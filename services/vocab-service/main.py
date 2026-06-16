import os
import json
import uuid
from datetime import datetime, timezone

import anthropic
from databases import Database
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lexis:lexis@db:5432/lexis")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

app = FastAPI(title="Vocab Service")
db = Database(DATABASE_URL)
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


class AddWordRequest(BaseModel):
    term: str
    context: str | None = None
    use_ai: bool = False


class PatchWordRequest(BaseModel):
    term: str | None = None
    context: str | None = None
    definition: str | None = None
    usage_explanation: str | None = None
    sample_sentences: list[str] | None = None
    register: str | None = None
    related_words: list[str] | None = None
    category: str | None = None
    status: str | None = None


@app.on_event("startup")
async def startup():
    await db.connect()
    # warm migration: add status column to existing databases without it
    await db.execute(
        "ALTER TABLE words ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'"
    )


@app.on_event("shutdown")
async def shutdown():
    await db.disconnect()


def _build_prompt(term: str, context: str | None) -> str:
    ctx_line = f"Context where it was heard (if any): '{context}'" if context else "Context where it was heard (if any): none"
    return (
        f"Given the word or phrase: '{term}'\n"
        f"{ctx_line}\n"
        "Return a JSON object with these exact keys:\n"
        "- definition: string\n"
        "- usage_explanation: string (how it's used in the given context, or general usage)\n"
        "- sample_sentences: array of 3 strings\n"
        "- register: one of 'formal' | 'neutral' | 'informal' | 'slang' | 'idiomatic'\n"
        "- related_words: array of up to 4 strings\n"
        "- category: one of 'business' | 'technology' | 'social' | 'academic' | 'idiom' | 'general'"
    )


@app.post("/words")
async def add_word(req: AddWordRequest):
    if req.use_ai:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system="You are a concise English language assistant. Return JSON only. No markdown.",
            messages=[{"role": "user", "content": _build_prompt(req.term, req.context)}],
        )
        raw = message.content[0].text.strip()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            raise HTTPException(status_code=502, detail="Invalid JSON from AI response")
        definition = parsed.get("definition", "")
        usage_explanation = parsed.get("usage_explanation", "")
        sample_sentences = json.dumps(parsed.get("sample_sentences", []))
        register = parsed.get("register", "neutral")
        related_words = json.dumps(parsed.get("related_words", []))
        category = parsed.get("category", "general")
    else:
        definition = ""
        usage_explanation = ""
        sample_sentences = "[]"
        register = "neutral"
        related_words = "[]"
        category = "general"

    record_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    query = """
        INSERT INTO words (id, term, context, definition, usage_explanation,
                           sample_sentences, register, related_words, category, status, created_at)
        VALUES (:id, :term, :context, :definition, :usage_explanation,
                :sample_sentences, :register, :related_words, :category, :status, :created_at)
    """
    await db.execute(query, {
        "id": record_id,
        "term": req.term,
        "context": req.context,
        "definition": definition,
        "usage_explanation": usage_explanation,
        "sample_sentences": sample_sentences,
        "register": register,
        "related_words": related_words,
        "category": category,
        "status": "new",
        "created_at": now,
    })
    return await _fetch_word(record_id)


@app.get("/words")
async def list_words():
    rows = await db.fetch_all("SELECT * FROM words ORDER BY created_at DESC")
    return [_serialize(r) for r in rows]


@app.get("/words/{word_id}")
async def get_word(word_id: str):
    word = await _fetch_word(word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
    return word


@app.patch("/words/{word_id}")
async def update_word(word_id: str, req: PatchWordRequest):
    if not await _fetch_word(word_id):
        raise HTTPException(status_code=404, detail="Word not found")

    updates = req.model_dump(exclude_unset=True)
    if not updates:
        return await _fetch_word(word_id)

    set_clauses = []
    params: dict = {"id": word_id}
    for key, val in updates.items():
        set_clauses.append(f"{key} = :{key}")
        if key in ("sample_sentences", "related_words") and val is not None:
            params[key] = json.dumps(val)
        else:
            params[key] = val

    await db.execute(
        f"UPDATE words SET {', '.join(set_clauses)} WHERE id = :id",
        params,
    )
    return await _fetch_word(word_id)


@app.delete("/words/{word_id}")
async def delete_word(word_id: str):
    result = await db.execute("DELETE FROM words WHERE id = :id", {"id": word_id})
    if result == 0:
        raise HTTPException(status_code=404, detail="Word not found")
    return {"deleted": word_id}


async def _fetch_word(word_id: str):
    row = await db.fetch_one("SELECT * FROM words WHERE id = :id", {"id": word_id})
    if not row:
        return None
    return _serialize(row)


def _serialize(row) -> dict:
    d = dict(row)
    for key in ("sample_sentences", "related_words"):
        val = d.get(key)
        if val is None:
            d[key] = []
        elif isinstance(val, str):
            try:
                d[key] = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                d[key] = []
        elif not isinstance(val, (list, dict)):
            d[key] = []
    if isinstance(d.get("created_at"), datetime):
        d["created_at"] = d["created_at"].isoformat()
    if not d.get("status"):
        d["status"] = "new"
    return d

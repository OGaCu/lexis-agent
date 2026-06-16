import os
import json
import uuid
from datetime import datetime, timezone

import anthropic
import httpx
import redis.asyncio as aioredis
from databases import Database
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lexis:lexis@db:5432/lexis")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "")
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")

AV_BASE = "https://www.alphavantage.co/query"
NEWS_BASE = "https://newsapi.org/v2/top-headlines"

app = FastAPI(title="Invest Service")
db = Database(DATABASE_URL)
redis: aioredis.Redis = None
ai = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


class AddTickerRequest(BaseModel):
    ticker: str


@app.on_event("startup")
async def startup():
    global redis
    await db.connect()
    redis = aioredis.from_url(REDIS_URL, decode_responses=True)


@app.on_event("shutdown")
async def shutdown():
    await db.disconnect()
    await redis.aclose()


# ── Watchlist ────────────────────────────────────────────────────────────────

@app.get("/watchlist")
async def get_watchlist():
    rows = await db.fetch_all("SELECT ticker FROM watchlist ORDER BY added_at ASC")
    result = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for row in rows:
            ticker = row["ticker"]
            quote = await _get_quote(client, ticker)
            result.append(quote)
    return result


@app.post("/watchlist")
async def add_ticker(req: AddTickerRequest):
    ticker = req.ticker.strip().upper()
    if not ticker or len(ticker) > 5:
        raise HTTPException(status_code=422, detail="Ticker must be 1-5 uppercase characters")
    try:
        record_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        await db.execute(
            "INSERT INTO watchlist (id, ticker, added_at) VALUES (:id, :ticker, :added_at)",
            {"id": record_id, "ticker": ticker, "added_at": now},
        )
    except Exception:
        raise HTTPException(status_code=409, detail="Ticker already in watchlist")
    row = await db.fetch_one("SELECT * FROM watchlist WHERE id = :id", {"id": record_id})
    return _serialize_row(row)


@app.delete("/watchlist/{ticker}")
async def delete_ticker(ticker: str):
    ticker = ticker.upper()
    result = await db.execute("DELETE FROM watchlist WHERE ticker = :ticker", {"ticker": ticker})
    if result == 0:
        raise HTTPException(status_code=404, detail="Ticker not found")
    return {"deleted": ticker}


# ── Briefings ────────────────────────────────────────────────────────────────

@app.get("/briefings/latest")
async def get_latest_briefing():
    row = await db.fetch_one("SELECT * FROM briefings ORDER BY created_at DESC LIMIT 1")
    if not row:
        return None
    return _serialize_row(row)


@app.post("/briefings/generate")
async def generate_briefing():
    async with httpx.AsyncClient(timeout=15.0) as client:
        headlines = await _fetch_headlines(client)
        tickers = await db.fetch_all("SELECT ticker FROM watchlist ORDER BY added_at ASC")
        prices = {}
        for row in tickers:
            quote = await _get_quote(client, row["ticker"])
            prices[row["ticker"]] = {"price": quote["price"], "change_percent": quote["change_percent"]}

    message = ai.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system="You are a concise investment research assistant. Return JSON only.",
        messages=[{"role": "user", "content": (
            f"News headlines: {json.dumps(headlines)}\n"
            f"Portfolio tickers and prices: {json.dumps(prices)}\n"
            "Return JSON with:\n"
            "- macro_summary: string (2-3 sentences on market conditions)\n"
            "- news_items: array of { headline: str, implication: str }\n"
            "- stock_notes: array of { ticker: str, note: str }\n"
            "- disclaimer: 'This is for informational purposes only and does not constitute financial advice.'"
        )}],
    )
    raw = message.content[0].text.strip()
    try:
        content = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Invalid JSON from AI response")

    record_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.execute(
        "INSERT INTO briefings (id, content, created_at) VALUES (:id, CAST(:content AS jsonb), :created_at)",
        {"id": record_id, "content": json.dumps(content), "created_at": now},
    )
    row = await db.fetch_one("SELECT * FROM briefings WHERE id = :id", {"id": record_id})
    return _serialize_row(row)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_quote(client: httpx.AsyncClient, ticker: str) -> dict:
    cache_key = f"quote:{ticker}"
    cached = await redis.get(cache_key)
    if cached:
        data = json.loads(cached)
        data["cached"] = True
        return data

    try:
        resp = await client.get(AV_BASE, params={
            "function": "GLOBAL_QUOTE",
            "symbol": ticker,
            "apikey": ALPHA_VANTAGE_KEY,
        })
        gq = resp.json().get("Global Quote", {})
        price = gq.get("05. price", "N/A")
        change_pct = gq.get("10. change percent", "N/A")
    except Exception:
        price, change_pct = "N/A", "N/A"

    data = {"ticker": ticker, "price": price, "change_percent": change_pct, "cached": False}
    await redis.setex(cache_key, 3600, json.dumps({k: v for k, v in data.items() if k != "cached"}))
    return data


async def _fetch_headlines(client: httpx.AsyncClient) -> list[str]:
    try:
        resp = await client.get(NEWS_BASE, params={
            "category": "business",
            "language": "en",
            "pageSize": 5,
            "apiKey": NEWS_API_KEY,
        })
        articles = resp.json().get("articles", [])
        return [a["title"] for a in articles[:5]]
    except Exception:
        return []


def _serialize_row(row) -> dict:
    d = dict(row)
    for key in ("content",):
        if isinstance(d.get(key), str):
            d[key] = json.loads(d[key])
    for key in ("created_at", "added_at"):
        if isinstance(d.get(key), datetime):
            d[key] = d[key].isoformat()
    return d

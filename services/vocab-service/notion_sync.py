import os
import logging
from notion_client import AsyncClient
from notion_client.errors import APIResponseError

logger = logging.getLogger(__name__)

NOTION_API_KEY = os.getenv("NOTION_API_KEY", "")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID", "")

_client: AsyncClient | None = None

_TRUNC = 1990  # Notion rich_text block limit is 2000 chars


def _t(s: str | None) -> str:
    return (s or "")[:_TRUNC]


def get_client() -> AsyncClient | None:
    global _client
    if not NOTION_API_KEY or not NOTION_DATABASE_ID:
        return None
    if _client is None:
        _client = AsyncClient(auth=NOTION_API_KEY)
    return _client


def _build_properties(word: dict) -> dict:
    related = word.get("related_words") or []
    samples = word.get("sample_sentences") or []
    created_at = word.get("created_at")

    props: dict = {
        "Term": {"title": [{"text": {"content": _t(word.get("term"))}}]},
        "Definition": {"rich_text": [{"text": {"content": _t(word.get("definition"))}}]},
        "Context": {"rich_text": [{"text": {"content": _t(word.get("context"))}}]},
        "Usage Explanation": {"rich_text": [{"text": {"content": _t(word.get("usage_explanation"))}}]},
        "Sample Sentences": {"rich_text": [{"text": {"content": _t("\n".join(samples))}}]},
        "Register": {"select": {"name": word.get("register") or "neutral"}},
        "Related Words": {"multi_select": [{"name": w} for w in related if w]},
        "Category": {"select": {"name": word.get("category") or "general"}},
        "Status": {"select": {"name": word.get("status") or "new"}},
        "Lexis ID": {"rich_text": [{"text": {"content": word.get("id", "")}}]},
    }
    if created_at:
        props["Created At"] = {"date": {"start": created_at}}
    return props


async def _find_page_id(client: AsyncClient, lexis_id: str) -> str | None:
    result = await client.databases.query(
        database_id=NOTION_DATABASE_ID,
        filter={"property": "Lexis ID", "rich_text": {"equals": lexis_id}},
    )
    pages = result.get("results", [])
    return pages[0]["id"] if pages else None


async def sync_word_created(word: dict) -> None:
    client = get_client()
    if not client:
        return
    try:
        await client.pages.create(
            parent={"database_id": NOTION_DATABASE_ID},
            properties=_build_properties(word),
        )
    except APIResponseError as e:
        logger.warning("Notion create sync failed: %s", e)


async def sync_word_updated(word: dict) -> None:
    client = get_client()
    if not client:
        return
    try:
        page_id = await _find_page_id(client, word["id"])
        if page_id:
            await client.pages.update(page_id=page_id, properties=_build_properties(word))
        else:
            await sync_word_created(word)
    except APIResponseError as e:
        logger.warning("Notion update sync failed: %s", e)


async def sync_word_deleted(word_id: str) -> None:
    client = get_client()
    if not client:
        return
    try:
        page_id = await _find_page_id(client, word_id)
        if page_id:
            await client.pages.update(page_id=page_id, archived=True)
    except APIResponseError as e:
        logger.warning("Notion delete sync failed: %s", e)

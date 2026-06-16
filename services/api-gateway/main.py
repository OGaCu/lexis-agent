import os
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Lexis API Gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VOCAB_SERVICE_URL = os.getenv("VOCAB_SERVICE_URL", "http://vocab-service:8001")
INVEST_SERVICE_URL = os.getenv("INVEST_SERVICE_URL", "http://invest-service:8002")


@app.get("/health")
async def health():
    return {"status": "ok"}


async def _proxy(request: Request, target_base: str, path: str) -> Response:
    url = f"{target_base}{path}"
    body = await request.body()
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.request(
            method=request.method,
            url=url,
            headers={k: v for k, v in request.headers.items() if k.lower() != "host"},
            content=body,
            params=dict(request.query_params),
        )
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=dict(resp.headers),
    )


@app.api_route("/vocab/{path:path}", methods=["GET", "POST", "DELETE", "PUT", "PATCH"])
async def vocab_proxy(request: Request, path: str):
    return await _proxy(request, VOCAB_SERVICE_URL, f"/{path}")


@app.api_route("/invest/{path:path}", methods=["GET", "POST", "DELETE", "PUT", "PATCH"])
async def invest_proxy(request: Request, path: str):
    return await _proxy(request, INVEST_SERVICE_URL, f"/{path}")

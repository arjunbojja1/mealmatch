from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


class HelloResponse(BaseModel):
    message: str


class EchoRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class EchoResponse(BaseModel):
    echoed_text: str
    length: int

app = FastAPI(title="bitcamp-2026 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": "bitcamp-2026 backend is running",
        "docs": "/docs",
    }


@app.get("/api/v1/hello", response_model=HelloResponse)
def hello() -> HelloResponse:
    return HelloResponse(message="Hello from FastAPI")


@app.post("/api/v1/echo", response_model=EchoResponse)
def echo(payload: EchoRequest) -> EchoResponse:
    return EchoResponse(echoed_text=payload.text, length=len(payload.text))

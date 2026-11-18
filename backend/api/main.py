
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.api.routes.chat import router as chat_router
from backend.api.routes.auth import router as auth_router

app = FastAPI(
    title="E.D.I.T.H API",
    description="Enhanced Digital Intelligence & Task Handler",
    version="0.1.0"
)

app.include_router(chat_router)
app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

@app.get("/")
async def root():
    return {
        "name": "E.D.I.T.H",
        "message": "Backend is running",
        "version": "0.1.0"
    }


@app.get("/api/v1/health")
async def health_check():
    return {
        "status": "online",
        "application": "E.D.I.T.H",
        "version": "0.1.0"
    }

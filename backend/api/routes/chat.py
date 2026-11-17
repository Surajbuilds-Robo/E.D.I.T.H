
from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/chat", tags=["Chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)


class ChatResponse(BaseModel):
    status: str
    user_message: str
    message: str
    model: str | None = None


@router.post("/", response_model=ChatResponse)
async def send_message(request: ChatRequest):
    return ChatResponse(
        status="model_not_configured",
        user_message=request.message,
        message=(
            "The chat API is connected successfully. "
            "The local AI model has not been configured yet."
        ),
        model=None
    )


import httpx

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session

from backend.api.auth_dependencies import get_current_user
from backend.database.connection import get_db
from backend.database.models import User, Conversation, Message


router = APIRouter(
    prefix="/api/v1/chat",
    tags=["Chat"],
)

OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL = "qwen3.5:4b"

SYSTEM_PROMPT = """
You are E.D.I.T.H., a personal AI assistant.

Your responsibilities:
- Answer questions accurately and clearly.
- Help with productivity, learning and research.
- Assist with programming and technical problems.
- Understand English, Hindi and Hinglish.
- Be concise unless more detail is requested.
- Never claim to have performed actions you have not performed.
- Do not reveal private internal reasoning.
- Provide the final answer directly.
"""


# ==============================
# REQUEST AND RESPONSE MODELS
# ==============================

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    conversation_id: int | None = None


class ChatResponse(BaseModel):
    status: str
    conversation_id: int
    user_message: str
    message: str
    model: str | None = None


class ConversationHistoryItem(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MessageHistoryItem(BaseModel):
    id: int
    role: str
    content: str
    model: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationDetail(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageHistoryItem]


# ==============================
# CHAT ENDPOINT
# ==============================

@router.post("/", response_model=ChatResponse)
async def send_message(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Find an existing conversation belonging to this user,
    # or create a new conversation.
    if request.conversation_id is not None:
        conversation = db.query(Conversation).filter(
            Conversation.id == request.conversation_id,
            Conversation.user_id == current_user.id,
        ).first()

        if not conversation:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

    else:
        conversation = Conversation(
            user_id=current_user.id,
            title=request.message[:50],
        )

        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    # Retrieve previous messages.
    history = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )

    # Save the user's message.
    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=request.message,
    )

    db.add(user_message)
    db.commit()

    # Build model context.
    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        }
    ]

    for item in history:
        messages.append({
            "role": item.role,
            "content": item.content,
        })

    messages.append({
        "role": "user",
        "content": request.message,
    })

    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "keep_alive": "5m",
    }

    # Request response from Ollama.
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(180.0, connect=5.0)
        ) as client:

            response = await client.post(
                OLLAMA_URL,
                json=payload,
            )

            response.raise_for_status()

            result = response.json()

            ollama_message = result.get("message", {})

            assistant_message = ollama_message.get("content", "")

            if not assistant_message:
                raise HTTPException(
                    status_code=502,
                    detail="The AI model returned an empty response.",
                )

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="The local AI model took too long to respond.",
        )

    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to Ollama. Check whether it is running.",
        )

    except httpx.HTTPStatusError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Ollama returned HTTP {error.response.status_code}.",
        )

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Communication with the local AI model failed.",
        )

    # Save the assistant response.
    assistant_record = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=assistant_message,
        model=result.get("model", OLLAMA_MODEL),
    )

    db.add(assistant_record)

    conversation.updated_at = datetime.now(timezone.utc)

    db.commit()

    return ChatResponse(
        status="success",
        conversation_id=conversation.id,
        user_message=request.message,
        message=assistant_message,
        model=result.get("model", OLLAMA_MODEL),
    )


# ==============================
# GET USER CONVERSATIONS
# ==============================

@router.get(
    "/conversations",
    response_model=list[ConversationHistoryItem],
)
def get_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversations = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(
            Conversation.updated_at.desc(),
            Conversation.id.desc(),
        )
        .all()
    )

    return conversations


# ==============================
# GET SINGLE CONVERSATION
# ==============================

@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationDetail,
)
def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    return {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "messages": conversation.messages,
    }


# ==============================
# DELETE CONVERSATION
# ==============================

@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    db.delete(conversation)
    db.commit()

    return {
        "status": "success",
        "message": "Conversation deleted.",
        "conversation_id": conversation_id,
    }

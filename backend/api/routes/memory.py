
import re

from datetime import datetime
from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from backend.database.connection import get_db
from backend.database.models import User, UserMemory
from backend.api.auth_dependencies import get_current_user


router = APIRouter(
    prefix="/api/v1/memory",
    tags=["Memory"],
)

ALLOWED_CATEGORIES = {
    "preference",
    "personal_context",
    "project",
    "other",
}

ALLOWED_IMPORTANCE = {
    "critical",
    "high",
    "normal",
    "low",
}

DUPLICATE_THRESHOLD = 0.78
MAX_DUPLICATE_RESULTS = 5
MAX_MEMORIES_TO_COMPARE = 200


# ==========================================
# REQUEST AND RESPONSE MODELS
# ==========================================

class MemoryCreate(BaseModel):
    content: str = Field(min_length=1, max_length=10000)
    category: str = "other"
    importance: str = "normal"
    expires_at: datetime | None = None
    source_conversation_id: int | None = None


class MemoryUpdate(BaseModel):
    content: str | None = Field(
        default=None,
        min_length=1,
        max_length=10000,
    )
    category: str | None = None
    importance: str | None = None
    expires_at: datetime | None = None


class MemoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: str
    category: str
    importance: str
    source_conversation_id: int | None
    expires_at: datetime | None
    last_used_at: datetime | None
    usage_count: int
    created_at: datetime
    updated_at: datetime


class DuplicateCheckRequest(BaseModel):
    content: str = Field(min_length=1, max_length=10000)


class DuplicateMatch(BaseModel):
    id: int
    content: str
    category: str
    similarity: float


class DuplicateCheckResponse(BaseModel):
    is_duplicate: bool
    matches: list[DuplicateMatch]


# ==========================================
# VALIDATION AND HELPERS
# ==========================================

def validate_category(category: str):
    if category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid memory category.",
        )


def validate_importance(importance: str):
    if importance not in ALLOWED_IMPORTANCE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid memory importance.",
        )


def normalize_memory_content(content: str) -> str:
    """
    Normalize text for duplicate comparison.
    """

    content = content.casefold().strip()
    content = re.sub(r"\s+", " ", content)
    content = re.sub(r"[^\w\s]", "", content)

    return content


def get_owned_memory(
    memory_id: int,
    user: User,
    db: Session,
) -> UserMemory:

    memory = (
        db.query(UserMemory)
        .filter(
            UserMemory.id == memory_id,
            UserMemory.user_id == user.id,
        )
        .first()
    )

    if not memory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory not found.",
        )

    return memory


# ==========================================
# CHECK MEMORY DUPLICATES
# ==========================================

@router.post(
    "/check-duplicate",
    response_model=DuplicateCheckResponse,
)
def check_duplicate_memory(
    request: DuplicateCheckRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):

    new_content = normalize_memory_content(request.content)

    if not new_content:
        raise HTTPException(
            status_code=422,
            detail="Memory content cannot be empty.",
        )

    existing_memories = (
        db.query(UserMemory)
        .filter(
            UserMemory.user_id == user.id,
        )
        .order_by(
            UserMemory.updated_at.desc(),
            UserMemory.id.desc(),
        )
        .limit(MAX_MEMORIES_TO_COMPARE)
        .all()
    )

    matches = []

    for memory in existing_memories:

        existing_content = normalize_memory_content(
            memory.content
        )

        if not existing_content:
            continue

        similarity = SequenceMatcher(
            None,
            new_content,
            existing_content,
        ).ratio()

        if similarity >= DUPLICATE_THRESHOLD:

            matches.append(
                DuplicateMatch(
                    id=memory.id,
                    content=memory.content,
                    category=memory.category,
                    similarity=round(similarity, 3),
                )
            )

    matches.sort(
        key=lambda item: item.similarity,
        reverse=True,
    )

    matches = matches[:MAX_DUPLICATE_RESULTS]

    return DuplicateCheckResponse(
        is_duplicate=len(matches) > 0,
        matches=matches,
    )


# ==========================================
# CREATE MEMORY
# ==========================================

@router.post(
    "/",
    response_model=MemoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_memory(
    request: MemoryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):

    content = request.content.strip()

    if not content:
        raise HTTPException(
            status_code=422,
            detail="Memory content cannot be empty.",
        )

    validate_category(request.category)
    validate_importance(request.importance)

    if request.source_conversation_id is not None:

        from backend.database.models import Conversation

        conversation = (
            db.query(Conversation)
            .filter(
                Conversation.id == request.source_conversation_id,
                Conversation.user_id == user.id,
            )
            .first()
        )

        if not conversation:
            raise HTTPException(
                status_code=404,
                detail="Source conversation not found.",
            )

    memory = UserMemory(
        user_id=user.id,
        content=content,
        category=request.category,
        importance=request.importance,
        expires_at=request.expires_at,
        source_conversation_id=request.source_conversation_id,
    )

    db.add(memory)
    db.commit()
    db.refresh(memory)

    return memory


# ==========================================
# LIST MEMORIES
# ==========================================

@router.get("/", response_model=list[MemoryResponse])
def list_memories(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):

    return (
        db.query(UserMemory)
        .filter(
            UserMemory.user_id == user.id,
        )
        .order_by(
            UserMemory.updated_at.desc(),
        )
        .all()
    )


# ==========================================
# GET SINGLE MEMORY
# ==========================================

@router.get("/{memory_id}", response_model=MemoryResponse)
def read_memory(
    memory_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):

    return get_owned_memory(
        memory_id,
        user,
        db,
    )


# ==========================================
# UPDATE MEMORY
# ==========================================

@router.put("/{memory_id}", response_model=MemoryResponse)
def update_memory(
    memory_id: int,
    request: MemoryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):

    memory = get_owned_memory(
        memory_id,
        user,
        db,
    )

    changes = request.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=422,
            detail="No changes provided.",
        )

    if "content" in changes:

        content = changes["content"]

        if content is None or not content.strip():
            raise HTTPException(
                status_code=422,
                detail="Memory content cannot be empty.",
            )

        memory.content = content.strip()

    if "category" in changes:

        category = changes["category"]

        if category is None:
            raise HTTPException(
                status_code=422,
                detail="Memory category cannot be empty.",
            )

        validate_category(category)
        memory.category = category

    if "importance" in changes:

        importance = changes["importance"]

        if importance is None:
            raise HTTPException(
                status_code=422,
                detail="Memory importance cannot be empty.",
            )

        validate_importance(importance)
        memory.importance = importance

    if "expires_at" in changes:
        # Explicit null removes the expiration date.
        memory.expires_at = changes["expires_at"]

    db.commit()
    db.refresh(memory)

    return memory


# ==========================================
# DELETE MEMORY
# ==========================================

@router.delete("/{memory_id}")
def delete_memory(
    memory_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):

    memory = get_owned_memory(
        memory_id,
        user,
        db,
    )

    db.delete(memory)
    db.commit()

    return {
        "status": "success",
        "message": "Memory deleted successfully.",
    }

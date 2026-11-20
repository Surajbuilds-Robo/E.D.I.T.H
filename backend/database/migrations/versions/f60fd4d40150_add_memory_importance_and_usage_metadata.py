
"""add memory importance and usage metadata

Revision ID: f60fd4d40150
Revises: 905a548113d8
Create Date: 2026-11-19 10:10:32.224362
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f60fd4d40150"
down_revision: Union[str, Sequence[str], None] = "905a548113d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_memories",
        sa.Column(
            "importance",
            sa.String(length=20),
            server_default="normal",
            nullable=False,
        ),
    )

    op.add_column(
        "user_memories",
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.add_column(
        "user_memories",
        sa.Column(
            "last_used_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.add_column(
        "user_memories",
        sa.Column(
            "usage_count",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )

    op.create_check_constraint(
        "check_memory_importance",
        "user_memories",
        "importance IN ('critical', 'high', 'normal', 'low')",
    )

    op.create_check_constraint(
        "check_memory_usage_count",
        "user_memories",
        "usage_count >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "check_memory_usage_count",
        "user_memories",
        type_="check",
    )

    op.drop_constraint(
        "check_memory_importance",
        "user_memories",
        type_="check",
    )

    op.drop_column("user_memories", "usage_count")
    op.drop_column("user_memories", "last_used_at")
    op.drop_column("user_memories", "expires_at")
    op.drop_column("user_memories", "importance")

"""add memory consolidation archival columns

Revision ID: b7b689816a01
Revises: f60fd4d40150
Create Date: 2026-11-21 19:31:44.702747

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7b689816a01'
down_revision: Union[str, Sequence[str], None] = 'f60fd4d40150'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_memories",
        sa.Column(
            "is_archived",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
    )
    op.create_index(
        "ix_user_memories_is_archived",
        "user_memories",
        ["is_archived"],
        unique=False,
    )
    op.add_column(
        "user_memories",
        sa.Column(
            "archived_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "user_memories",
        sa.Column(
            "consolidated_into_id",
            sa.Integer(),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_user_memories_consolidated_into_id",
        "user_memories",
        ["consolidated_into_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_user_memories_consolidated_into_id",
        "user_memories",
        "user_memories",
        ["consolidated_into_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_user_memories_consolidated_into_id",
        "user_memories",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_user_memories_consolidated_into_id",
        table_name="user_memories",
    )
    op.drop_column("user_memories", "consolidated_into_id")
    op.drop_column("user_memories", "archived_at")
    op.drop_index(
        "ix_user_memories_is_archived",
        table_name="user_memories",
    )
    op.drop_column("user_memories", "is_archived")

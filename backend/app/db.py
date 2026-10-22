"""SQLite database setup with SQLAlchemy async engine.

This module keeps the legacy `app.db` import surface stable while the actual
ORM classes live in domain-specific modules under `app.db_models`.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.db_base import Base, async_session, engine
from app.db_base import EncryptedText, _utcnow  # noqa: F401
from app.db_models import *  # noqa: F401,F403 - re-export ORM models for compatibility
from app.services.encryption import encrypt_field_value

logger = logging.getLogger(__name__)

__all__ = [
    "Base",
    "EncryptedText",
    "async_session",
    "engine",
    "_utcnow",
    "init_db",
    "get_db",
]


async def init_db() -> None:
    """Create all tables if they don't exist, then add any missing columns."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _add_missing_columns(conn)
        await _encrypt_existing_snapshot_fields(conn)
        await _encrypt_existing_stakeholder_fields(conn)


async def _add_missing_columns(conn) -> None:
    """Best-effort ALTER TABLE ADD COLUMN for every ORM model column."""
    import sqlalchemy as sa
    fallback_timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    for table in Base.metadata.sorted_tables:
        result = await conn.execute(sa.text(f"PRAGMA table_info('{table.name}')"))
        existing = {row[1] for row in result.fetchall()}

        for col in table.columns:
            if col.name in existing:
                continue

            col_type = col.type.compile(dialect=conn.dialect)
            nullable = ""
            if not col.nullable:
                col_default = getattr(col.default, "arg", None)
                if isinstance(col_default, bool):
                    nullable = f" NOT NULL DEFAULT {int(col_default)}"
                elif isinstance(col_default, (int, float)):
                    nullable = f" NOT NULL DEFAULT {col_default}"
                elif isinstance(col_default, str):
                    escaped_col_default = col_default.replace("'", "''")
                    nullable = f" NOT NULL DEFAULT '{escaped_col_default}'"
                elif callable(col_default):
                    if isinstance(col.type, sa.Boolean):
                        nullable = " NOT NULL DEFAULT 0"
                    elif isinstance(col.type, (sa.Integer, sa.Float)):
                        nullable = " NOT NULL DEFAULT 0"
                    elif isinstance(col.type, sa.DateTime):
                        nullable = f" NOT NULL DEFAULT '{fallback_timestamp}'"
                    else:
                        nullable = " NOT NULL DEFAULT ''"
                elif isinstance(col.type, sa.Boolean):
                    nullable = " NOT NULL DEFAULT 0"
                elif isinstance(col.type, (sa.Integer, sa.Float)):
                    nullable = " NOT NULL DEFAULT 0"
                elif isinstance(col.type, sa.DateTime):
                    nullable = f" NOT NULL DEFAULT '{fallback_timestamp}'"
                else:
                    nullable = " NOT NULL DEFAULT ''"

            try:
                await conn.execute(
                    sa.text(f"ALTER TABLE {table.name} ADD COLUMN {col.name} {col_type}{nullable}")
                )
            except Exception as exc:
                logger.warning("Skipping best-effort column add for %s.%s: %s", table.name, col.name, exc)


async def _encrypt_existing_stakeholder_fields(conn) -> None:
    """Best-effort encryption upgrade for legacy plaintext stakeholder note fields."""
    import sqlalchemy as sa

    sensitive_columns = [
        "stakeholder_name",
        "role",
        "department",
        "interview_date",
        "notes",
        "key_findings",
        "pain_points",
        "source_meeting",
        "tags",
    ]

    result = await conn.execute(
        sa.text(
            "SELECT id, stakeholder_name, role, department, interview_date, notes, "
            "key_findings, pain_points, source_meeting, tags FROM stakeholder_notes"
        )
    )

    for row in result.mappings():
        updates: dict[str, str | None] = {}
        for column in sensitive_columns:
            encrypted = encrypt_field_value(row[column])
            if encrypted != row[column]:
                updates[column] = encrypted
        if not updates:
            continue
        assignments = ", ".join(f"{column} = :{column}" for column in updates)
        await conn.execute(
            sa.text(f"UPDATE stakeholder_notes SET {assignments} WHERE id = :id"),
            {"id": row["id"], **updates},
        )


async def _encrypt_existing_snapshot_fields(conn) -> None:
    """Best-effort encryption upgrade for legacy plaintext snapshot payloads."""
    import sqlalchemy as sa

    result = await conn.execute(sa.text("SELECT id, data_json FROM assessment_snapshots"))

    for row in result.mappings():
        encrypted = encrypt_field_value(row["data_json"])
        if encrypted == row["data_json"]:
            continue
        await conn.execute(
            sa.text("UPDATE assessment_snapshots SET data_json = :data_json WHERE id = :id"),
            {"id": row["id"], "data_json": encrypted},
        )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session."""
    async with async_session() as session:
        yield session

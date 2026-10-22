"""Shared database setup primitives."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Text, TypeDecorator, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings
from app.services.encryption import decrypt_field_value, encrypt_field_value

engine = create_async_engine(settings.database_url, echo=settings.debug)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
        """Enable SQLite foreign keys so cascade behavior matches the ORM."""

        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


class Base(DeclarativeBase):
    pass


class EncryptedText(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt_field_value(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt_field_value(value)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

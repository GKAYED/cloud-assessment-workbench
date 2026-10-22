"""Application-level field encryption for sensitive local data."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

_ENCRYPTED_PREFIX = "enc::"


def _resolve_key_bytes() -> bytes:
    configured_key = settings.field_encryption_key.strip()
    if configured_key:
        return configured_key.encode("utf-8")

    key_path = Path(settings.field_encryption_key_path).expanduser().resolve()
    key_path.parent.mkdir(parents=True, exist_ok=True)
    if key_path.exists():
        return key_path.read_bytes().strip()

    key = Fernet.generate_key()
    key_path.write_bytes(key)
    return key


@lru_cache(maxsize=1)
def get_field_encryptor() -> Fernet:
    return Fernet(_resolve_key_bytes())


def ensure_field_encryption_ready() -> None:
    get_field_encryptor()


def encrypt_field_value(value: str | None) -> str | None:
    if value is None:
        return None
    if value.startswith(_ENCRYPTED_PREFIX):
        return value
    token = get_field_encryptor().encrypt(value.encode("utf-8")).decode("utf-8")
    return f"{_ENCRYPTED_PREFIX}{token}"


def decrypt_field_value(value: str | None) -> str | None:
    if value is None:
        return None
    if not value.startswith(_ENCRYPTED_PREFIX):
        return value
    token = value[len(_ENCRYPTED_PREFIX):]
    try:
        return get_field_encryptor().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return value

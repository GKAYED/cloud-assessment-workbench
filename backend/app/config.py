"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Backend settings — loaded from .env or environment variables."""

    # Azure AD App Registration
    azure_client_id: str = ""
    azure_tenant_id: str = "common"  # "common" allows multi-tenant

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:5174"

    # Database
    database_url: str = "sqlite+aiosqlite:///./azaudit.db"
    field_encryption_key: str = ""
    field_encryption_key_path: str = "./azaudit.key"

    # Server
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = False
    local_unlock_key_path: str = "./workbench-unlock.key"

    # Optional manual override for subscription names. Format:
    #   id1=Friendly Name,id2=Other Name
    # If a subscription display name from Azure is not helpful (e.g. a GUID),
    # this lets operators supply their own mapping to show in the UI.
    subscription_name_map: str = ""

    # Optional OpenAI integration for transcript-to-markdown processing
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"

    model_config = {"env_file": ".env", "env_prefix": "AZAUDIT_"}


settings = Settings()

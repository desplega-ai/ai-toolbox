"""Configuration management for invoice-cli."""

import tomllib
from pathlib import Path

import tomli_w
from pydantic import BaseModel, Field


class AccountConfig(BaseModel):
    """Configuration for a Gmail account."""

    name: str
    email: str
    token_file: str


class StorageConfig(BaseModel):
    """Configuration for invoice storage."""

    base_path: Path = Field(default=Path.home() / "invoices")


class AIConfig(BaseModel):
    """Configuration for AI classification."""

    model: str = "claude-haiku-4-5"


class CompanyConfig(BaseModel):
    """User's company/personal info for invoice matching."""

    # Personal info
    owner_name: str | None = None

    # Company info
    company_name: str | None = None
    vat_id: str | None = None
    tax_id: str | None = None

    # Address
    street: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None


class OwnershipConfig(BaseModel):
    """Configuration for automatic ownership assignment based on seller company."""

    personal_companies: list[str] = Field(default_factory=list)
    work_companies: list[str] = Field(default_factory=list)


class Config(BaseModel):
    """Main configuration model."""

    storage: StorageConfig = Field(default_factory=StorageConfig)
    ai: AIConfig = Field(default_factory=AIConfig)
    accounts: list[AccountConfig] = Field(default_factory=list)
    company: CompanyConfig = Field(default_factory=CompanyConfig)
    ownership: OwnershipConfig = Field(default_factory=OwnershipConfig)


def get_config_dir() -> Path:
    """Get the configuration directory path (XDG-compliant)."""
    config_home = Path.home() / ".config"
    config_dir = config_home / "invoice-cli"
    return config_dir


def get_config_path() -> Path:
    """Get the path to the config file."""
    return get_config_dir() / "config.toml"


def get_tokens_dir() -> Path:
    """Get the directory for OAuth tokens."""
    return get_config_dir() / "tokens"


def load_config() -> Config:
    """Load configuration from file, or return defaults if not found."""
    config_path = get_config_path()
    if not config_path.exists():
        return Config()

    with open(config_path, "rb") as f:
        data = tomllib.load(f)

    # Convert storage.base_path from string to Path if present
    if "storage" in data and "base_path" in data["storage"]:
        data["storage"]["base_path"] = Path(data["storage"]["base_path"]).expanduser()

    return Config.model_validate(data)


def save_config(config: Config) -> None:
    """Save configuration to file."""
    config_dir = get_config_dir()
    config_dir.mkdir(parents=True, exist_ok=True)

    # Convert to dict for TOML serialization (exclude None values as TOML doesn't support null)
    data = config.model_dump(exclude_none=True)

    # Convert Path objects to strings
    if "storage" in data and "base_path" in data["storage"]:
        data["storage"]["base_path"] = str(data["storage"]["base_path"])

    config_path = get_config_path()
    with open(config_path, "wb") as f:
        tomli_w.dump(data, f)


def ensure_config_exists() -> Config:
    """Ensure config file exists, creating defaults if needed."""
    config_path = get_config_path()
    if not config_path.exists():
        config = Config()
        save_config(config)
        return config
    return load_config()

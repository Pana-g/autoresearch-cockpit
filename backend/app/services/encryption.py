"""Fernet-based encryption for provider credentials."""

import logging
from pathlib import Path

from cryptography.fernet import Fernet

from app.config import settings

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None

_KEY_FILE = Path.home() / ".autoresearch-cockpit" / "encryption.key"
_LEGACY_KEY_FILE = Path.home() / ".autoresearch" / "encryption.key"


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.encryption_key
        if not key:
            # Try loading a previously persisted key
            if _KEY_FILE.exists():
                key = _KEY_FILE.read_text().strip()
                logger.info("Loaded encryption key from %s", _KEY_FILE)
            elif _LEGACY_KEY_FILE.exists():
                key = _LEGACY_KEY_FILE.read_text().strip()
                _KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
                _KEY_FILE.write_text(key)
                _KEY_FILE.chmod(0o600)
                logger.info("Migrated encryption key from %s to %s", _LEGACY_KEY_FILE, _KEY_FILE)
            else:
                key = Fernet.generate_key().decode()
                # Persist so credentials survive restarts
                _KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
                _KEY_FILE.write_text(key)
                _KEY_FILE.chmod(0o600)
                logger.info(
                    "Generated and persisted encryption key to %s", _KEY_FILE
                )
            settings.encryption_key = key
        _fernet = Fernet(key.encode())
    return _fernet


def encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()

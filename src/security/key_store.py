"""Encrypted key storage using SQLite + Fernet encryption."""

import hashlib
import base64
import sqlite3
from pathlib import Path
from typing import List, Optional
from cryptography.fernet import Fernet


class EncryptedKeyStore:
    """Secure storage for API keys using SQLite + Fernet encryption.
    
    Keys are encrypted before storage and decrypted only when needed.
    Master password is required to derive the encryption key.
    """
    
    SALT = b'visionmachine_salt_2026_v1'
    PBKDF2_ITERATIONS = 100000
    
    def __init__(self, db_path: str, master_password: str):
        """Initialize key store.
        
        Args:
            db_path: Path to SQLite database file
            master_password: Password to derive encryption key
        """
        self.db_path = Path(db_path)
        self.master_key = self._derive_key(master_password)
        self.cipher = Fernet(self.master_key)
        self._init_database()
    
    def _derive_key(self, password: str) -> bytes:
        """Derive 32-byte encryption key from password using PBKDF2."""
        key = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            self.SALT,
            self.PBKDF2_ITERATIONS
        )
        return base64.urlsafe_b64encode(key[:32])
    
    def _init_database(self):
        """Create tables if they don't exist."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT UNIQUE NOT NULL,
                key_encrypted BLOB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_provider 
            ON api_keys(provider)
        ''')
        
        conn.commit()
        conn.close()
    
    def save_key(self, provider: str, api_key: str) -> None:
        """Encrypt and store an API key.
        
        Args:
            provider: Provider identifier (e.g., 'agnes', 'openai')
            api_key: The raw API key to encrypt
        """
        encrypted_key = self.cipher.encrypt(api_key.encode('utf-8'))
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO api_keys (provider, key_encrypted, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(provider) DO UPDATE SET
                key_encrypted = excluded.key_encrypted,
                updated_at = datetime('now')
        ''', (provider, encrypted_key))
        
        conn.commit()
        conn.close()
    
    def get_key(self, provider: str) -> str:
        """Retrieve and decrypt an API key.
        
        Args:
            provider: Provider identifier
            
        Returns:
            Decrypted API key string
            
        Raises:
            KeyError: If no key exists for the provider
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute(
            'SELECT key_encrypted FROM api_keys WHERE provider = ?',
            (provider,)
        )
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise KeyError(f"No API key stored for provider: {provider}")
        
        decrypted = self.cipher.decrypt(row[0])
        return decrypted.decode('utf-8')
    
    def delete_key(self, provider: str) -> bool:
        """Remove an API key from storage.
        
        Args:
            provider: Provider identifier
            
        Returns:
            True if key was deleted, False if not found
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM api_keys WHERE provider = ?', (provider,))
        deleted = cursor.rowcount > 0
        
        conn.commit()
        conn.close()
        
        return deleted
    
    def list_providers(self) -> List[str]:
        """Get list of all configured providers.
        
        Returns:
            List of provider names
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT provider FROM api_keys ORDER BY provider')
        providers = [row[0] for row in cursor.fetchall()]
        
        conn.close()
        return providers
    
    def key_exists(self, provider: str) -> bool:
        """Check if a key exists for provider.
        
        Args:
            provider: Provider identifier
            
        Returns:
            True if key exists
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute(
            'SELECT 1 FROM api_keys WHERE provider = ? LIMIT 1',
            (provider,)
        )
        
        exists = cursor.fetchone() is not None
        conn.close()
        
        return exists
    
    def clear_all(self) -> int:
        """Remove all stored keys.
        
        Returns:
            Number of keys deleted
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM api_keys')
        count = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        return count

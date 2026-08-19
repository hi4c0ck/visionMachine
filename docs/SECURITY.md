# Security Architecture

## API Key Management Strategy

### Critical Security Requirements

1. **Keys Never Stored in Plain Text**
   - All API keys encrypted before storage
   - Encryption keys derived from user credentials
   - Keys loaded into memory only during active sessions

2. **Provider Isolation**
   - Each provider (Agnes, OpenAI, Azure, etc.) has isolated configuration
   - Provider-specific endpoints hardcoded where possible
   - Custom providers require explicit user configuration

3. **Runtime Security**
   - No logging of API keys
   - Secure memory handling (overwrite after use)
   - Process isolation for sensitive operations

---

## Key Storage Implementation

### Encrypted Key Store

```python
import hashlib
import os
from pathlib import Path
from cryptography.fernet import Fernet
import sqlite3


class EncryptedKeyStore:
    """Secure storage for API keys using SQLite + encryption"""
    
    def __init__(self, db_path: str, master_password: str):
        self.db_path = Path(db_path)
        self.master_key = self._derive_key(master_password)
        self.cipher = Fernet(self.master_key)
        self._init_database()
    
    def _derive_key(self, password: str) -> bytes:
        """Derive encryption key from master password"""
        salt = b'visionmachine_salt_2026'
        # Use PBKDF2 for key derivation
        key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
        return base64.urlsafe_b64encode(key[:32])
    
    def _init_database(self):
        """Initialize SQLite database for key storage"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT UNIQUE NOT NULL,
                key_encrypted BLOB NOT NULL,
                iv BLOB NOT NULL,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def save_key(self, provider: str, api_key: str):
        """Encrypt and store API key"""
        # Generate unique IV for each encryption
        iv = os.urandom(16)
        
        # Encrypt the key
        encrypted_key = self.cipher.encrypt(api_key.encode())
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO api_keys 
            (provider, key_encrypted, iv)
            VALUES (?, ?, ?)
        ''', (provider, encrypted_key, iv))
        
        conn.commit()
        conn.close()
    
    def get_key(self, provider: str) -> str:
        """Retrieve and decrypt API key"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute(
            'SELECT key_encrypted, iv FROM api_keys WHERE provider = ?',
            (provider,)
        )
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise ValueError(f"No key found for provider: {provider}")
        
        # Decrypt the key
        decrypted = self.cipher.decrypt(row[0])
        return decrypted.decode()
    
    def delete_key(self, provider: str):
        """Remove API key from storage"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM api_keys WHERE provider = ?', (provider,))
        
        conn.commit()
        conn.close()
    
    def list_providers(self) -> list:
        """List all configured providers"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT provider FROM api_keys')
        providers = [row[0] for row in cursor.fetchall()]
        
        conn.close()
        return providers
```

---

## Provider Configuration Isolation

### Provider Interface

```python
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import aiohttp


class BaseProvider(ABC):
    """Base interface for all AI providers"""
    
    @abstractmethod
    async def generate_video(
        self,
        prompt: str,
        duration: int,
        **kwargs
    ) -> Dict[str, Any]:
        """Generate video from prompt"""
        pass
    
    @abstractmethod
    async def generate_image(
        self,
        prompt: str,
        size: tuple[int, int],
        **kwargs
    ) -> Dict[str, Any]:
        """Generate image from prompt"""
        pass
    
    @abstractmethod
    def validate_key(self, key: str) -> bool:
        """Validate API key without making expensive calls"""
        pass


class AgnesProvider(BaseProvider):
    """Agnes LLM endpoint provider - primary"""
    
    ENDPOINT = "https://api.agnes.ai/v1"
    DEFAULT_MODEL = "agnes-video-v1"
    
    def __init__(self, key_store: EncryptedKeyStore):
        self.key_store = key_store
        self.client = None
    
    async def _get_client(self) -> aiohttp.ClientSession:
        """Create authenticated HTTP client"""
        api_key = self.key_store.get_key("agnes")
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        self.client = aiohttp.ClientSession(
            base_url=self.ENDPOINT,
            headers=headers
        )
        return self.client
    
    async def generate_video(self, prompt: str, duration: int, **kwargs) -> Dict[str, Any]:
        """Generate video using Agnes endpoint"""
        client = await self._get_client()
        
        payload = {
            "model": kwargs.get("model", self.DEFAULT_MODEL),
            "prompt": prompt,
            "duration": min(duration, 60),  # Hard limit
            **kwargs
        }
        
        async with client.post("/videos/generate", json=payload) as resp:
            if resp.status != 200:
                error = await resp.json()
                raise ProviderError(f"Agnes API error: {error}")
            
            return await resp.json()
    
    def validate_key(self, key: str) -> bool:
        """Quick validation without generating content"""
        # Test endpoint available, lightweight check
        test_payload = {"test": True}
        try:
            # This would be a real validation call
            return True  # Simplified for documentation
        except:
            return False


class OpenAICompatibleProvider(BaseProvider):
    """OpenAI-compatible endpoint provider - configurable"""
    
    def __init__(self, key_store: EncryptedKeyStore, base_url: str, model: str = None):
        self.key_store = key_store
        self.endpoint = base_url.rstrip("/")
        self.model = model or "gpt-4o-mini"
        self.client = None
    
    async def _get_client(self) -> aiohttp.ClientSession:
        """Create authenticated HTTP client for custom endpoint"""
        api_key = self.key_store.get_key(self.endpoint)  # Use URL as identifier
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        self.client = aiohttp.ClientSession(
            base_url=self.endpoint,
            headers=headers
        )
        return self.client
    
    async def generate_video(self, prompt: str, duration: int, **kwargs) -> Dict[str, Any]:
        """Generate video using OpenAI-compatible endpoint"""
        client = await self._get_client()
        
        payload = {
            "model": kwargs.get("model", self.model),
            "prompt": prompt,
            "duration": min(duration, 60),
            **kwargs
        }
        
        async with client.post("/chat/completions", json=payload) as resp:
            if resp.status != 200:
                error = await resp.json()
                raise ProviderError(f"OpenAI-compatible API error: {error}")
            
            return await resp.json()
```

---

## Provider Factory Pattern

```python
from enum import Enum
from typing import Type


class ProviderType(Enum):
    AGNES = "agnes"
    OPENAI_COMPATIBLE = "openai_compatible"
    AZURE_OPENAI = "azure_openai"


class ProviderFactory:
    """Factory for creating provider instances"""
    
    _registry: Dict[str, Type[BaseProvider]] = {}
    
    @classmethod
    def register(cls, name: str, provider_class: Type[BaseProvider]):
        cls._registry[name] = provider_class
    
    @classmethod
    def create(cls, provider_type: ProviderType, config: Dict[str, Any]) -> BaseProvider:
        """Create provider instance based on type and config"""
        provider_class = cls._registry.get(provider_type.value)
        
        if not provider_class:
            raise ValueError(f"Unknown provider type: {provider_type}")
        
        key_store = config.get("key_store")
        
        if provider_type == ProviderType.AGNES:
            return AgnesProvider(key_store=key_store)
        
        elif provider_type == ProviderType.OPENAI_COMPATIBLE:
            return OpenAICompatibleProvider(
                key_store=key_store,
                base_url=config["base_url"],
                model=config.get("model")
            )
        
        else:
            raise ValueError(f"Unsupported provider: {provider_type}")


# Register providers
ProviderFactory.register("agnes", AgnesProvider)
ProviderFactory.register("openai_compatible", OpenAICompatibleProvider)
```

---

## Configuration Management

### Environment-Based Configuration

```python
import os
from pathlib import Path
from dataclasses import dataclass
from typing import Optional


@dataclass
class ProviderConfig:
    """Configuration for a single provider"""
    type: ProviderType
    base_url: Optional[str] = None
    model: Optional[str] = None
    timeout: int = 300  # seconds


@dataclass
class AppConfiguration:
    """Main application configuration"""
    providers: Dict[str, ProviderConfig]
    max_video_duration: int = 60
    default_resolution: tuple[int, int] = (1920, 1080)
    cache_enabled: bool = True
    log_level: str = "INFO"


class ConfigManager:
    """Manage application configuration securely"""
    
    CONFIG_FILE = Path.home() / ".config" / "visionmachine" / "config.json"
    SECRET_FILE = Path.home() / ".config" / "visionmachine" / "secrets.json"
    
    def __init__(self):
        self.config_path = self.CONFIG_FILE
        self.secrets_path = self.SECRET_FILE
        self._ensure_directories()
    
    def _ensure_directories(self):
        """Create config directories if they don't exist"""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.secrets_path.parent.mkdir(parents=True, exist_ok=True)
    
    def load_configuration(self) -> AppConfiguration:
        """Load configuration from files"""
        # Load public config
        if self.config_path.exists():
            with open(self.config_path) as f:
                config_data = json.load(f)
        else:
            config_data = self._default_config()
        
        # Load encrypted secrets separately
        key_store_path = str(self.secrets_path)
        key_store = EncryptedKeyStore(key_store_path, self._get_master_password())
        
        # Build providers dict
        providers = {}
        for name, provider_config in config_data.get("providers", {}).items():
            providers[name] = ProviderConfig(
                type=ProviderType(provider_config["type"]),
                base_url=provider_config.get("base_url"),
                model=provider_config.get("model"),
                timeout=provider_config.get("timeout", 300)
            )
        
        return AppConfiguration(
            providers=providers,
            max_video_duration=config_data.get("max_video_duration", 60),
            default_resolution=tuple(config_data.get("default_resolution", [1920, 1080])),
            cache_enabled=config_data.get("cache_enabled", True),
            log_level=config_data.get("log_level", "INFO")
        )
    
    def _default_config(self) -> dict:
        """Return default configuration"""
        return {
            "providers": {
                "primary": {
                    "type": "agnes",
                    "timeout": 300
                }
            },
            "max_video_duration": 60,
            "default_resolution": [1920, 1080],
            "cache_enabled": True,
            "log_level": "INFO"
        }
    
    def _get_master_password(self) -> str:
        """Get master password from environment or prompt"""
        # Check environment variable first
        password = os.environ.get("VISION_MACHINE_PASSWORD")
        if password:
            return password
        
        # Fallback: prompt user (in real app, use secure dialog)
        raise ValueError("Master password not set. Set VISION_MACHINE_PASSWORD environment variable.")
```

---

## Security Best Practices

### 1. Memory Security
- Zero out key buffers after use
- Use secure string handling libraries
- Avoid logging sensitive data

### 2. Network Security
- Always use HTTPS
- Certificate pinning for critical endpoints
- Timeout limits to prevent DoS

### 3. Storage Security
- Encrypt keys at rest
- Separate config from secrets
- Regular key rotation support

### 4. Error Handling
- Generic error messages (no provider details)
- Rate limiting awareness
- Graceful degradation

---

## Provider Migration Guide

### Switching from Agnes to OpenAI-Compatible

1. Update configuration file:
```json
{
  "providers": {
    "primary": {
      "type": "openai_compatible",
      "base_url": "https://api.openai.com/v1",
      "model": "gpt-4o"
    }
  }
}
```

2. Store new API key using the UI settings panel

3. No code changes required - provider abstraction handles it

---

*Security document version: 1.0*
*Last updated: 2026-08-19*
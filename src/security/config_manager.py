"""Configuration manager with secure secret handling."""

import json
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import Dict, Optional, Tuple
from enum import Enum
import os


class ProviderType(str, Enum):
    """Supported provider types."""
    AGNES = "agnes"
    OPENAI_COMPATIBLE = "openai_compatible"
    AZURE_OPENAI = "azure_openai"
    CUSTOM = "custom"


@dataclass
class ProviderConfig:
    """Configuration for a single AI provider."""
    type: ProviderType
    endpoint: str
    model: Optional[str] = None
    timeout: int = 300  # seconds
    metadata: Dict[str, any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        d = asdict(self)
        d['type'] = self.type.value
        return d
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'ProviderConfig':
        data['type'] = ProviderType(data['type'])
        return cls(**data)


@dataclass
class AppConfiguration:
    """Main application configuration."""
    providers: Dict[str, ProviderConfig] = field(default_factory=dict)
    max_video_duration: int = 60
    default_resolution: Tuple[int, int] = (1920, 1080)
    cache_enabled: bool = True
    log_level: str = "INFO"
    auto_save_projects: bool = True
    
    def to_dict(self) -> Dict:
        return asdict(self)
    
    @classmethod
    def from_dict(self, data: Dict) -> 'AppConfiguration':
        providers = {}
        for name, config in data.get('providers', {}).items():
            providers[name] = ProviderConfig.from_dict(config)
        data['providers'] = providers
        data['default_resolution'] = tuple(data.get('default_resolution', [1920, 1080]))
        return cls(**data)


class ConfigManager:
    """Manage application configuration and secure secrets."""
    
    CONFIG_DIR = Path.home() / ".config" / "visionmachine"
    CONFIG_FILE = CONFIG_DIR / "config.json"
    KEY_STORE_PATH = CONFIG_DIR / "keys.db"
    
    def __init__(self, master_password_env: str = "VISION_MACHINE_PASSWORD"):
        """Initialize config manager.
        
        Args:
            master_password_env: Environment variable containing master password
        """
        self.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        self.master_password_env = master_password_env
        self._config: Optional[AppConfiguration] = None
        self._key_store = None
    
    def _get_master_password(self) -> str:
        """Retrieve master password from environment."""
        password = os.environ.get(self.master_password_env)
        if not password:
            raise ValueError(
                f"Environment variable {self.master_password_env} not set.\n"
                "Please set VISION_MACHINE_PASSWORD before running the application."
            )
        return password
    
    @property
    def key_store(self):
        """Lazy-load key store."""
        if self._key_store is None:
            password = self._get_master_password()
            self._key_store = EncryptedKeyStore(
                str(self.KEY_STORE_PATH),
                password
            )
        return self._key_store
    
    def load_configuration(self) -> AppConfiguration:
        """Load configuration from disk.
        
        Returns:
            AppConfiguration instance
        """
        if self._config is not None:
            return self._config
        
        if self.CONFIG_FILE.exists():
            with open(self.CONFIG_FILE, 'r') as f:
                config_data = json.load(f)
            self._config = AppConfiguration.from_dict(config_data)
        else:
            self._config = self._create_default_config()
            self.save_configuration()
        
        return self._config
    
    def save_configuration(self) -> None:
        """Save current configuration to disk."""
        if self._config is None:
            self._config = self.load_configuration()
        
        with open(self.CONFIG_FILE, 'w') as f:
            json.dump(self._config.to_dict(), f, indent=2)
    
    def _create_default_config(self) -> AppConfiguration:
        """Create default configuration."""
        return AppConfiguration(
            providers={
                "primary": ProviderConfig(
                    type=ProviderType.AGNES,
                    endpoint="https://api.agnes.ai/v1",
                    model="agnes-video-v1",
                    timeout=300
                )
            },
            max_video_duration=60,
            default_resolution=(1920, 1080),
            cache_enabled=True,
            log_level="INFO"
        )
    
    # Provider management methods
    
    def get_provider(self, name: str = "primary") -> ProviderConfig:
        """Get provider configuration by name.
        
        Args:
            name: Provider name (default: 'primary')
            
        Returns:
            ProviderConfig instance
        """
        config = self.load_configuration()
        return config.providers.get(name, config.providers.get("primary"))
    
    def list_providers(self) -> List[str]:
        """List all configured provider names.
        
        Returns:
            List of provider names
        """
        config = self.load_configuration()
        return list(config.providers.keys())
    
    def add_provider(self, name: str, config: ProviderConfig) -> None:
        """Add or update a provider configuration.
        
        Args:
            name: Provider name
            config: Provider configuration
        """
        cfg = self.load_configuration()
        cfg.providers[name] = config
        self.save_configuration()
    
    def remove_provider(self, name: str) -> bool:
        """Remove a provider configuration.
        
        Args:
            name: Provider name
            
        Returns:
            True if removed, False if not found
        """
        cfg = self.load_configuration()
        if name in cfg.providers:
            del cfg.providers[name]
            self.save_configuration()
            return True
        return False
    
    def get_api_key(self, provider_name: str) -> str:
        """Get API key for a provider.
        
        Args:
            provider_name: Name of the provider
            
        Returns:
            Decrypted API key
        """
        return self.key_store.get_key(provider_name)
    
    def set_api_key(self, provider_name: str, api_key: str) -> None:
        """Store API key for a provider.
        
        Args:
            provider_name: Name of the provider
            api_key: API key to store
        """
        self.key_store.save_key(provider_name, api_key)
    
    def delete_api_key(self, provider_name: str) -> bool:
        """Delete API key for a provider.
        
        Args:
            provider_name: Name of the provider
            
        Returns:
            True if deleted, False if not found
        """
        return self.key_store.delete_key(provider_name)
    
    def has_api_key(self, provider_name: str) -> bool:
        """Check if API key exists for provider.
        
        Args:
            provider_name: Name of the provider
            
        Returns:
            True if key exists
        """
        return self.key_store.key_exists(provider_name)
    
    def validate_configuration(self) -> Dict[str, bool]:
        """Validate current configuration.
        
        Returns:
            Dictionary of validation results
        """
        results = {
            "config_file_valid": False,
            "has_primary_provider": False,
            "master_password_set": False,
            "key_store_accessible": False
        }
        
        # Check config file
        try:
            cfg = self.load_configuration()
            results["config_file_valid"] = True
            
            # Check primary provider exists
            results["has_primary_provider"] = "primary" in cfg.providers
        except Exception:
            pass
        
        # Check master password
        try:
            self._get_master_password()
            results["master_password_set"] = True
        except ValueError:
            pass
        
        # Check key store accessibility
        try:
            self.key_store.list_providers()
            results["key_store_accessible"] = True
        except Exception:
            pass
        
        return results

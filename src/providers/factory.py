"""Provider factory for creating provider instances."""

from typing import Dict, Type, Optional, List
from .base import BaseProvider
from .agnes import AgnesProvider
from .openai_compatible import OpenAICompatibleProvider
from ..security import ProviderType


class ProviderFactory:
    """Factory pattern for creating provider instances."""
    
    _registry: Dict[str, Type[BaseProvider]] = {}
    
    @classmethod
    def register(cls, name: str, provider_class: Type[BaseProvider]):
        """Register a provider class.
        
        Args:
            name: Provider type identifier
            provider_class: Provider class to register
        """
        cls._registry[name] = provider_class
    
    @classmethod
    def create(
        cls,
        provider_type: ProviderType,
        key_store,
        config: Dict
    ) -> BaseProvider:
        """Create provider instance based on type and configuration.
        
        Args:
            provider_type: Type enum value
            key_store: EncryptedKeyStore instance
            config: Provider configuration dictionary
            
        Returns:
            Provider instance
            
        Raises:
            ValueError: If provider type is unknown
        """
        provider_class = cls._registry.get(provider_type.value)
        
        if not provider_class:
            raise ValueError(f"Unknown provider type: {provider_type.value}")
        
        if provider_type == ProviderType.AGNES:
            return AgnesProvider(
                key_store=key_store,
                endpoint=config.get("endpoint"),
                model=config.get("model")
            )
        
        elif provider_type == ProviderType.OPENAI_COMPATIBLE:
            if not config.get("endpoint"):
                raise ValueError("Endpoint required for openai_compatible provider")
            
            return OpenAICompatibleProvider(
                key_store=key_store,
                endpoint=config["endpoint"],
                model=config.get("model"),
                timeout=config.get("timeout", 300)
            )
        
        else:
            raise ValueError(f"Unsupported provider type: {provider_type}")
    
    @classmethod
    def get_registered_types(cls) -> List[str]:
        """Get list of registered provider types.
        
        Returns:
            List of provider type strings
        """
        return list(cls._registry.keys())
    
    @classmethod
    def create_from_config(
        cls,
        key_store,
        provider_name: str,
        config: Dict
    ) -> BaseProvider:
        """Create provider from configuration dictionary.
        
        Args:
            key_store: EncryptedKeyStore instance
            provider_name: Provider identifier
            config: Configuration dictionary
            
        Returns:
            Provider instance
        """
        provider_type = config.get("type")
        
        if isinstance(provider_type, str):
            provider_type = ProviderType(provider_type)
        
        return cls.create(provider_type, key_store, config)


# Register built-in providers
ProviderFactory.register("agnes", AgnesProvider)
ProviderFactory.register("openai_compatible", OpenAICompatibleProvider)
"""Provider abstraction layer for AI endpoints."""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
import aiohttp
import asyncio


class ProviderError(Exception):
    """Base exception for provider errors."""
    pass


class ProviderConnectionError(ProviderError):
    """Raised when connection to provider fails."""
    pass


class ProviderAuthenticationError(ProviderError):
    """Raised when authentication fails."""
    pass


class ProviderRateLimitError(ProviderError):
    """Raised when rate limit is exceeded."""
    pass


class BaseProvider(ABC):
    """Abstract base class for all AI providers."""
    
    @abstractmethod
    async def generate_video(
        self,
        prompt: str,
        duration: int,
        **kwargs
    ) -> Dict[str, Any]:
        """Generate a video from prompt.
        
        Args:
            prompt: Text description of video content
            duration: Desired duration in seconds (max 60)
            **kwargs: Additional provider-specific parameters
            
        Returns:
            Dictionary containing video generation results
        """
        pass
    
    @abstractmethod
    async def generate_image(
        self,
        prompt: str,
        size: tuple[int, int] = (1920, 1080),
        **kwargs
    ) -> Dict[str, Any]:
        """Generate an image from prompt.
        
        Args:
            prompt: Text description of image content
            size: Target size as (width, height)
            **kwargs: Additional provider-specific parameters
            
        Returns:
            Dictionary containing image generation results
        """
        pass
    
    @abstractmethod
    async def generate_text(
        self,
        prompt: str,
        **kwargs
    ) -> str:
        """Generate text from prompt.
        
        Args:
            prompt: Text prompt
            **kwargs: Additional provider-specific parameters
            
        Returns:
            Generated text string
        """
        pass
    
    @abstractmethod
    async def validate_connection(self) -> bool:
        """Validate provider connection and credentials.
        
        Returns:
            True if connection is valid
        """
        pass
    
    @abstractmethod
    def get_supported_models(self) -> List[str]:
        """Get list of supported model names.
        
        Returns:
            List of model identifiers
        """
        pass


class AgnesProvider(BaseProvider):
    """Agnes LLM endpoint provider - primary/secure."""
    
    DEFAULT_ENDPOINT = "https://api.agnes.ai/v1"
    DEFAULT_MODEL = "agnes-video-v1"
    VALIDATION_PATH = "/health"
    
    def __init__(self, key_store, endpoint: str = None, model: str = None):
        """Initialize Agnes provider.
        
        Args:
            key_store: EncryptedKeyStore instance
            endpoint: Custom endpoint (optional)
            model: Model identifier (optional)
        """
        self.key_store = key_store
        self.endpoint = endpoint or self.DEFAULT_ENDPOINT
        self.model = model or self.DEFAULT_MODEL
        self._session = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create authenticated HTTP session."""
        if self._session and not self._session.closed:
            return self._session
        
        api_key = self.key_store.get_key("agnes")
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        self._session = aiohttp.ClientSession(
            base_url=self.endpoint,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=300)
        )
        return self._session
    
    async def close(self):
        """Close HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def generate_video(self, prompt: str, duration: int, **kwargs) -> Dict[str, Any]:
        """Generate video using Agnes endpoint.
        
        Args:
            prompt: Video description
            duration: Duration in seconds (capped at 60)
            **kwargs: Additional parameters (model, style, etc.)
            
        Returns:
            Generation result dict
        """
        session = await self._get_session()
        
        payload = {
            "prompt": prompt,
            "duration": min(duration, 60),
            "model": kwargs.get("model", self.model),
            **kwargs
        }
        
        async with session.post("/videos/generate", json=payload) as resp:
            if resp.status == 401:
                raise ProviderAuthenticationError("Invalid API key")
            elif resp.status == 429:
                raise ProviderRateLimitError("Rate limit exceeded")
            elif resp.status != 200:
                error = await resp.json()
                raise ProviderError(f"Video generation failed: {error}")
            
            return await resp.json()
    
    async def generate_image(self, prompt: str, size: tuple[int, int] = (1920, 1080), **kwargs) -> Dict[str, Any]:
        """Generate image using Agnes endpoint.
        
        Args:
            prompt: Image description
            size: Target size (width, height)
            **kwargs: Additional parameters
            
        Returns:
            Generation result dict
        """
        session = await self._get_session()
        
        payload = {
            "prompt": prompt,
            "width": size[0],
            "height": size[1],
            "model": kwargs.get("model", self.model),
            **kwargs
        }
        
        async with session.post("/images/generate", json=payload) as resp:
            if resp.status != 200:
                error = await resp.json()
                raise ProviderError(f"Image generation failed: {error}")
            
            return await resp.json()
    
    async def generate_text(self, prompt: str, **kwargs) -> str:
        """Generate text using Agnes endpoint.
        
        Args:
            prompt: Text prompt
            **kwargs: Additional parameters
            
        Returns:
            Generated text string
        """
        session = await self._get_session()
        
        payload = {
            "prompt": prompt,
            "model": kwargs.get("model", self.model),
            **kwargs
        }
        
        async with session.post("/chat/completions", json=payload) as resp:
            if resp.status != 200:
                error = await resp.json()
                raise ProviderError(f"Text generation failed: {error}")
            
            data = await resp.json()
            return data["choices"][0]["message"]["content"]
    
    async def validate_connection(self) -> bool:
        """Validate provider connection.
        
        Returns:
            True if connection is valid
        """
        try:
            session = await self._get_session()
            async with session.get(self.VALIDATION_PATH) as resp:
                return resp.status == 200
        except Exception:
            return False
    
    def get_supported_models(self) -> List[str]:
        """Get supported models."""
        return [self.model]
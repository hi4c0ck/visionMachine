"""Agnes LLM endpoint provider - primary and secure."""

from typing import Dict, Any, List
import aiohttp
from .base import BaseProvider, ProviderError, ProviderAuthenticationError, ProviderRateLimitError


class AgnesProvider(BaseProvider):
    """Agnes LLM provider with hardcoded secure endpoint.
    
    This provider uses a fixed endpoint URL that cannot be changed by users,
    ensuring security through obscurity for the primary provider.
    """
    
    DEFAULT_ENDPOINT = "https://api.agnes.ai/v1"
    DEFAULT_MODEL = "agnes-video-v1"
    HEALTH_CHECK_PATH = "/health"
    
    def __init__(self, key_store, endpoint: str = None, model: str = None):
        """Initialize Agnes provider.
        
        Args:
            key_store: EncryptedKeyStore instance for API key management
            endpoint: Custom endpoint (optional, defaults to hardcoded)
            model: Model identifier (optional, defaults to main model)
        """
        self.key_store = key_store
        self.endpoint = endpoint or self.DEFAULT_ENDPOINT
        self.model = model or self.DEFAULT_MODEL
        self._session = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create authenticated HTTP session."""
        if self._session and not self._session.closed:
            return self._session
        
        # Retrieve encrypted API key
        api_key = self.key_store.get_key("agnes")
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        self._session = aiohttp.ClientSession(
            base_url=self.endpoint,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=300)  # 5 minute timeout
        )
        return self._session
    
    async def close(self):
        """Close HTTP session when done."""
        if self._session and not self._session.closed:
            await self._session.close()
    
    async def __aenter__(self):
        """Async context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
    
    async def generate_video(self, prompt: str, duration: int, **kwargs) -> Dict[str, Any]:
        """Generate video using Agnes endpoint.
        
        Args:
            prompt: Text description of video content
            duration: Desired duration in seconds (capped at 60)
            **kwargs: Additional parameters (model, style, etc.)
            
        Returns:
            Dictionary containing video generation results
        """
        session = await self._get_session()
        
        payload = {
            "prompt": prompt,
            "duration": min(duration, 60),  # Hard limit per requirements
            "model": kwargs.get("model", self.model),
            **{k: v for k, v in kwargs.items() if k != "model"}
        }
        
        async with session.post("/videos/generate", json=payload) as resp:
            await self._handle_response(resp)
            return await resp.json()
    
    async def generate_image(self, prompt: str, size: tuple[int, int] = (1920, 1080), **kwargs) -> Dict[str, Any]:
        """Generate supportive image using Agnes endpoint.
        
        Args:
            prompt: Image description
            size: Target size as (width, height)
            **kwargs: Additional parameters
            
        Returns:
            Dictionary containing image generation results
        """
        session = await self._get_session()
        
        payload = {
            "prompt": prompt,
            "width": size[0],
            "height": size[1],
            "model": kwargs.get("model", self.model),
            **{k: v for k, v in kwargs.items() if k != "model"}
        }
        
        async with session.post("/images/generate", json=payload) as resp:
            await self._handle_response(resp)
            return await resp.json()
    
    async def generate_text(self, prompt: str, **kwargs) -> str:
        """Generate text/script using Agnes endpoint.
        
        Args:
            prompt: Text prompt for generation
            **kwargs: Additional parameters
            
        Returns:
            Generated text string
        """
        session = await self._get_session()
        
        payload = {
            "prompt": prompt,
            "model": kwargs.get("model", self.model),
            **{k: v for k, v in kwargs.items() if k != "model"}
        }
        
        async with session.post("/chat/completions", json=payload) as resp:
            await self._handle_response(resp)
            data = await resp.json()
            return data["choices"][0]["message"]["content"]
    
    async def validate_connection(self) -> bool:
        """Validate provider connection and credentials.
        
        Returns:
            True if connection is valid, False otherwise
        """
        try:
            session = await self._get_session()
            async with session.get(self.HEALTH_CHECK_PATH) as resp:
                return resp.status == 200
        except Exception:
            return False
    
    def get_supported_models(self) -> List[str]:
        """Get list of supported model identifiers.
        
        Returns:
            List of model names
        """
        return [self.model]
    
    async def _handle_response(self, resp):
        """Handle API response with appropriate error raising.
        
        Args:
            resp: HTTP response object
        """
        if resp.status == 401:
            raise ProviderAuthenticationError("Invalid or expired API key")
        elif resp.status == 429:
            raise ProviderRateLimitError("Rate limit exceeded, please wait")
        elif resp.status != 200:
            try:
                error_data = await resp.json()
                error_msg = error_data.get("error", {}).get("message", "Unknown error")
            except Exception:
                error_msg = f"HTTP {resp.status}"
            raise ProviderError(f"API error: {error_msg}")
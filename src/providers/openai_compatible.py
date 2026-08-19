"""OpenAI-compatible provider for flexible endpoint support."""

from typing import Dict, Any, List
import aiohttp
from .base import BaseProvider, ProviderError, ProviderAuthenticationError, ProviderRateLimitError


class OpenAICompatibleProvider(BaseProvider):
    """Provider for OpenAI-compatible endpoints (Azure, local servers, etc.)."""
    
    def __init__(
        self,
        key_store,
        endpoint: str,
        model: str = "gpt-4o-mini",
        timeout: int = 300
    ):
        """Initialize OpenAI-compatible provider.
        
        Args:
            key_store: EncryptedKeyStore instance
            endpoint: Full API endpoint URL
            model: Model identifier
            timeout: Request timeout in seconds
        """
        self.key_store = key_store
        self.endpoint = endpoint.rstrip("/")
        self.model = model
        self.timeout = timeout
        self._session = None
        
        # Use endpoint URL as provider identifier for key storage
        self.provider_name = self.endpoint.replace("https://", "").replace("/", "_")
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create authenticated HTTP session."""
        if self._session and not self._session.closed:
            return self._session
        
        api_key = self.key_store.get_key(self.provider_name)
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        self._session = aiohttp.ClientSession(
            base_url=self.endpoint,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=self.timeout)
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
        """Generate video using OpenAI-compatible endpoint.
        
        Note: Not all OpenAI-compatible endpoints support video generation.
        This uses the standard /chat/completions endpoint.
        """
        session = await self._get_session()
        
        # Try video generation endpoint first
        endpoints_to_try = ["/videos/generate", "/chat/completions"]
        
        for endpoint_path in endpoints_to_try:
            try:
                payload = {
                    "model": kwargs.get("model", self.model),
                    "prompt": prompt,
                    "duration": min(duration, 60),
                    **kwargs
                }
                
                async with session.post(endpoint_path, json=payload) as resp:
                    if resp.status == 401:
                        raise ProviderAuthenticationError("Invalid API key")
                    elif resp.status == 429:
                        raise ProviderRateLimitError("Rate limit exceeded")
                    elif resp.status == 404:
                        continue  # Try next endpoint
                    elif resp.status != 200:
                        error = await resp.json()
                        raise ProviderError(f"Video generation failed: {error}")
                    
                    return await resp.json()
            except ProviderError:
                raise
            except Exception:
                continue
        
        raise ProviderError("Video generation endpoint not available on this provider")
    
    async def generate_image(self, prompt: str, size: tuple[int, int] = (1920, 1080), **kwargs) -> Dict[str, Any]:
        """Generate image using OpenAI-compatible endpoint.
        
        Uses /images/generations endpoint (DALL-E compatible).
        """
        session = await self._get_session()
        
        payload = {
            "model": kwargs.get("model", self.model),
            "prompt": prompt,
            "size": f"{size[0]}x{size[1]}",
            **kwargs
        }
        
        async with session.post("/images/generations", json=payload) as resp:
            if resp.status == 401:
                raise ProviderAuthenticationError("Invalid API key")
            elif resp.status == 429:
                raise ProviderRateLimitError("Rate limit exceeded")
            elif resp.status != 200:
                error = await resp.json()
                raise ProviderError(f"Image generation failed: {error}")
            
            return await resp.json()
    
    async def generate_text(self, prompt: str, **kwargs) -> str:
        """Generate text using chat completions endpoint.
        
        Standard OpenAI-compatible text generation.
        """
        session = await self._get_session()
        
        payload = {
            "model": kwargs.get("model", self.model),
            "messages": [{"role": "user", "content": prompt}],
            **kwargs
        }
        
        async with session.post("/chat/completions", json=payload) as resp:
            if resp.status == 401:
                raise ProviderAuthenticationError("Invalid API key")
            elif resp.status == 429:
                raise ProviderRateLimitError("Rate limit exceeded")
            elif resp.status != 200:
                error = await resp.json()
                raise ProviderError(f"Text generation failed: {error}")
            
            data = await resp.json()
            return data["choices"][0]["message"]["content"]
    
    async def validate_connection(self) -> bool:
        """Validate provider connection.
        
        Attempts a lightweight request to check connectivity.
        """
        try:
            session = await self._get_session()
            
            # Try to list models as a lightweight validation
            async with session.get("/models") as resp:
                return resp.status in [200, 401]  # 401 means connection works, auth failed
        except Exception:
            return False
    
    def get_supported_models(self) -> List[str]:
        """Get supported models (just the configured one for now)."""
        return [self.model]
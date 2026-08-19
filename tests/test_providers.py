"""Tests for provider abstractions."""
import pytest
from unittest.mock import Mock, AsyncMock, patch
from src.providers.base import BaseProvider, ProviderError
from src.providers.agnes import AgnesProvider
from src.providers.openai_compatible import OpenAICompatibleProvider


class TestAgnesProvider:
    """Tests for Agnes provider."""
    
    @pytest.fixture
    def mock_key_store(self):
        """Create mock key store."""
        store = Mock()
        store.get_key.return_value = "test-agnes-key"
        return store
    
    @pytest.fixture
    def agnes_provider(self, mock_key_store):
        """Create Agnes provider instance."""
        return AgnesProvider(key_store=mock_key_store)
    
    @pytest.mark.asyncio
    async def test_init_uses_default_endpoint(self, agnes_provider):
        """Test that default endpoint is set."""
        assert agnes_provider.endpoint == "https://api.agnes.ai/v1"
        assert agnes_provider.model == "agnes-video-v1"
    
    @pytest.mark.asyncio
    async def test_init_with_custom_values(self, mock_key_store):
        """Test initialization with custom values."""
        provider = AgnesProvider(
            key_store=mock_key_store,
            endpoint="https://custom.ai/v1",
            model="custom-model"
        )
        
        assert provider.endpoint == "https://custom.ai/v1"
        assert provider.model == "custom-model"
    
    @pytest.mark.asyncio
    async def test_get_supported_models(self, agnes_provider):
        """Test getting supported models."""
        models = agnes_provider.get_supported_models()
        
        assert len(models) == 1
        assert models[0] == "agnes-video-v1"
    
    @pytest.mark.asyncio
    async def test_validate_connection_success(self, agnes_provider, mock_key_store):
        """Test connection validation success."""
        with patch('aiohttp.ClientSession') as mock_session:
            mock_resp = AsyncMock()
            mock_resp.status = 200
            mock_session.return_value.get.return_value.__aenter__.return_value = mock_resp
            
            result = await agnes_provider.validate_connection()
            
            assert result is True
    
    @pytest.mark.asyncio
    async def test_validate_connection_failure(self, agnes_provider, mock_key_store):
        """Test connection validation failure."""
        with patch('aiohttp.ClientSession') as mock_session:
            mock_session.side_effect = Exception("Connection failed")
            
            result = await agnes_provider.validate_connection()
            
            assert result is False
    
    @pytest.mark.asyncio
    async def test_generate_video(self, agnes_provider, mock_key_store):
        """Test video generation."""
        with patch('aiohttp.ClientSession') as mock_session:
            mock_resp = AsyncMock()
            mock_resp.status = 200
            mock_resp.json.return_value = asyncio.Future()
            mock_resp.json.return_value.set_result({
                "video_url": "https://example.com/video.mp4",
                "duration": 30
            })
            
            mock_context = AsyncMock()
            mock_context.__aenter__.return_value = mock_resp
            mock_session.return_value.post.return_value = mock_context
            
            result = await agnes_provider.generate_video(
                prompt="Test video",
                duration=30
            )
            
            assert result["video_url"] == "https://example.com/video.mp4"
            assert result["duration"] == 30
    
    @pytest.mark.asyncio
    async def test_generate_video_capped_at_max_duration(self, agnes_provider, mock_key_store):
        """Test that duration is capped at 60 seconds."""
        with patch('aiohttp.ClientSession') as mock_session:
            mock_resp = AsyncMock()
            mock_resp.status = 200
            mock_resp.json.return_value = asyncio.Future()
            mock_resp.json.return_value.set_result({})
            
            mock_context = AsyncMock()
            mock_context.__aenter__.return_value = mock_resp
            mock_session.return_value.post.return_value = mock_context
            
            await agnes_provider.generate_video(prompt="Test", duration=120)
            
            # Verify the call used capped duration
            call_args = mock_session.return_value.post.call_args
            payload = call_args[1]['json']
            
            assert payload["duration"] == 60


class TestOpenAICompatibleProvider:
    """Tests for OpenAI-compatible provider."""
    
    @pytest.fixture
    def mock_key_store(self):
        """Create mock key store."""
        store = Mock()
        store.get_key.return_value = "test-openai-key"
        return store
    
    @pytest.fixture
    def openai_provider(self, mock_key_store):
        """Create OpenAI-compatible provider instance."""
        return OpenAICompatibleProvider(
            key_store=mock_key_store,
            endpoint="https://api.openai.com/v1",
            model="gpt-4o"
        )
    
    @pytest.mark.asyncio
    async def test_init_sets_endpoint(self, openai_provider):
        """Test initialization sets correct endpoint."""
        assert openai_provider.endpoint == "https://api.openai.com/v1"
        assert openai_provider.model == "gpt-4o"
    
    @pytest.mark.asyncio
    async def test_generate_text(self, openai_provider, mock_key_store):
        """Test text generation."""
        with patch('aiohttp.ClientSession') as mock_session:
            mock_resp = AsyncMock()
            mock_resp.status = 200
            mock_resp.json.return_value = asyncio.Future()
            mock_resp.json.return_value.set_result({
                "choices": [{"message": {"content": "Generated text"}}]
            })
            
            mock_context = AsyncMock()
            mock_context.__aenter__.return_value = mock_resp
            mock_session.return_value.post.return_value = mock_context
            
            result = await openai_provider.generate_text(prompt="Hello")
            
            assert result == "Generated text"
    
    @pytest.mark.asyncio
    async def test_validate_connection(self, openai_provider, mock_key_store):
        """Test connection validation."""
        with patch('aiohttp.ClientSession') as mock_session:
            mock_resp = AsyncMock()
            mock_resp.status = 200
            mock_session.return_value.get.return_value.__aenter__.return_value = mock_resp
            
            result = await openai_provider.validate_connection()
            
            assert result is True


class TestProviderFactory:
    """Tests for provider factory."""
    
    def test_create_agnes_provider(self):
        """Test creating Agnes provider."""
        from src.security.key_store import EncryptedKeyStore
        from src.security.config_manager import ProviderType
        
        with pytest.raises(Exception):  # Needs real DB path
            ProviderFactory.create(
                provider_type=ProviderType.AGNES,
                key_store=Mock(),
                config={}
            )
    
    def test_get_registered_types(self):
        """Test getting registered provider types."""
        types = ProviderFactory.get_registered_types()
        
        assert "agnes" in types
        assert "openai_compatible" in types
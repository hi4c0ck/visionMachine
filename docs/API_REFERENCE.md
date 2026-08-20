# API Reference

## Tauri Commands (Frontend ↔ Rust)

### Video Generation

#### `generate_video`
Generate a video from prompt using multi-shot chaining.

**Parameters:**
```typescript
interface GenerateVideoParams {
  prompt: string;           // Video description (required)
  duration: number;         // Total duration in seconds (3-60)
  shots: number;            // Number of shots (4-12)
  style: string;            // Visual style (cinematic/anime/realistic/artistic)
  resolution: string;       // Output resolution (1920x1080/1280x720/854x480)
}
```

**Returns:**
```typescript
interface GenerationResult {
  success: boolean;
  video_url?: string;       // Path to generated video
  error?: string;           // Error message if failed
  metadata?: {
    prompt: string;
    duration: number;
    shots: number;
    style: string;
    resolution: string;
    generated_at: string;   // ISO timestamp
  };
}
```

**JavaScript Usage:**
```javascript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke('generate_video', {
  prompt: "A beautiful sunset over mountains",
  duration: 30,
  shots: 6,
  style: "cinematic",
  resolution: "1920x1080"
});
```

### Provider Management

#### `list_providers`
Get list of available provider types.

**Returns:** `Promise<string[]>` - `["agnes", "openai_compatible"]`

#### `validate_provider`
Check if a provider is connected and credentials are valid.

**Parameters:**
```typescript
interface ValidateProviderParams {
  provider_name: string;    // Provider identifier
}
```

**Returns:** `Promise<boolean>`

#### `get_api_key_status`
Check if API key exists for a provider.

**Parameters:** `string provider_name`
**Returns:** `Promise<boolean>`

### Project Management

#### `create_project`
Create a new project.

**Parameters:**
```typescript
interface CreateProjectParams {
  name: string;
  logo?: string;  // Optional logo path
}
```

**Returns:** `Promise<Project>`

#### `list_projects`
List all projects.

**Returns:** `Promise<Project[]>`

#### `delete_project`
Delete a project and all associated data.

**Parameters:** `string project_id`
**Returns:** `Promise<boolean>`

### Composer

#### `get_composer`
Load composer state for a session.

**Parameters:** `string session_id`
**Returns:** `Promise<ComposerState>`

#### `save_composer`
Save composer state asynchronously.

**Parameters:** `ComposerState composer`
**Returns:** `Promise<void>`

## Python Provider Interface

### Base Provider

All providers must implement this interface:

```python
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional

class BaseProvider(ABC):
    """Base interface for all AI providers."""
    
    @abstractmethod
    async def generate_video(
        self,
        prompt: str,
        duration: int,
        **kwargs
    ) -> Dict[str, Any]:
        """Generate video from prompt."""
        pass
    
    @abstractmethod
    async def generate_image(
        self,
        prompt: str,
        size: tuple[int, int] = (1920, 1080),
        **kwargs
    ) -> Dict[str, Any]:
        """Generate image."""
        pass
    
    @abstractmethod
    async def generate_text(
        self,
        prompt: str,
        **kwargs
    ) -> str:
        """Generate text response."""
        pass
    
    @abstractmethod
    async def validate_connection(self) -> bool:
        """Check if provider is reachable."""
        pass
    
    @abstractmethod
    def get_supported_models(self) -> List[str]:
        """Return list of supported model names."""
        pass
```

### Agnes Provider

Primary provider with hardcoded endpoint:

```python
class AgnesProvider(BaseProvider):
    ENDPOINT = "https://api.agnes.ai/v1"
    DEFAULT_MODEL = "agnes-video-v1"
    
    def __init__(self, key_store: EncryptedKeyStore):
        self.key_store = key_store
        self.client = None
```

### OpenAI-Compatible Provider

Configurable endpoint:

```python
class OpenAICompatibleProvider(BaseProvider):
    def __init__(
        self,
        key_store: EncryptedKeyStore,
        base_url: str,
        model: Optional[str] = None
    ):
        self.endpoint = base_url.rstrip("/")
        self.model = model or "gpt-4o-mini"
```

### Provider Factory

```python
class ProviderFactory:
    _registry: Dict[str, Type[BaseProvider]] = {}
    
    @classmethod
    def register(cls, name: str, provider_class: Type[BaseProvider])
    
    @classmethod
    def create(
        cls,
        provider_type: ProviderType,
        key_store: EncryptedKeyStore,
        config: Dict[str, Any]
    ) -> BaseProvider
```

## Error Responses

### Authentication Errors

```json
{
  "success": false,
  "error": "Invalid API key",
  "type": "authentication_error"
}
```

### Rate Limit Errors

```json
{
  "success": false,
  "error": "Rate limit exceeded. Retry after 30 seconds.",
  "type": "rate_limit_error",
  "retry_after": 30
}
```

### Generation Errors

```json
{
  "success": false,
  "error": "Prompt too long (max 2000 characters)",
  "type": "validation_error"
}
```

## Event Types (Rust → Frontend)

```typescript
// Progress updates
{
  type: 'generation_progress',
  payload: { percentage: number, status_text: string }
}

// Generation complete
{
  type: 'generation_complete',
  payload: { video_url: string, metadata: object }
}

// Error
{
  type: 'generation_error',
  payload: { error: string }
}

// Project updates
{
  type: 'project_updated',
  payload: { project_id: string, action: string }
}
```

*API Reference v1.0*
*Last updated: 2026-08-21*

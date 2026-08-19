# VisionMachine API Reference

## Overview

VisionMachine exposes APIs through three layers:
1. **Tauri Commands** (Rust ↔ JavaScript)
2. **Python Subprocess** (Rust → Python)
3. **Provider Interfaces** (Python ↔ AI Services)

---

## 🖥️ Tauri Commands (Frontend API)

### Generation Commands

#### `generate_video`
Generate a video from prompt with multi-shot chaining.

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
  video_url: string;        // Path or URL to generated video
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
const result = await invoke('generate_video', {
  prompt: "A beautiful sunset over mountains",
  duration: 30,
  shots: 6,
  style: "cinematic",
  resolution: "1920x1080"
});
```

---

### Provider Commands

#### `list_providers`
Get list of available provider types.

**Returns:** `Promise<string[]>` - List of provider names

**JavaScript Usage:**
```javascript
const providers = await invoke('list_providers');
// Returns: ["agnes", "openai_compatible"]
```

#### `validate_provider`
Check if a provider is connected and credentials are valid.

**Parameters:**
```typescript
interface ValidateProviderParams {
  provider_name: string;    // Provider identifier
}
```

**Returns:** `Promise<boolean>` - true if connected

**JavaScript Usage:**
```javascript
const isConnected = await invoke('validate_provider', {
  provider_name: "agnes"
});
```

#### `get_api_key_status`
Check if API key exists for a provider.

**Parameters:**
```typescript
interface GetKeyStatusParams {
  provider_name: string;
}
```

**Returns:** `Promise<boolean>` - true if key exists

---

### UI Commands

#### `update_progress`
Update generation progress indicator.

**Parameters:**
```typescript
interface UpdateProgressParams {
  percentage: number;       // 0-100
  status_text: string;      // Status message
}
```

---

## 🔧 Python Service Layer

### Core Modules

#### `src.security.EncryptedKeyStore`

Secure API key storage using Fernet encryption.

**Constructor:**
```python
EncryptedKeyStore(
    db_path: str,           # Path to SQLite database
    master_password: str    # Master password for key derivation
)
```

**Methods:**

```python
# Save encrypted key
store.save_key(provider: str, api_key: str) -> None

# Retrieve decrypted key
store.get_key(provider: str) -> str

# Check if key exists
store.key_exists(provider: str) -> bool

# Delete key
store.delete_key(provider: str) -> bool

# List all providers
store.list_providers() -> List[str]

# Clear all keys
store.clear_all() -> int  # Returns count deleted
```

**Example:**
```python
from src.security import EncryptedKeyStore

# Initialize store
store = EncryptedKeyStore(
    db_path=".config/visionmachine/keys.db",
    master_password=os.environ["VISION_MACHINE_PASSWORD"]
)

# Save key
store.save_key("agnes", "sk-agnes-xxxxx")

# Retrieve key
key = store.get_key("agnes")

# Check existence
if store.key_exists("openai"):
    print("OpenAI key configured")
```

---

#### `src.security.ConfigManager`

Configuration management with secure secrets.

**Methods:**

```python
# Load configuration from disk
ConfigManager.load_configuration() -> AppConfiguration

# Get provider by name
ConfigManager.get_provider(name: str = "primary") -> ProviderConfig

# Add/update provider
ConfigManager.add_provider(name: str, config: ProviderConfig) -> None

# Remove provider
ConfigManager.remove_provider(name: str) -> bool

# Get API key (decrypts from store)
ConfigManager.get_api_key(provider_name: str) -> str

# Set API key (encrypts and stores)
ConfigManager.set_api_key(provider_name: str, api_key: str) -> None

# Delete API key
ConfigManager.delete_api_key(provider_name: str) -> bool

# Validate all settings
ConfigManager.validate_configuration() -> Dict[str, bool]
```

**Example:**
```python
from src.security import ConfigManager

cfg = ConfigManager()

# Configure provider
provider = cfg.get_provider("primary")
print(f"Using: {provider.endpoint}")

# Set API key
cfg.set_api_key("agnes", "sk-xxx")

# Validate setup
results = cfg.validate_configuration()
assert results["has_primary_provider"]
assert results["master_password_set"]
```

---

#### `src.providers.BaseProvider`

Abstract base class for all AI providers.

**Subclasses:**
- `AgnesProvider` - Primary provider (hardcoded endpoint)
- `OpenAICompatibleProvider` - Flexible endpoint support

**Common Interface:**

```python
class BaseProvider(ABC):
    """All providers must implement these methods."""
    
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

---

#### `src.providers.ProviderFactory`

Factory pattern for creating provider instances.

**Methods:**

```python
# Register new provider type
ProviderFactory.register(name: str, provider_class: Type[BaseProvider])

# Create provider instance
ProviderFactory.create(
    provider_type: ProviderType,
    key_store: EncryptedKeyStore,
    config: Dict[str, Any]
) -> BaseProvider

# Get registered types
ProviderFactory.get_registered_types() -> List[str]
```

**Example:**
```python
from src.providers import ProviderFactory, ProviderType
from src.security import ConfigManager

cfg = ConfigManager()
key_store = cfg.key_store

# Create Agnes provider
agnes = ProviderFactory.create(
    provider_type=ProviderType.AGNES,
    key_store=key_store,
    config={}  # Agnes uses hardcoded endpoint
)

# Create OpenAI-compatible provider
openai = ProviderFactory.create(
    provider_type=ProviderType.OPENAI_COMPATIBLE,
    key_store=key_store,
    config={
        "endpoint": "https://api.openai.com/v1",
        "model": "gpt-4o"
    }
)
```

---

#### `src.services.VideoGenerationService`

Multi-shot video generation with chaining.

**Methods:**

```python
async def generate_video(
    self,
    prompt: str,
    duration: int = 60,
    style: str = "cinematic",
    shot_count: Optional[int] = None,
    **kwargs
) -> Dict[str, Any]
```

**Shot Breaking Algorithm:**

The service automatically decomposes long prompts into sequential shots:

```
Total Duration: 60s
├── Shot 1: 8s - Opening establishing shot
├── Shot 2: 7s - Medium shot, action begins
├── Shot 3: 6s - Close-up details
├── Shot 4: 7s - Reaction shots
├── Shot 5: 8s - Climax sequence
├── Shot 6: 6s - Resolution
├── Shot 7: 7s - Final moments
└── Shot 8: 8s - Closing shot
```

**Transitions:**
- Auto-generated 0.5s crossfade between shots
- Temporal consistency maintained via prompt chaining
- Style preserved across all shots

---

## 🔐 Provider Configuration

### Agnes Provider (Primary)
```python
{
    "type": "agnes",
    "endpoint": "https://api.agnes.ai/v1",  # Hardcoded
    "model": "agnes-video-v1",
    "timeout": 300
}
```

**Characteristics:**
- ✅ Endpoint cannot be changed (security feature)
- ✅ Requires valid Agnes API key
- ✅ Full video generation support
- ✅ Best performance and quality

---

### OpenAI-Compatible Provider
```python
{
    "type": "openai_compatible",
    "endpoint": "https://api.openai.com/v1",  # User configurable
    "model": "gpt-4o",  # User selectable
    "timeout": 300
}
```

**Supported Endpoints:**
- Azure OpenAI (`https://{}.openai.azure.com/`)
- Local Ollama servers
- Other OpenAI-compatible APIs

**Notes:**
- ⚠️ Video generation may not be supported by all endpoints
- ✅ Text and image generation typically work
- ✅ Use for fallback or alternative providers

---

## 🎬 Video Generation Pipeline

### Request Flow
```
User Input (UI)
    ↓
Tauri Command (Rust)
    ↓
Validation & Parameters
    ↓
Python Subprocess
    ↓
VideoGenerationService.generate_video()
    ↓
    ├── Prompt Decomposition
    │     ↓
    │   [Shot 1 Prompt], [Shot 2 Prompt], ...
    │
    ├── Per-Shot Generation
    │     ↓
    │   provider.generate_video(prompt, duration)
    │     ↓
    │   [Clip 1], [Clip 2], ...
    │
    └── Chaining
          ↓
        FFmpeg concatenation
          ↓
        Final Video Output
```

### Error Handling

| Error Type | Cause | Recovery |
|------------|-------|----------|
| `ProviderAuthenticationError` | Invalid/expired API key | Re-authenticate via Settings |
| `ProviderRateLimitError` | Too many requests | Wait and retry (exponential backoff) |
| `ProviderConnectionError` | Network issue | Check connection, retry |
| `VideoGenerationError` | API returned error | Show error message, allow retry |

---

## 📊 Response Formats

### Success Response
```json
{
  "success": true,
  "video_url": "/output/vm_20260819_143022.mp4",
  "metadata": {
    "prompt": "A beautiful sunset...",
    "duration": 60,
    "shots": 10,
    "style": "cinematic",
    "resolution": "1920x1080",
    "generated_at": "2026-08-19T14:30:22Z"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Rate limit exceeded. Please wait 30 seconds.",
  "retry_after": 30
}
```

---

## 🔌 Integration Examples

### React Component Example
```jsx
import { invoke } from '@tauri-apps/api/core';

function VideoGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  
  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await invoke('generate_video', {
        prompt: "Ocean waves at sunset",
        duration: 30,
        shots: 6,
        style: "cinematic",
        resolution: "1920x1080"
      });
      
      if (result.success) {
        playVideo(result.video_url);
      }
    } catch (error) {
      showError(error);
    } finally {
      setIsGenerating(false);
    }
  };
  
  return (
    <button onClick={handleGenerate} disabled={isGenerating}>
      {isGenerating ? 'Generating...' : 'Generate Video'}
    </button>
  );
}
```

### Python CLI Example
```python
#!/usr/bin/env python3
"""Batch video generation script."""

import asyncio
from src.security import ConfigManager
from src.providers.factory import ProviderFactory
from src.services.video_generator import VideoGenerationService


async def batch_generate(prompts: list, output_dir: str):
    cfg = ConfigManager()
    provider = ProviderFactory.create(
        provider_type=cfg.get_provider().type,
        key_store=cfg.key_store,
        config={}
    )
    
    service = VideoGenerationService(provider)
    
    for i, prompt in enumerate(prompts):
        print(f"Generating video {i+1}/{len(prompts)}...")
        result = await service.generate_video(
            prompt=prompt,
            duration=30,
            style="cinematic"
        )
        
        if result['success']:
            print(f"✓ Saved to: {result['video_url']}")


if __name__ == '__main__':
    prompts = [
        "Mountain landscape at dawn",
        "City skyline at night",
        "Forest with misty morning"
    ]
    asyncio.run(batch_generate(prompts, "./output"))
```

---

*API Reference v1.0*
*Last updated: 2026-08-19*
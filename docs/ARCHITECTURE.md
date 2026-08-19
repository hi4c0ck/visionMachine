# VisionMachine - Architecture Document

## Project Vision

A lightweight Windows desktop application for AI-powered video generation using OpenAI-compatible APIs. The app enables users to create coherent video sequences (up to 60 seconds) through multi-shot generation with seamless chaining capabilities.

## Core Principles

### 1. Lightweight & Accessible
- Buildable on standard Windows environments without admin privileges
- No complex framework dependencies
- Simple installation and deployment
- Cross-platform potential (Windows → Web/Mobile migration path)

### 2. Security-First Design
- API keys never stored in plain text
- Provider configuration isolated from core logic
- Encryption-ready key storage
- Environment-based configuration

### 3. Extensible Provider System
- Primary: Agnes LLM endpoints
- Adaptable: OpenAI-compatible endpoints
- Plugin-style provider interface
- Runtime provider switching

---

## Technical Boundaries

### Supported Features
| Feature | Status | Notes |
|---------|--------|-------|
| Video Generation (up to 60s) | Planned | Multi-shot chaining |
| Image Generation | Planned | Supportive content |
| Text/Script Generation | Planned | Prompt engineering |
| Local Model Caching | Planned | Offline capability |
| Batch Processing | Future | Queue-based system |

### Hard Limitations
- **Maximum video length**: 60 seconds (API constraint)
- **Output formats**: MP4 (H.264) - standard, widely compatible
- **Resolution**: Up to 1080p (balance quality vs speed)
- **Local storage**: SQLite database for metadata only
- **No GPU requirement**: CPU-friendly processing

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Desktop Application                  │
│                   (Electron/Tauri)                       │
├─────────────────────────────────────────────────────────┤
│                        UI Layer                          │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│   │ Video Editor│  │  Generation │  │  Settings   │    │
│   │   Preview   │  │   Pipeline  │  │  Manager    │    │
│   └─────────────┘  └─────────────┘  └─────────────┘    │
├─────────────────────────────────────────────────────────┤
│                     Service Layer                        │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│   │   Video     │  │    Image    │  │    Text     │    │
│   │  Generator  │  │  Generator  │  │  Generator  │    │
│   └─────────────┘  └─────────────┘  └─────────────┘    │
├─────────────────────────────────────────────────────────┤
│                    Provider Abstraction                  │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│   │  Agnes      │  │  OpenAI-    │  │  Custom     │    │
│   │  Provider   │  │  Compatible │  │  Providers  │    │
│   └─────────────┘  └─────────────┘  └─────────────┘    │
├─────────────────────────────────────────────────────────┤
│                  Security Layer                          │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│   │  Key Store  │  │  Config     │  │  Validation │    │
│   │  (Encrypted)│  │  Manager    │  │  Engine     │    │
│   └─────────────┘  └─────────────┘  └─────────────┘    │
├─────────────────────────────────────────────────────────┤
│                    Data Layer                            │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│   │   SQLite    │  │   File      │  │   Cache     │    │
│   │   Database  │  │   System    │  │   Manager   │    │
│   └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Framework Decision Matrix

### Desktop Framework Options

| Framework | Pros | Cons | Recommendation |
|-----------|------|------|----------------|
| **Electron** | Mature, large ecosystem, Windows native | Heavy (~150MB+), complex build | ❌ Overkill |
| **Tauri** | Lightweight (~5MB), Rust backend, secure | Newer ecosystem, macOS/Linux focus | ⚠️ Consider for future |
| **WPF/.NET MAUI** | Native Windows, good performance | Windows-only, heavier dependencies | ❌ Too complex |
| **Custom WebView + Python** | Lightweight, Python ML stack | Requires WebView runtime | ✅ **Recommended** |

### Recommended Stack

```
┌─────────────────────────────────────┐
│           UI Layer                   │
│  • Electron-like lightweight shell  │
│  • Python + custom WebView renderer │
│  • HTML/CSS/JS interface            │
├─────────────────────────────────────┤
│           Business Layer             │
│  • Python (core logic)              │
│  • FastAPI (internal service)       │
│  • Celery/Redis (task queue)        │
├─────────────────────────────────────┤
│           Data Layer                 │
│  • SQLite (metadata, history)       │
│  • Local file system (artifacts)    │
│  • encrypted key store              │
└─────────────────────────────────────┘
```

---

## Security Architecture

### API Key Management

```python
# Key storage strategy
class KeyManager:
    def __init__(self):
        self.key_store = EncryptedKeyStore()
        self.config = ProviderConfig()
    
    def get_key(self, provider: str) -> str:
        """Retrieve decrypted key for provider"""
        encrypted = self.key_store.read(provider)
        return self._decrypt(encrypted)
    
    def set_key(self, provider: str, key: str):
        """Store encrypted key"""
        encrypted = self._encrypt(key)
        self.key_store.write(provider, encrypted)
```

### Provider Configuration Isolation

```python
# providers/agnes.py
class AgnesProvider(BaseProvider):
    endpoint = "https://api.agnes.ai/v1"
    # Hardcoded, not configurable
    
# providers/openai_compatible.py
class OpenAICompatibleProvider(BaseProvider):
    def __init__(self, base_url: str, api_key: str):
        self.endpoint = base_url
        self.api_key = api_key
    # Configurable endpoint, secured key
```

---

## Data Storage Strategy

### SQLite Schema (Lightweight)

```sql
-- Projects table
CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Video generations
CREATE TABLE video_generations (
    id INTEGER PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    status TEXT, -- pending, generating, completed, failed
    prompt TEXT,
    duration_seconds INTEGER,
    output_path TEXT,
    provider_config TEXT, -- JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API keys (encrypted references)
CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY,
    provider TEXT UNIQUE,
    key_encrypted BLOB,
    last_used TIMESTAMP
);
```

### Why SQLite?
- Zero configuration
- Single file storage
- Cross-platform compatibility
- Transaction support
- No external dependencies
- ~5MB footprint for entire app

---

## Video Generation Pipeline

### Multi-Shot Chaining Algorithm

```python
class VideoChainer:
    def generate_sequential(self, prompt: str, duration: int = 60):
        """
        Break 60s video into shots, generate each, chain together
        """
        shots = self._break_into_shots(prompt, duration)
        clips = []
        
        for i, shot in enumerate(shots):
            # Generate individual clip
            clip = self.provider.generate_video(shot.prompt, shot.duration)
            
            # Ensure smooth transitions
            if i > 0:
                prev_clip = clips[-1]
                transition = self._generate_transition(prev_clip, clip)
                clip = self._apply_transition(clip, transition)
            
            clips.append(clip)
        
        # Combine all clips
        final_video = self._concatenate(clips)
        return final_video
```

### Shot Duration Guidelines
- **Total duration**: Up to 60 seconds
- **Minimum shot**: 3 seconds (API limit)
- **Recommended shots**: 4-12 per video
- **Transition buffer**: 0.5-1 second between shots

---

## Next Steps

### Phase 1: Foundation
- [ ] Select desktop framework (recommendation: lightweight Python + WebView)
- [ ] Create provider abstraction layer
- [ ] Implement encrypted key storage
- [ ] Set up SQLite database schema

### Phase 2: Core Generation
- [ ] Implement video generation service
- [ ] Create prompt decomposition logic
- [ ] Build shot chaining algorithm
- [ ] Add basic CLI interface

### Phase 3: UI Development
- [ ] Design simple HTML interface
- [ ] Integrate with Python backend
- [ ] Add video preview player
- [ ] Implement settings panel

### Phase 4: Polish
- [ ] Add batch processing
- [ ] Implement progress tracking
- [ ] Add error handling and retries
- [ ] Package for distribution

---

## Questions for Team

1. **Desktop Framework Preference**:
   - Tauri (Rust-based, modern, lightweight)?
   - Electron (mature, larger footprint)?
   - Custom Python + WebView (most lightweight)?

2. **OpenAI-Compatible Endpoint Support**:
   - Which providers need support? (Azure OpenAI, local Ollama, etc.)
   - Should we support multiple simultaneous providers?

3. **Video Format Requirements**:
   - MP4 only, or additional formats?
   - Resolution constraints?
   - Frame rate preferences?

4. **Build & Distribution**:
   - Self-build requirement confirmed?
   - Any code signing requirements?
   - Update mechanism needed?

---

*Document version: 1.0*
*Last updated: 2026-08-19*
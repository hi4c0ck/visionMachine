# Architecture

## System Overview

VisionMachine is a hybrid desktop application combining:
- **Rust/Tauri** for the native window and system integration
- **Svelte** for the reactive UI
- **Python** for AI provider logic and video generation services

The architecture follows a layered approach with clear separation between UI, business logic, and data persistence.

## Layer Diagram

```
┌──────────────────────────────────────────────────────┐
│  PRESENTATION LAYER (Svelte)                          │
│  DashboardView, CameraView, ComposerSection           │
│  TwoThumbSlider, ArtifactsPanel                       │
├──────────────────────────────────────────────────────┤
│  VIEW MODEL LAYER (Rust)                              │
│  FrameViewModel, ComposerViewModel, ProjectViewModel  │
│  ProfileViewModel, ToolsViewModel                     │
├──────────────────────────────────────────────────────┤
│  COMMAND LAYER (Tauri + Rust)                         │
│  generate_video, create_project, list_providers       │
│  validate_provider, get_api_key_status                │
├──────────────────────────────────────────────────────┤
│  BUSINESS LOGIC (Python)                              │
│  VideoGenerationService, ProviderFactory              │
│  BaseProvider (abstract), AgnesProvider,              │
│  OpenAICompatibleProvider                             │
├──────────────────────────────────────────────────────┤
│  DATA LAYER                                           │
│  EncryptedKeyStore (SQLite + Fernet)                  │
│  ConfigManager (JSON config + env vars)               │
│  Database (Tauri SQLite plugin)                       │
└──────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Why Tauri over Electron?

| Factor | Tauri | Electron |
|--------|-------|----------|
| Binary size | ~5 MB | ~150+ MB |
| Memory usage | Low | High |
| Rust backend | Native | N/A |
| Ecosystem maturity | Growing | Mature |
| Security model | Permission-based | Standard |

**Decision:** Tauri chosen for lightweight footprint and native performance on Windows.

### 2. Provider Abstraction

All AI providers implement the `BaseProvider` interface:

```python
class BaseProvider(ABC):
    @abstractmethod
    async def generate_video(self, prompt: str, duration: int, **kwargs) -> Dict[str, Any]
    
    @abstractmethod
    async def generate_image(self, prompt: str, size: tuple[int, int], **kwargs) -> Dict[str, Any]
    
    @abstractmethod
    async def generate_text(self, prompt: str, **kwargs) -> str
    
    @abstractmethod
    async def validate_connection(self) -> bool
```

This allows runtime switching between providers without changing the core logic.

### 3. Data Storage Strategy

**SQLite** was chosen for local storage because:
- Zero configuration — single file, no server
- Cross-platform compatibility
- Transaction support for data integrity
- ~5 MB footprint even with large datasets
- No external dependencies

Migration files live in `src-tauri/migrations/` and run automatically on app startup.

### 4. Security Approach

- **Fernet encryption** for API keys (symmetric, HMAC-signed)
- **Key derivation** via PBKDF2-HMAC-SHA256
- **Master password** from environment variable (`VISION_MACHINE_PASSWORD`)
- **No logging** of sensitive data
- **Input validation** prevents SQL injection and path traversal

## Component Relationships

```
App.svelte
├── Titlebar.svelte
├── Sidebar.svelte
│   └── ProjectSidebar.svelte
├── StatusBar.svelte
└── Workspace.svelte
    └── WorkScreen.svelte (FSM state machine)
        ├── DashboardView
        ├── CameraView
        ├── GenerationsView
        └── StatusView

ComposerSection.svelte
├── FrameRuler.svelte
├── MultiThumbSlider.svelte
└── TwoThumbSlider.svelte
```

## State Management

The app uses an FSM (Finite State Machine) pattern in `WorkScreen.svelte`:

```typescript
type ScreenState = 
  | { screen: 'idle' }
  | { screen: 'generating'; context: 'dashboard' | 'project' | 'camera' }
  | { screen: 'loading'; source?: string }
  | { screen: 'error'; message: string; previousScreen: string }
  | { screen: 'camera-active' }
  | { screen: 'settings-open' };

type ModalType = 'theme' | 'settings' | 'new-project' | 'generate' | 'export' | 'delete-confirm' | 'crop-tool' | null;
```

Blocking hierarchy:
1. **Modals** (highest priority) — block all interactions
2. **Generating/Loading states** — full block, only completion/error handlers work
3. **Normal states** — full interaction available

## Video Generation Pipeline

```
User Input (UI)
    ↓
Tauri Command: generate_video(prompt, duration, shots, style, resolution)
    ↓
Validate Parameters (Rust)
    ↓
Python Subprocess Call
    ↓
VideoGenerationService.generate_video()
    ├─ Prompt Decomposition (shot breaking algorithm)
    ├─ Per-Shot Generation via Provider
    └─ FFmpeg Concatenation (if multi-shot)
    ↓
Result → SQLite Storage → UI Display
```

## Performance Considerations

- GPU-accelerated video playback via HTML5 `<video>` element
- Debounced composer saves (300ms) to prevent excessive disk I/O
- Async write pattern (`AsyncWriter`) for non-blocking file operations
- Thumbnail caching for artifact previews

## Future Extensibility

| Feature | Implementation Path |
|---------|---------------------|
| Linux/macOS support | Tauri cross-compilation (already configured) |
| Web deployment | Extract Svelte frontend + FastAPI backend |
| Mobile support | React Native / Flutter port |
| Batch processing | Queue-based with Redis/Celery |
| Local models | ONNX Runtime integration |

*Last updated: 2026-08-21*

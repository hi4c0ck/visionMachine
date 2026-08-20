# VisionMachine

A lightweight Windows desktop application for AI-powered video generation using OpenAI-compatible APIs. Built with Rust/Tauri backend and Svelte frontend.

## What You Get

- **Standalone Windows desktop app** — compiles to a single `.exe` file
- **No web server required** at runtime
- **No Node.js required** to run the final app
- **Double-click and it works**

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Svelte 4 + Vite 5 |
| Backend | Rust (Tauri v2) |
| Data | SQLite (`src-tauri/src/storage/db.rs`) |
| AI Providers | Python (`aiohttp`, `cryptography`) |
| Key Storage | Fernet-encrypted SQLite (`~/.config/visionmachine/keys.db`) |

## Quick Start

### Prerequisites (install once)

```powershell
# Rust (required)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js 18+
# Download from https://nodejs.org

# Python 3.12+
uv python install 3.12
```

### Build & Run

```powershell
# Install dependencies and build
.\build.bat

# Or development mode with hot reload
.\dev.bat
```

**Output:** `src-tauri/target/release/visionmachine.exe`

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Svelte Frontend (src/frontend/)            │
│   DashboardView · CameraView · ComposerSection          │
├─────────────────────────────────────────────────────────┤
│              Tauri Commands (src-tauri/src/commands/)   │
│   projects.rs · sessions.rs · composer.rs · settings.rs │
├─────────────────────────────────────────────────────────┤
│              Rust Controllers (src-tauri/src/controllers/)│
│   projects · frame · profile · composer                 │
├─────────────────────────────────────────────────────────┤
│              SQLite Storage (src-tauri/src/storage/)    │
│   db.rs · settings.rs · validation.rs · composer_db.rs  │
├─────────────────────────────────────────────────────────┤
│              Python Providers (src/providers/)          │
│   agnes.py · openai_compatible.py                       │
├─────────────────────────────────────────────────────────┤
│              Security (src/security/)                   │
│   key_store.py · config_manager.py                      │
└─────────────────────────────────────────────────────────┘
```

## Data Model

```
Profile
├── Project
│   └── Session
│       ├── Composer (Pipes → PromptRows)
│       └── Artifacts (images, videos, configs)
└── Settings (including storage path)
```

Database schema migrations are in `src-tauri/migrations/`.

## Configuring Providers

API keys are encrypted and stored at `%USERPROFILE%\.config\visionmachine\keys.db`.

Set your master password via environment variable:
```powershell
$env:VISION_MACHINE_PASSWORD = "your-master-password"
```

Default provider: Agnes (`api.agnes.ai`). Custom OpenAI-compatible endpoints are also supported.

## Running Tests

```powershell
# Python tests
uv run pytest tests/ -v

# Rust tests
cd src-tauri && cargo test
```

## Troubleshooting

See [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for common issues.

## Docs

| File | Contents |
|------|----------|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design and stack decisions |
| [docs/API_REFERENCE.md](./docs/API_REFERENCE.md) | Tauri command interfaces and Python API |
| [docs/SECURITY.md](./docs/SECURITY.md) | Key management and encryption |
| [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Common errors and fixes |
| [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) | Code style and PR guidelines |

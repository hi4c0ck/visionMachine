# VisionMachine Documentation Index

## Quick Navigation

| Document | Purpose | Audience |
|----------|---------|----------|
| [GETTING_STARTED.md](./GETTING_STARTED.md) | First-time user setup | New users |
| [README.md](../README.md) | Project overview & features | Everyone |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design & components | Developers |
| [COMPONENT_API.md](./COMPONENT_API.md) | Svelte 5 component reference | Frontend devs |
| [API_REFERENCE.md](./API_REFERENCE.md) | Tauri command reference | Backend devs |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Colors, typography, tokens | Designers |
| [SECURITY.md](./SECURITY.md) | Threat model & practices | Security team |
| [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) | Setup & workflows | Contributors |
| [SVELTE5_GUIDE.md](./SVELTE5_GUIDE.md) | Svelte 5 patterns | Frontend devs |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common issues & fixes | Everyone |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to contribute | Contributors |

---

## Documentation Flow

```
New User
    ↓
README.md (Overview)
    ↓
GETTING_STARTED.md (Quick start)
    ↓
Use the app

Developer
    ↓
ARCHITECTURE.md (System design)
    ↓
COMPONENT_API.md (UI components)
    ↓
API_REFERENCE.md (Backend commands)
    ↓
DESIGN_SYSTEM.md (Styling)
    ↓
SVELTE5_GUIDE.md (Patterns)
    ↓
DEVELOPMENT_GUIDE.md (Setup)
    ↓
CONTRIBUTING.md (Process)
```

---

## Key Concepts

### Layout Modes
- **Landscape**: All 5 panels visible (default)
- **Portrait**: Projects + Composer + Profile
- **Single**: Composer only (fullscreen)

### Themes
1. **JetBrains Dark** - `#2B2B2B` background, blue accent
2. **Steel Machinery Dark** - `#1A1D23` background, steel accent
3. **Light** - `#F6F8FA` background, GitHub blue accent

### Svelte 5 Patterns
- `$state()` for reactive variables
- `$props()` for component props
- `$derived()` for computed values
- `$effect()` for side effects
- Callback props (`onlogout`, `onthemechange`) instead of events

---

## File Locations

| Type | Path |
|------|------|
| Frontend components | `src/components/*.svelte` |
| Backend commands | `src-tauri/src/lib.rs` |
| Design system CSS | `css/design-system.css` |
| Documentation | `docs/*.md` |
| Build scripts | `scripts/*.py` |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-08-22 | Production screens with Svelte 5 |
| 0.1.0 | 2026-08-21 | Initial Tauri 2 integration |
| 0.1.0 | 2026-08-20 | Svelte 5 migration started |

---

## Links

- **Repository**: https://github.com/hi4c0ck/visionMachine
- **Issues**: https://github.com/hi4c0ck/visionMachine/issues
- **Discussions**: https://github.com/hi4c0ck/visionMachine/discussions
# VisionMachine Documentation Index

## 📚 Complete Documentation Structure

### 1. Architecture & Design
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design, boundaries, decisions
- [SECURITY.md](./SECURITY.md) - Security implementation details
- [TAURI_SETUP.md](./TAURI_SETUP.md) - Desktop app setup guide
- [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) - Dev process and standards

### 2. API Reference
- [API_REFERENCE.md](./API_REFERENCE.md) - Complete API documentation

### 3. UI & Components
- [UI_COMPONENTS.md](./UI_COMPONENTS.md) - UI component library recommendations

### 4. User Guides
- [GETTING_STARTED.md](./GETTING_STARTED.md) - Quick start guide
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [README-TAURI.md](../README-TAURI.md) - Desktop app user guide

### 5. Implementation Summary
- [IMPLEMENTATION_SUMMARY.md](../IMPLEMENTATION_SUMMARY.md) - What's built
- [FINAL_SUMMARY.md](../FINAL_SUMMARY.md) - Complete summary

---

## 🎯 Quick Navigation by Role

### For Developers
| Task | Document | Section |
|------|----------|---------|
| Set up dev environment | DEVELOPMENT_WORKFLOW.md | Setup section |
| Add new provider | API_REFERENCE.md | Provider Configuration |
| Debug issues | DEVELOPMENT_WORKFLOW.md | Debugging Guide |
| Run tests | DEVELOPMENT_WORKFLOW.md | Testing section |
| Contribute code | CONTRIBUTING.md | Full document |

### For End Users
| Task | Document | Section |
|------|----------|---------|
| Install app | GETTING_STARTED.md | Quick Start |
| Generate video | README-TAURI.md | UI Features |
| Configure providers | SECURITY.md | Provider Configuration |
| Troubleshoot | README-TAURI.md | Troubleshooting |

### For Architects
| Task | Document | Section |
|------|----------|---------|
| Understand system design | ARCHITECTURE.md | Full document |
| Review security | SECURITY.md | Full document |
| Plan migrations | ARCHITECTURE.md | Framework Decision Matrix |
| UI component selection | UI_COMPONENTS.md | Full document |

---

## 🔗 Cross-References

### Architecture → Implementation
- **Provider System** → See [ARCHITECTURE.md](./ARCHITECTURE.md#provider-abstraction) + [API_REFERENCE.md](./API_REFERENCE.md#srcprovidersbaseprovider)
- **Security Model** → See [SECURITY.md](./SECURITY.md) + [ARCHITECTURE.md#security-architecture](./ARCHITECTURE.md#security-architecture)
- **Data Flow** → See [ARCHITECTURE.md#data-storage-strategy](./ARCHITECTURE.md#data-storage-strategy)

### Development → Deployment
- **Local Development** → [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)
- **Build & Distribution** → [README-TAURI.md](../README-TAURI.md#-build-for-distribution)
- **CI/CD Pipeline** → [.github/workflows/ci.yml](../.github/workflows/ci.yml)

---

## 📖 Recommended Reading Order

### New Team Member
1. [FINAL_SUMMARY.md](../FINAL_SUMMARY.md) - Overview of what exists
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - How it all fits together
3. [GETTING_STARTED.md](./GETTING_STARTED.md) - How to run it
4. [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) - How to work on it
5. [API_REFERENCE.md](./API_REFERENCE.md) - Technical details
6. [SECURITY.md](./SECURITY.md) - Security considerations

### Feature Development
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Check existing patterns
2. [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) - Follow standards
3. [API_REFERENCE.md](./API_REFERENCE.md) - Implement interface
4. Update this INDEX.md if adding new docs

### Bug Fixing
1. [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) - Debugging section
2. [API_REFERENCE.md](./API_REFERENCE.md) - Check expected behavior
3. [SECURITY.md](./SECURITY.md) - Verify no security impact

---

## 📝 Documentation Conventions

### Versioning
All documents follow semantic versioning:
- `v1.0.0` - Initial release
- Increment patch for corrections
- Increment minor for additions
- Increment major for breaking changes

### Update Checklist
When making changes, update:
- [ ] Primary document
- [ ] Cross-references in related docs
- [ ] This INDEX.md (if structure changes)
- [ ] IMPLEMENTATION_SUMMARY.md (if features change)

---

*Documentation index v1.1*
*Last updated: 2026-08-19*
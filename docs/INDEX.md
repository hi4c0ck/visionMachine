# VisionMachine Documentation Index

## 📚 Complete Documentation Structure

### 1. Architecture & Design
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design, boundaries, decisions
- [SECURITY.md](./SECURITY.md) - Security implementation details
- [TAURI_SETUP.md](./TAURI_SETUP.md) - Desktop app setup guide
- [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) - Dev process and standards

### 2. API Reference
- [API_REFERENCE.md](./API_REFERENCE.md) - Complete API documentation

### 3. User Guides
- [README-TAURI.md](../README-TAURI.md) - Quick start for desktop users
- [IMPLEMENTATION_SUMMARY.md](../IMPLEMENTATION_SUMMARY.md) - What's built and how to use

---

## 🎯 Quick Navigation by Topic

### For Developers
| Task | Document | Page |
|------|----------|------|
| Set up dev environment | DEVELOPMENT_WORKFLOW.md | Setup section |
| Add new provider | API_REFERENCE.md | Provider Configuration |
| Debug issues | DEVELOPMENT_WORKFLOW.md | Debugging Guide |
| Run tests | DEVELOPMENT_WORKFLOW.md | Testing section |

### For End Users
| Task | Document | Page |
|------|----------|------|
| Install app | README-TAURI.md | Quick Start |
| Generate video | README-TAURI.md | UI Features |
| Configure providers | SECURITY.md | Provider Configuration |
| Troubleshoot | README-TAURI.md | Troubleshooting |

### For Architects
| Task | Document | Page |
|------|----------|------|
| Understand system design | ARCHITECTURE.md | Full document |
| Review security | SECURITY.md | Full document |
| Plan migrations | ARCHITECTURE.md | Framework Decision Matrix |

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

## 📖 Reading Order Recommendations

### New Team Member
1. [IMPLEMENTATION_SUMMARY.md](../IMPLEMENTATION_SUMMARY.md) - Overview of what exists
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - How it all fits together
3. [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) - How to work on it
4. [API_REFERENCE.md](./API_REFERENCE.md) - Technical details
5. [SECURITY.md](./SECURITY.md) - Security considerations

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

## 🔄 Documentation Conventions

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

## 📝 Contributing to Documentation

### Adding New Documentation
1. Create file in `docs/` directory
2. Add entry to this INDEX.md
3. Update relevant cross-references
4. Commit with descriptive message

### Format Standards
- Use Markdown throughout
- Include code examples where applicable
- Link related sections with relative paths
- Keep headers to H2/H3 maximum depth
- Add "Last updated" date at end

---

*Documentation index v1.0*
*Created: 2026-08-19*
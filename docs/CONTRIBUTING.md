# Contributing to VisionMachine

Thank you for your interest in contributing! This document provides guidelines and steps for contributing.

---

## 🎯 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the project
- Show empathy towards other community members

---

## 🚀 Getting Started

### 1. Fork and Clone
```powershell
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/visionMachine.git
cd visionMachine

# Add upstream remote
git remote add upstream https://github.com/hi4c0ck/visionMachine.git
```

### 2. Setup Development Environment
```powershell
# Create virtual environment
uv venv --python 3.12
.venv\Scripts\activate

# Install dependencies
uv pip install -e ".[dev]"

# Install Rust tools (if not already)
cargo install tauri-cli --version "^2"
```

### 3. Create Branch
```powershell
# Always create a descriptive branch
git checkout -b feature/add-video-export
# or
git checkout -b fix/provider-connection-error
# or
git checkout -b docs/update-api-reference
```

---

## 📝 Making Changes

### Python Code

**Style Guidelines:**
- Follow PEP 8
- Type hints required for public APIs
- Docstrings for all functions/methods
- Maximum line length: 100 characters

**Example:**
```python
async def generate_video(
    self,
    prompt: str,
    duration: int = 30,
    **kwargs
) -> Dict[str, Any]:
    """Generate video from prompt.
    
    Args:
        prompt: Video description
        duration: Duration in seconds
        
    Returns:
        Generation result dict
    """
    # Implementation
    pass
```

### Rust Code

**Style Guidelines:**
- Follow rustfmt defaults
- Clippy warnings should be resolved
- Documentation comments for public APIs

**Example:**
```rust
/// Generate a video using the configured provider.
#[tauri::command]
async fn generate_video(
    prompt: String,
    duration: u32,
) -> Result<VideoResult, String> {
    // Validate
    if prompt.is_empty() {
        return Err("Prompt cannot be empty".to_string());
    }
    
    // Implementation
    Ok(result)
}
```

### Frontend Code

**Structure:**
- Use functional components
- Keep components small and focused
- Add comments for complex logic
- Test cross-browser compatibility

---

## 🧪 Testing

### Required Tests
Before submitting a PR, ensure:

1. **Existing tests pass**
   ```powershell
   uv run pytest tests/ -v
   cargo test
   ```

2. **New tests for new features**
   - Unit tests for logic
   - Integration tests for workflows
   - UI tests if applicable

3. **Type checking**
   ```powershell
   mypy src/
   cargo clippy
   ```

### Test Coverage Requirements
- New code: minimum 80% coverage
- Bug fixes: include regression test
- Features: include edge case tests

---

## 🔄 Pull Request Process

### 1. Before Submitting
- [ ] Branch is up to date with main
- [ ] All tests pass
- [ ] Documentation updated
- [ ] Changelog updated (if user-facing change)
- [ ] No debug code or print statements

### 2. PR Description Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring

## Testing
How did you test these changes?

## Screenshots (if applicable)
Add screenshots of UI changes

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have added tests
- [ ] I have updated documentation
- [ ] I have run the test suite
```

### 3. Review Process
1. Maintainer reviews code
2. Automated checks run (CI)
3. Feedback provided if needed
4. Merge after approval

---

## 📋 Contribution Areas

Looking for somewhere to start? Check these areas:

### 🎨 UI/UX Improvements
- Enhance video preview player
- Add more customization options
- Improve accessibility
- Optimize for different screen sizes

### 🔧 Backend Features
- Add new AI providers
- Implement video post-processing
- Add batch generation
- Optimize performance

### 📚 Documentation
- Expand API reference
- Add video tutorials
- Create migration guides
- Improve README examples

### 🧪 Testing
- Increase test coverage
- Add end-to-end tests
- Performance benchmarks
- Security audits

### 🔒 Security
- Audit encryption implementation
- Add penetration testing
- Review dependency vulnerabilities
- Enhance key rotation

---

## 🐛 Reporting Bugs

Use the bug report template:
```markdown
**Describe the bug**
Clear and concise description

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

**Expected behavior**
What you expected to happen

**Screenshots**
If applicable

**Environment:**
- OS: [e.g., Windows 11]
- Version: [e.g., 0.1.0]
```

---

## 💡 Suggesting Features

Use the feature request template:
```markdown
**Is your feature request related to a problem?**
A clear description of what the problem is

**Describe the solution you'd like**
What you want to happen

**Describe alternatives you've considered**
Any alternative solutions

**Additional context**
Any other context about the feature
```

---

## 🎓 Learning Resources

### Rust
- [The Rust Programming Language](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
- [Tauri Documentation](https://v2.tauri.app/)

### Python
- [Python Documentation](https://docs.python.org/3/)
- [AsyncIO Tutorial](https://docs.python.org/3/library/asyncio.html)
- [Pydantic Documentation](https://docs.pydantic.dev/)

### Web Development
- [MDN Web Docs](https://developer.mozilla.org/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Shadcn/UI Documentation](https://ui.shadcn.com/)

---

## 📞 Getting Help

- **Discussions**: GitHub Discussions tab
- **Issues**: Open an issue for bugs/features
- **Documentation**: Check docs/ folder first
- **Chat**: Join our community chat (if available)

---

## ✅ Commit Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add video download functionality
fix: resolve provider connection timeout
docs: update API reference
test: add tests for encryption module
chore: update dependencies
refactor: simplify video generation pipeline
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, semicolons)
- `refactor`: Code change that neither fixes bug nor adds feature
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

---

## 🏆 Recognition

Contributors will be recognized in:
- README.md acknowledgments
- Release notes
- Contributors page (future)

---

*Thank you for helping make VisionMachine better!*
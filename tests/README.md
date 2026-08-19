# VisionMachine Test Suite

This directory contains tests for the VisionMachine project.

## Test Files

- `test_core.py` - Tests for core image processing functions
- `test_imports.py` - Verification that all required modules are available

## Running Tests

```bash
uv run pytest tests/ -v
```

## Adding New Tests

Create new test files following the pattern:
- `test_<module_name>.py` for module-specific tests
- Use pytest fixtures and parametrization where appropriate
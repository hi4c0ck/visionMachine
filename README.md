# VisionMachine

A comprehensive vision processing and machine learning pipeline platform.

## Features

- Image loading and preprocessing
- PyTorch model integration
- OpenCV image processing
- FastAPI service layer (planned)
- Comprehensive test suite

## Setup

### Prerequisites
- Python 3.12+
- uv package manager

### Installation

```bash
# Clone repository
git clone https://github.com/hi4c0ck/visionMachine.git
cd visionMachine

# Create virtual environment
uv venv --python 3.12
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
uv pip install -e ".[dev]"
```

### Environment Variables

Copy the example env file and configure as needed:

```bash
cp config/.env.example config/.env
# Edit config/.env with your settings
```

## Usage

### Running Tests

```bash
uv run pytest tests/ -v
```

### Testing Imports

```bash
uv run python -c "import torch; import numpy; from PIL import Image; import cv2; print('All OK')"
```

## Project Structure

```
VisionMachine/
├── src/                    # Source code
├── tests/                  # Test suite
├── config/                 # Configuration templates
├── scripts/                # Utility scripts
├── pyproject.toml         # Python project config
└── package.json           # Node.js dependencies
```

## Development Workflow

1. Create feature branch from `main`
2. Write tests first (TDD approach)
3. Implement features in `src/`
4. Run tests: `uv run pytest`
5. Commit with descriptive messages
6. Push and create pull request

## License

Proprietary - HorizonsMachine
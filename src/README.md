# VisionMachine - Core Modules

This package contains core vision processing functionality.

## Modules

### `core.py`

Core image processing functions including:
- `load_image()` - Load images from file paths
- `preprocess_image()` - Preprocess images for ML models

## Usage

```python
from src.core import load_image, preprocess_image

# Load an image
image = load_image("path/to/image.jpg")

# Preprocess for model input
processed = preprocess_image(
    image,
    target_size=(224, 224),
    normalize=True,
    to_tensor=True
)
```

## Dependencies

- Pillow (PIL)
- NumPy
- PyTorch (optional, for tensor conversion)
- OpenCV (optional, for advanced processing)
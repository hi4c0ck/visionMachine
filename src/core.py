"""Core vision processing functions."""
from typing import Optional
import numpy as np


def load_image(path: str) -> np.ndarray:
    """Load an image from file path.
    
    Args:
        path: Path to image file
        
    Returns:
        Image as numpy array (RGB)
        
    Raises:
        ValueError: If image cannot be loaded
    """
    try:
        from PIL import Image
        img = Image.open(path).convert('RGB')
        return np.array(img)
    except Exception as e:
        raise ValueError(f"Failed to load image from {path}: {e}")


def preprocess_image(
    image: np.ndarray,
    target_size: tuple[int, int] | None = None,
    normalize: bool = True,
    to_tensor: bool = True,
) -> np.ndarray:
    """Preprocess image for model input.
    
    Args:
        image: Input image as numpy array (HWC format)
        target_size: Optional target size (width, height)
        normalize: Whether to normalize pixel values to [0, 1]
        to_tensor: Whether to convert to CHW format for PyTorch
        
    Returns:
        Preprocessed image array
    """
    if target_size:
        from PIL import Image
        pil_img = Image.fromarray(image)
        pil_img = pil_img.resize(target_size, Image.LANCZOS)
        image = np.array(pil_img)

    if normalize:
        image = image.astype(np.float32) / 255.0

    if to_tensor:
        # HWC -> CHW for PyTorch
        image = np.transpose(image, (2, 0, 1))

    return image
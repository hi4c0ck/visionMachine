"""Test that all required Python modules can be imported."""
import sys


def test_torch_import():
    """Test torch module import."""
    import torch
    assert hasattr(torch, '__version__')
    print(f'torch: {torch.__version__}')


def test_numpy_import():
    """Test numpy module import."""
    import numpy as np
    assert hasattr(np, '__version__')
    print(f'numpy: {np.__version__}')


def test_pil_import():
    """Test PIL/Pillow import."""
    from PIL import Image
    print(f'PIL: {Image.__version__}')


def test_opencv_import():
    """Test OpenCV import."""
    import cv2
    assert hasattr(cv2, '__version__')
    print(f'cv2: {cv2.__version__}')


def test_pytest_import():
    """Test pytest module import."""
    import pytest
    assert hasattr(pytest, '__version__')
    print(f'pytest: {pytest.__version__}')


def test_pydantic_import():
    """Test pydantic module import."""
    from pydantic import BaseModel
    assert BaseModel is not None
    print('pydantic: OK')
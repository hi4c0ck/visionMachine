import os
import sys

def test_import_all():
    """Test that all required modules can be imported."""
    modules = ['torch', 'numpy', 'PIL', 'cv2', 'pytest', 'pydantic']
    for mod in modules:
        __import__(mod)
    return True

if __name__ == '__main__':
    try:
        test_import_all()
        print('All imports OK')
        sys.exit(0)
    except ImportError as e:
        print(f'Import error: {e}')
        sys.exit(1)

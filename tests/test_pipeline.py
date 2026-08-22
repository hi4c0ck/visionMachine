"""
Test pipeline for VisionMachine project startup and validation
"""
import pytest
import subprocess
import sys
from pathlib import Path


def test_rust_installed():
    """Verify Rust toolchain is available"""
    result = subprocess.run(['rustc', '--version'], capture_output=True)
    assert result.returncode == 0, "Rust not installed"
    assert 'rustc' in result.stdout.decode()


def test_cargo_installed():
    """Verify Cargo package manager is available"""
    result = subprocess.run(['cargo', '--version'], capture_output=True)
    assert result.returncode == 0, "Cargo not installed"
    assert 'cargo' in result.stdout.decode()


def test_node_installed():
    """Verify Node.js is available"""
    result = subprocess.run(['node', '--version'], capture_output=True)
    assert result.returncode == 0, "Node.js not installed"
    assert 'v' in result.stdout.decode()


def test_npm_installed():
    """Verify npm is available"""
    result = subprocess.run(['npm', '--version'], capture_output=True)
    assert result.returncode == 0, "npm not installed"


def test_tauri_cli_installed():
    """Verify Tauri CLI is installed"""
    result = subprocess.run(['tauri', '--version'], capture_output=True)
    # May fail if not in PATH, but check alternative
    if result.returncode != 0:
        # Try via npx
        result = subprocess.run(['npx', 'tauri', '--version'], capture_output=True)
    assert result.returncode == 0, "Tauri CLI not installed"


def test_python_available():
    """Verify Python is available"""
    result = subprocess.run([sys.executable, '--version'], capture_output=True)
    assert result.returncode == 0, "Python not found"
    assert 'Python' in result.stdout.decode()


def test_project_structure():
    """Verify critical project files exist"""
    project_root = Path(__file__).parent.parent
    
    critical_files = [
        'launch.bat',
        'src-tauri/Cargo.toml',
        'src-tauri/src/main.rs',
        'src-tauri/tauri.conf.json',
        'src/frontend/App.svelte',
        'pyproject.toml',
        '.gitignore',
    ]
    
    for file_path in critical_files:
        full_path = project_root / file_path
        assert full_path.exists(), f"Missing required file: {file_path}"


def test_git_configured():
    """Verify Git user configuration"""
    result = subprocess.run(
        ['git', 'config', 'user.email'],
        capture_output=True,
        text=True,
        cwd=Path(__file__).parent.parent
    )
    assert result.returncode == 0, "Git not configured"
    email = result.stdout.strip()
    assert '@' in email, f"Invalid git email: {email}"


def test_no_sensitive_files_in_git():
    """Verify no sensitive files are tracked"""
    result = subprocess.run(
        ['git', 'ls-files'],
        capture_output=True,
        text=True,
        cwd=Path(__file__).parent.parent
    )
    tracked_files = result.stdout
    
    # Should not contain sensitive patterns
    sensitive_patterns = [
        '*.pem',
        '*token*.txt',
        '.env',
        'github-token',
    ]
    
    for pattern in sensitive_patterns:
        assert pattern not in tracked_files.lower(), f"Sensitive pattern found in git: {pattern}"


def test_requirements_txt_exists():
    """Verify requirements.txt exists"""
    requirements_path = Path(__file__).parent.parent / 'requirements.txt'
    assert requirements_path.exists(), "requirements.txt missing"
    
    # Check it's not empty
    content = requirements_path.read_text()
    assert len(content.strip()) > 0, "requirements.txt is empty"


def test_pyproject_toml_exists():
    """Verify pyproject.toml exists"""
    pyproject_path = Path(__file__).parent.parent / 'pyproject.toml'
    assert pyproject_path.exists(), "pyproject.toml missing"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

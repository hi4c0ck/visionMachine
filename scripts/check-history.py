import subprocess
import sys
from pathlib import Path

def check_git_history():
    """Check git history for sensitive files"""
    repo_dir = Path('.')
    
    # Get all files ever committed
    result = subprocess.run(
        ['git', 'log', '--all', '--name-only', '--pretty=format:'],
        cwd=repo_dir,
        capture_output=True,
        text=True
    )
    
    files = set(result.stdout.strip().split('\n'))
    sensitive_patterns = ['.pem', 'token', 'secret', 'password', '.env']
    
    print("=== Checking Git History for Sensitive Files ===\n")
    
    found_sensitive = False
    for f in files:
        if not f or f == '(deleted)':
            continue
        if any(p in f.lower() for p in sensitive_patterns):
            print(f"WARNING - POTENTIALLY SENSITIVE: {f}")
            found_sensitive = True
    
    if not found_sensitive:
        print("OK - No obvious sensitive files found in history")
    
    # Check current tracked files
    print("\n=== Currently Tracked Files ===\n")
    result = subprocess.run(
        ['git', 'ls-files'],
        cwd=repo_dir,
        capture_output=True,
        text=True
    )
    tracked = result.stdout.strip().split('\n')
    
    sensitive_in_current = []
    for f in tracked:
        if not f:
            continue
        if any(p in f.lower() for p in sensitive_patterns):
            sensitive_in_current.append(f)
    
    if sensitive_in_current:
        print("Files that may need review:")
        for f in sensitive_in_current:
            print(f"  - {f}")
    else:
        print("OK - No sensitive files currently tracked")

if __name__ == '__main__':
    check_git_history()

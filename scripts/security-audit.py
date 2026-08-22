import subprocess
from pathlib import Path

def check_file_in_history(filename):
    """Check if a file existed in git history"""
    result = subprocess.run(
        ['git', 'log', '--all', '--name-only', '--pretty=format:', '--', filename],
        capture_output=True,
        text=True
    )
    return bool(result.stdout.strip())

def get_last_commit_with_file(filename):
    """Get the last commit that had this file"""
    result = subprocess.run(
        ['git', 'log', '--all', '--oneline', '--name-only', '--pretty=format:%h %s', '--', filename],
        capture_output=True,
        text=True
    )
    lines = result.stdout.strip().split('\n')
    if lines:
        return lines[0]
    return None

repo_dir = Path('.')

# Check for sensitive files
sensitive_files = [
    'config/github-token.txt',
    '.agnes/',
    'scripts/*.pem'
]

print("=== Security History Check ===\n")

for f in sensitive_files:
    exists = check_file_in_history(f)
    last_commit = get_last_commit_with_file(f)
    
    if exists:
        print(f"WARNING - FOUND in history: {f}")
        if last_commit:
            print(f"   Last seen: {last_commit[:50]}...")
    else:
        print(f"OK - Clean: {f}")

print("\n=== Recommendation ===")
print("If sensitive files were in history, consider:")
print("1. Using git filter-branch or BFG Repo-Cleaner to remove them")
print("2. Rotating any exposed credentials immediately")
print("3. Adding the files to .gitignore before rewriting history")

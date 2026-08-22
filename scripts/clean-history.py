#!/usr/bin/env python3
"""Clean sensitive files from git history automatically."""

import subprocess
import sys
from pathlib import Path

def run(cmd, check=True, shell=False):
    """Run a shell command."""
    print(f"\n>>> {cmd}")
    result = subprocess.run(
        cmd,
        shell=shell,
        capture_output=True,
        text=True,
        cwd='.'
    )
    if check and result.returncode != 0:
        if "does not match" in result.stderr or "not found" in result.stderr.lower():
            # File not tracked, that's OK
            return True
        print(f"ERROR: {result.stderr[:500]}")
        return False
    if result.stdout:
        print(result.stdout[:500])
    return True

def main():
    print("=== VisionMachine - Git History Cleanup ===\n")
    
    # Step 1: Ensure .gitignore has sensitive patterns
    print("[Step 1] Ensuring .gitignore has sensitive patterns...")
    gitignore = Path('.gitignore')
    current = gitignore.read_text() if gitignore.exists() else ''
    
    patterns_to_add = [
        'config/github-token.txt',
        '.agnes/',
    ]
    
    for pattern in patterns_to_add:
        if pattern.strip() not in current:
            with open(gitignore, 'a') as f:
                f.write(f'\n{pattern}\n')
            print(f"  Added: {pattern}")
    
    # Step 2: Remove files from git tracking (keep local copies)
    print("\n[Step 2] Removing sensitive files from git tracking...")
    run('git rm --cached config/github-token.txt 2>nul || true', shell=True)
    run('git rm -r --cached .agnes/ 2>nul || true', shell=True)
    
    # Step 3: Clean history using git filter-branch
    print("\n[Step 3] Rewriting git history...")
    print("  This will remove config/github-token.txt and .agnes/ from ALL commits")
    
    filter_script = '''git rm -f --cached --ignore-unmatch config/github-token.txt && rm -rf .agnes/'''
    run(f'git filter-branch -f --tree-filter "{filter_script}" HEAD', shell=True)
    
    # Step 4: Remove backup refs and prune
    print("\n[Step 4] Cleaning up backup refs and pruning...")
    run('git for-each-ref --format="%(refname)" refs/original/ | xargs -n 1 git update-ref -d 2>nul || true', shell=True)
    run('git reflog expire --expire=now --expire-unreachable=now --all', shell=True)
    run('git gc --prune=now --aggressive', shell=True)
    
    # Step 5: Commit the .gitignore changes
    print("\n[Step 5] Committing .gitignore changes...")
    run('git add .gitignore')
    run('git commit -m "chore: update .gitignore to exclude sensitive files"', shell=True)
    
    print("\n✅ History cleanup complete!")
    print("\n⚠️  IMPORTANT: You need to force push to remote:")
    print("   git push origin --force --all")
    print("   git push origin --force --tags")
    print("\n⚠️  NOTE: All clones of this repo will need to be re-cloned after force push.")

if __name__ == '__main__':
    main()

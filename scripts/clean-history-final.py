# Clean sensitive files from git history
# WARNING: This rewrites history - update your remotes after!

import subprocess
import sys
from pathlib import Path

def run(cmd, cwd='.'):
    print(f'\n>>> {cmd}')
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0 and 'did not match any files' not in result.stderr:
        print(f'Warning: {result.stderr[:200]}')
    return result.returncode == 0

def main():
    repo = Path('.')
    
    print("=" * 70)
    print("VISIONMACHINE - GIT HISTORY CLEANUP")
    print("=" * 70)
    
    # Files to remove from history
    sensitive_files = [
        'FINAL_SUMMARY.md',
        'IMPLEMENTATION_SUMMARY.md', 
        'PROJECT_STATUS.md',
        'README-TAURI.md',
        'COMPLETE_DOCUMENTATION_SUMMARY.md',
        'config/github-token.txt',
    ]
    
    # Step 1: Remove from tracking (if currently tracked)
    print("\n[Step 1] Removing sensitive files from git index...")
    for f in sensitive_files:
        run(f'git rm --cached "{f}"', cwd=repo)
    
    # Step 2: Rewrite history using filter-branch
    print("\n[Step 2] Rewriting git history...")
    print("  This will remove sensitive files from ALL commits")
    
    filter_script = '''
        rm -f FINAL_SUMMARY.md IMPLEMENTATION_SUMMARY.md PROJECT_STATUS.md README-TAURI.md COMPLETE_DOCUMENTATION_SUMMARY.md config/github-token.txt
    '''
    
    run(f'git filter-branch -f --tree-filter "{filter_script}" HEAD', cwd=repo)
    
    # Step 3: Clean up backup refs
    print("\n[Step 3] Cleaning up backup refs...")
    run('git for-each-ref --format="%(refname)" refs/original/ | xargs -n 1 git update-ref -d', cwd=repo)
    run('git reflog expire --expire=now --expire-unreachable=now --all', cwd=repo)
    run('git gc --prune=now --aggressive', cwd=repo)
    
    # Step 4: Verify cleanup
    print("\n[Step 4] Verifying cleanup...")
    result = subprocess.run(
        ['git', 'log', '--all', '--name-only', '--pretty=format:'],
        cwd=repo,
        capture_output=True,
        text=True
    )
    
    found_in_history = []
    for line in result.stdout.split('\n'):
        line = line.strip()
        if line in sensitive_files:
            found_in_history.append(line)
    
    if found_in_history:
        print("  WARNING: Files still found in history:")
        for f in found_in_history:
            print(f"    - {f}")
    else:
        print("  OK: No sensitive files found in history")
    
    # Step 5: Commit the .gitignore changes
    print("\n[Step 5] Committing .gitignore updates...")
    run('git add .gitignore')
    run('git commit -m "chore: clean git history and update .gitignore"')
    
    print("\n" + "=" * 70)
    print("CLEANUP COMPLETE")
    print("=" * 70)
    print("\nIMPORTANT: You must now FORCE PUSH to update the remote:")
    print("  git push origin develop --force")
    print("  git push origin production --force")
    print("  git push origin master --force")
    print("\nWARNING: All team members will need to re-clone the repository!")

if __name__ == '__main__':
    main()

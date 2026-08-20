"""Verify sensitive files are removed from git history."""
import subprocess
import sys
from pathlib import Path

def run(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout.strip(), result.stderr.strip(), result.returncode

def main():
    print("=== Git History Security Check ===\n")

    # 1. Check current tracked files
    print("1. Currently tracked files:")
    out, err, rc = run("git ls-files")
    if out:
        found = False
        for line in out.split('\n'):
            if any(s in line.lower() for s in ['.pem', 'token', 'secret', 'agnes']):
                print(f"   WARNING - {line}")
                found = True
        if not found:
            print("   OK - No sensitive files tracked")
    else:
        print("   (no files tracked)")

    # 2. Check ALL commits for sensitive files
    print("\n2. Checking all commits for sensitive files...")
    out, err, rc = run("git log --all --name-only --pretty=format: | sort -u")
    sensitive_files = []
    for line in out.split('\n'):
        line = line.strip()
        if line and any(s in line.lower() for s in ['.pem', 'github-token', '.agnes']):
            sensitive_files.append(line)

    if sensitive_files:
        print("   WARNING - Found in history:")
        for f in sensitive_files:
            print(f"      - {f}")
    else:
        print("   OK - No sensitive files in history")

    # 3. Check .gitignore
    print("\n3. .gitignore check:")
    gitignore = Path('.gitignore').read_text()
    checks = {
        'config/github-token.txt': 'config/github-token.txt' in gitignore,
        '.agnes/': '.agnes/' in gitignore,
        'scripts/': 'scripts/' in gitignore,
    }
    for check, passed in checks.items():
        status = "OK" if passed else "MISSING"
        print(f"   [{status}] {check}")

    # 4. Check untracked files
    print("\n4. Untracked files that should be ignored:")
    out, err, rc = run("git ls-files --others --exclude-standard")
    suspicious = [f for f in out.split('\n') if f and any(s in f.lower() for s in ['.pem', 'token', 'secret', 'agnes'])]
    if suspicious:
        print("   WARNING - Found:")
        for f in suspicious:
            print(f"      - {f}")
    else:
        print("   OK - Clean")

    print("\n=== Summary ===")
    print("If all checks show OK, the repository is clean.")
    print("WARNING indicates items that need attention.")

if __name__ == '__main__':
    main()

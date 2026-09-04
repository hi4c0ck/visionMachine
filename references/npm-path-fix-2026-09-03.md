# VisionMachine Composer — npm PATH Fix (2026-09-03)

## Problem
Hermes bundles its own npm (v12.0.2) which takes priority over system npm (v11.12.1).
This causes version mismatches and build failures.

## Root Cause
Windows PATH order: Hermes node is in `C:\Users\user\AppData\Local\hermes\node\` which comes before
`C:\Program Files\nodejs\` in the PATH environment variable.

## Fix
Always set PATH before npm commands:
```bash
export PATH="/c/Program Files/nodejs:$PATH" && npm run build
```

## Verification
```bash
which npm && npm --version
# Expected: /c/Program Files/nodejs/npm && 11.12.1
```

## Related
- System node: v24.15.0
- System npm: 11.12.1
- Hermes bundled npm: 12.0.2 (uses separate Node.js installation)

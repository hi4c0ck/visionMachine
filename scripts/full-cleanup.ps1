# Full Git History Cleanup Script
# WARNING: This will rewrite ALL history and force push

Set-Location "D:\work\horizonsMachine\VisionMachine"

Write-Host "=== COMPLETE GIT HISTORY CLEANUP ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Show current status
Write-Host "[1/6] Current git status:" -ForegroundColor Yellow
git status --short
Write-Host ""

# Step 2: Create a fresh branch from clean state
Write-Host "[2/6] Creating clean backup branch..." -ForegroundColor Yellow
git checkout -b clean-start 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Branch already exists, switching..." -ForegroundColor Gray
    git checkout clean-start
}

# Step 3: Reset to remove all tracked sensitive files
Write-Host "[3/6] Removing sensitive files from index..." -ForegroundColor Yellow
$filesToRemove = @(
    'FINAL_SUMMARY.md',
    'IMPLEMENTATION_SUMMARY.md',
    'PROJECT_STATUS.md',
    'README-TAURI.md',
    'COMPLETE_DOCUMENTATION_SUMMARY.md',
    'BRANCHING_STRATEGY.md',
    'config/github-token.txt'
)

foreach ($file in $filesToRemove) {
    if (Test-Path $file) {
        git rm --cached $file 2>$null
        Write-Host "  Removed: $file" -ForegroundColor Gray
    }
}

# Step 4: Remove .agnes directory from tracking
Write-Host "  Removing .agnes/ directory..." -ForegroundColor Gray
git rm -r --cached .agnes/ 2>$null

# Step 5: Commit the cleanup
Write-Host "[4/6] Committing cleanup..." -ForegroundColor Yellow
git add -A
git commit -m "chore: Complete security cleanup - remove all sensitive files from repo"

# Step 6: Delete old branches and recreate
Write-Host "[5/6] Recreating branch structure..." -ForegroundColor Yellow

# Delete old develop branch locally
git branch -D develop 2>$null

# Create new develop from clean-start
git checkout -b develop

# Merge clean-start into develop
git merge --no-ff clean-start -m "Merge clean state into develop"

# Delete backup branch
git branch -d clean-start

# Step 7: Force push everything
Write-Host "[6/6] Force pushing to remote..." -ForegroundColor Red
Write-Host "WARNING: This will overwrite remote history!" -ForegroundColor Red
Write-Host ""

git push origin develop --force
git push origin master --force 2>$null
git push origin production --force 2>$null

Write-Host ""
Write-Host "=== CLEANUP COMPLETE ===" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "1. Go to GitHub and regenerate your App private key" -ForegroundColor White
Write-Host "2. Update the key file at: D:\work\horizonsMachine\ssh\vision-app\" -ForegroundColor White
Write-Host "3. Anyone with clones must delete and re-clone this repository" -ForegroundColor White
Write-Host ""

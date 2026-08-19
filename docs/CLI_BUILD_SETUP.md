# VisionMachine - Pure CLI Build Setup

## 🎯 Goal
Install all build dependencies using ONLY command-line tools (no GUI installers).

## ✅ Prerequisites

### Option A: Using winget (Windows Package Manager)
```powershell
# Check if winget is available
winget --version

# Install Rust
winget install Rustlang.Rust

# Install Visual C++ Build Tools (standalone)
winget install Microsoft.VisualStudioBuildTools

# Install Node.js (if not present)
winget install OpenJS.NodeJS.LTS
```

### Option B: Using Chocolatey
```powershell
# Install Chocolatey first (if needed)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Then install tools
choco install rust -y
choco install visualstudio2022buildtools -y --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
choco install nodejs-lts -y
```

### Option C: Direct Downloads (No Package Manager)
```powershell
# Rust installer (command-line friendly)
Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "rustup-init.exe"
.\rustup-init.exe -y --default-toolchain stable

# Build Tools (direct download link)
Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vs_BuildTools.exe" -OutFile "$env:TEMP\vs_build_tools.exe"
& "$env:TEMP\vs_build_tools.exe" --passive --wait --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows10SDK.22621

# Node.js (LTS version)
Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi" -OutFile "$env:TEMP\node.msi"
msiexec /i "$env:TEMP\node.msi" /quiet
```

---

## 🔧 Automated Setup Script

Create and run `scripts\install-build-tools.ps1`:

```powershell
# VisionMachine Build Tool Installer (CLI Only)
param(
    [switch]$UseWinget,
    [switch]$UseChoco,
    [switch]$UseDirect
)

Write-Host "=== VisionMachine Build Tool Installer ===" -ForegroundColor Cyan
Write-Host ""

# Detect package manager
$useWinget = $UseWinget.IsPresent
$useChoco = $UseChoco.IsPresent
$useDirect = $UseDirect.IsPresent

if (-not ($useWinget -or $useChoco -or $useDirect)) {
    # Auto-detect
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        $useWinget = $true
    } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        $useChoco = $true
    } else {
        $useDirect = $true
    }
}

# Install based on method
if ($useWinget) {
    Write-Host "Using winget..." -ForegroundColor Yellow
    winget install --id Rustlang.Rust -e --accept-package-agreements --accept-source-agreements
    winget install --id Microsoft.VisualStudioBuildTools -e --accept-package-agreements --accept-source-agreements
} elseif ($useChoco) {
    Write-Host "Using Chocolatey..." -ForegroundColor Yellow
    choco install rust -y
    choco install visualstudio2022buildtools -y --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
} else {
    Write-Host "Using direct downloads..." -ForegroundColor Yellow
    # Download and run Rust installer silently
    $rustupUrl = "https://win.rustup.rs/x86_64"
    $rustupExe = "$env:TEMP\rustup-init.exe"
    Invoke-WebRequest -Uri $rustupUrl -OutFile $rustupExe
    & $rustupExe -y --default-toolchain stable --no-modify-path
    
    # Download Build Tools
    $btUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
    $btExe = "$env:TEMP\vs_build_tools.exe"
    Invoke-WebRequest -Uri $btUrl -OutFile $btExe
    Start-Process -FilePath $btExe -ArgumentList "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows10SDK.22621" -Wait
}

# Install Node.js if needed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Node.js..." -ForegroundColor Yellow
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements 2>$null
    choco install nodejs-lts -y 2>$null
}

# Install Tauri CLI
Write-Host "Installing Tauri CLI..." -ForegroundColor Yellow
npm install -g @tauri-apps/cli

Write-Host ""
Write-Host "=== Installation Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Please restart your terminal/session." -ForegroundColor Cyan
Write-Host "Then verify with:" -ForegroundColor Cyan
Write-Host "  rustc --version" -ForegroundColor White
Write-Host "  cargo --version" -ForegroundColor White
Write-Host "  tauri --version" -ForegroundColor White
Write-Host ""
Write-Host "Build with: cargo tauri build" -ForegroundColor Green
```

---

## 🚀 One-Command Setup

Save as `scripts\install-all.ps1`:

```powershell
# Run this ONCE to set up build environment
.\scripts\install-all.ps1

# Then build
cargo tauri build
```

---

## ⚠️ Important Notes

1. **First-time setup takes 15-30 minutes** (downloading ~5GB of tools)
2. **Admin privileges may be required** for system-wide installations
3. **Restart terminal** after installation for PATH updates
4. **Firewall/antivirus** may prompt during installation - allow all

---

*Pure CLI approach - no visual installers involved.*

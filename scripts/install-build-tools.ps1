# VisionMachine Build Tool Installer (CLI Only)
# Run: powershell -ExecutionPolicy Bypass -File scripts\install-build-tools.ps1

param(
    [switch]$UseWinget,
    [switch]$UseChoco,
    [switch]$UseDirect,
    [switch]$SkipNode,
    [switch]$SkipTauri
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  VisionMachine - Build Tool Installer (CLI)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Detect package manager
$useWinget = $UseWinget.IsPresent
$useChoco = $UseChoco.IsPresent
$useDirect = $UseDirect.IsPresent

if (-not ($useWinget -or $useChoco -or $useDirect)) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "[Auto-detect] Using winget" -ForegroundColor Yellow
        $useWinget = $true
    } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Host "[Auto-detect] Using Chocolatey" -ForegroundColor Yellow
        $useChoco = $true
    } else {
        Write-Host "[Auto-detect] Using direct downloads" -ForegroundColor Yellow
        $useDirect = $true
    }
}

# Step 1: Install Rust
Write-Host ""
Write-Host "[1/4] Installing Rust toolchain..." -ForegroundColor Cyan
if (Get-Command rustc -ErrorAction SilentlyContinue) {
    $ver = & rustc --version 2>&1
    Write-Host "  Rust already installed: $ver" -ForegroundColor Green
} else {
    if ($useWinget) {
        winget install --id Rustlang.Rust -e --accept-package-agreements --accept-source-agreements
    } elseif ($useChoco) {
        choco install rust -y
    } else {
        $rustupUrl = "https://win.rustup.rs/x86_64"
        $rustupExe = "$env:TEMP\rustup-init.exe"
        Write-Host "  Downloading rustup..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $rustupUrl -OutFile $rustupExe -UseBasicParsing
        Write-Host "  Installing Rust (silent)..." -ForegroundColor Gray
        & $rustupExe -y --default-toolchain stable --no-modify-path
        Remove-Item $rustupExe -Force
    }
}

# Step 2: Install Visual C++ Build Tools
Write-Host ""
Write-Host "[2/4] Installing Visual C++ Build Tools..." -ForegroundColor Cyan
if (Get-Command link -ErrorAction SilentlyContinue) {
    Write-Host "  Visual C++ Build Tools already installed" -ForegroundColor Green
} else {
    Write-Host "  Downloading Build Tools (~500MB)..." -ForegroundColor Yellow
    $btUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
    $btExe = "$env:TEMP\vs_build_tools.exe"
    
    try {
        Invoke-WebRequest -Uri $btUrl -OutFile $btExe -UseBasicParsing -ErrorAction Stop
        Write-Host "  Running silent installation (this takes 10-15 minutes)..." -ForegroundColor Yellow
        Write-Host "  Do NOT close this window!" -ForegroundColor Red
        
        $process = Start-Process -FilePath $btExe -ArgumentList @(
            "--passive",
            "--wait",
            "--add", "Microsoft.VisualStudio.Workload.VCTools",
            "--add", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
            "--add", "Microsoft.VisualStudio.Component.Windows10SDK.22621",
            "--add", "Microsoft.VisualStudio.Component.VC.ATL",
            "--add", "Microsoft.VisualStudio.Component.VC.MFC"
        ) -Wait -PassThru -ErrorAction SilentlyContinue
        
        if ($process.ExitCode -eq 0) {
            Write-Host "  Build Tools installed successfully" -ForegroundColor Green
        } else {
            Write-Host "  Build Tools installation failed with exit code: $($process.ExitCode)" -ForegroundColor Red
            Write-Host "  Try running as Administrator" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  Error: $_" -ForegroundColor Red
    } finally {
        if (Test-Path $btExe) { Remove-Item $btExe -Force -ErrorAction SilentlyContinue }
    }
}

# Step 3: Install Node.js (optional)
if (-not $SkipNode) {
    Write-Host ""
    Write-Host "[3/4] Checking Node.js..." -ForegroundColor Cyan
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $ver = & node --version
        Write-Host "  Node.js already installed: $ver" -ForegroundColor Green
    } else {
        Write-Host "  Installing Node.js..." -ForegroundColor Yellow
        if ($useWinget) {
            winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements
        } elseif ($useChoco) {
            choco install nodejs-lts -y
        } else {
            Write-Host "  Please install Node.js manually from https://nodejs.org/" -ForegroundColor Yellow
        }
    }
}

# Step 4: Install Tauri CLI
if (-not $SkipTauri) {
    Write-Host ""
    Write-Host "[4/4] Installing Tauri CLI..." -ForegroundColor Cyan
    if (Get-Command tauri -ErrorAction SilentlyContinue) {
        $ver = & tauri --version 2>&1
        Write-Host "  Tauri CLI already installed: $ver" -ForegroundColor Green
    } else {
        npm install -g @tauri-apps/cli
    }
}

# Final verification
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Verification" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

if (Get-Command rustc -ErrorAction SilentlyContinue) {
    Write-Host "  [OK] Rust: $(rustc --version)" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Rust not found" -ForegroundColor Red
    $allGood = $false
}

if (Get-Command cargo -ErrorAction SilentlyContinue) {
    Write-Host "  [OK] Cargo: $(cargo --version)" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Cargo not found" -ForegroundColor Red
    $allGood = $false
}

if (Get-Command link -ErrorAction SilentlyContinue) {
    Write-Host "  [OK] Visual C++ Compiler: Found" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Visual C++ Build Tools not found" -ForegroundColor Red
    $allGood = $false
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "  [OK] Node.js: $(node --version)" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Node.js not found (optional)" -ForegroundColor Yellow
}

if (Get-Command tauri -ErrorAction SilentlyContinue) {
    Write-Host "  [OK] Tauri CLI: $(tauri --version)" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Tauri CLI not in PATH (try restarting terminal)" -ForegroundColor Yellow
}

Write-Host ""
if ($allGood) {
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  SUCCESS! All build tools installed." -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Close and reopen your terminal" -ForegroundColor White
    Write-Host "  2. cd D:\work\horizonsMachine\VisionMachine" -ForegroundColor White
    Write-Host "  3. cargo tauri build" -ForegroundColor White
} else {
    Write-Host "================================================" -ForegroundColor Red
    Write-Host "  SOME TOOLS MISSING" -ForegroundColor Red
    Write-Host "================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please review the errors above and retry." -ForegroundColor Yellow
}

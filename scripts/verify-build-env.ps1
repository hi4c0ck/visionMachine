#!/usr/bin/env pwsh
# VisionMachine Build Verification Script
# Run this AFTER installing Visual C++ Build Tools

Write-Host "=== VisionMachine Build Verification ===" -ForegroundColor Cyan
Write-Host ""

$errors = @()
$warnings = @()
$success = @()

# Check Rust
Write-Host "[1/5] Checking Rust..." -ForegroundColor Yellow
$rustc = Get-Command rustc -ErrorAction SilentlyContinue
if ($rustc) {
    $version = & rustc --version 2>&1
    Write-Host "  ✅ Rust: $version" -ForegroundColor Green
    $success += "Rust"
} else {
    Write-Host "  ❌ Rust not found" -ForegroundColor Red
    $errors += "Rust"
}

# Check Cargo
Write-Host "[2/5] Checking Cargo..." -ForegroundColor Yellow
$cargo = Get-Command cargo -ErrorAction SilentlyContinue
if ($cargo) {
    $version = & cargo --version 2>&1
    Write-Host "  ✅ Cargo: $version" -ForegroundColor Green
    $success += "Cargo"
} else {
    Write-Host "  ❌ Cargo not found" -ForegroundColor Red
    $errors += "Cargo"
}

# Check Node.js
Write-Host "[3/5] Checking Node.js..." -ForegroundColor Yellow
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $version = & node --version 2>&1
    Write-Host "  ✅ Node.js: $version" -ForegroundColor Green
    $success += "Node.js"
} else {
    Write-Host "  ❌ Node.js not found" -ForegroundColor Red
    $errors += "Node.js"
}

# Check npm
Write-Host "[4/5] Checking npm..." -ForegroundColor Yellow
$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($npm) {
    $version = & npm --version 2>&1
    Write-Host "  ✅ npm: $version" -ForegroundColor Green
    $success += "npm"
} else {
    Write-Host "  ❌ npm not found" -ForegroundColor Red
    $errors += "npm"
}

# Check Visual C++ Build Tools (link.exe)
Write-Host "[5/5] Checking Visual C++ Build Tools..." -ForegroundColor Yellow
$linkPath = Get-Command link -ErrorAction SilentlyContinue
if ($linkPath) {
    Write-Host "  ✅ Visual C++ Build Tools: Found at $($linkPath.Source)" -ForegroundColor Green
    $success += "Visual C++"
    
    # Also check cl.exe
    $cl = Get-Command cl -ErrorAction SilentlyContinue
    if ($cl) {
        Write-Host "  ✅ Compiler (cl.exe): Found" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Compiler (cl.exe): Not in PATH" -ForegroundColor Yellow
        $warnings += "cl.exe not in PATH"
    }
} else {
    Write-Host "  ❌ Visual C++ Build Tools: NOT FOUND" -ForegroundColor Red
    Write-Host "     Required for compiling Rust native code" -ForegroundColor Gray
    $errors += "Visual C++ Build Tools"
    
    # Suggest locations
    Write-Host ""
    Write-Host "Looking for link.exe in common locations..." -ForegroundColor Gray
    $commonPaths = @(
        "C:\Program Files\Microsoft Visual Studio\*\VC\Tools\MSVC\*\bin\Hostx64\x64\link.exe",
        "C:\Program Files (x86)\Microsoft Visual Studio\*\VC\Tools\MSVC\*\bin\Hostx64\x64\link.exe",
        "C:\Program Files (x86)\Microsoft Visual Studio 14.0\VC\bin\link.exe"
    )
    
    foreach ($pattern in $commonPaths) {
        $found = Get-ChildItem $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            Write-Host "  Found at: $($found.FullName)" -ForegroundColor Cyan
        }
    }
}

# Summary
Write-Host ""
Write-Host "=== Verification Summary ===" -ForegroundColor Cyan
Write-Host "Passed: $($success.Count)/5" -ForegroundColor Green
Write-Host "Failed: $($errors.Count)/5" -ForegroundColor Red
if ($warnings.Count -gt 0) {
    Write-Host "Warnings: $($warnings.Count)" -ForegroundColor Yellow
}

Write-Host ""
if ($errors.Count -eq 0) {
    Write-Host "✅ All checks passed! Ready to build." -ForegroundColor Green
    Write-Host ""
    Write-Host "Run: cargo tauri build" -ForegroundColor Cyan
} else {
    Write-Host "❌ Missing components:" -ForegroundColor Red
    foreach ($err in $errors) {
        Write-Host "  - $err" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Please install the missing components and run this script again." -ForegroundColor Yellow
}

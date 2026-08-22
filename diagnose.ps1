# VisionMachine Window Diagnostics Script
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Util {
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@

$proc = Get-Process -Name 'vision-machine' -ErrorAction SilentlyContinue
if ($proc) {
    $hwnd = $proc.MainWindowHandle
    Write-Host "=== VisionMachine Window Analysis ===" -ForegroundColor Cyan
    Write-Host "PID: $($proc.Id)" -ForegroundColor Yellow
    Write-Host "Window Title: '$($proc.MainWindowTitle)'" -ForegroundColor Yellow
    
    $visible = [Win32Util]::IsWindowVisible($hwnd)
    Write-Host "Is Visible: $visible" -ForegroundColor $(if ($visible) {'Green'} else {'Red'})
    
    # Get window style
    $GWL_STYLE = -16
    $style = [Win32Util]::GetWindowLong($hwnd, $GWL_STYLE)
    Write-Host "Window Style: 0x$($style.ToString('X'))"
    
    # Check for WS_VISIBLE (0x10000000) and WS_CAPTION (0x00C00000)
    if ($visible) {
        Write-Host "Window IS visible according to Windows API" -ForegroundColor Green
    } else {
        Write-Host "Window is HIDDEN - attempting to show..." -ForegroundColor Red
        [Win32Util]::ShowWindow($hwnd, 9) | Out-Null  # SW_SHOW
        [Win32Util]::SetForegroundWindow($hwnd) | Out-Null
        Write-Host "Window should now be visible" -ForegroundColor Green
    }
} else {
    Write-Host "ERROR: VisionMachine process not found!" -ForegroundColor Red
}

Write-Host "`n=== Process Info ===" -ForegroundColor Cyan
$proc | Select-Object Id, ProcessName, MainWindowTitle, Responding, StartTime, @{N='Threads';E={$_.Threads.Count}}, @{N='Handles';E={$_.HandleCount}} | Format-List

#!/usr/bin/env python3
import subprocess
import time
import os
import sys

exe = r'D:\work\horizonsMachine\VisionMachine\src-tauri\target\release\vision-machine.exe'
print(f'Starting app: {exe}')
print(f'File exists: {os.path.exists(exe)}')
print(f'File size: {os.path.getsize(exe):,} bytes')

# Start the process
proc = subprocess.Popen([exe], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(3)

# Check if still running
is_running = proc.poll() is None
print(f'Process running after 3s: {is_running}')

if is_running:
    print('Killing process...')
    proc.kill()
    print('Done')
else:
    print(f'Process exited with code: {proc.returncode}')
    # Get any output
    stdout, stderr = proc.communicate()
    if stdout:
        print(f'STDOUT ({len(stdout)} bytes): {stdout[:500].decode("utf-8", errors="ignore")}')
    if stderr:
        print(f'STDERR ({len(stderr)} bytes): {stderr[:500].decode("utf-8", errors="ignore")}')

import os

log_path = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'VisionMachine', 'logs', 'visionmachine_20260821.log')

try:
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
        print(f"Total lines: {len(lines)}")
        print("\n=== LAST 100 LINES ===\n")
        for line in lines[-100:]:
            print(line.rstrip())
except Exception as e:
    print(f"Error reading log: {e}")

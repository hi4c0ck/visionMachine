import os
base = r'D:\work\horizonsMachine\VisionMachine\dist'
total = 0
for root, dirs, files in os.walk(base):
    for f in files:
        fp = os.path.join(root, f)
        total += os.path.getsize(fp)
        print(f'{fp}: {os.path.getsize(fp)/1024:.1f} KB')
print(f'Total dist size: {total/1024/1024:.2f} MB')

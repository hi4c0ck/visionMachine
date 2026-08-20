"""Create minimal icon files for Tauri"""
import os
import struct
import zlib

def create_png(width, height, color=(0, 122, 204)):
    """Create a minimal PNG file with solid color"""
    # PNG signature
    signature = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
    ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)

    # IDAT chunk (image data)
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # filter byte
        for x in range(width):
            raw_data += bytes(color) + b'\xff'  # RGBA

    compressed = zlib.compress(raw_data)
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)

    # IEND chunk
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)

    return signature + ihdr + idat + iend

def create_ico(size, color=(0, 122, 204)):
    """Create minimal ICO file with PNG data"""
    # ICO header
    header = struct.pack('<HHH', 0, 1, 1)  # reserved, type=ICO, count=1

    # Directory entry
    dir_entry = struct.pack('<BBBBHHII', size, size, 0, 0, 1, 0, 22 + 16, 14)  # offset to PNG data

    # Get PNG data
    png_data = create_png(size, size, color)

    return header + dir_entry + png_data

# Create icons directory
icon_dir = r'D:\work\horizonsMachine\VisionMachine\src-tauri\icons'
os.makedirs(icon_dir, exist_ok=True)

# Create all required icon sizes
for size in [16, 32, 48, 64, 128, 256]:
    filename = f'{size}x{size}.png'
    path = os.path.join(icon_dir, filename)
    with open(path, 'wb') as f:
        f.write(create_png(size, size))
    print(f'Created {filename}')

# Create icon.ico (multi-size)
with open(os.path.join(icon_dir, 'icon.ico'), 'wb') as f:
    f.write(create_ico(32))
print('Created icon.ico')

print('\nIcons created successfully!')

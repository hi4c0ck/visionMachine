"""Create minimal valid ICO file for Tauri"""
import struct
import zlib

def create_png(width, height):
    """Create minimal PNG with solid color"""
    # PNG signature
    sig = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr) & 0xffffffff
    ihdr_chunk = struct.pack('>I', 13) + b'IHDR' + ihdr + struct.pack('>I', ihdr_crc)
    
    # Image data (RGB, no alpha for simplicity)
    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter byte
        for x in range(width):
            raw += bytes([30, 50, 150])  # RGB blue
    
    compressed = zlib.compress(raw)
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    idat_chunk = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    
    # IEND chunk
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    iend_chunk = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    
    return sig + ihdr_chunk + idat_chunk + iend_chunk

def create_ico():
    """Create minimal ICO file with embedded PNG"""
    png_data = create_png(32, 32)
    
    # ICO header
    header = struct.pack('<HHH', 0, 1, 1)  # reserved, type=ICO, count=1
    
    # Directory entry
    dir_entry = struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 0, len(png_data), 22)
    
    return header + dir_entry + png_data

# Create icons
import os
icon_dir = r'D:\work\horizonsMachine\VisionMachine\src-tauri\icons'
os.makedirs(icon_dir, exist_ok=True)

ico_data = create_ico()
with open(os.path.join(icon_dir, 'icon.ico'), 'wb') as f:
    f.write(ico_data)

print(f"Created icon.ico ({len(ico_data)} bytes)")

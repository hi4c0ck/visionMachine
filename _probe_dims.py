import struct, os, sys, json, base64
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
root = r'C:\Users\user\VisionMachine\hi4\Projects\HM\Session 8'

def coded_dims(data):
    i = data.find(b'stsd')
    if i < 0:
        return None
    codec = None
    for tag in (b'avc1', b'hvc1', b'hev1'):
        j = data.find(tag, i, i + 40)
        if j > 0:
            codec = tag.decode()
            break
    if not codec:
        return None
    start = j + 4
    for off in range(start, min(start + 40, len(data) - 4), 2):
        w, h = struct.unpack('>HH', data[off:off + 4])
        if 64 <= w <= 4096 and 64 <= h <= 4096:
            return (w, h, codec)
    return None

def sent_first_frame_dims(log_path):
    """Decode the base64 first_frame data URI actually sent, read its PNG IHDR."""
    if not os.path.exists(log_path):
        return None
    raw = open(log_path, encoding='utf-8').read()
    import re
    m = re.search(r'"first_frame"\s*:\s*"(data:image/png;base64,)', raw)
    # find the data URI end
    if not m:
        return None
    start = raw.index(',', m.start()) + 1
    end = raw.index('"', start)
    b64 = raw[start:end]
    png = base64.b64decode(b64[:96])  # IHDR is in the first 24 bytes
    w, h = struct.unpack('>II', png[16:24])
    return (w, h, len(b64))

order = [
    ('shot1 text (14:47)', '46312b05-fcd3-4042-80c6-1a7e5ecae379', 'text'),
    ('shot2 keyf (15:01)', '19560db5-eadf-464d-afe8-3b33d472c371', 'keyframe'),
    ('shot3 keyf (15:26)', '1870714b-605c-458d-8222-29d56e26de69', 'keyframe'),
]
for label, task, mode in order:
    dirpath = None
    for sdir in os.listdir(root):
        d = os.path.join(root, sdir, task)
        if os.path.isdir(d):
            dirpath = d
            break
    v = os.path.join(dirpath, 'video.mp4')
    cd = coded_dims(open(v, 'rb').read()) if os.path.exists(v) else None
    ff = sent_first_frame_dims(os.path.join(dirpath, 'request.log'))
    print(f'{label:20} mode={mode:8}')
    print(f'   output clip coded dims : {cd[0]} x {cd[1]}' if cd else '   output clip coded dims : <none>')
    print(f'   first_frame SENT       : {ff[0]} x {ff[1]}' if ff else '   first_frame SENT       : (none - text mode, no image sent)')
    print()

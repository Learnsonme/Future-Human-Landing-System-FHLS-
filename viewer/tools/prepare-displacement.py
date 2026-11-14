"""Recreate CGI Moon Kit unsigned displacement from the official source LDEM_4.IMG.

Usage: python3 viewer/tools/prepare-displacement.py /path/to/ldem_4.img
The original product is 0..360 east, north-first, little-endian signed int16,
half-metres above 1737400 m. Shift longitude by 180 degrees and add 20000 DN,
as described by NASA SVS 4720. No resampling or loss of sample precision.
Output is an uncompressed uint16 TIFF, generated using only Python's stdlib.
"""
from pathlib import Path
import struct
import sys

source = Path(sys.argv[1]).read_bytes()
assert len(source) == 1440 * 720 * 2, 'Expected the 1440x720 PDS LDEM_4 image'
raw = struct.unpack('<1036800h', source)
values = []
for row in range(720):
    line = raw[row * 1440:(row + 1) * 1440]
    values.extend(v + 20000 for v in line[720:] + line[:720])
assert min(values) >= 0 and max(values) <= 65535
tags = [(256, 4, 1440), (257, 4, 720), (258, 3, 16), (259, 3, 1),
        (262, 3, 1), (273, 4, 0), (274, 3, 1), (277, 3, 1),
        (278, 4, 720), (279, 4, len(source)), (339, 3, 1)]
offset = 8 + 2 + len(tags) * 12 + 4
result = bytearray(b'II' + struct.pack('<HIH', 42, 8, len(tags)))
for tag, kind, value in tags:
    if tag == 273:
        value = offset
    result.extend(struct.pack('<HHI', tag, kind, 1))
    result.extend(struct.pack('<H', value) + b'\0\0' if kind == 3 else struct.pack('<I', value))
result.extend(struct.pack('<I', 0))
result.extend(struct.pack('<1036800H', *values))
target = Path(__file__).resolve().parents[1] / 'assets' / 'moon-displacement.tiff'
target.write_bytes(result)
print(target, len(result), 'bytes; heights', (min(values) - 20000) / 2, (max(values) - 20000) / 2, 'm')

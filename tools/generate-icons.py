#!/usr/bin/env python3
"""Generate PureFocus toolbar icons (16/32/48/128 px PNG) with no dependencies.

Design: dark rounded square, a mint-to-indigo gradient focus ring and a solid
center dot. Rendered with 4x4 supersampling for smooth edges.

Usage: python3 tools/generate-icons.py   (writes into ./src/icons)
"""
import math
import os
import struct
import zlib

SIZES = (16, 32, 48, 128)
SS = 4  # supersampling factor per axis

BG = (13, 15, 20)
MINT = (110, 231, 183)
INDIGO = (129, 140, 248)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def inside_rounded_square(x, y, radius):
    # Coordinates in [0, 1]; radius as a fraction of the side.
    cx = min(max(x, radius), 1 - radius)
    cy = min(max(y, radius), 1 - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def sample(x, y):
    """Return (r, g, b, a) for a point in unit coordinates."""
    if not inside_rounded_square(x, y, 0.22):
        return (0, 0, 0, 0)
    dx, dy = x - 0.5, y - 0.5
    d = math.hypot(dx, dy)
    t = min(max((x + y) / 2, 0), 1)
    accent = lerp(MINT, INDIGO, t)
    if 0.25 <= d <= 0.34:
        return (*accent, 255)
    if d <= 0.11:
        return (*accent, 255)
    return (*BG, 255)


def render(size):
    rows = []
    n = SS * SS
    for py in range(size):
        row = bytearray([0])  # filter type: none
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    r, g, b, a = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size)
                    acc[0] += r * a
                    acc[1] += g * a
                    acc[2] += b * a
                    acc[3] += a
            alpha = acc[3] / n
            if acc[3]:
                row += bytes((round(acc[0] / acc[3]), round(acc[1] / acc[3]), round(acc[2] / acc[3]), round(alpha)))
            else:
                row += bytes(4)
        rows.append(bytes(row))
    return b"".join(rows)


def png(size, raw):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def main():
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "icons")
    os.makedirs(out_dir, exist_ok=True)
    for size in SIZES:
        path = os.path.join(out_dir, f"icon{size}.png")
        with open(path, "wb") as fh:
            fh.write(png(size, render(size)))
        print("wrote", os.path.normpath(path))


if __name__ == "__main__":
    main()

"""Shrink the textures inside a .glb.

Why this exists rather than `gltf-transform resize`: the Sketchfab 911 carries a
palette-mode and a luminance+alpha PNG, and libvips (which gltf-transform uses)
fails on both with "colourspace: parameter space not set". Pillow reads them
without complaint.

Why it matters: the model shipped a 2048x4096 base-colour texture — 3.6 MB on
disk and 44.7 MB once uploaded to the GPU — plus a 2048x2048 at 22.4 MB. That
is ~95 MB of texture memory for a car drawn about 1000 px wide, which is what
made the landing page crawl on a phone.

    python scripts/shrink-glb.py public/car.glb public/car-mobile.glb --max 1024

The mesh is left completely alone; only image bufferViews are rewritten.
"""
import argparse
import io
import json
import struct
import sys

from PIL import Image

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path):
    raw = open(path, "rb").read()
    magic, version, total = struct.unpack("<III", raw[:12])
    if magic != 0x46546C67:
        raise SystemExit(f"{path} is not a .glb")
    chunks, off = {}, 12
    while off < total:
        length, ctype = struct.unpack("<II", raw[off : off + 8])
        chunks[ctype] = raw[off + 8 : off + 8 + length]
        off += 8 + length
    return json.loads(chunks[JSON_CHUNK].decode("utf-8")), chunks.get(BIN_CHUNK, b"")


def resize_png(data: bytes, max_side: int):
    """Return (new_bytes, before, after) — or None if it was already small."""
    im = Image.open(io.BytesIO(data))
    w, h = im.size
    longest = max(w, h)
    if longest <= max_side:
        return None
    scale = max_side / longest
    size = (max(1, round(w * scale)), max(1, round(h * scale)))

    # Palette images resample badly; go through RGBA and let the encoder
    # re-quantise. LA (luminance+alpha) survives a direct resize.
    if im.mode == "P":
        im = im.convert("RGBA")
    im = im.resize(size, Image.LANCZOS)

    out = io.BytesIO()
    im.save(out, format="PNG", optimize=True)
    return out.getvalue(), (w, h), size


def pad4(b: bytes, fill=b"\x00") -> bytes:
    return b + fill * ((4 - len(b) % 4) % 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--max", type=int, default=1024, help="longest side, px")
    args = ap.parse_args()

    gltf, binary = read_glb(args.src)
    views = gltf.get("bufferViews", [])
    images = gltf.get("images", [])

    # Replacement bytes, keyed by bufferView index.
    replaced = {}
    saved = 0
    for i, img in enumerate(images):
        bv_index = img.get("bufferView")
        if bv_index is None:
            continue
        bv = views[bv_index]
        start = bv.get("byteOffset", 0)
        data = binary[start : start + bv["byteLength"]]
        result = resize_png(data, args.max)
        if result is None:
            print(f"  image {i}: already <= {args.max}px, left alone")
            continue
        new_bytes, before, after = result
        replaced[bv_index] = new_bytes
        saved += len(data) - len(new_bytes)
        print(
            f"  image {i}: {before[0]}x{before[1]} -> {after[0]}x{after[1]}  "
            f"{len(data)/1e6:.2f}MB -> {len(new_bytes)/1e6:.2f}MB"
        )

    if not replaced:
        print("nothing to do")
        return

    # Rebuild the binary chunk, keeping every bufferView's content but giving
    # each a fresh, 4-byte-aligned offset.
    out = bytearray()
    for index, bv in enumerate(views):
        payload = replaced.get(index)
        if payload is None:
            start = bv.get("byteOffset", 0)
            payload = binary[start : start + bv["byteLength"]]
        while len(out) % 4:
            out.append(0)
        bv["byteOffset"] = len(out)
        bv["byteLength"] = len(payload)
        out.extend(payload)

    gltf["buffers"] = [{"byteLength": len(out)}]

    json_chunk = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    bin_chunk = pad4(bytes(out))
    total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)

    with open(args.dst, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(json_chunk), JSON_CHUNK))
        f.write(json_chunk)
        f.write(struct.pack("<II", len(bin_chunk), BIN_CHUNK))
        f.write(bin_chunk)

    import os

    print(
        f"\n{args.src} {os.path.getsize(args.src)/1e6:.2f}MB"
        f"  ->  {args.dst} {os.path.getsize(args.dst)/1e6:.2f}MB"
    )


if __name__ == "__main__":
    sys.exit(main())

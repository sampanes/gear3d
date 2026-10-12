"""Privacy scan for binary CAD files (.blend, .stl, .3mf) before they are committed.

Binary files can carry absolute paths from the machine that wrote them: Blender keeps
the last file-browser folder, library and render-output paths; slicer 3MFs keep
project metadata. This fails if a file contains an absolute drive path or a user
profile path.

Usage:
    python cad/check_private.py --staged          # scan staged CAD binaries (pre-commit)
    python cad/check_private.py FILE [FILE ...]   # scan files on disk

Compressed .blend files need the `zstandard` module (bundled with Blender's Python).

Fixing a flagged .blend: in Blender, point any File Browser area back to `//`
(Blender keeps the last Save As folder there), then save again.
"""

import io
import re
import subprocess
import sys
import zipfile

EXTS = (".blend", ".stl", ".3mf")
PATTERNS = re.compile(
    rb"[A-Za-z]:[\\/][\w .-]{2,}[\\/]"      # C:\something\
    rb"|(?i:\b(users|home|documents and settings)[\\/][\w .-]{2,})"
)


def _blend_bytes(data):
    if data[:4] == b"\x28\xb5\x2f\xfd":  # zstd
        import zstandard

        reader = zstandard.ZstdDecompressor().stream_reader(io.BytesIO(data), read_across_frames=True)
        return reader.read()
    if data[:2] == b"\x1f\x8b":  # gzip (older Blender)
        import gzip

        return gzip.decompress(data)
    return data


def _payloads(name, data):
    if name.lower().endswith(".blend"):
        yield name, _blend_bytes(data)
    elif name.lower().endswith(".3mf"):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for member in z.namelist():
                yield f"{name}:{member}", z.read(member)
    else:
        yield name, data


def scan(name, data):
    hits = []
    for where, blob in _payloads(name, data):
        for m in PATTERNS.finditer(blob):
            s = max(m.start() - 40, 0)
            ctx = re.sub(rb"[^ -~]", b".", blob[s:m.end() + 40]).decode("ascii")
            hits.append(f"{where}: {ctx}")
    return hits


def main(argv):
    if argv[:1] == ["--staged"]:
        out = subprocess.run(["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
                             capture_output=True, check=True).stdout.decode()
        names = [n for n in out.split("\0") if n.lower().endswith(EXTS)]
        files = [(n, subprocess.run(["git", "show", f":{n}"], capture_output=True, check=True).stdout)
                 for n in names]
    else:
        files = [(n, open(n, "rb").read()) for n in argv]
    bad = 0
    for name, data in files:
        hits = scan(name, data)
        print(f"[{'X' if hits else 'OK'}] {name}")
        for h in hits[:10]:
            print("    " + h)
        bad += bool(hits)
    if bad:
        print(f"[X] {bad} file(s) contain absolute paths -- see the fix in cad/check_private.py")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

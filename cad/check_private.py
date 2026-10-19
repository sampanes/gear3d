"""Privacy scan for files before they are committed (and of the whole tree in CI).

Binary files can carry absolute paths from the machine that wrote them: Blender keeps
the last file-browser folder, library and render-output paths; slicer 3MFs keep
project metadata. Text files can pick up a pasted local path or an email address.
This fails if a CAD binary contains a local path (drive, UNC or home folder), or a
text file contains a local path or an email address.

Usage:
    python cad/check_private.py --staged          # scan staged files (pre-commit)
    python cad/check_private.py --all             # scan every tracked file (CI)
    python cad/check_private.py FILE [FILE ...]   # scan files on disk

Compressed .blend files need the `zstandard` module (bundled with Blender's Python).

Fixing a flagged .blend: in Blender, point any File Browser area back to `//`
(Blender keeps the last Save As folder there), then save again, or rebuild it with
cad/make.py, which saves only the model's own collections.
"""

import io
import re
import subprocess
import sys
import zipfile

CAD = (".blend", ".stl", ".3mf")
TEXT = (".py", ".js", ".mjs", ".md", ".json", ".yml", ".yaml", ".html", ".css", ".txt", ".bat",
        ".cmd", ".ps1", ".sh", ".gitignore", ".gitattributes", "LICENSE", "pre-commit")
PATHS = re.compile(
    rb"[A-Za-z]:[\\/][\w .-]+[\\/]"                      # a drive path
    rb"|\\\\[\w.-]{2,}\\[\w$ .-]+"                       # a network share
    rb"|(?i:\b(users|home|documents and settings)[\\/][\w .-]{2,})"   # a home folder
)
# system folders say nothing about whose machine it is
SYSTEM = re.compile(rb"(?i)^[A-Za-z]:[\\/](windows|program files( \(x86\))?|programdata)[\\/]")
EMAIL = re.compile(rb"[\w.%+-]+@[\w-]+(\.[\w-]+)*\.[A-Za-z]{2,}")
# text that may legitimately match: the scanner's own examples and placeholders
ALLOW = (b"noreply@github.com", b"user@example.com")


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
    """(where, bytes, patterns) for each scannable part of a file."""
    low = name.lower()
    if low.endswith(".blend"):
        yield name, _blend_bytes(data), (PATHS,)
    elif low.endswith(".3mf"):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for member in z.namelist():
                yield f"{name}:{member}", z.read(member), (PATHS, EMAIL)
    elif low.endswith(".stl"):
        yield name, data, (PATHS,)  # binary floats: an email pattern would match noise
    else:
        yield name, data, (PATHS, EMAIL)


def scannable(name):
    return name.lower().endswith(CAD) or name.endswith(TEXT)


def scan(name, data):
    hits = []
    for where, blob, patterns in _payloads(name, data):
        for pat in patterns:
            for m in pat.finditer(blob):
                if m.group(0) in ALLOW or SYSTEM.match(m.group(0)):
                    continue
                s = max(m.start() - 40, 0)
                ctx = re.sub(rb"[^ -~]", b".", blob[s:m.end() + 40]).decode("ascii")
                hits.append(f"{where}: {ctx}")
    return hits


def _git(*args):
    return subprocess.run(["git", *args], capture_output=True, check=True).stdout


def main(argv):
    if argv[:1] in (["--staged"], ["--all"]):
        if argv[0] == "--staged":
            out = _git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").decode()
            ref = ":"        # the staged blob
        else:
            out = _git("ls-files", "-z").decode()
            ref = "HEAD:" if subprocess.run(["git", "rev-parse", "-q", "--verify", "HEAD"],
                                            capture_output=True).returncode == 0 else ":"
        names = [n for n in out.split("\0") if n and scannable(n)]
        files = [(n, _git("show", f"{ref}{n}")) for n in names]
    else:
        files = [(n, open(n, "rb").read()) for n in argv]
    bad = 0
    for name, data in files:
        hits = scan(name, data)
        if hits or name.lower().endswith(CAD) or len(files) < 20:
            print(f"[{'X' if hits else 'OK'}] {name}")
        for h in hits[:10]:
            print("    " + h)
        bad += bool(hits)
    print(f"[{'X' if bad else 'OK'}] {len(files)} file(s) scanned, {bad} with local paths or emails")
    if bad:
        print("[X] see the fix in cad/check_private.py")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

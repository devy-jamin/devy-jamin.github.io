#!/usr/bin/env python3
"""Check every image reference on every page before publishing.

Catches: missing files, srcset entries belonging to a different image, width
descriptors that do not match the real file, and duplicates.

    python3 tools/validate.py
"""
import os, re, sys, struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZED = re.compile(r"-\d+x\d+(\.\w+)$")
_w = {}


def width(rel):
    if rel in _w:
        return _w[rel]
    v = None
    try:
        with open(os.path.join(ROOT, rel.lstrip("/")), "rb") as f:
            h = f.read(33)
        if h[:8] == b"\x89PNG\r\n\x1a\n":
            v = struct.unpack(">II", h[16:24])[0]
    except Exception:
        v = None
    _w[rel] = v
    return v


base_of = lambda u: SIZED.sub(r"\1", u.split("?")[0])
problems = {"missing": [], "foreign": [], "descriptor": [], "dup": []}
imgs = 0

for dp, dn, fs in os.walk(ROOT):
    dn[:] = [d for d in dn if d not in (".git", "locked-assets", "tools")]
    for fn in fs:
        if not fn.endswith(".html"):
            continue
        page = os.path.relpath(os.path.join(dp, fn), ROOT)
        published = not page.startswith("_unlocked")
        text = open(os.path.join(dp, fn), encoding="utf-8", errors="replace").read()
        for tag in re.findall(r"<img[^>]*>", text):
            sm = re.search(r'src="([^"]+)"', tag)
            if not sm or not sm.group(1).startswith("/"):
                continue
            imgs += 1
            src = sm.group(1)
            if width(src) is None and published:
                problems["missing"].append((page, src))
            want, urls = base_of(src), []
            ss = re.search(r'srcset="([^"]*)"', tag)
            if not ss:
                continue
            for e in ss.group(1).split(","):
                e = e.strip()
                if not e:
                    continue
                parts = e.split()
                u = parts[0]
                if u in urls:
                    problems["dup"].append((page, u))
                urls.append(u)
                aw = width(u)
                if aw is None:
                    if published:
                        problems["missing"].append((page, u))
                    continue
                if base_of(u) != want:
                    problems["foreign"].append((page, want.split("/")[-1], u.split("/")[-1]))
                if len(parts) > 1 and parts[1].endswith("w"):
                    try:
                        if int(parts[1][:-1]) != aw:
                            problems["descriptor"].append((page, u.split("/")[-1], parts[1], aw))
                    except ValueError:
                        pass

print("%d <img> tags checked (published pages only for missing-file checks)\n" % imgs)
labels = {"missing": "MISSING FILES", "foreign": "FOREIGN srcset ENTRIES",
          "descriptor": "WRONG WIDTH DESCRIPTORS", "dup": "DUPLICATE ENTRIES"}
bad = False
for k in labels:
    v = problems[k]
    print("%s: %d" % (labels[k], len(v)))
    for row in v[:12]:
        print("   ", "  ".join(str(x) for x in row))
    if v:
        bad = True
print("\n" + ("ISSUES FOUND" if bad else "ALL CLEAN"))
sys.exit(1 if bad else 0)

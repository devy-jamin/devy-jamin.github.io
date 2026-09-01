#!/usr/bin/env python3
"""Re-download images that the protected pages reference but that lock.py removed.

lock.py encrypts the images used only by the protected case studies and deletes
the plaintext originals. To re-lock later those originals must be back on disk,
so this pulls them from the live WordPress site.

    python3 tools/restore_media.py

ONLY WORKS WHILE BLUEHOST IS STILL RUNNING.
"""
import os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 Chrome/124 Safari/537.36"}
UP = re.compile(r'(/wp-content/uploads/[^"\'()\s,>]+)')


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
        return r.read()


def fetch(path):
    dest = os.path.join(ROOT, path.lstrip("/"))
    try:
        data = get("https://www.devyjamin.com" + path)
    except Exception:
        m = re.match(r"(.*)-(\d+)x(\d+)(\.\w+)$", path)
        if not m:
            return path, None, "not found and not a sized variant"
        b, w, h, ext = m.groups()
        try:
            data = get("https://i0.wp.com/www.devyjamin.com%s%s?resize=%s,%s&ssl=1" % (b, ext, w, h))
        except Exception as e:
            return path, None, str(e)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "wb").write(data)
    return path, len(data), None


unlocked = os.path.join(ROOT, "_unlocked")
if not os.path.isdir(unlocked):
    sys.exit("No _unlocked/ folder found.")

refs = set()
for fn in os.listdir(unlocked):
    if fn.endswith(".html"):
        refs.update(UP.findall(open(os.path.join(unlocked, fn), encoding="utf-8").read()))

missing = sorted(r for r in refs
                 if "*" not in r and not os.path.exists(os.path.join(ROOT, r.lstrip("/"))))
print("%d referenced, %d missing on disk\n" % (len(refs), len(missing)))

ok = fail = total = 0
with ThreadPoolExecutor(max_workers=8) as ex:
    for path, size, err in ex.map(fetch, missing):
        if err:
            fail += 1
            print("  FAILED %s: %s" % (path, err))
        else:
            ok += 1
            total += size
print("\nrestored %d, failed %d, %.1f MB" % (ok, fail, total / 1048576))
if ok:
    print("You can now run `python3 lock.py`.")

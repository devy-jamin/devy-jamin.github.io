#!/usr/bin/env python3
"""Compare the live WordPress pages against the static copies in the repo.

Reports which pages have changed text or a different set of images, so a
re-import only has to touch the pages that actually moved.
"""
import os, re, sys, html, urllib.request
from concurrent.futures import ThreadPoolExecutor

REPO = sys.argv[1]
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 Chrome/124 Safari/537.36"}

# live WP path  ->  local file in the repo
PAGES = {
    "/":                         "index.html",
    "/nike-artemis-2/":          "_unlocked/nike-artemis.html",
    "/nike-launch-admin/":       "_unlocked/nike-launch-admin.html",
    "/nike-artemis-case-study/": "nike-artemis-case-study/index.html",
    "/ruby-ros/":                "ruby-ros/index.html",
    "/ruby-mobile-app/":         "ruby-mobile-app/index.html",
    "/sorel-site-design/":       "sorel-site-design/index.html",
    "/hanna-mobile/":            "hanna-mobile/index.html",
}


def visible_text(h):
    body = h[h.find("<body"):]
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", body, flags=re.S)
    body = re.sub(r"<[^>]+>", " ", body)
    return re.sub(r"\s+", " ", html.unescape(body)).strip()


def image_stems(h):
    """Base image names, ignoring size suffixes and CDN query strings."""
    out = set()
    for u in re.findall(r'/wp-content/uploads/[^"\'()\s,>]+\.(?:png|jpg|jpeg|gif|mp4|mov)', h):
        out.add(re.sub(r'-\d+x\d+(\.\w+)$', r'\1', u).split('/')[-1])
    return out


def fetch(path):
    req = urllib.request.Request("https://www.devyjamin.com" + path, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def compare(item):
    path, local_rel = item
    local_p = os.path.join(REPO, local_rel)
    if not os.path.exists(local_p):
        return path, "LOCAL FILE MISSING", None
    try:
        live = fetch(path)
    except Exception as e:
        return path, "FETCH FAILED: %s" % e, None
    if "post-password-form" in live:
        return path, "password-protected on WP (unprotect it to compare)", None

    lt, rt = visible_text(open(local_p, encoding="utf-8").read()), visible_text(live)
    li, ri = image_stems(open(local_p, encoding="utf-8").read()), image_stems(live)

    notes = []
    if lt != rt:
        notes.append("text differs (local %d chars, live %d)" % (len(lt), len(rt)))
    added, removed = ri - li, li - ri
    if added:
        notes.append("%d image(s) added on WP: %s" % (len(added), ", ".join(sorted(added)[:4])))
    if removed:
        notes.append("%d image(s) no longer on WP: %s" % (len(removed), ", ".join(sorted(removed)[:4])))
    return path, ("unchanged" if not notes else "; ".join(notes)), (lt, rt)


rows = []
with ThreadPoolExecutor(max_workers=6) as ex:
    rows = list(ex.map(compare, PAGES.items()))

print("%-30s %s" % ("PAGE", "STATUS"))
changed = 0
for path, status, extra in rows:
    mark = "  " if status == "unchanged" else "* "
    if status != "unchanged":
        changed += 1
    print("%s%-28s %s" % (mark, path, status))
print("\n%d of %d pages differ from the repo" % (changed, len(rows)))

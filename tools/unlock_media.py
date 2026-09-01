#!/usr/bin/env python3
"""Decrypt locked-assets/ back to plaintext images.

The companion to lock.py. lock.py encrypts the images used only by the
protected case studies and deletes the plaintext, so re-locking later needs
those originals back. restore_media.py can fetch them from WordPress, but only
for images that came from there — anything added locally (a screenshot, an
export) exists nowhere else once lock.py has run.

This recovers all of them from the encrypted copies using your password, so
nothing depends on Bluehost still being alive.

    python3 tools/unlock_media.py            # restore only what's missing
    python3 tools/unlock_media.py --all      # overwrite everything
    python3 tools/unlock_media.py --out DIR  # write elsewhere (a backup)

Requires: python3 -m pip install --user cryptography
"""
import os, re, sys, json, base64, getpass, hashlib

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    sys.exit("Missing dependency. Run:\n\n    python3 -m pip install --user cryptography\n")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNLOCKED = os.path.join(ROOT, "_unlocked")
ASSETDIR = os.path.join(ROOT, "locked-assets")
SLUGS = ["nike-artemis", "nike-launch-admin"]
UPLOAD_RE = re.compile(r'(/wp-content/uploads/[^"\'()\s,>]+)')

ALL = "--all" in sys.argv
OUT = ROOT
if "--out" in sys.argv:
    OUT = os.path.abspath(sys.argv[sys.argv.index("--out") + 1])


def field(text, name):
    m = re.search(r'%s = "([^"]*)"' % name, text)
    return base64.b64decode(m.group(1)) if m else None


def main():
    pages = [s for s in SLUGS if os.path.exists(os.path.join(ROOT, s, "index.html"))]
    if not pages:
        sys.exit("No locked pages found.")

    pw = getpass.getpass("Password: ")
    if not pw:
        sys.exit("No password entered.")

    # derive the key from any locked page (they share a salt per lock run)
    key = payload = None
    for slug in pages:
        t = open(os.path.join(ROOT, slug, "index.html"), encoding="utf-8").read()
        salt, iv, ct = field(t, "SALT"), field(t, "IV"), field(t, "CT")
        it = re.search(r"ITER = (\d+)", t)
        if not all([salt, iv, ct, it]):
            continue
        k = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, int(it.group(1)), 32)
        try:
            payload = json.loads(AESGCM(k).decrypt(iv, ct, None).decode())
            key = k
            break
        except Exception:
            continue
    if key is None:
        sys.exit("That password did not open the locked pages.")
    print("password accepted\n")

    # map each encrypted asset id back to the path the pages reference.
    # the page HTML inside the payload carries __ENC__<id>__ where the path was,
    # and _unlocked/ still has the same markup with the real paths.
    id_to_path = {}
    for slug in pages:
        enc_html = None
        t = open(os.path.join(ROOT, slug, "index.html"), encoding="utf-8").read()
        salt, iv, ct = field(t, "SALT"), field(t, "IV"), field(t, "CT")
        try:
            enc_html = json.loads(AESGCM(key).decrypt(iv, ct, None).decode())["html"]
        except Exception:
            continue
        plain_p = os.path.join(UNLOCKED, slug + ".html")
        if not os.path.exists(plain_p):
            continue
        plain = open(plain_p, encoding="utf-8").read()
        # The encrypted HTML is identical to the plaintext except that each
        # upload path was replaced by __ENC__<id>__. Walking both with a single
        # cursor keeps them aligned, so each token maps to the path it replaced.
        parts = re.split(r"__ENC__([0-9a-f]+)__", enc_html)
        cursor = 0
        for i in range(0, len(parts) - 1, 2):
            cursor += len(parts[i])
            m = UPLOAD_RE.match(plain[cursor:])
            if not m:
                break            # drifted out of alignment; stop rather than guess
            id_to_path.setdefault(parts[i + 1], m.group(1))
            cursor += len(m.group(1))

    assets = payload.get("assets", {})
    print("%d encrypted assets, %d mapped to a path\n" % (len(assets), len(id_to_path)))

    written = skipped = failed = unknown = 0
    for aid in assets:
        f = os.path.join(ASSETDIR, aid + ".enc")
        if not os.path.exists(f):
            failed += 1
            continue
        rel = id_to_path.get(aid)
        if not rel:
            rel = "/_recovered/%s%s" % (aid, {"image/png": ".png", "image/jpeg": ".jpg",
                    "video/mp4": ".mp4", "video/quicktime": ".mov"}.get(assets[aid].get("t"), ""))
            unknown += 1
        dest = os.path.join(OUT, rel.lstrip("/"))
        if os.path.exists(dest) and not ALL:
            skipped += 1
            continue
        raw = open(f, "rb").read()
        try:
            data = AESGCM(key).decrypt(raw[:12], raw[12:], None)
        except Exception:
            failed += 1
            continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, "wb").write(data)
        written += 1
        print("  %9d B  %s" % (len(data), rel))

    print("\nwritten %d, already present %d, failed %d" % (written, skipped, failed))
    if unknown:
        print("%d asset(s) could not be matched to a path; written to _recovered/" % unknown)
    if OUT == ROOT and written:
        print("\nYou can now run `python3 lock.py` to re-encrypt.")


if __name__ == "__main__":
    main()

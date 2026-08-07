#!/usr/bin/env python3
"""
Encrypt the password-protected case studies so they can live on static hosting.

Reads plaintext pages from _unlocked/, encrypts each page *and* every image or
video used only by those pages, then writes:

    <slug>/index.html        a password page containing only ciphertext
    locked-assets/<id>.enc   encrypted media, under opaque random filenames

Nothing readable is published — not the copy, not the images, not even the
original filenames. The password is never written to disk.

Usage:  python3 lock.py
Re-run after editing anything in _unlocked/.

Requires: python3 -m pip install --user cryptography
"""
import os, re, json, base64, getpass, hashlib, secrets, sys, shutil

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    sys.exit("Missing dependency. Run:\n\n    python3 -m pip install --user cryptography\n")

ROOT = os.path.dirname(os.path.abspath(__file__))
UNLOCKED = os.path.join(ROOT, "_unlocked")
ASSETDIR = os.path.join(ROOT, "locked-assets")
SLUGS = ["nike-artemis", "nike-launch-admin"]
ITERATIONS = 300_000

MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
        ".mp4": "video/mp4", ".mov": "video/quicktime"}


def b64(b):
    return base64.b64encode(b).decode()


# Matches an uploads path anywhere it appears — including the 2nd and later
# entries of a srcset, which are preceded by a space rather than a quote.
UPLOAD_RE = re.compile(r'(/wp-content/uploads/[^"\'()\s,>]+)')


def collect_private_assets():
    """Uploads referenced by the protected pages and by nothing public."""
    public, prot = set(), set()
    for dp, _, fs in os.walk(ROOT):
        top = os.path.relpath(dp, ROOT).split(os.sep)[0]
        if top in ("_unlocked", "locked-assets"):
            continue
        for fn in fs:
            if not fn.endswith(".html"):
                continue
            slug = os.path.relpath(dp, ROOT)
            slug = "" if slug == "." else slug
            if slug in SLUGS:
                continue                       # the locked stubs themselves
            t = open(os.path.join(dp, fn), encoding="utf-8", errors="replace").read()
            public.update(UPLOAD_RE.findall(t))
    for slug in SLUGS:
        t = open(os.path.join(UNLOCKED, slug + ".html"), encoding="utf-8").read()
        prot.update(UPLOAD_RE.findall(t))
    return sorted(u for u in prot - public
                  if os.path.exists(os.path.join(ROOT, u.lstrip("/"))))


def main():
    if not os.path.isdir(UNLOCKED):
        sys.exit(f"No _unlocked/ folder at {UNLOCKED}")
    missing = [s for s in SLUGS if not os.path.exists(os.path.join(UNLOCKED, s + ".html"))]
    if missing:
        sys.exit("Missing plaintext pages in _unlocked/: " + ", ".join(missing))

    # A previous run deletes the plaintext it encrypts. Re-running without
    # restoring it would publish pages whose images silently never resolve.
    absent = []
    for slug in SLUGS:
        t = open(os.path.join(UNLOCKED, slug + ".html"), encoding="utf-8").read()
        for u in set(UPLOAD_RE.findall(t)):
            if "*" in u:
                continue
            if not os.path.exists(os.path.join(ROOT, u.lstrip("/"))):
                absent.append(u)
    if absent:
        print(f"{len(absent)} image(s) referenced by the protected pages are not on disk,")
        print("because a previous lock.py run encrypted and removed them. Examples:")
        for u in sorted(absent)[:5]:
            print("   ", u)
        print("\nRestore the originals before locking again, or the published pages")
        print("will have missing images. Ask Claude to re-run restore.py.")
        if input("\nContinue anyway? [y/N] ").strip().lower() != "y":
            sys.exit("Aborted.")

    pw = getpass.getpass("Password to protect these pages: ")
    if len(pw) < 6:
        sys.exit("Please use at least 6 characters.")
    if pw != getpass.getpass("Confirm password: "):
        sys.exit("Passwords didn't match.")

    private = collect_private_assets()
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, ITERATIONS, 32)
    aes = AESGCM(key)

    shutil.rmtree(ASSETDIR, ignore_errors=True)
    os.makedirs(ASSETDIR, exist_ok=True)

    assets, token_for, total = {}, {}, 0
    for path in private:
        aid = secrets.token_hex(8)
        raw = open(os.path.join(ROOT, path.lstrip("/")), "rb").read()
        iv = secrets.token_bytes(12)
        open(os.path.join(ASSETDIR, aid + ".enc"), "wb").write(iv + aes.encrypt(iv, raw, None))
        assets[aid] = {"t": MIME.get(os.path.splitext(path)[1].lower(),
                                     "application/octet-stream")}
        token_for[path] = aid
        total += len(raw)
        print(f"  encrypted {len(raw):>10,} B  {path}")

    template = open(os.path.join(ROOT, "_lock-template.html"), encoding="utf-8").read()

    for slug in SLUGS:
        html = open(os.path.join(UNLOCKED, slug + ".html"), encoding="utf-8").read()
        # longest paths first so "foo.png" can't clobber "foo-300x200.png"
        for path in sorted(token_for, key=len, reverse=True):
            html = html.replace(path, f"__ENC__{token_for[path]}__")

        iv = secrets.token_bytes(12)
        ct = aes.encrypt(iv, json.dumps({"html": html, "assets": assets}).encode(), None)

        m = re.search(r"<title>(.*?)</title>", html, re.S)
        title = m.group(1).strip() if m else slug
        # h1 shows just the project name, not the "– Devy Jamin" site suffix
        heading = re.split(r"\s+[–—-]\s+Devy Jamin", title)[0].strip() or title
        page = (template
                .replace("__HEADING__", heading)
                .replace("__TITLE__", title)
                .replace("__SALT__", b64(salt))
                .replace("__IV__", b64(iv))
                .replace("__CT__", b64(ct))
                .replace("__ITER__", str(ITERATIONS)))
        out = os.path.join(ROOT, slug, "index.html")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, "w", encoding="utf-8").write(page)
        print(f"  locked {slug}/index.html  ({len(page):,} bytes)")

    removed = 0
    for path in private:
        f = os.path.join(ROOT, path.lstrip("/"))
        if os.path.exists(f):
            os.remove(f)
            removed += 1
    for dp, _, _ in sorted((d for d in os.walk(os.path.join(ROOT, "wp-content"))),
                           key=lambda x: -len(x[0])):
        if os.path.isdir(dp) and not os.listdir(dp):
            os.rmdir(dp)

    print(f"\n{len(assets)} assets encrypted ({total/1048576:.1f} MB); "
          f"{removed} plaintext originals removed from the published tree.")
    print("Editable originals stay in _unlocked/ (git-ignored). Re-run this to re-lock.")


if __name__ == "__main__":
    main()

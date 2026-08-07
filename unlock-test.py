#!/usr/bin/env python3
"""
Check whether a password actually opens the locked case studies.

Runs entirely on your machine — the password is never sent anywhere. Use it to
work out which password the last `python3 lock.py` run used, without guessing in
the browser.

Usage:  python3 unlock-test.py
"""
import os, re, sys, json, base64, getpass, hashlib

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    sys.exit("Run:  python3 -m pip install --user cryptography")

ROOT = os.path.dirname(os.path.abspath(__file__))
PAGES = ["nike-artemis", "nike-launch-admin"]


def field(text, name):
    m = re.search(rf'{name} = "([^"]*)"', text)
    return base64.b64decode(m.group(1)) if m else None


def try_page(slug, pw):
    p = os.path.join(ROOT, slug, "index.html")
    if not os.path.exists(p):
        return None, f"{slug}/index.html not found"
    t = open(p, encoding="utf-8").read()
    salt, iv, ct = field(t, "SALT"), field(t, "IV"), field(t, "CT")
    m = re.search(r"ITER = (\d+)", t)
    if not all([salt, iv, ct, m]):
        return None, "page doesn't look like a locked page"
    key = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, int(m.group(1)), 32)
    try:
        data = json.loads(AESGCM(key).decrypt(iv, ct, None).decode())
    except Exception:
        return False, "wrong password"

    # also confirm one encrypted asset opens with the same key
    ids = list(data.get("assets", {}))
    asset_ok = "no assets to check"
    if ids:
        f = os.path.join(ROOT, "locked-assets", ids[0] + ".enc")
        if os.path.exists(f):
            raw = open(f, "rb").read()
            try:
                AESGCM(key).decrypt(raw[:12], raw[12:], None)
                asset_ok = f"{len(ids)} assets, sample decrypts OK"
            except Exception:
                asset_ok = "PAGE opened but ASSET failed — re-run lock.py"
        else:
            asset_ok = f"manifest lists {len(ids)} assets but {ids[0]}.enc is missing"
    title = re.search(r"<title>(.*?)</title>", data["html"], re.S)
    return True, (f"opened — \"{title.group(1).strip() if title else slug}\", "
                  f"{len(data['html']):,} chars; {asset_ok}")


def main():
    pw = getpass.getpass("Password to test: ")
    if not pw:
        sys.exit("No password entered.")
    print()
    variants = [("as typed", pw)]
    if pw != pw.strip():
        variants.append(("whitespace trimmed", pw.strip()))

    any_ok = False
    for label, cand in variants:
        print(f"[{label}]")
        for slug in PAGES:
            ok, detail = try_page(slug, cand)
            mark = "✓" if ok else ("✗" if ok is False else "?")
            print(f"  {mark} {slug}: {detail}")
            any_ok = any_ok or bool(ok)
        print()

    if any_ok:
        print("That password works. If the browser still refuses it:")
        print("  - hard-reload the page (Cmd+Shift+R)")
        print("  - check for a trailing space when pasting")
    else:
        print("That password does not open these files.")
        print("Try another, or set a fresh one — ask Claude to restore the")
        print("plaintext images first, then run:  python3 lock.py")


if __name__ == "__main__":
    main()

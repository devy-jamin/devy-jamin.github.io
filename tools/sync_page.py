#!/usr/bin/env python3
"""Re-import a page from the live WordPress site into this static site.

Downloads the page, pulls every image/video/CSS/JS it references down to local
files, rewrites the URLs, strips the dead WordPress plumbing, and re-adds the
SEO/social tags.

    python3 tools/sync_page.py                 # list the pages it knows about
    python3 tools/sync_page.py ruby-ros        # re-import one page
    python3 tools/sync_page.py --all           # re-import every public page

ONLY WORKS WHILE BLUEHOST IS STILL RUNNING. Once hosting is cancelled there is
no source to pull from.

Re-importing OVERWRITES the local copy, so any hand-edits to that page's markup
are lost. Styling in the theme stylesheet is unaffected.
"""
import os, re, sys, html, urllib.request
from urllib.parse import urljoin, urlparse, parse_qs, unquote
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = "https://www.devyjamin.com"
SITE_HOSTS = {"devyjamin.com", "www.devyjamin.com"}
CDN_HOSTS = {"i0.wp.com", "i1.wp.com", "i2.wp.com", "i3.wp.com"}
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 Chrome/124 Safari/537.36"}

# slug -> (live WP path, output file, page title, meta description)
PAGES = {
  "home": ("/", "index.html",
     "Devy Jamin — Senior Product Designer",
     "Devy Jamin is a Senior Product Designer based in Portland, OR, currently "
     "working as a Design Lead at Nike. Selected product design work."),
  "nike-artemis-case-study": ("/nike-artemis-case-study/", "nike-artemis-case-study/index.html",
     "Nike Artemis — Product Readiness & Activation Platform",
     "Full case study: Artemis, Nike's centralized product readiness and activation platform."),
  "ruby-ros": ("/ruby-ros/", "ruby-ros/index.html",
     "Ruby / Receptionists Operating System — Devy Jamin",
     "Case study: Ruby's Receptionists Operating System."),
  "ruby-mobile-app": ("/ruby-mobile-app/", "ruby-mobile-app/index.html",
     "Ruby / Mobile App — Devy Jamin",
     "Case study: the Ruby mobile app for business owners on the go."),
  "sorel-site-design": ("/sorel-site-design/", "sorel-site-design/index.html",
     "SOREL / Responsive Site Redesign — Devy Jamin",
     "Case study: a responsive ecommerce redesign for SOREL."),
  "hanna-mobile": ("/hanna-mobile/", "hanna-mobile/index.html",
     "Hanna Andersson / Mobile Shopping — Devy Jamin",
     "Case study: rethinking mobile shopping for Hanna Andersson."),
  # protected pages: output goes to _unlocked/, then re-run lock.py
  "nike-artemis": ("/nike-artemis-2/", "_unlocked/nike-artemis.html", None, None),
  "nike-launch-admin": ("/nike-launch-admin/", "_unlocked/nike-launch-admin.html", None, None),
}

KILL = [
  r"<meta name='robots' content='noindex, nofollow' />\s*",
  r"<link rel='dns-prefetch' href='//js\.stripe\.com' />\s*",
  r"<link rel='preconnect' href='//i0\.wp\.com' />\s*",
  r'<link rel="alternate" type="application/rss\+xml"[^>]*/>\s*',
  r'<link rel="alternate" title="oEmbed[^>]*/>\s*',
  r'<link rel="alternate" title="JSON"[^>]*/>\s*',
  r'<link rel="https://api\.w\.org/"[^>]*/>\s*',
  r'<link rel="EditURI"[^>]*/>\s*',
  r'<meta name="generator" content="WordPress[^"]*" />\s*',
  r"<link rel='shortlink'[^>]*/>\s*",
  r'<link rel="profile" href="https://gmpg\.org/xfn/11" />\s*',
  r'<script id="wp-emoji-settings"[^>]*>.*?</script>\s*',
  r'<script[^>]*src="[^"]*wp-emoji-(?:loader|release)[^"]*"[^>]*>\s*</script>\s*',
  r'<script id="stripe-js-js"[^>]*>\s*</script>\s*',
  r'<script id="wpecpp-js[^"]*"[^>]*>.*?</script>\s*',
  r'<script id="SFSI[^"]*"[^>]*>.*?</script>\s*',
  r'<script[^>]*src="[^"]*ultimate-social-media-icons[^"]*"[^>]*>\s*</script>\s*',
  r"<link rel='stylesheet' id='SFSImainCss-css'[^>]*/>\s*",
  r"<link rel='stylesheet' id='wpecpp-css'[^>]*/>\s*",
]

ATTR = re.compile(r'''(?:src|href|data-src|poster)\s*=\s*("([^"]+)"|'([^']+)')''', re.I)
SRCSET = re.compile(r'''srcset\s*=\s*("([^"]+)"|'([^']+)')''', re.I)
CSSURL = re.compile(r'url\(\s*["\']?([^"\')]+)["\']?\s*\)')
seen = {}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def local_path(url):
    p = urlparse(url)
    path = unquote(p.path)
    if p.netloc.lower() in CDN_HOSTS:
        for h in SITE_HOSTS:
            if path.startswith("/" + h + "/"):
                path = path[len(h) + 1:]
                break
        q = parse_qs(p.query)
        dim = q.get("resize") or q.get("fit")
        if dim:
            m = re.match(r"(\d+),(\d+)", unquote(dim[0]))
            if m:
                stem, ext = os.path.splitext(path)
                path = "%s-%sx%s%s" % (stem, m.group(1), m.group(2), ext)
    return re.sub(r'[?*<>|"]', "_", path.lstrip("/"))


def grab(url):
    if url in seen:
        return seen[url]
    rel = local_path(url)
    seen[url] = "/" + rel
    dest = os.path.join(ROOT, rel)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "/" + rel
    try:
        data = get(url)
    except Exception as e:
        print("    FAILED %s: %s" % (url, e))
        del seen[url]
        return None
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "wb").write(data)
    print("    +%9d B  /%s" % (len(data), rel))
    return "/" + rel


def internal(u):
    h = urlparse(u).netloc.lower()
    return h in SITE_HOSTS or h in CDN_HOSTS


def sync(slug):
    live_path, out_rel, title, desc = PAGES[slug]
    print("\n== %s  (%s -> %s)" % (slug, live_path, out_rel))
    text = get(ORIGIN + live_path).decode("utf-8", "replace")
    if "post-password-form" in text:
        print("    SKIPPED: password-protected on WordPress. Set it to Public,")
        print("    re-run this, then set it back to Password protected.")
        return False

    base = ORIGIN + live_path
    repl = {}
    cands = set()
    for m in ATTR.finditer(text):
        cands.add(m.group(2) or m.group(3))
    for m in CSSURL.finditer(text):
        cands.add(m.group(1))
    for raw in cands:
        u = html.unescape(raw).strip()
        if u.startswith(("data:", "mailto:", "tel:", "#", "javascript:")):
            continue
        absu = urljoin(base, u)
        if not absu.startswith("http") or not internal(absu):
            continue
        if re.search(r'/(wp-json|xmlrpc\.php|feed/?$|comments/feed)', urlparse(absu).path):
            continue
        p = urlparse(absu).path
        if p in ("/", ""):
            continue
        # internal page link -> keep as a site-relative path
        page_slug = p.rstrip("/") + "/"
        if page_slug in [v[0] for v in PAGES.values()]:
            repl[raw] = "/nike-artemis/" if page_slug == "/nike-artemis-2/" else page_slug
            continue
        new = grab(absu.split("#")[0])
        if new:
            repl[raw] = new

    ss_repl = {}
    for m in SRCSET.finditer(text):
        rawset = m.group(2) or m.group(3)
        parts = []
        for item in rawset.split(","):
            item = item.strip()
            if not item:
                continue
            bits = item.split()
            absu = urljoin(base, html.unescape(bits[0]))
            if internal(absu):
                new = grab(absu.split("#")[0])
                if new:
                    bits[0] = new
            parts.append(" ".join(bits))
        newset = ", ".join(parts)
        if newset != rawset:
            ss_repl[rawset] = newset

    for old, new in sorted(ss_repl.items(), key=lambda kv: -len(kv[0])):
        text = text.replace(old, new)
    for old, new in sorted(repl.items(), key=lambda kv: -len(kv[0])):
        text = text.replace('"' + old + '"', '"' + new + '"')
        text = text.replace("'" + old + "'", "'" + new + "'")

    for pat in KILL:
        text = re.sub(pat, "", text, flags=re.S | re.I)

    if title:
        url = "https://devyjamin.com/" + ("" if slug == "home" else live_path.strip("/") + "/")
        m = re.search(r'src="(/wp-content/uploads/[^"]+\.(?:png|jpg|jpeg))"',
                      text[text.find("<body"):])
        img = "https://devyjamin.com" + (m.group(1) if m else
              "/wp-content/uploads/2017/07/logo-512x512.png")
        e = lambda s: html.escape(s, quote=True)
        tags = ('<meta name="description" content="%s" />\n'
                '<meta property="og:type" content="website" />\n'
                '<meta property="og:site_name" content="Devy Jamin" />\n'
                '<meta property="og:title" content="%s" />\n'
                '<meta property="og:description" content="%s" />\n'
                '<meta property="og:url" content="%s" />\n'
                '<meta property="og:image" content="%s" />\n'
                '<meta name="twitter:card" content="summary_large_image" />\n'
                % (e(desc), e(title), e(desc), url, img))
        text = re.sub(r'<link rel="canonical" href="[^"]*" />',
                      '<link rel="canonical" href="%s" />' % url, text)
        if 'property="og:title"' not in text:
            text = re.sub(r'(</title>)', r'\1\n' + tags.replace('\\', '\\\\'), text, count=1)

    dest = os.path.join(ROOT, out_rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, "w", encoding="utf-8").write(text)
    print("    wrote %s (%d chars)" % (out_rel, len(text)))
    if out_rel.startswith("_unlocked/"):
        print("    NOTE: protected page — run `python3 lock.py` to re-publish it.")
    return True


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if "--all" in sys.argv:
        args = [s for s in PAGES if not PAGES[s][1].startswith("_unlocked/")]
    if not args:
        print(__doc__)
        print("Known pages:\n  " + "\n  ".join(sorted(PAGES)))
        sys.exit()
    for slug in args:
        if slug not in PAGES:
            print("unknown page: %s" % slug)
            continue
        sync(slug)
    print("\nDone. Review with `python3 serve.py`, then commit and push.")

# Tools

Scripts for pulling changes from the old WordPress site into this static site.

> **These only work while Bluehost is still running.** Once hosting is
> cancelled there is nothing left to pull from, and this site becomes the only
> copy. Do a final sync before you cancel.

## Did anything change in WordPress?

```
python3 tools/check_wp_changes.py .
```

Compares every live WordPress page against the copy in this repo and lists
which ones differ in text or images. Start here — it tells you what actually
needs re-importing.

## Bring a change across

```
python3 tools/sync_page.py                 # list the page names it knows
python3 tools/sync_page.py ruby-ros        # re-import one page
python3 tools/sync_page.py --all           # re-import every public page
```

Downloads the page, pulls its images down locally, rewrites the URLs, strips
the WordPress plumbing, and re-adds the SEO/social tags.

Then check and publish:

```
python3 tools/validate.py     # no broken or mismatched images
python3 serve.py              # look at it on http://localhost:4321
git add -A && git commit -m "Update ruby-ros from WordPress" && git push
```

### ⚠️ Re-importing overwrites hand-edits

`sync_page.py` replaces the local page with whatever WordPress has. Anything
changed here but not there is lost. Right now that means one thing:

**`nike-artemis` — the Outcome stat cards.** They are coded HTML here
(`dj-outcomes` / `dj-outcome`), but still four flat PNGs in WordPress.
Re-importing that page reverts them to images. If you do, re-apply the change
or ask Claude to.

CSS in the theme stylesheet is never touched by a re-import.

## The two protected pages

They live encrypted, so they take extra steps:

1. In WordPress, set the page's visibility from **Password protected** to
   **Public** (otherwise only the password form can be downloaded)
2. `python3 tools/sync_page.py nike-artemis` — writes to `_unlocked/`
3. Set it back to **Password protected** in WordPress
4. `python3 tools/restore_media.py` — puts back the images lock.py deleted
5. `python3 lock.py` — re-encrypt and publish

## Checking the images

```
python3 tools/validate.py
```

Flags missing files, srcset entries pointing at a *different* image, width
descriptors that do not match the real file, and duplicates. Worth running
before any push that touches images.

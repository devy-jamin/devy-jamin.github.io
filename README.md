# devyjamin.com

Personal design portfolio for Devy Jamin — Senior Product Designer, Portland OR.

Static site hosted free on **GitHub Pages**. Migrated off WordPress/Bluehost in August 2026.

## How to change something

Every page is a plain HTML file. To edit text, open the file and change the words.

| Page | File |
|---|---|
| Home / selected work | `index.html` |
| Nike Artemis | `nike-artemis/index.html` |
| Ruby ROS | `ruby-ros/index.html` |
| Nike Launch Admin | `nike-launch-admin/index.html` |
| Ruby Mobile App | `ruby-mobile-app/index.html` |
| SOREL Site Design | `sorel-site-design/index.html` |
| Hanna Andersson Mobile | `hanna-mobile/index.html` |
| Not-found page | `404.html` |

Images live in `wp-content/uploads/<year>/<month>/`. Site styling is
`wp-content/themes/balasana-wpcom/style.css`. (Those folder names are left over
from WordPress — they work fine, they're just historical.)

## Preview locally before publishing

```
python3 serve.py
```

Then open <http://localhost:4321>. Press `Ctrl+C` to stop.

## Publish a change

```
git add -A
git commit -m "Describe what changed"
git push
```

GitHub Pages redeploys automatically, usually within a minute.

## Things worth knowing

- `CNAME` holds the custom domain (`devyjamin.com`). **Don't delete it** — the
  domain stops working if it goes missing.
- `sitemap.xml` lists pages for Google. Add an entry if you add a page.
- `robots.txt` allows search engines. The old WordPress site was set to
  `noindex` — that's been removed, so the site can now actually be found.
- Fonts load from Google Fonts; everything else is served from this repo.

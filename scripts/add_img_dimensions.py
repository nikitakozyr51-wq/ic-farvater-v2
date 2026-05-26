"""Add width/height attributes to all <img> tags in HTML files (CLS prevention).

Walks d:\\site-v2\\**/*.html, reads each <img src="..."> file via PIL, and inserts
width="X" height="Y" attributes if missing. Idempotent: skips images that already
have both dimensions. Skips external URLs and missing files.

Safe rewrite: only injects new attrs immediately after `<img`. Doesn't touch any
existing attributes (alt, loading, class, fetchpriority, etc.).
"""
import re
from pathlib import Path
from urllib.parse import unquote
from PIL import Image

ROOT = Path(r'd:\site-v2')

img_re   = re.compile(r'<img\b([^>]*?)\s*/?>', re.IGNORECASE)
src_re   = re.compile(r'\bsrc=["\']([^"\']+)["\']', re.IGNORECASE)
width_re = re.compile(r'\bwidth=["\']?\d+["\']?', re.IGNORECASE)
height_re = re.compile(r'\bheight=["\']?\d+["\']?', re.IGNORECASE)

def resolve(html_path: Path, src: str):
    if src.startswith(('http://', 'https://', '//', 'data:')):
        return None
    # Decode %20 etc — HTML href encodes spaces in filenames
    return (html_path.parent / unquote(src)).resolve()

stats = {'patched': 0, 'already_set': 0, 'no_src': 0, 'external': 0, 'missing': 0, 'unreadable': 0}

for html in ROOT.rglob('*.html'):
    if any(p in html.parts for p in ('.git', 'node_modules')): continue
    text = html.read_text(encoding='utf-8')
    file_patched = False

    def patch(m):
        global file_patched
        attrs = m.group(1)
        if width_re.search(attrs) and height_re.search(attrs):
            stats['already_set'] += 1
            return m.group(0)
        src_m = src_re.search(attrs)
        if not src_m:
            stats['no_src'] += 1
            return m.group(0)
        src = src_m.group(1)
        img_path = resolve(html, src)
        if img_path is None:
            stats['external'] += 1
            return m.group(0)
        if not img_path.exists():
            stats['missing'] += 1
            print(f'  MISSING: {src} (from {html.name})')
            return m.group(0)
        try:
            with Image.open(img_path) as im:
                w, h = im.size
        except Exception as e:
            stats['unreadable'] += 1
            print(f'  UNREADABLE: {src} — {e}')
            return m.group(0)
        # Inject just after `<img` so existing attr ordering stays intact
        new_attrs = f' width="{w}" height="{h}"' + attrs
        stats['patched'] += 1
        file_patched = True
        return f'<img{new_attrs}>'

    new_text = img_re.sub(patch, text)
    if file_patched:
        html.write_text(new_text, encoding='utf-8')
        print(f'patched: {html.relative_to(ROOT)}')

print('\nStats:', stats)

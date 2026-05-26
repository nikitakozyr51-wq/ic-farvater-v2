"""Generate Open Graph image (1200x630) from hero photo + brand overlay."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path

SRC  = Path(r'd:\site-v2\assets\images\9CN77.webp')
OUT  = Path(r'd:\site-v2\assets\images\og-image.jpg')
W, H = 1200, 630

img = Image.open(SRC).convert('RGB')

# Crop to 1200x630 aspect, then resize
src_ratio = img.width / img.height
dst_ratio = W / H
if src_ratio > dst_ratio:
    # Source wider — crop sides
    new_w = int(img.height * dst_ratio)
    x = (img.width - new_w) // 2
    img = img.crop((x, 0, x + new_w, img.height))
else:
    # Source taller — crop top/bottom
    new_h = int(img.width / dst_ratio)
    y = (img.height - new_h) // 2
    img = img.crop((0, y, img.width, y + new_h))
img = img.resize((W, H), Image.LANCZOS)

# Subtle blur for text readability + dark overlay
img = img.filter(ImageFilter.GaussianBlur(radius=2))
overlay = Image.new('RGBA', (W, H), (17, 47, 110, 140))  # brand #112F6E @ ~55%
img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')

# Text overlay
draw = ImageDraw.Draw(img)

def load_font(size):
    for name in ['segoeuib.ttf', 'segoeui.ttf', 'arialbd.ttf', 'arial.ttf']:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()

font_brand    = load_font(96)
font_tagline  = load_font(38)
font_meta     = load_font(28)

cream = (245, 243, 239)
cream_muted = (245, 243, 239, 200)

# "ic farvater" — main brand mark
title = 'ic farvater'
tw, _ = draw.textbbox((0, 0), title, font=font_brand)[2:]
draw.text(((W - tw) / 2, 200), title, fill=cream, font=font_brand)

# Tagline
tag = 'поставки электронных компонентов'
tw, _ = draw.textbbox((0, 0), tag, font=font_tagline)[2:]
draw.text(((W - tw) / 2, 330), tag, fill=cream, font=font_tagline)

# Meta line
meta = 'микросхемы · разъёмы · СВЧ · преобразователи'
tw, _ = draw.textbbox((0, 0), meta, font=font_meta)[2:]
draw.text(((W - tw) / 2, 400), meta, fill=cream_muted[:3], font=font_meta)

# URL chip bottom right
url = 'ic-farvater.ru'
tw, _ = draw.textbbox((0, 0), url, font=font_meta)[2:]
draw.text((W - tw - 60, H - 60), url, fill=cream_muted[:3], font=font_meta)

img.save(OUT, 'JPEG', quality=88, optimize=True, progressive=True)
print(f'wrote {OUT} ({OUT.stat().st_size // 1024} KB)')

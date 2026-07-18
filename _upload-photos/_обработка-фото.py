# -*- coding: utf-8 -*-
# Обработка присланных фото: прозрачный PNG (товар + мягкая тень) ->
# серый #E9E8EB -> единый квадрат 1200x1200 (масштаб по ТОВАРУ, не по тени) -> WebP.
# Запуск: python wrap_photos.py <входная_папка> [--lossless]
import sys, os, io, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from PIL import Image

GRAY = (233, 232, 235)   # #E9E8EB — фон карточек сайта
SIZE = 1200              # целевой квадрат
PAD = 0.14               # поле вокруг товара
MAX_UPSCALE = 2.4        # мелкий исходник не раздувать сильнее — иначе замылит
ALPHA_THR = 50           # порог: плотный товар vs мягкая тень

def to_transparent(im, thr=236):
    """Прозрачный PNG отдаём как есть; белый фон -> прозрачность по порогу яркости."""
    im = im.convert('RGBA')
    if im.getextrema()[3][0] < 255:
        return im
    px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r >= thr and g >= thr and b >= thr:
                px[x, y] = (r, g, b, 0)
    return im

def wrap(path, lossless=False):
    im = to_transparent(Image.open(path))
    a = im.getchannel('A')
    dense = a.point(lambda v: 255 if v > ALPHA_THR else 0).getbbox()  # рамка товара без слабой тени
    if dense is None: dense = im.getbbox() or (0, 0, im.width, im.height)
    dw, dh = dense[2]-dense[0], dense[3]-dense[1]
    inner = SIZE * (1 - 2*PAD)
    scale = min(inner/dw, inner/dh, MAX_UPSCALE)   # масштаб по товару → единый размер
    big = im.resize((max(1, round(im.width*scale)), max(1, round(im.height*scale))), Image.LANCZOS)
    # центр товара (dense) → центр кадра; тень естественно уходит за края при необходимости
    dcx = (dense[0]+dense[2]) / 2 * scale
    dcy = (dense[1]+dense[3]) / 2 * scale
    canvas = Image.new('RGBA', (SIZE, SIZE), GRAY + (255,))
    canvas.alpha_composite(big, (round(SIZE/2 - dcx), round(SIZE/2 - dcy)))
    return canvas.convert('RGB'), scale

def main():
    inp = sys.argv[1]
    lossless = '--lossless' in sys.argv
    out = os.path.join(inp, '_обработано')
    os.makedirs(out, exist_ok=True)
    files = [f for f in glob.glob(os.path.join(inp, '*')) if f.lower().endswith(('.png','.jpg','.jpeg','.webp'))]
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        img, sc = wrap(f, lossless)
        dst = os.path.join(out, name + '.webp')
        if lossless: img.save(dst, 'WEBP', lossless=True, quality=100)
        else: img.save(dst, 'WEBP', quality=92, method=6)
        warn = ' ⚠ мелкий исходник (растянут)' if sc >= MAX_UPSCALE else ''
        print(f"  {name}.webp  ({os.path.getsize(dst)//1024} КБ){warn}")
    print(f"\nобработано {len(files)} -> {out}")

if __name__ == '__main__':
    main()

# IC Фарватер — сайт (вариант 2)

Многостраничный сайт-каталог B2B-дистрибьютора электронной компонентной базы. Чистый HTML + CSS + vanilla JS, без сборщиков и npm.

## Технологии

- HTML5, CSS3 (custom properties + grid + flex), ES6+ JavaScript
- Шрифт Inter (локальный, woff2)
- GSAP + Lenis для скролл-анимаций
- PHP для бэкенда форм (отправка email через `scripts/send.php`)
- Docker (`Dockerfile` с php:8.2-apache) для деплоя через Dokploy

## Roadmap

- **Сейчас:** static HTML + PHP формы → Dokploy → Beget VPS
- **Этап 2:** Strapi CMS как админка для редактирования каталога — см. [`STRAPI-ROADMAP.md`](./STRAPI-ROADMAP.md)

## Структура

```
.
├── index.html                  # Главная
├── pages/
│   ├── products.html           # Каталог
│   ├── product-detail.html     # Универсальная карточка (landing / variant / single)
│   ├── about.html              # О компании
│   ├── contacts.html           # Контакты
│   ├── privacy-policy.html     # Политика конфиденциальности
│   └── consent.html            # Согласие на обработку ПД
├── css/                        # Стили (reset, tokens, base, layout, components, inner-page, animations)
├── js/                         # main.js, animations.js, products/connectors/converters/capacitors data
├── scripts/                    # PHP backend (send.php) + утилиты сборки (build_og_image.py)
├── assets/
│   ├── fonts/                  # Inter woff2
│   ├── images/                 # Фото товаров + OG-картинка
│   └── favicon/                # SVG + PNG + manifest
├── Dockerfile                  # PHP 8.2 + Apache (для Dokploy/VPS деплоя)
├── .dockerignore               # Что исключить из image
├── .htaccess                   # Apache конфиг (gzip, cache, security headers, PHP limits)
├── robots.txt                  # Crawler разрешения
├── sitemap.xml                 # XML карта сайта
├── llms.txt                    # Краткая справка для AI ботов (ChatGPT, Perplexity)
├── DEPLOY-DOKPLOY.md           # Гайд деплоя на VPS через Dokploy (актуальный)
├── DEPLOY.md                   # Гайд для shared-хостинга (fallback)
└── STRAPI-ROADMAP.md           # План этапа 2 — Strapi CMS как админка
```

## Локальная разработка

```powershell
Start-Process python -ArgumentList '-m','http.server','5501','--directory','D:\site-v2','--bind','127.0.0.1'
```
Открыть http://127.0.0.1:5501/

## Deploy на Beget VPS через Dokploy

См. подробный гайд: [`DEPLOY-DOKPLOY.md`](./DEPLOY-DOKPLOY.md)

Кратко:
1. Установить Dokploy на VPS (одна SSH-команда)
2. В веб-панели Dokploy подключить GitHub-репозиторий
3. Привязать домен `ic-farvater.ru` + Let's Encrypt
4. **Deploy** → сайт работает
5. Дальше: каждый `git push` → автоматический rebuild

Альтернативный гайд для shared-хостинга: [`DEPLOY.md`](./DEPLOY.md) (legacy fallback).

## Конфигурация после деплоя

### Yandex.Metrica

1. Зарегистрировать счётчик: https://metrika.yandex.ru/list?
2. Подтвердить владение доменом
3. Скопировать 8-значный counter ID
4. Заменить во всех 7 HTML файлах:
   ```html
   <meta name="yandex-counter" content="">
   ```
   на:
   ```html
   <meta name="yandex-counter" content="99999999">
   ```
   (где 99999999 — ваш counter ID)
5. После accept в cookie banner — JS автоматически подгрузит снippet `mc.yandex.ru/metrika/tag.js`

### Email формы

В `scripts/send.php` проверить константы:
- `TO_EMAIL` — основной получатель (`info@ic-farvater.ru`)
- `CC_EMAIL` — копия (`sale@ic-farvater.ru`)
- `FROM_EMAIL` — отправитель (должен быть зарегистрирован на Beget, например `noreply@ic-farvater.ru`)
- `ALLOWED_ORIGIN` — `https://ic-farvater.ru` (домен с протоколом)

### CSP (Content-Security-Policy)

В `pages/contacts.html` уже добавлены `https://mc.yandex.ru` в `connect-src` для отправки метрик. Если добавите GA — расширьте CSP.

## Cache-busting

CSS/JS подключены с query-параметром `?v=N`. При изменении файла — увеличить `N` в HTML.

## Цвета (фирменные)

- `#112F6E` — основной (тёмно-синий)
- `#F5F3EF` — фон (тёплый кремовый)
- `#E9E8EB` — placeholder фон
- `#6B7A94` — приглушённый текст
- `#D7D3CB` — разделители

## Анимации

- Hero / page-top: CSS-only entry (`ic-entry-up` keyframe) — мгновенно при load
- Sections / cards: ScrollTrigger fade-up / stagger / scale-reveal (GSAP)
- Card hover: translateY -6px + image scale 1.06 (Swiss easing)
- Mobile menu: slide-in справа 350ms
- Filter dot-fill: hover на `( )` показывает `(•)` через CSS `::before`

## Контакты компании

ООО «Айси Фарватер» · ИНН 7801709112 · ОГРН 1227800016993
ул. Беринга, д. 1-А, оф. 46-Н, г. Санкт-Петербург, 199406
+7 996 778-88-42 · info@ic-farvater.ru

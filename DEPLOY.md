# Deploy IC Фарватер v2 на Beget

Пошаговая инструкция: от готового кода → до работающего сайта на `ic-farvater.ru`.

---

## Что у тебя уже есть

- ✅ Сервер Beget куплен
- ✅ Домен `ic-farvater.ru` направлен на сервер
- ✅ Код в репозитории `https://github.com/nikitakozyr51-wq/ic-farvater-v2`
- ✅ Локально работает: `http://127.0.0.1:5501/`

---

## Шаг 1 — Проверить что DNS уже привязался

Открой в браузере: https://www.whatsmydns.net/#A/ic-farvater.ru

Если в большинстве точек мира зелёный IP твоего Beget-сервера — DNS готов. Обычно 15 минут – 2 часа, в худшем случае до 24ч.

Альтернатива — в PowerShell:
```powershell
nslookup ic-farvater.ru
```
Должен показать IP сервера Beget.

**Если ещё не привязался — иди дальше шаги 2-4, пока ждёшь.**

---

## Шаг 2 — Настройки в панели Beget (web-интерфейс)

### 2.1 SSL-сертификат (Let's Encrypt, бесплатно)

1. Войди в https://beget.com/
2. Сайты → выбери `ic-farvater.ru`
3. **SSL** → **Заказать Let's Encrypt** → Подтвердить
4. Включи галку **Принудительный HTTPS** (после установки сертификата)

Сертификат выдаётся за 5-15 минут. Подтверждение работает только после того, как DNS привязался — иначе Let's Encrypt не сможет верифицировать домен.

### 2.2 Почтовый ящик для отправки форм

В панели Beget:
1. **Почта** → **Создать ящик**
2. Имя: `noreply` (полный адрес станет `noreply@ic-farvater.ru`)
3. Пароль: сгенерируй сложный + запиши его — он понадобится в `send.php` если хочешь использовать SMTP вместо встроенного PHP `mail()`
4. **Создать**

Создай также `info@ic-farvater.ru` и `sale@ic-farvater.ru` (если ещё нет) — туда будут падать заявки с сайта.

### 2.3 Версия PHP

В панели Beget:
1. **Сайты** → `ic-farvater.ru` → **Настройки PHP**
2. Версия: **PHP 8.1** или **8.2** (рекомендую 8.1 LTS)
3. Сохранить

---

## Шаг 3 — Подготовить deploy-пакет

В терминале PowerShell на твоей машине:
```powershell
cd D:\site-v2
.\scripts\build_deploy_package.ps1
```

Скрипт создаст `D:\site-v2\dist\ic-farvater-v2-deploy.zip` — внутри только production-файлы:
- HTML (7 страниц)
- CSS, JS (без vendor source maps)
- Assets (картинки, шрифты, favicon)
- `scripts/send.php`
- `.htaccess`
- `robots.txt`, `sitemap.xml`, `llms.txt`

**Исключено:** `.git/`, `scripts/*.py`, `screenshots/`, `README.md`, `DEPLOY.md`, `HANDOFF.md`, `CLAUDE.md`, `.claude/`, `docs/`, `node_modules/` etc.

Размер архива ≈ 25-30 MB.

---

## Шаг 4 — Залить файлы на Beget

### Вариант A — Через панель Beget (проще, медленнее)

1. **Файловый менеджер** в панели Beget
2. Перейди в `ic-farvater.ru/public_html/`
3. **Удали** всё что там есть (обычно index.html заглушка от Beget)
4. **Загрузить** → выбери `ic-farvater-v2-deploy.zip`
5. После загрузки — **Распаковать** (правый клик → Распаковать)
6. Архив удалить

### Вариант B — Через Termius (SFTP)

1. Открой Termius → **Hosts** → **New Host**
2. Параметры:
   - **Label:** `Beget IC Farvater`
   - **Hostname:** `ic-farvater.ru` (если DNS привязался) **ИЛИ** IP сервера из панели Beget
   - **Port:** `22`
   - **Username:** из панели Beget → раздел **SSH** (обычно совпадает с login Beget, типа `nikitakozyr1`)
   - **Password:** твой Beget-пароль
3. **Save** → **Connect**
4. Когда подключилось — открой панель **SFTP** (значок справа или Cmd/Ctrl+Shift+E)
5. Слева — твой компьютер, справа — сервер
6. Справа перейди в `ic-farvater.ru/public_html/`
7. **Удали всё внутри** (обычно `index.html` от Beget)
8. Слева открой `D:\site-v2\dist\deploy\` (папку, не zip — она создаётся скриптом до архивирования)
9. **Выдели всё** (Ctrl+A) → перетащи правую панель
10. Дождись окончания upload (5-15 минут)

### Вариант C — Через git clone (если Beget даёт SSH)

Не у всех тарифов Beget есть SSH. Если есть:
1. Подключись через Termius (см. Вариант B шаги 1-3)
2. В терминале:
```bash
cd ~/ic-farvater.ru/
rm -rf public_html/*
git clone https://github.com/nikitakozyr51-wq/ic-farvater-v2.git public_html
cd public_html
# удалить dev файлы прямо на сервере
rm -rf .git .claude .agents .lazyweb .playwright-mcp .youtube-analyze scripts/*.py scripts/*.ps1 screenshots README.md DEPLOY.md HANDOFF.md CLAUDE.md docs
```

---

## Шаг 5 — Права доступа

Через File Manager в панели Beget или через Termius (SFTP):
- Папки → `755`
- Файлы → `644`
- `scripts/send.php` → `644` (НЕ `755` — не нужны exec права)
- `.htaccess` → `644`

Обычно Beget ставит правильно по умолчанию, но если форма не отправляется или сайт 500-ит — проверь права.

---

## Шаг 6 — Конфиг send.php

Открой `scripts/send.php` (через File Manager Beget или скачай SFTP) и проверь:

```php
define('TO_EMAIL',       'info@ic-farvater.ru');     // ← куда падают заявки
define('CC_EMAIL',       'sale@ic-farvater.ru');     // ← копия (можно пустую '' если не нужна)
define('FROM_EMAIL',     'noreply@ic-farvater.ru');  // ← должен совпадать с реальным mailbox на Beget
define('ALLOWED_ORIGIN', 'https://ic-farvater.ru');  // ← после установки SSL
```

Если хочешь убрать копию — поставь `CC_EMAIL` пустую строку.

---

## Шаг 7 — Yandex.Metrica

1. Открой https://metrika.yandex.ru/list
2. **Добавить счётчик**
3. Имя: `IC Фарватер`
4. Адрес сайта: `https://ic-farvater.ru`
5. Часовой пояс: GMT+3 (Москва)
6. Поставь галки:
   - Вебвизор
   - Карта скроллинга
   - Карта кликов
7. **Создать** → запиши **8-значный counter ID** (типа `99876543`)
8. Подтверди владение (Yandex сам проверит через `<meta name="yandex-verification">` или meta-tag метрики — выбери meta-tag)
9. В файлах сайта на Beget через File Manager **по очереди в 7 HTML файлах** найди:
```html
<meta name="yandex-counter" content="">
```
и впиши свой ID:
```html
<meta name="yandex-counter" content="99876543">
```

JS автоматически подгрузит снippет после accept в cookie banner.

**Файлы для правки** (все в корне или в `pages/`):
- `index.html`
- `pages/products.html`
- `pages/product-detail.html`
- `pages/about.html`
- `pages/contacts.html`
- `pages/privacy-policy.html`
- `pages/consent.html`

---

## Шаг 8 — Тест

### 8.1 Сайт открывается
- https://ic-farvater.ru/ — должна быть главная
- https://ic-farvater.ru/pages/products.html — каталог
- https://ic-farvater.ru/pages/contacts.html — контакты + форма + карта

### 8.2 SSL работает
В адресной строке — замок 🔒, протокол `https://`. Если выдаёт `Not Secure` — Let's Encrypt ещё не выпустился, подожди 10-15 минут.

### 8.3 Формы отправляются
1. Открой https://ic-farvater.ru/pages/contacts.html
2. Заполни форму: имя / email / телефон / сообщение
3. Поставь галку согласия (mobile)
4. Отправить

**Должно:** появиться "спасибо! мы свяжемся с вами в течение рабочего дня."
**В почте `info@ic-farvater.ru`** должно прийти письмо в течение 1-2 минут.

Аналогично — кнопка "запросить КП" в шапке → форма → отправить.

### 8.4 OG-превью в Telegram/VK
Скинь ссылку https://ic-farvater.ru/ в любой Telegram-чат — должна показаться картинка с brand-логотипом и текстом, не пустое превью.

### 8.5 favicon
Открой во вкладке — должна быть синяя иконка "ic" в табе браузера.

### 8.6 Yandex.Metrica
1. Открой https://metrika.yandex.ru/list
2. В твоём счётчике → **Сводка** → ждать 5-10 минут после первого визита на сайт
3. Если данных нет — на сайте открой консоль (F12) → должно быть `window.ym` объект. Если нет — проверь meta-tag на странице.

---

## Шаг 9 — После деплоя

Раскомментируй в `.htaccess` (через File Manager Beget):

```apache
# HTTP → HTTPS redirect (раскомментировать после SSL)
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} off
  RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>

# HSTS — включить ПОСЛЕ установки SSL
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
```

И опционально (если хочешь только без `www`):

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTP_HOST} ^www\.ic-farvater\.ru [NC]
  RewriteRule ^(.*)$ https://ic-farvater.ru/$1 [L,R=301]
</IfModule>
```

---

## Шаг 10 — Sitemap в Yandex.Webmaster и Google Search Console

После того как сайт работает:
1. https://webmaster.yandex.ru/ → добавь сайт `https://ic-farvater.ru/` → подтвердить владение → **Файлы Sitemap** → добавить `https://ic-farvater.ru/sitemap.xml`
2. https://search.google.com/search-console → то же самое

Через 1-2 дня Yandex начнёт индексировать страницы.

---

## Troubleshooting

| Проблема | Что проверить |
|---|---|
| Сайт не открывается, "сервер не отвечает" | DNS ещё не привязался → подожди 1-2ч и проверь через whatsmydns.net |
| Открывается заглушка Beget | Файлы не залились в `public_html/`, проверь File Manager |
| 500 Internal Server Error | Скорее всего `.htaccess` несовместим с версией Apache на Beget. Открой панель → Журналы → найди ошибку. Часто `php_value` директивы блокируются — переместить в `php.ini` через панель |
| Forms 403 Forbidden | `ALLOWED_ORIGIN` в `send.php` не совпадает с реальным URL (например `http` vs `https`) |
| Письма не приходят | Папка спам в почте проверена? `FROM_EMAIL` должен быть реальным mailbox на Beget. На некоторых тарифах Beget требует SMTP вместо `mail()` |
| OG-превью не отображается в Telegram | Telegram кэширует превью. Очисти кэш: напиши `@webpagebot https://ic-farvater.ru/` — он покажет обновлённый snapshot |
| Карта Yandex не загружается на contacts | CSP в `pages/contacts.html` блокирует. Проверь что `frame-src https://yandex.ru https://*.yandex.ru` есть |

---

## Контрольный чек-лист перед сдачей заказчику

- [ ] DNS привязан (whatsmydns зелёные)
- [ ] SSL установлен, HTTPS работает
- [ ] Сайт открывается на всех 7 страницах
- [ ] Форма КП → реальное письмо доходит
- [ ] Форма "Контакты" → реальное письмо доходит
- [ ] Yandex.Metrica counter ID вписан, видны посещения
- [ ] OG-превью красивое (Telegram-тест)
- [ ] favicon виден в табе
- [ ] Сайт быстро открывается (PageSpeed Insights, опционально)
- [ ] Sitemap добавлен в Yandex.Webmaster

---

## Если что-то не работает

Скинь мне:
1. Скрин ошибки (если есть)
2. URL страницы
3. Что делала / что ожидала

Поправлю.

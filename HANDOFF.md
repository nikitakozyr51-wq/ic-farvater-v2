# IC Фарватер v2 — Handoff Prompt

> Context for a fresh Claude Code session to continue work on the v2 redesign. Copy/paste the contents below into the new chat as the first message.

---

## Проект

**IC Фарватер** — сайт-каталог B2B дистрибьютора ЭКБ (Санкт-Петербург). Поставки разъёмов ЕТ-серии, микросхем, преобразователей, СВЧ-конденсаторов/транзисторов, печатных плат. Юзер Валентина — первый сайт, рус, лаконичный фидбэк.

**Что есть:**
- **v2** — `d:\site-v2\` — текущая активная версия, которую дорабатываем. **Локальный коммит, нет git remote.**
- **v1** — `d:\site\` — старая версия для логики reference. **Не редактировать.**

**Tech stack:** Чистый HTML + CSS + vanilla JS (ES6+). Без сборщиков. Inter из `assets/fonts/InterVariable.woff2`.

**Локальный сервер:**
```powershell
Start-Process python -ArgumentList '-m','http.server','5501','--directory','D:\site-v2','--bind','127.0.0.1'
```
URL: http://127.0.0.1:5501/

---

## Pencil — design source of truth

**Файл:** `D:\Загрузки\Downloads\ic farvater.pen` (зашифрован, читать ТОЛЬКО через `mcp__pencil__batch_get` / `mcp__pencil__get_screenshot`).

**ВАЖНО:** Pencil-файл — read-only в этой работе. Никаких `batch_design` (правки в Pencil). Если перед read-операцией нужен backup — `cp` сам файл (Pencil не имеет version history, 2026-05-23 терял всю мобильную v4 без восстановления).

### Ключевые Pencil frame IDs

**Desktop:**
- `Ns26c` — IC Farvater Main Page (home)
- `Q6E76` — About
- `F3WSA` — Products (default grid)
- `rN0pk` — Products (list view)
- `jugib` — Catalog grid (4-col cards)
- `qYQC0` — Series Detail (УДАЛЁН в v2, см. ниже)
- `W3oj8` — Variant Page (4-col related)
- `HJty4` — Contacts
- `zCPAQ` — entry-cards "обзор раздела" (6-cat overview cards)
- `UGNxO` — Footer Custo-style desktop
- 6 category landings: `fh0MA` microchips / `tUie5` razemy / `USmAk` converters / `njeyO` capacitors / `DA6LB` transistors / `Py4Cq` pcb

**Mobile:**
- `XqqmZ` — Главная / `MlENF` — Меню / `X3Cjv` — О компании
- `xEgU3` — Каталог grid / `nOHww` — Catalog cards mobile
- `mPQ4E` — Карточка товара / `IlduO` — Контакты
- `V4PTj` — Products page-top mobile
- `CyFMy` — Products list view mobile
- `C8EHBB` — Menu (open) mobile — **критично, переделан недавно**
- `YsYD7` — Footer mobile — **критично, переделан недавно**
- 6 mobile landings: `HPQvI/X61Pn/zyxIp/BqfNx/PtnRv/YpDYC`

---

## Структура проекта v2

```
d:\site-v2\
├── index.html              # Главная
├── pages/
│   ├── products.html       # Каталог
│   ├── product-detail.html # Универсальный: landing / variant / product
│   ├── about.html / contacts.html / privacy-policy.html / consent.html
├── css/
│   ├── reset.css / tokens.css / base.css / layout.css
│   ├── components.css      # Header / Hero / Footer / cards / forms
│   ├── inner-page.css      # Catalog + product-detail (~1900 lines)
│   └── animations.css      # Stub for now
├── js/
│   ├── main.js             # Все: header, mobile menu, catalog, product detail, KP drawer (~2000 lines)
│   ├── animations.js       # GSAP + Lenis (один-shot scroll animations)
│   ├── products.js         # PRODUCTS array (микросхемы + транзисторы)
│   ├── connectors-data.js  # CONNECTOR_SERIES (23 серии разъёмов)
│   ├── converters-data.js  # CONVERTER_SERIES (4 серии)
│   └── capacitors-data.js  # CAPACITOR_SERIES (3 серии)
└── assets/
    ├── fonts/InterVariable.woff2
    └── images/products/{connectors,items,…}/*.webp
```

---

## Маршруты URL

| Hash | Page | Что показывает |
|---|---|---|
| `/index.html` | главная | hero, разъёмы (01), о&nbsp;компании (02), свч-компоненты (03), услуги (04), CTA-блок |
| `/pages/products.html` | каталог | default cat-cards grid 6 категорий |
| `/pages/products.html#{cat}` | категория | разъёмы/преобразователи/конденсаторы → series cards; микросхемы/транзисторы → product cards; pcb → single landing-row |
| `/pages/products.html#{cat}/{slug}` | series view inline | сетка вариантов серии (NB не отдельная страница!) |
| `/pages/products.html#search` | global search | toolbar focus + поиск по всем категориям |
| `/pages/product-detail.html#cat-{slug}` | landing категории | 6 frames per Pencil v4 (microchips/razemy/converters/capacitors/transistors/pcb) |
| `/pages/product-detail.html#p-{id}` | single product | для микросхем/транзисторов по `PRODUCTS.id` |
| `/pages/product-detail.html#v-{seriesSlug}:{idx}` | variant page (W3oj8) | конкретный вариант в серии |
| `#s-c-* / #s-v-* / #s-k-*` | **УДАЛЕНО** | Series Detail intermediate page вырезан, старые ссылки → "товар не найден" empty state |

---

## Сделано (хронология)

### Фаза 1 — Каталог + landing pages (commits c1ec021…ee6b4fb)
- 4-col grid каталога per jugib desktop + 2-col mobile per nOHww
- 6 category landings (#cat-*) с Pencil v4 структурой
- Cyrillize product codes (ET1310PN1U → ЕТ1310РН1У)
- Search morphology + global empty-state fallback
- Filter groups collapsible

### Фаза 2 — Product Detail polish (commits 8fd0dc9, 0873fab, f91a973)
- Bullets "что мы поставляем" перенесён внутрь `.pd-info` (между description и actions)
- Series detail 580×480 image fix
- 4 параллельных аудита (landings/series/variant/UX) → punch list:
  - H1 counter (NN) per variant index
  - Search index includes partnumbers + displaySub
  - Invalid hash → "товар не найден" empty state
  - CTA data-kp-product wired
  - Mobile burger menu surface КП + search
  - Breadcrumb `·` → `/`
  - Specs row 42px (was 48)
  - Subtitle line-height 1.55

### Фаза 3 — Catalog UX rework (commits 3699470, 8e6a454, 9434e00)
- **Series Detail page УДАЛЁН.** Клик на серию → in-page subhash `#razemy/et-2rmg`, сетка вариантов обновляется в каталоге.
- Series view header: убран "← разъёмы" back-link, показывает "ЕТ-2РМГ(Д) — 30 вариантов" subheader.
- Type filter (вилка/розетка/заглушка/кожух) в sidebar — появляется при `#razemy/#converters/#capacitors` + при заходе в серию.
- normalizeType() — bucket'ит 17 грязных типов в 4 чистых (вилка/розетка/заглушка/кожух).

### Фаза 4 — List view per Pencil rN0pk (commit 263e25e)
- Row 75h: name 300w + desc fills + → arrow (desktop), name+desc stacked (mobile per CyFMy)
- No image в строках, entry-card скрыт в list mode

### Фаза 5 — Short descriptions (commit ff02523)
- `SERIES_SHORT_DESC` map (30 записей) — компактные SEO-формулировки вместо first-sentence-of-description
- Example: "блочные герметичные вилки и розетки, до 200 °с" (ET-2RMG)

### Фаза 6 — Mobile fixes (commits 98f8e17, 9fe42c9, 70489b7, 74f1fca, 129dee9)
- View-toggle (•) сетка/(•) список → `<button data-view>` вместо `<a>` (раньше 404'ило)
- **Mobile menu полностью переделан per Pencil C8EHBB** — `.mobile-menu` overlay, position:fixed z-index:110 (фиксит scroll bug со sticky header peeking through):
  - logo + X close header (60h)
  - search-item at top
  - 5 nav items (главная / продукция / о компании / услуги / контакты) 28/500/-1
  - CTA "запросить КП →" 52h pill
  - Contact block (4 fields)
- **Mobile footer per Pencil YsYD7**: eyebrow labels "каталог" / "компания", email placeholder "email@example.com", correct color tokens (40% white для eyebrow, 60% для copyright)
- PCB empty state: больше не большая коробка, а обычная cat-card row
- Related cats: 3 → 4 cards per Pencil W3oj8 4-col grid

---

## Что осталось

### 1. Анимации (animations.js)
**Текущее состояние:** есть `animations.js` с Lenis smooth scroll + GSAP ScrollTrigger setup, но реальных анимаций НЕТ — только setup boilerplate.

**Что нужно (мнение):**
- Hero entry: title staircase reveal на load (per quadrantcapital.io feel)
- Section transitions: section-eyebrow + h2 fade-up на scroll
- Card hover: subtle scale/shift на cat-card / pd-card
- Footer reveal: snap-to-position на scroll-end
- Page transitions (опционально): fade overlay
- Mobile menu: slide-down или fade-in вместо instant
- Lenis duration / easing tuning

**Reference:** Swiss + редакционный минимализм (см. CLAUDE.md). НЕ перебарщивать — Pencil не имеет motion-spec, нужна сдержанность.

**Где код:** `d:\site-v2\js\animations.js`. Уже подключён в HTML.

### 2. Deploy на v2 production
**Сейчас:** v2 — только локальный коммит (`git status` показывает master, нет remote).

**Опции:**
- A. GitHub Pages — создать новый repo `ic-farvater-v2` или ветку v2 в существующем
- B. Заменить content в текущем `nikitakozyr51-wq/ic-farvater` — но это assertion. Memory `deploy_master_branch.md` говорит "GitHub Pages деплоит из master, пушить main:master". Нужно проверить какой repo.
- C. VPS / другой хостинг

**Спросить юзера:** какой target deploy?

**Что нужно перед deploy:**
- Минимизация / fingerprinting (опционально) — сейчас cache-bust query strings (`?v=N`) работают
- Open Graph meta-tags / favicon set
- robots.txt + sitemap.xml
- Privacy policy / consent доделать (страницы есть, контент проверить)
- Test 404 / form submissions (KP drawer → `/scripts/send.php` — на dev не работает)
- Smoke test all 6 landings + variant pages + mobile menu
- Lighthouse audit

### 3. Мелочи (не критично)
- Mobile menu: scroll bug (sticky header peek) уже исправлен через z-index 110. Но user reported earlier что "при прокрутке появляется меню" — нужно повторно проверить на реальном телефоне после deploy.
- Search results page (`/products.html#search`) — focus на input работает, но empty-state UX можно улучшить
- KP drawer — wire data-kp-product атрибуты на ВСЕ CTA на сайте (не только product-detail)
- About page — Pencil Q6E76 нужно verify pixel-perfect
- Cookie banner — есть, но не интегрирован с реальным consent logic

---

## Workflow rules (из memory)

1. **Pencil first, HTML/CSS после.** Если нет Pencil спеки — спросить юзера перед кодом.
2. **НЕ выдумывать данные** (years/SKU/specs). Только то, что в CLAUDE.md фактах или в data files.
3. **NBSP после 1-/2-/3-letter prep/conj в КАЖДОМ тексте.** Антивисячие предлоги обязательны.
4. **Cache-bust `?v=N` на CSS/JS** при каждом изменении (например `inner-page.css?v=48`). Браузер кэширует жёстко.
5. **Backup `.pen` файла** `cp` перед любой read-операцией (страховка).
6. **container-max = 1320px** (не 1440 — это canvas). Iм. `var(--container-max)` в CSS.
7. **`object-fit: cover` РАЗРЕШЁН** для секционных/декоративных фото. `contain` только для каталога/product image.
8. **Сначала desktop, потом mobile.** Mobile-first CSS в `components.css` (с base = mobile), inner-page.css desktop в `@media (min-width: 1024px)`.
9. **Авто-коммит после правок кода** (но НЕ после Pencil — только локально).
10. **Лаконично, на русском.** Юзер — Валентина, базовый уровень. Не объяснять очевидное.

---

## Гача (gotchas)

- **CONNECTOR_SERIES.items[].type** — грязная data: "роозетка" (опечатка), "вилка блочна", "заглушка для снц144". Используй `normalizeType()` из main.js для group/filter logic.
- **ET-2RMG `imageByType`** должен быть `{}` (нет файлов `et-2rmg-vilka.webp`). Не используй ET-2RMT-файлы для ET-2RMG.
- **PCB не имеет товаров** — в `getItems('pcb')` возвращается `[]`. UI рендерит single fallback row на products.html.
- **Series Detail (#s-c-/#s-v-/#s-k-) маршрут УДАЛЁН.** Не возвращать. Старые ссылки → empty state.
- **CSS hardcode px banned.** Use `var(--s-*)` / `var(--t-*)` / `var(--c-*)` tokens. Token file: `css/tokens.css`.
- **Mobile menu — separate overlay**, не `.header__nav`. Element `.mobile-menu` создаётся через JS в `initMobileMenu()`, appendChild to body. z-index 110.
- **Pencil text often has explicit `\n`** в `content` — НЕ "natural wrap". Например entry-cards в zCPAQ — "о&nbsp;конденсаторах\nARC70" значит `<br>` нужен.
- **Pencil API** не имеет height/width для text без `textGrowth: "fixed-width"`. Если frame name = "label-col" с layout vertical — высота auto.
- **Phantom `+50` в snapshot_layout** — Pencil bug, при сравнении игнорировать.

---

## Полезные ссылки

- **CLAUDE.md** — design system spec (tokens, typography, spacing rules)
- **docs/design-research/IC-V4-DESIGN-SYSTEM.md** — формальная спека
- **docs/design-research/00-INDEX.md** — index всех research docs
- **Memory:** `C:\Users\nikko\.claude\projects\d--site\memory\MEMORY.md` — auto-loaded, читай если непонятно

---

## Recent commits (последние 15)

```
129dee9 landing related: bump "другие категории" from 3 → 4 cards
74f1fca catalog: PCB empty state renders as regular cat-card row
70489b7 mobile footer: match Pencil YsYD7
9fe42c9 mobile menu: rebuild as Pencil C8EHBB overlay
98f8e17 catalog mobile: fix broken view-toggle
ff02523 catalog: SEO-optimized short series descriptions
a57b303 catalog list view: fix desc overflow, render 6-cat rows at #all
263e25e catalog: list view per Pencil rN0pk + fix ET-2RMG stale image data
9434e00 catalog: type filter active at category level + normalize
8e6a454 catalog: series-view UX rework
3699470 catalog: series view inline (no intermediate Series Detail page)
9dcc9d8 catalog: stable 120px gap before footer
fcfb385 catalog: entry card CTA — flex space-between
f91a973 product-detail: 4-audit punch list pixel-perfect
0873fab product-detail: series specs hidden + 580x480 image
```

---

## Открытые вопросы для юзера в следующем чате

1. **Анимации:** какой vibe? Сдержанные scroll-triggered fade-ups, или что-то с moving images / parallax? Какие референсы (besides quadrantcapital)?
2. **Deploy target:** GitHub Pages новый repo? Замена существующего nikitakozyr51-wq/ic-farvater? Другой хостинг?
3. **KP drawer backend:** `/scripts/send.php` — настроен ли на проде? Или нужен другой бэкенд (mailto / Telegram bot / Bitrix24 etc.)?
4. **Аналитика:** Yandex.Metrica? GA4? VK pixel?
5. **Cookie banner** — что конкретно logging-ить + consent flow?

---

## Начало работы в новом чате

1. `cd d:/site-v2 && git status && git log --oneline -10`
2. Прочитать CLAUDE.md + этот HANDOFF.md
3. Запустить локальный сервер
4. Спросить юзера: "Что делаем — анимации, deploy, или что-то ещё?"
5. После согласования — конкретный план с ID Pencil frames (если применимо)

Удачи следующему чату 🤝

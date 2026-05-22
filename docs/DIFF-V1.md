# DIFF-V1 — намеренные отличия v2 от v1

Лог отличий v2 от текущего v1-сайта. Каждое отличие — намеренное design decision (из v4 Pencil), не баг.

## Архитектура

| Что | v1 | v2 | Почему |
|-----|----|----|--------|
| Container max-width | 1920px | **1440px** | На 1920 v1 растягивается без полей (root cause «странного растяжения»). v4 проектный брейкпоинт 1440 |
| Mobile CSS | Отдельный `mobile.css` через `media="(max-width: 768px)"` (нет tablet-слоя 769-1023) | **Mobile-first внутри компонентов**, нет `mobile.css` файла | Между 769-1023 был «мёртвый зоной» с десктопными стилями |
| Hero height | `height: 780px` (фиксированный) | **`min-height: clamp(480px, 50vh, 720px)`** | Фикс. высота ломала пропорции на планшете |
| Spacing | Хардкод-px (14px, 28px, 6px, 280px) | Только через `var(--s-*)` токены | 12+ нарушений 8px-сетки в v1 |
| Typography | Жёсткие `font-size: 72px` с @media-переключением | `clamp()` для fluid type | Размеры «скачут» между брейкпоинтами |
| Accent цвет | Несколько вариантов (orange/blue/мixed) | Один `#112F6E` | Согласно errors_log #1 |

## Image mapping ⚠ TODO — подтвердить с Валентиной

Pencil image-paths ссылаются на файлы рядом с `.pen` файлом (префикс `fv-`), которые недоступны напрямую через MCP. Использовал closest-name match из `d:\site\assets\images\`. Валентине проверить:

| Pencil path | Использовано в v2 | OK? |
|-------------|-------------------|-----|
| `fv-9CN77.webp` (hero) | `assets/images/9CN77.webp` | ✅ same |
| `fv-et-snc23.webp` (разъёмы card1) | `assets/images/products/items/ET_SNC23%201.webp` | ⚠ closest match, проверить |
| `fv-FQD8W.webp` (разъёмы card2) | `assets/images/products/connectors/et-2rmg.webp` | ⚠ closest match, проверить |
| `fv-et-2rmt.webp` (разъёмы card3) | `assets/images/products/connectors/et-2rmt.webp` | ✅ same |
| `ET_2RMG_D_.png` (разъёмы card4) | `assets/images/products/items/ET_2RMG_D_.webp` | ✅ same (webp not png) |
| `fv-uGwvR.webp` (кабельные) | TBD | TBD |
| `o-kompanii.webp` (о компании desktop) | `assets/images/o-kompanii.webp` | ✅ same |
| `about-anim.webp` (о компании mobile, disabled) | `assets/images/about-anim.webp` (placeholder grey if disabled) | TBD |
| `podbor-analogov-desktop.webp` | `assets/images/podbor-analogov-desktop.webp` | ✅ same |
| `tehnicheskaya-ekspertiza-desktop.webp` | TBD | TBD |
| `ispytaniya-gost-desktop.webp` | `assets/images/ispytaniya-gost-desktop.webp` | ✅ same |

## Главная — секции

| Секция | v1 | v2 | Изменение |
|--------|----|----|-----------|
| Header | uppercase "IC FARVATER" logo, nav order: Каталог/О компании/Услуги/Контакты | lowercase "ic farvater", nav order: каталог/услуги/о компании/контакты | v4 Pencil — full lowercase + reordered nav |
| Hero h1 | desktop+mobile = "ПОСТАВКИ ЭКБ ПО ВСЕЙ РОССИИ" (один текст) | desktop "поставки электронных компонентов / по всей россии", mobile "поставки экб / по всей / россии" | v4 mobile сокращает контент намеренно |
| Hero CTA | "ПОДОБРАТЬ КОМПОНЕНТЫ" uppercase | "подобрать компоненты" lowercase | v4 lowercase воcity |
| Разъёмы | uppercase title, hard 4-col grid via @media | lowercase "разъёмы (01)", 2-col mobile / 4-col desktop, border-bottom только desktop | v4 design system |

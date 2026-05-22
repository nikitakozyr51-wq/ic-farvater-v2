# GRID-RULES — pre-commit checklist для v2

Прохожу глазами **перед каждым `git commit`** секции. Если хоть один ❌ — фиксую, не коммичу.

## Token discipline

- [ ] `padding/margin/gap` — только через `var(--s-*)` или `clamp()` из tokens.css
- [ ] `font-size` — только `var(--t-*)`, никаких хардкод-px
- [ ] `color` / `background` — только `var(--c-*)`
- [ ] `letter-spacing` — только `var(--ls-*)`
- [ ] `line-height` — только `var(--lh-*)` или дробное значение из Pencil
- [ ] Container padding — только через `.container` класс, не дублировать в секциях
- [ ] Section vertical padding — только через `.section` класс (`--section-y`)

## Pencil pixel-perfect

- [ ] Контент 1:1 как в Pencil-фрейме (символ в символ, перенос в перенос)
- [ ] Mobile и desktop версии в макете отличаются? — отразить в коде, **не унифицировать**
- [ ] Disabled элементы в Pencil — в коде НЕ включены
- [ ] `\n` в Pencil text → `<br>` в HTML, не объединять в один абзац

## Layout discipline

- [ ] Hero — `min-height: clamp(...)`, никогда `height: 780px`
- [ ] Grid — `auto-fit minmax(...)` ИЛИ явные media с 2/3/4 колонками
- [ ] Нет `overflow-x: hidden` (кроме `<html>` крайней мерой с TODO)
- [ ] Нет `mobile.css` отдельным файлом — всё в компонентах через `@media (min-width: 768px)`
- [ ] List rows / accordion items — `height: var(--row-height)` + `align-items: center` + `padding: 0`
- [ ] Badge ≥ `var(--badge-min)` (36×36)

## Single accent

- [ ] Единственный accent цвет — `var(--c-text)` (`#112F6E`)
- [ ] Никаких orange/brown/coral/прочих accent'ов из других рефов

## Responsive

- [ ] На 1920 — контент центрирован в 1440 (нет растяжения)
- [ ] На 1280 / 1024 — нет горизонтального скролла
- [ ] На 768 / 390 — нет уезжающих элементов
- [ ] Mobile breakpoint = 768 (mobile-first), Pencil mobile = 390px base

## Text discipline

- [ ] NBSP проставлены через `applyNbsp(document.body)` в `js/nbsp.js`
- [ ] Sub-text копирован дословно из Pencil

## JS hooks (нельзя ломать)

- [ ] `data-animate` атрибуты сохранены на тех же узлах: `fade-up` / `fade-up-stagger` / `split` / `scale-reveal` / `line-draw`
- [ ] Класс `.section-header` сохранён (animations.js использует)
- [ ] Селекторы меню/поиска в `main.js` не сломаны

## Pencil API gotchas (если читаю/правлю Pencil)

- [ ] `alignItems` — только `start / center / end`, НЕ `baseline` (fail 4 раза подряд)
- [ ] `stroke` — `{color:"#..."}`, без width/weight
- [ ] `width` на text не wrap — manual `\n` в content
- [ ] `justifyContent:"center"` И `padding` — не вместе
- [ ] "Partially clipped" warning в snapshot_layout — verify через batch_get (часто phantom +50 false positive)
- [ ] Пустой screenshot одиночного frame'а — screenshot родителя

## Verification

- [ ] Screenshot на 6 ширинах (390/768/1024/1280/1440/1920) сделан
- [ ] Side-by-side с Pencil desktop frame на 1440 проверен
- [ ] Side-by-side с Pencil mobile frame на 390 проверен
- [ ] DIFF-V1.md обновлён осознанными отличиями от v1 (если есть)

# Strapi для IC Фарватер — план этапа 2

> Цель: дать заказчику админку чтобы редактировать каталог + страницы без правки кода. Текущий static сайт продолжает работать как есть.

---

## Архитектура

```
[Заказчик]
   │ редактирует через веб-админку
   ▼
[Strapi CMS — backend на cms.ic-farvater.ru]
   │ при Publish — отправляет webhook
   ▼
[Build скрипт]
   │ скачивает данные из Strapi API
   │ генерирует js/connectors-data.js, products.js etc.
   │ коммитит в git
   ▼
[GitHub webhook → Dokploy]
   │ автоматически пересобирает фронт
   ▼
[ic-farvater.ru — обновлённый static сайт]
```

**Преимущества подхода:**
- Сайт остаётся быстрым (static HTML, нет API запросов в браузере)
- Если Strapi упадёт — сайт продолжает работать
- SEO отличный (весь контент в HTML при первой загрузке)
- Заказчик редактирует через привычный UI

**Недостаток:**
- Изменения не мгновенные (rebuild ~1-2 мин)
- Build скрипт нужно поддерживать

---

## Content Types в Strapi

Структура повторяет наши JS data-файлы.

### 1. `Category` (категория продукции)
- `slug` (uid, unique): `microchips` / `razemy` / `converters` / `capacitors` / `transistors` / `pcb`
- `nameRu` (string): «Разъёмы», «Микросхемы»
- `description` (richtext): описание категории для landing
- `image` (media): изображение для cat-card
- `bullets` (component[], repeatable): bullet-список «что мы поставляем»
- `nomenclature` (component[], repeatable, ровно 9 строк): label + value для спек-таблицы
- `seoTitle` (string)
- `seoDescription` (text)
- `order` (integer): порядок в каталоге

### 2. `ConnectorSeries` (серия разъёмов, для категории «разъёмы»)
- `slug` (uid): `et-2rmg` / `et-snc23` etc
- `name` (string): «ЕТ-2РМГ»
- `shortDesc` (string): «герметичные · до +200°с»
- `description` (richtext)
- `image` (media)
- `specs` (component[]): label + value
- `items` (relation hasMany → ConnectorItem)
- `category` (relation → Category, по умолчанию `razemy`)

### 3. `ConnectorItem` (конкретное исполнение в серии)
- `name` (string): «ЕТ-2РМГ-22Б4Г1В»
- `type` (enum): вилка / розетка / заглушка / кожух
- `image` (media, optional — fallback на serie image)
- `specs` (component[])

### 4. `ConverterSeries` (преобразователи)
То же что ConnectorSeries но для категории `converters`. Items с дополнительными полями (входное/выходное напряжение, мощность).

### 5. `CapacitorSeries` (СВЧ-конденсаторы)
То же.

### 6. `Product` (одиночный товар без серии — для микросхем/транзисторов)
- `id` (string): `ET1310PN1U`
- `nameDisplay` (string, кириллица): «ЕТ1310РН1У»
- `category` (relation → Category): microchips / transistors
- `description` (richtext)
- `specs` (component[])
- `image` (media)
- `applications` (component[]): где применяется

### 7. `Page` (статические страницы — about, FAQ, политика)
- `slug` (uid): `about` / `faq` / `privacy-policy` / `consent`
- `title` (string)
- `sections` (dynamic zone): можно добавлять секции разных типов
- `seoTitle`, `seoDescription`

### Reusable components

- `Spec`: `label: string` + `value: string`
- `Bullet`: `text: string` (или вложенный rich)
- `NomenclatureRow`: `label: string` + `value: string`

---

## Миграция данных

Один раз при старте:

```bash
# scripts/migrate_to_strapi.py (написать)
# Читает js/connectors-data.js, парсит JS экспорты
# POST'ит в Strapi REST API (с admin token)
# Загружает images через /upload endpoint
```

Альтернатива — вручную через UI Strapi (для 30 connector series + 4 converter + 3 capacitor + ~150 items — ~3-4 часа кликания).

---

## Webhook + Build скрипт

В Strapi → Settings → Webhooks → создать:
- Name: `Frontend rebuild`
- URL: `https://dokploy.ic-farvater.ru/api/deploy/...` (триггер Dokploy)
- Events: `entry.publish`, `entry.unpublish`, `entry.update`

Build flow:
1. Webhook вызывает Dokploy app `build-job`
2. App запускает Docker контейнер с скриптом
3. Скрипт: `node build/generate-data.js`
   - Fetch GET `cms.ic-farvater.ru/api/categories?populate=*` → пишет `js/categories-data.js`
   - Fetch GET `/api/connector-series?populate=*` → пишет `js/connectors-data.js`
   - и т.д.
4. Скрипт `git commit -am 'data: sync from Strapi' && git push`
5. GitHub webhook → Dokploy `frontend` app → rebuild

Альтернатива — frontend читает JSON напрямую при build, без записи в git. Но git-flow проще отслеживать.

---

## Deploy Strapi в Dokploy

В существующем Dokploy-проекте `IC Farvater`:

### Сервис `postgres`
1. **Create Service** → Database → Postgres
2. Name: `cms-db`
3. Username: `strapi`
4. Password: сгенерировать сложный
5. Database name: `strapi`
6. **Save**

### Сервис `backend` (Strapi)
1. **Create Application** → Docker
2. Name: `backend`
3. Source: Git → отдельный repo `ic-farvater-cms` (создадим)
4. Build: Dockerfile (стандартный для Strapi v5)
5. Env variables:
   ```
   DATABASE_CLIENT=postgres
   DATABASE_HOST=cms-db
   DATABASE_PORT=5432
   DATABASE_NAME=strapi
   DATABASE_USERNAME=strapi
   DATABASE_PASSWORD=<из postgres сервиса>
   APP_KEYS=<сгенерируется в node>
   API_TOKEN_SALT=<random 32 chars>
   ADMIN_JWT_SECRET=<random 32 chars>
   JWT_SECRET=<random 32 chars>
   ```
6. Volume: `/opt/app/public/uploads` → постоянный (для загруженных картинок товаров)
7. Domain: `cms.ic-farvater.ru` (subdomain) + Let's Encrypt SSL
8. **Deploy**

---

## Авторизация

Strapi v5 имеет встроенную admin-панель с email/password. После первого запуска:
1. Открыть `https://cms.ic-farvater.ru/admin`
2. Создать суперюзера (твой email + пароль)
3. Создать аккаунт для заказчика (его email + пароль)
4. Дать заказчику роль Editor (может редактировать но не менять структуру)

---

## Шаги реализации

### Phase 2.1 — Подготовка (2-3 часа)
- [ ] Создать новый GitHub repo `ic-farvater-cms`
- [ ] Локально: `npx create-strapi-app@latest cms --quickstart` → определить content types
- [ ] Создать components (Spec, Bullet, NomenclatureRow)
- [ ] Создать content types (Category → ConnectorSeries → ConnectorItem etc)
- [ ] Локальный тест: добавить пару записей через admin UI

### Phase 2.2 — Deploy Strapi (1-2 часа)
- [ ] В Dokploy: postgres сервис + backend application
- [ ] DNS: A-запись для `cms.ic-farvater.ru` → IP VPS
- [ ] Создать ящик заказчика в Strapi

### Phase 2.3 — Миграция данных (3-4 часа)
- [ ] Скрипт `scripts/migrate_to_strapi.py` — парсит JS data-файлы → POST в Strapi
- [ ] Или вручную через UI (для 30 серий + ~150 items)
- [ ] Загрузить картинки товаров

### Phase 2.4 — Build flow (2-3 часа)
- [ ] Скрипт `scripts/generate-data.js` (Node) — fetch из Strapi API → пишет JS data файлы
- [ ] Dokploy job application для запуска build на webhook
- [ ] Strapi webhook → Dokploy job URL
- [ ] Тест: правка в Strapi → жду 2 мин → проверяю сайт

### Phase 2.5 — Доводка
- [ ] Роли (Admin = я, Editor = заказчик)
- [ ] Бэкап postgres ежедневный
- [ ] Документация для заказчика как редактировать товары

**Итого:** 1-2 рабочих дня на полный Strapi-этап. Без спешки — после того как заказчик одобрит V2.

---

## Альтернатива — Sanity / Directus / Decap

Если Strapi окажется слишком сложным для деплоя — можно рассмотреть:

| CMS | Плюсы | Минусы |
|-----|-------|--------|
| **Strapi** | Гибкий, REST + GraphQL, бесплатный self-hosted, большое community | Требует Node.js + Postgres, обновления могут ломать |
| **Directus** | Похож на Strapi, UI красивее, бесплатный self-hosted | Меньше community, документация хуже |
| **Sanity** | Облачный (не надо self-host), мгновенный preview | Бесплатный план ограничен, в РФ могут быть проблемы с оплатой |
| **Decap (бывш. Netlify CMS)** | Бесплатный, редактирует прямо в git, не нужен сервер для CMS | UI попроще, медленнее на больших каталогах |

Для нашего случая (B2B каталог + 1 редактор + need self-hosted в РФ) — **Strapi** оптимальный выбор.

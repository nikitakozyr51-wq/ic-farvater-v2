# Deploy IC Фарватер v2 на Beget VPS через Dokploy

Полный путь: VPS чистая Ubuntu → Dokploy → сайт работает на `https://ic-farvater.ru`.

---

## Архитектура

```
[Твой компьютер]
   │ git push
   ▼
[GitHub: ic-farvater-v2]
   │ webhook
   ▼
[Beget VPS — Ubuntu]
   ├── Dokploy (панель управления, port 3000)
   │     │ читает Dockerfile + билдит image
   │     ▼
   ├── Docker контейнер: nginx/Traefik (входящий трафик :80/:443)
   │     │ проксирует
   │     ▼
   └── Docker контейнер: php:apache + наш сайт
         └── ic-farvater.ru → ваш сайт
```

**Логика:** ты пишешь код локально → `git push` → Dokploy автоматически пересобирает Docker-образ → деплоит → сайт обновлён через 1-2 минуты. Без SFTP, без ручных загрузок.

---

## Шаг 1 — Подключение к VPS (один раз через Termius)

В панели Beget найди:
- **IP-адрес сервера** (например `87.236.16.123`)
- **root пароль** (приходит на email при покупке VPS)

В Termius:
1. **New Host**
2. **Hostname:** IP сервера
3. **Port:** 22
4. **Username:** `root`
5. **Password:** root пароль с почты Beget
6. **Save** → **Connect**

Когда увидишь `root@...$ ` — ты на сервере.

---

## Шаг 2 — Базовая защита VPS (15 минут)

В SSH-сессии Termius выполни по порядку:

```bash
# 1. Обновить пакеты
apt update && apt upgrade -y

# 2. Установить базовые утилиты
apt install -y curl wget ufw fail2ban htop nano git

# 3. Создать обычного пользователя (вместо работы под root)
adduser nikita
# Введёшь пароль 2 раза, остальное Enter

# 4. Дать ему sudo права
usermod -aG sudo nikita

# 5. Настроить firewall (открыть только нужные порты)
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp   # Dokploy web UI (потом закроем, оставим только VPN)
ufw --force enable

# 6. Проверить статус
ufw status
# Должны быть OPEN: 22 (SSH), 80, 443, 3000
```

Пока на этом достаточно. Усилить безопасность (SSH key-only login, отключение root-логина) можно позже.

---

## Шаг 3 — Установка Dokploy (одна команда)

В той же SSH-сессии:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Скрипт сам поставит Docker, Docker Compose, Traefik, Postgres (для базы Dokploy) и запустит панель.

Когда увидишь сообщение `Dokploy is ready at http://YOUR_IP:3000` — открой в браузере:

```
http://87.236.16.123:3000
```
(подставь свой IP)

Создай **первый admin аккаунт** — это твой логин в Dokploy. Email + пароль. Запиши пароль.

---

## Шаг 4 — Создать проект в Dokploy

В веб-панели Dokploy:

1. **Projects** → **Create Project**
2. Name: `IC Farvater`
3. Description: `B2B каталог ЭКБ`
4. **Create**

Внутри проекта:
1. **Create Application** → выбери **Docker**
2. Name: `frontend`
3. **Source** → **Github**
   - Если не подключён GitHub аккаунт → **Connect Github** → авторизуй
   - Repository: `nikitakozyr51-wq/ic-farvater-v2`
   - Branch: `master`
   - Build path: `/` (корень репо)
4. **Build Type:** Dockerfile (определится автоматически из нашего `Dockerfile`)
5. **Save**

---

## Шаг 5 — Привязать домен

В application `frontend`:

1. Раздел **Domains** → **Add Domain**
2. Host: `ic-farvater.ru`
3. Path: `/`
4. Port: `80` (внутренний порт контейнера)
5. **HTTPS:** включить
6. **Certificate Provider:** Let's Encrypt
7. **Save**

Dokploy автоматически:
- Настроит Traefik (reverse proxy)
- Выпустит SSL-сертификат
- Перенаправит HTTP → HTTPS

Добавь ещё одну запись для `www.ic-farvater.ru` тоже (так же), иначе люди вводящие `www.` получат ошибку.

---

## Шаг 6 — Первый деплой

В application `frontend`:

1. **Deploy** (большая синяя кнопка)
2. Логи появятся в реальном времени:
   - `Cloning repository...`
   - `Building Docker image...` (5-10 мин в первый раз)
   - `Starting container...`
   - `Healthcheck passing ✓`
3. Когда увидишь зелёный статус **Running** — открой `https://ic-farvater.ru/`

---

## Шаг 7 — Автодеплой при `git push`

В application `frontend`:

1. Раздел **Auto Deploy** → включить
2. Dokploy создаст webhook URL — скопируй его
3. На GitHub в repo:
   - Settings → Webhooks → Add webhook
   - Payload URL: вставь URL из Dokploy
   - Content type: `application/json`
   - Secret: оставь пустым (Dokploy сам подпишет)
   - Events: только `push`
   - **Add webhook**

Теперь любой `git push origin master` → автоматический rebuild + redeploy.

---

## Шаг 8 — Конфигурация send.php

`send.php` использует встроенный PHP `mail()`. На VPS он не работает по умолчанию — нет MTA (Mail Transfer Agent) внутри Docker.

**Вариант A — Внешний SMTP через Beget почту (рекомендую):**

Создай в панели Beget почтовый ящик `noreply@ic-farvater.ru` (запиши пароль).

Я перепишу `scripts/send.php` чтобы использовал SMTP через PHPMailer вместо `mail()`. Скажи когда дойдём — добавлю.

**Вариант B — postfix внутри контейнера:**

Сложнее, не рекомендую — мейлы часто попадают в спам.

**Вариант C — Telegram-бот:**

Заявки приходят в Telegram-чат вместо email. Часто удобнее для B2B (видно мгновенно).

---

## Шаг 9 — Тесты

- [ ] https://ic-farvater.ru/ открывается, замок 🔒
- [ ] https://www.ic-farvater.ru/ → редирект на без www
- [ ] OG-превью красивое (тест в Telegram)
- [ ] Формы отправляются (после Шага 8)
- [ ] Yandex.Metrica counter подключён (см. DEPLOY.md → Шаг 7)
- [ ] Скорость загрузки https://pagespeed.web.dev/ — желательно 90+

---

## Шаг 10 — Закрыть порт 3000 (Dokploy веб-панель)

Сейчас панель Dokploy доступна всему миру по `http://your-ip:3000`. Для безопасности — закрой:

```bash
ufw delete allow 3000/tcp
ufw reload
```

Доступ к Dokploy теперь только через SSH-туннель:

```bash
# На своём компьютере
ssh -L 3000:localhost:3000 root@87.236.16.123
# Затем в браузере: http://localhost:3000
```

Альтернатива — настроить отдельный домен с авторизацией: `dokploy.ic-farvater.ru` → но это больше работы.

---

## Шаг 11 — Бэкапы

В Dokploy → проект → **Backups**:
- Включить автобэкап GitHub-репо: не нужен, всё уже в git
- Если поставишь Strapi (этап 2) — настроишь бэкап Postgres-БД сюда (ежедневный)

---

## Полезные команды на VPS

```bash
# Состояние контейнеров
docker ps

# Логи фронтенда
docker logs ic-farvater-frontend --tail 100 -f

# Перезапустить контейнер вручную
docker restart ic-farvater-frontend

# Дисковое пространство
df -h
docker system df

# Очистить старые Docker images (после многих deploy)
docker system prune -a

# Проверить SSL сертификат
docker exec -it $(docker ps -qf name=dokploy-traefik) cat /letsencrypt/acme.json | head
```

---

## Troubleshooting

| Проблема | Что проверить |
|---|---|
| `https://ic-farvater.ru` не открывается | DNS привязка (whatsmydns.net), firewall `ufw status`, контейнер `docker ps` |
| SSL ошибка (Not Secure / NET::ERR_CERT) | Let's Encrypt не выпустился. Подожди 5-10 мин, проверь логи Traefik в Dokploy |
| Сайт открывается на IP, но не на домене | DNS не привязался, или Domain в Dokploy не привязан к app |
| 502 Bad Gateway | Контейнер `frontend` упал — проверь логи в Dokploy |
| Изменения после `git push` не применяются | Webhook не настроен. Шаг 7 |
| Build падает на `COPY` | `.dockerignore` исключил нужный файл — проверь |
| Forms 500 Internal | send.php требует MTA — Шаг 8 (SMTP setup) |

---

## Что дальше (этап 2 — Strapi)

См. `STRAPI-ROADMAP.md` — план миграции каталога в Strapi.

Кратко:
1. Создать ещё одно Application в том же Dokploy-проекте (`backend`)
2. Image: `strapi/strapi:latest` (или собственный Dockerfile)
3. Database: добавить Postgres сервис в Dokploy
4. Domain: `cms.ic-farvater.ru` (или `admin.ic-farvater.ru`)
5. Создать content types (Categories, Series, Items, Specs)
6. Импортировать данные из `js/*-data.js` → Strapi
7. Webhook Strapi → скрипт rebuild → frontend redeploy

---

## Контрольный чек-лист

- [ ] VPS защищён (firewall + non-root user)
- [ ] Dokploy установлен и работает
- [ ] GitHub repo подключён, autoDeploy включён
- [ ] Domain + SSL настроены
- [ ] Сайт открывается, формы работают
- [ ] Yandex.Metrica подключена
- [ ] Порт 3000 закрыт от внешнего мира
- [ ] Бэкап-стратегия определена

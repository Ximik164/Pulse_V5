# Деплой Pulse на Render.com

Пошаговая инструкция, чтобы мессенджер открывался по ссылке (для защиты диплома).

## 1. Загрузить код на GitHub

1. Создайте репозиторий на [github.com](https://github.com) (например `pulse-messenger`).
2. В папке проекта выполните:

```powershell
cd "C:\Users\xumuk\Desktop\Новая папка (17)\pulse-messenger"
git init
git add .
git commit -m "Pulse diploma project"
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/pulse-messenger.git
git push -u origin main
```

> Папка `node_modules` и `data/` не попадут в git (см. `.gitignore`).

## 2. Создать сервис на Render

1. Зайдите на [render.com](https://render.com) и войдите через GitHub.
2. **New +** → **Web Service**.
3. Подключите репозиторий `pulse-messenger`.
4. Настройки:

| Поле | Значение |
|------|----------|
| Name | `pulse-messenger` (или любое) |
| Region | Frankfurt / ближайший к вам |
| Branch | `main` |
| Runtime | **Node** |
| Build Command | `npm install` |
| Start Command | `npm start` |

5. **Environment Variables** (обязательно):

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | длинная случайная строка (Render может сгенерировать сам) |

6. Нажмите **Create Web Service**.

Через 2–5 минут появится ссылка вида:  
`https://pulse-messenger.onrender.com`

## 3. Проверка после деплоя

- Откройте `https://ваш-сервис.onrender.com/health` — должен быть JSON `{ "status": "OK", ... }`.
- Войдите: **demo** / **demo123**.
- Для демо real-time откройте сайт в двух браузерах, зарегистрируйте второго пользователя.

## 4. Важно про данные на бесплатном Render

На бесплатном тарифе файлы в `data/store.json` **могут сбрасываться** при перезапуске сервиса. Для защиты это нормально:

- покажите регистрацию и чат в live-режиме;
- упомяните в записке: «для продакшена — PostgreSQL».

Демо-пользователь `demo` создаётся автоматически при каждом старте.

## 5. Быстрый деплой через Blueprint

В репозитории есть файл `render.yaml`. На Render:

**New +** → **Blueprint** → выберите репозиторий → Render подставит настройки сам.

## 6. Локально vs облако

| | Локально | Render |
|---|----------|--------|
| Запуск | `npm start` | автоматически |
| URL | `http://localhost:3000` | `https://....onrender.com` |
| WebSocket | `ws://` | `wss://` (работает автоматически) |

## 7. Если сервис «засыпает»

На free-тарифе первый запрос после простоя может занять **30–60 секунд** — это нормально для Render. На защите заранее откройте ссылку за минуту до демо.

# ICON CRM

CRM для учебного центра ICON Education (Ташкент): группы, студенты,
посещаемость, оплаты и балансы. React + Vite, Firebase (Auth/Firestore).

## Разработка

```bash
npm install
cp .env.example .env   # заполнить VITE_FB_* и SEED_ADMIN_EMAIL/PASSWORD
npm run dev
```

## Скрипты

- `npm run dev` — локальный сервер разработки
- `npm run build` — прод-сборка в `dist/`
- `npm run preview` — предпросмотр прод-сборки
- `npm run lint` — oxlint
- `npm run seed` — заводит первого сотрудника (роль `ceo`) и справочники филиала
- `npm run deploy` — сборка + публикация на GitHub Pages (`gh-pages`)

## Firebase

Правила и индексы — `firestore.rules` / `firestore.indexes.json`, деплой:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Документация

- [docs/ICON-CRM-SPEC.md](docs/ICON-CRM-SPEC.md) — техническое задание
- [docs/superpowers/specs/](docs/superpowers/specs/) — спеки отдельных фич

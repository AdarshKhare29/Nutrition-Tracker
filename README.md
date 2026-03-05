# Nutrition Tracker

Monorepo with a TypeScript + SQLite backend and an Expo (React Native + Web) frontend.

## Structure

- `backend/` – Node.js TypeScript API + static web assets
- `frontend/cross-platform-app/` – Expo app (web + mobile)

## Backend

```bash
cd backend
npm install
npm run dev
```

- API runs at `http://localhost:3000`
- SQLite DB file: `backend/database.sqlite`

## Frontend (Expo)

```bash
cd frontend/cross-platform-app
npm install
npm run web
```

### Mobile

```bash
npm run android
npm run ios
```

### API Base URL

Inside the app:
- Web: `http://localhost:3000`
- Android emulator: `http://10.0.2.2:3000`
- Physical device: `http://<your-computer-local-ip>:3000`

## Demo Users

- Admin: `admin / admin123`
- User: `user / user123`

## Notes

- `backend/data.json` is legacy and no longer used.
- `backend/database.sqlite` is created on first run.
- If npm install fails due to cache permissions, remove `backend/.npm-cache` and retry.

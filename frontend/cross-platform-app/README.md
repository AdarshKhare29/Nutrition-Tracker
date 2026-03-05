# Cross-Platform Client (Expo)

This folder contains a single-codebase React Native + Web app for the Calories/Protein tracker.

## 1) Start backend API

From project root:

```bash
npm start
```

Backend runs on `http://localhost:3000`.

## 2) Install and run Expo app

From `cross-platform-app`:

```bash
npm install
npm run web
```

For mobile:

```bash
npm run android
npm run ios
```

## Demo users

- Admin: `admin` / `admin123`
- User: `user` / `user123`

## API base URL

In the app, set API Base URL:

- Web: `http://localhost:3000`
- Android emulator: `http://10.0.2.2:3000`
- Physical device: `http://<your-computer-local-ip>:3000`


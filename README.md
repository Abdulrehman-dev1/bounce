# Bounce Live Website Annotator

This app includes:
1. Iframe + annotation flow (current editor)
2. **Phase 1 Remote Browser MVP** for blocked sites (Apple, etc.)

## Phase 1 Remote Browser (Playwright)

A local Node Playwright worker is included at:
- `remote-browser/server.mjs`

Laravel proxy endpoints:
- `POST /remote-browser/sessions`
- `POST /remote-browser/sessions/{id}/navigate`
- `POST /remote-browser/sessions/{id}/back`
- `POST /remote-browser/sessions/{id}/forward`
- `POST /remote-browser/sessions/{id}/reload`
- `POST /remote-browser/sessions/{id}/scroll`
- `POST /remote-browser/sessions/{id}/click`
- `POST /remote-browser/sessions/{id}/type`
- `GET /remote-browser/sessions/{id}/screenshot`
- `DELETE /remote-browser/sessions/{id}`

Playground UI:
- `GET /remote-browser`

## Local Setup

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
php artisan migrate
```

Install Playwright browser:
```bash
npx playwright install chromium
```

Run all services:
```bash
npm run dev:all
```

Or separately:
```bash
php artisan serve
npm run dev
npm run remote-browser
```

## Env

```env
REMOTE_BROWSER_URL=http://127.0.0.1:3100
REMOTE_BROWSER_PORT=3100
```

## Notes

- Remote browser MVP currently streams periodic screenshots and supports basic actions (go/back/forward/reload/scroll/click/type).
- This is Phase 1 groundwork for full interactive session streaming in Phase 2.

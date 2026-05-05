# Bounce Live Website Annotator

Laravel + Inertia + React app that supports:
- Live iframe website annotation mode
- Automatic fallback to Browsershot static snapshot when embedding is blocked
- Save/share/download annotated PNG

## Stack
- Laravel
- Inertia.js + React
- Tailwind CSS
- MySQL
- Konva/react-konva
- spatie/browsershot + Puppeteer/Chromium

## Core Flow
1. User enters URL.
2. Backend validates URL + SSRF checks.
3. Backend checks frame policy (`X-Frame-Options`, CSP `frame-ancestors`).
4. If embeddable -> live iframe mode.
5. If blocked -> static screenshot fallback.
6. User annotates.
7. Save/share generates PNG and stores metadata.

## Browser-like Features
- Address bar
- Go / Back / Forward / Refresh
- Browse vs Annotate mode switch
- Zoom can be done with browser/page zoom

## Routes
- `GET /`
- `POST /screenshots`
- `GET /screenshots/{id}/edit`
- `POST /screenshots/{id}/snapshot`
- `POST /screenshots/{id}/save`
- `GET /screenshots/{id}/image/{variant}`
- `GET /s/{slug}`

## Data Stored
In `screenshots`:
- `original_url`
- `screenshot_path` (nullable for live mode until snapshot)
- `annotated_path`
- `share_slug`
- `metadata` JSON including:
  - mode
  - current_url
  - viewport
  - scroll
  - annotations
  - frame policy reason

## Install
```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
```

Set MySQL in `.env`:
```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=bounceapp
DB_USERNAME=root
DB_PASSWORD=secret
```

Run:
```bash
php artisan migrate
php artisan serve
npm run dev
```

## Browsershot / Puppeteer
```bash
npm install puppeteer
```

## Tests
```bash
php artisan test
```

## Build
```bash
npm run build
```

## VPS Deploy
```bash
composer install --no-dev --optimize-autoloader
npm install
npm run build
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

## Future-ready Architecture
Current services are split for easy upgrade to remote browser streaming:
- `FramePolicyService`
- `ScreenshotCaptureService`

A future Playwright/Puppeteer live-session renderer can replace iframe mode without rewriting controllers/pages.

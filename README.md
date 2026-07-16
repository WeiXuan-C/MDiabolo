# MDiabolo Scoring

Offline-first diabolo competition scoring for phones and iPads.

## Stack

- React + Vite + TypeScript
- Capacitor for Android, iPhone and iPad
- Native SQLite for offline competition data
- QR score transfer with native camera scanning
- Optional HTTPS synchronization through `VITE_SYNC_ENDPOINT`

## Start

```powershell
npm install
npm run dev
```

## Verify

```powershell
npm test
npm run lint
npm run build
npm run cap:sync
```

See [Quick Start](docs/QUICK_START.md), [User Manual](docs/USER_MANUAL.md), [Architecture](docs/ARCHITECTURE.md), [Database Guide](docs/DATABASE_GUIDE.md), [Deployment Guide](docs/DEPLOYMENT_GUIDE.md), and [Requirements Traceability](docs/REQUIREMENTS_TRACEABILITY.md).

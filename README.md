# ReviseX — No-Code Visual Website Editing & Collaboration Platform

ReviseX allows non-technical website owners and clients to visually click and suggest edits to any supported public website inside an isolated Playwright/Chromium environment, without touching the original live website.

## Architecture

- **`frontend/`**: React 19, Vite, Tailwind CSS, Zustand, React Router, Axios, Lucide Icons, Socket.IO Client
- **`backend/`**: Node.js, Express, MongoDB/Mongoose, JWT + bcrypt, Zod validation, Helmet CSP, Rate Limiting, Socket.IO, S3-compatible asset storage (with local `/uploads` fallback)
- **`worker/`**: Isolated Playwright + Chromium browser rendering service with SSRF protection, DNS/IP validation, outgoing request interception, sanitized DOM snapshot extraction, element fingerprinting, and patch replay
- **`shared/`**: Shared viewport presets, allowed style properties, and element fingerprint matching engine

## Local Development

1. Copy `.env.example` to `.env` (in `backend/` and `worker/` if customizing ports/URIs).
2. Install dependencies:
   ```bash
   npm --prefix worker install
   npm --prefix backend install
   npm --prefix frontend install
   ```
3. Start all three services in separate terminals:
   ```bash
   npm run dev:worker
   npm run dev:backend
   npm run dev:frontend
   ```
4. Open `http://localhost:5173`.

## Running Tests

```bash
npm run test:worker
npm run test:backend
npm run build:frontend
```

## Production Deployment

- **Frontend (Vercel)**: Deploy `frontend/` with `VITE_API_URL=https://api.yourdomain.com/api` and `VITE_SOCKET_URL=https://api.yourdomain.com`. `frontend/vercel.json` handles SPA rewrites.
- **Backend & Browser Worker (Docker Compose)**:
  Set `JWT_SECRET`, `WORKER_SHARED_SECRET`, `FRONTEND_URL`, and optional `MONGO_URI` / `S3_*` variables, then run:
  ```bash
  docker compose up --build -d
  ```
- **Security Notes**:
  - Original websites are never modified automatically.
  - All URLs and subresource requests inside Chromium are validated against loopback, private, and cloud metadata IP ranges.
  - Share tokens are hashed with SHA-256 before storage and grant strictly read-only access with an explicit `"PROPOSED CHANGES — NOT LIVE ON ORIGINAL WEBSITE"` banner.

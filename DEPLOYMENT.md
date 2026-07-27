# Recommended production deployment

## Stage 1 — live read-only screener

No domain is required.

1. Replace the files in your GitHub `Scalpdeck` repository with this version.
2. Keep GitHub Pages enabled on `main` → `/ (root)`.
3. Open the Pages URL and verify the header shows `live ws`.
4. Switch between `Perpetual` and `Spot` in the top toolbar.
5. Open Density Map and verify L50 walls appear after the WebSocket snapshots arrive.

## Stage 2 — production backend

Use a long-running Node.js service when you want to scan hundreds of pairs simultaneously, keep alerts running while the browser is closed, or add Telegram notifications.

Suggested components:

- Web UI: Vercel/Cloudflare Pages
- Data service: Fly.io, Railway, Render, AWS, or a small VPS
- Database: PostgreSQL/Redis if persistence is needed
- Custom domain: point `app.yourdomain.com` to the frontend and `api.yourdomain.com` to the backend

## Stage 3 — Bybit account trading

Use Bybit API credentials only on the backend. Start with testnet. Restrict the API key permissions to the minimum needed and configure IP restrictions where possible. The browser should receive only the information/actions it needs through your own authenticated API.

# ScalpDeck v5.0

Live Bybit USDT Spot + Perpetual dashboard.

Changes in v5.0:
- 6 charts by default in a fixed 3×2 grid
- 9 charts = 3×3
- 12 charts = 4×3
- chart cards no longer stretch vertically
- Coins table has its own permanent vertical scrollbar
- board volume filter defaults to Any so the first page fills all 6 chart slots

# ScalpDeck v4.4 — Vercel live build

This build fixes the `0 markets` problem seen when the browser tries to call Bybit REST directly from GitHub Pages.

## Architecture

- Frontend: static HTML/CSS/JS
- Charts: TradingView Lightweight Charts
- REST bootstrap: same-origin Vercel serverless proxy (`/api/*`) -> Bybit V5
- Live stream: direct Bybit public WebSocket for tickers, candles and L50 order books
- Markets: all active USDT Spot pairs and all active USDT Linear Perpetual contracts

No Bybit API key is required for public market data.

## Deploy

1. Upload all files in this folder to the root of the GitHub repository.
2. Import that GitHub repository into Vercel.
3. Deploy with the default framework setting (Other / no build command).
4. Open the Vercel URL. The app will call `/api/instruments-info`, `/api/tickers`, `/api/kline`, and `/api/orderbook` on the same domain.
5. Connect a custom domain in Vercel only after the deployment is working.

GitHub Pages alone cannot execute the `/api/*.js` serverless functions, so use the Vercel URL for v4.


## Board layouts
The main dashboard starts with 6 charts and supports 6 / 9 / 12 chart layouts from the top bar or Settings. Layouts are fixed to 3×2, 3×3 and 4×3 respectively.


## v4.2 coin-list sorting

The Coins panel supports independent sorting by 24h percentage change and 24h USDT turnover. Click **24h** or **Vol** to toggle highest-to-lowest / lowest-to-highest.


## v4.4 hotfix
- Fixes Perpetual symbol loading when the frontend uses the relative `/api` Vercel backend.
- `new URL()` now resolves against `window.location.origin`, so paginated Bybit linear instruments load correctly.
- Vercel function region is set to Singapore (`sin1`) to place the REST proxy closer to Bybit market-data infrastructure.

## v4.7: full Bybit universe fix

Vercel Functions are pinned to Singapore (`sin1`). This matters because Vercel defaults new Functions to Washington, D.C. (`iad1`), while Bybit rejects API requests originating from U.S. IP addresses. The 24-symbol list is only a diagnostic fallback; a healthy deployment should load the complete active USDT Spot or Linear Perpetual universe.

After deployment, open `/api/health`. It should report `"ok": true` and normally `"region": "sin1"`.


## v5.0 chart drawing tools
Each chart now includes a left-side toolbar: Cursor, Ruler, Horizontal Level, Trend Line, and Clear Drawings. Ruler and Trend Line use two clicks; Horizontal Level uses one click. Drawings are kept per market/timeframe for the current browser session.


## v5.0 shared drawings

Drawings are shared by market and symbol across the multi-timeframe focus view. A horizontal level drawn on 1m appears on 5m, 15m and 1h immediately. Trend lines and ruler measurements also share the same absolute time/price anchors and render on any timeframe whose loaded candle range contains those anchors. Clearing drawings clears them for that symbol across all timeframes in the current browser session.

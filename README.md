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

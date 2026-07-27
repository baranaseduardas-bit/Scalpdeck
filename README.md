# ScalpDeck Live — TradingView Charts + Full Bybit USDT Universe

Static GitHub Pages-compatible crypto screener.

## What changed

- Loads the active Bybit instrument universe before loading tickers.
- **Spot:** every active Bybit Spot market whose quote coin is `USDT`.
- **Perpetual:** every active Bybit `LinearPerpetual` whose quote/settlement coin is `USDT`.
- Handles Bybit linear instrument pagination with `limit=1000` and `nextPageCursor`.
- The Coins panel renders the complete qualified market list, not only the first 120 rows.
- Board volume filtering is separate from the complete Coins list.
- Charts are rendered with **TradingView Lightweight Charts™ v5.2.0** using Bybit candles and WebSocket updates.
- Live Bybit L50 density levels are drawn as TradingView price lines.
- Bybit Spot / Perpetual switch, focus mode, watchlist, volume, sorting, alerts and density map remain available.

## Data sources

Public Bybit V5 REST and WebSocket endpoints. No API key is needed for this read-only screener.

## Deploy

Upload these files to the root of your GitHub repository and commit them:

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
- `DEPLOYMENT.md`

GitHub Pages: deploy from `main` → `/(root)`.

## TradingView attribution

This project uses TradingView Lightweight Charts™.

TradingView Lightweight Charts™  
Copyright (c) 2025 TradingView, Inc. https://www.tradingview.com/

The chart attribution logo remains enabled.

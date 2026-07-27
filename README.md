# ScalpDeck — ScalpBoard-style crypto screener prototype

This is a standalone front-end prototype inspired by the workflow and information architecture of ScalpBoard. It is not ScalpBoard's source code and does not reuse its proprietary assets.

## What is included

- Dense multi-chart screener board
- Bybit USDT perpetual market feed via the public REST API, with automatic simulated-data fallback
- 1m / 5m / 15m / 1h chart switching
- 24h change, range, approximate NATR, volume metrics
- Volume filters and sorting
- Watchlist / starred markets
- Order-book density map using Bybit order-book snapshots when available
- Focus mode with four synchronized-style timeframe panels
- Local alert manager UI for price, impulse and volume-spike conditions
- Settings for board size, grid lines, volume bars and refresh frequency
- Responsive dense dark trading UI

## Run it

The simplest method is to open `index.html` in a browser.

For more reliable API access, serve the folder locally:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Production architecture needed for a true multi-exchange clone

A production version should add a backend service to maintain WebSocket connections to Bybit, Binance and OKX, normalise symbols, de-duplicate markets, aggregate order-book walls, persist users/watchlists/alerts, and send Telegram/Web Push notifications. The front-end in this folder can be used as the UI base.

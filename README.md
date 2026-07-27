# ScalpDeck Live

Live Bybit Spot + USDT Perpetual crypto screener.

## Live data used

- Bybit V5 public WebSocket: Spot and Linear/Perpetual
- `tickers.{symbol}` for live prices and 24h fields
- `kline.{interval}.{symbol}` for the currently selected live candle
- `orderbook.50.{symbol}` for L50 order-book snapshots/deltas
- Bybit V5 REST for initial ticker lists, candles, and order-book bootstrap

The density/wall lines are calculated from actual public Bybit L50 order-book levels. A wall qualifies when its price × quantity notional exceeds the configured density threshold and is within the configured maximum percentage distance from market price.

Important: Bybit documents that RPI orders are not included in the public order-book stream.

## Run locally

The files are static. Use a local web server rather than double-clicking the HTML file.

### Python

```bash
python -m http.server 8080
```

Then open http://localhost:8080

### Node

```bash
npx serve .
```

## GitHub Pages

You can upload these files to the existing `Scalpdeck` repository and keep GitHub Pages enabled. The browser connects directly to Bybit's public WebSocket streams; no API key is required for the public screener.

## Production recommendation

For a public production service, use:

- Frontend: Vercel, Cloudflare Pages, or similar
- Public realtime: browser → Bybit public WebSocket, or a central market-data service if scanning hundreds of markets
- Backend: Node.js service for full-market order-book aggregation, persistent alerts, databases and Telegram/Discord notifications
- Private trading: backend-only Bybit API credentials; never place API secrets in `app.js`, GitHub, or browser storage

A custom domain is optional and can be attached after deployment.

## Private order execution

This build is deliberately read-only. It does not submit Buy/Sell orders to a Bybit account. Private trading should be added as a separate authenticated backend and tested against Bybit testnet before mainnet is enabled.

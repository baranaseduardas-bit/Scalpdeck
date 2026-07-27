# GitHub Pages deployment

1. Unzip this package.
2. Open your `Scalpdeck` GitHub repository.
3. Replace the existing `index.html`, `styles.css`, `app.js`, `README.md` and `DEPLOYMENT.md` with these files.
4. Commit to `main`.
5. Under **Settings → Pages**, keep **Deploy from a branch → main → /(root)**.
6. Hard-refresh the live site after GitHub finishes deploying (`Ctrl+F5`).

The site fetches its market universe directly from Bybit, so newly listed active USDT Spot and USDT linear perpetual markets are picked up automatically on reload.

# Deployment — ScalpDeck v4

## Recommended: Vercel + GitHub

Keep GitHub as the source repository and let Vercel deploy it automatically.

Repository root must contain:

- index.html
- styles.css
- app.js
- vercel.json
- api/
- lib/

After importing the repository into Vercel, every future GitHub commit will redeploy the site automatically.

### Test URLs

After deployment, check:

- `/api/tickers?category=linear`
- `/api/instruments-info?category=spot&status=Trading`

Both should return Bybit JSON. Then open `/` for the application.

## Custom domain

Add the domain in Vercel Project Settings > Domains after the app works on the generated `*.vercel.app` URL.

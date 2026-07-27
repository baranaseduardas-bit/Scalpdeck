const HOSTS = ['https://api.bybit.com', 'https://api.bytick.com'];

async function bybitMarketRequest(endpoint, query = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  }

  let lastError;
  for (const host of HOSTS) {
    const url = `${host}/v5/market/${endpoint}?${qs.toString()}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ScalpDeck/4.0'
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      const text = await response.text();
      if (!response.ok) {
        lastError = new Error(`Bybit HTTP ${response.status}: ${text.slice(0, 200)}`);
        continue;
      }

      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error('Bybit returned non-JSON data'); }

      if (data && data.retCode !== undefined && data.retCode !== 0) {
        throw new Error(`Bybit ${data.retCode}: ${data.retMsg || 'API error'}`);
      }
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Bybit request failed');
}

function publicQuery(req) {
  const out = {};
  for (const [key, value] of Object.entries(req.query || {})) {
    if (Array.isArray(value)) out[key] = value[0];
    else out[key] = value;
  }
  return out;
}

function sendJson(res, status, body, cacheSeconds = 0) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (cacheSeconds > 0) {
    res.setHeader('Cache-Control', `s-maxage=${cacheSeconds}, stale-while-revalidate=${Math.max(5, cacheSeconds * 2)}`);
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.status(status).json(body);
}

module.exports = { bybitMarketRequest, publicQuery, sendJson };

const { bybitMarketRequest, sendJson } = require('../lib/bybit');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

  const region = process.env.VERCEL_REGION || process.env.VERCEL_FUNCTION_REGION || 'unknown';
  try {
    const data = await bybitMarketRequest('time', {});
    return sendJson(res, 200, {
      ok: true,
      region,
      upstream: 'Bybit',
      bybitRetCode: data?.retCode ?? null,
      serverTime: data?.time ?? null
    });
  } catch (error) {
    return sendJson(res, 502, {
      ok: false,
      region,
      upstream: 'Bybit',
      error: error.message,
      hint: 'Bybit blocks U.S. API source IPs. Deploy Vercel Functions in sin1 (Singapore).'
    });
  }
};

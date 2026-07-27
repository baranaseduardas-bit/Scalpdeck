const { bybitMarketRequest, sendJson } = require('../lib/bybit');
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  try {
    const data = await bybitMarketRequest('time', {});
    return sendJson(res, 200, { ok: true, bybit: data });
  } catch (error) {
    return sendJson(res, 502, { ok: false, error: error.message });
  }
};

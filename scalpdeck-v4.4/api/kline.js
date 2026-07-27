const { bybitMarketRequest, publicQuery, sendJson } = require('../lib/bybit');
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const data = await bybitMarketRequest('kline', publicQuery(req));
    return sendJson(res, 200, data, 2);
  } catch (error) {
    return sendJson(res, 502, { error: 'Bybit kline request failed', detail: error.message });
  }
};

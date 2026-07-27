const { bybitMarketRequest, publicQuery, sendJson } = require('../lib/bybit');
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const data = await bybitMarketRequest('instruments-info', publicQuery(req));
    return sendJson(res, 200, data, 60);
  } catch (error) {
    return sendJson(res, 502, { error: 'Bybit instruments request failed', detail: error.message });
  }
};

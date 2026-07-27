(() => {
  'use strict';

  const API = '/api';
  const WS_URL = {
    linear: 'wss://stream.bybit.com/v5/public/linear',
    spot: 'wss://stream.bybit.com/v5/public/spot',
  };

  const state = {
    category: 'linear',
    markets: [],
    allMarkets: [],
    qualifiedSymbols: new Set(),
    instrumentMeta: new Map(),
    candles: new Map(),
    books: new Map(),
    bookDensities: new Map(),
    densities: [],
    timeframe: '1',
    page: 0,
    perPage: 6,
    sortBy: 'turnover',
    coinSortKey: 'turnover',
    coinSortDir: 'desc',
    minVolume: 50_000_000,
    densityThreshold: 250_000,
    densityMaxDistance: 4,
    showDensity: true,
    showCascade: true,
    showGrid: true,
    showVolume: true,
    compactHeaders: false,
    autoSort: true,
    layoutCols: 3,
    restConnected: false,
    wsConnected: false,
    refreshSec: 10,
    timer: null,
    socket: null,
    socketPing: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    socketGeneration: 0,
    starred: new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']),
    alerts: [
      { id: 1, type: 'price', symbol: 'BTCUSDT', value: 70000, active: true },
      { id: 2, type: 'impulse', symbol: 'SOLUSDT', value: 3, active: true },
      { id: 3, type: 'volume', symbol: 'ETHUSDT', value: 2, active: true },
    ],
    previousPrices: new Map(),
    lastMessageAt: 0,
    focusSymbol: null,
    chartSeq: 0,
  };

  const ids = [
    'chartGrid','coinList','densityMap','boardCount','pageLabel','connectionBadge','sourceLabel','densityCoinLabel','alertsList','alertCount',
    'searchModal','coinSearchInput','searchResults','settingsModal','focusModal','focusGrid','focusTitle','alertModal','toastStack','latencyLabel'
  ];
  const els = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const chartRegistry = new Map();

  const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const compact = n => {
    const a = Math.abs(n || 0);
    if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return fmt.format(n || 0);
  };
  const pct = n => `${n >= 0 ? '+' : ''}${Number(n || 0).toFixed(1)}%`;
  const priceFmt = n => {
    if (!Number.isFinite(n)) return '—';
    if (n >= 1000) return n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');
    if (n >= .01) return n.toFixed(5).replace(/0+$/,'').replace(/\.$/,'');
    return n.toPrecision(5);
  };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const hash = str => [...str].reduce((a,c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const marketName = () => state.category === 'spot' ? 'Spot' : 'Perpetual';
  const sourceCode = () => state.category === 'spot' ? 'BY-S' : 'BY-P';

  const CHART_CDNS = [
    'https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.0/dist/lightweight-charts.standalone.production.js',
    'https://unpkg.com/lightweight-charts@5.2.0/dist/lightweight-charts.standalone.production.js',
  ];

  function loadScript(src, timeout=5000) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => { script.remove(); reject(new Error(`Timeout loading ${src}`)); }, timeout);
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error(`Failed loading ${src}`)); };
      document.head.appendChild(script);
    });
  }

  async function ensureTradingViewCharts() {
    if (window.LightweightCharts) return true;
    for (const src of CHART_CDNS) {
      try {
        await loadScript(src);
        if (window.LightweightCharts) return true;
      } catch (err) { console.warn(err.message); }
    }
    console.warn('TradingView Lightweight Charts unavailable; using built-in canvas fallback.');
    return false;
  }

  function toast(message, hot=false) {
    const t = document.createElement('div');
    t.className = `toast${hot ? ' hot' : ''}`;
    t.textContent = message;
    els.toastStack.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  async function fetchJSON(url, timeout=6000) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      if (json?.retCode && json.retCode !== 0) throw new Error(json.retMsg || `Bybit ${json.retCode}`);
      return json;
    } finally { clearTimeout(tid); }
  }

  function syntheticMarkets() {
    const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','LINKUSDT','AVAXUSDT','SUIUSDT','TONUSDT','APTUSDT','NEARUSDT','WIFUSDT','ARBUSDT','OPUSDT','INJUSDT','ENAUSDT','PEPEUSDT','FETUSDT','SEIUSDT','LTCUSDT','BCHUSDT','TRXUSDT','ATOMUSDT'];
    return symbols.map(symbol => {
      const seed = Math.abs(hash(symbol + state.category));
      const base = symbol === 'BTCUSDT' ? 69000 : symbol === 'ETHUSDT' ? 3600 : symbol === 'SOLUSDT' ? 175 : ((seed % 40000) / 1000 + .1);
      const change = ((seed % 1800) / 100) - 9;
      const range = 1 + ((seed >> 3) % 80) / 10;
      return {
        symbol, lastPrice: base, price24hPcnt: change / 100,
        highPrice24h: base * (1 + range/200), lowPrice24h: base * (1 - range/200),
        turnover24h: 20_000_000 + (seed % 2_000_000_000), volume24h: 1_000_000 + seed % 50_000_000,
        natr: range / 2.5, range, trades: 100_000 + seed % 4_000_000, source: 'SIM'
      };
    });
  }

  function normalizeTicker(x) {
    const last = Number(x.lastPrice);
    const hi = Number(x.highPrice24h);
    const lo = Number(x.lowPrice24h);
    const range = last ? ((hi - lo) / last) * 100 : 0;
    return {
      symbol: x.symbol,
      lastPrice: last,
      price24hPcnt: Number(x.price24hPcnt || 0),
      highPrice24h: hi,
      lowPrice24h: lo,
      turnover24h: Number(x.turnover24h || 0),
      volume24h: Number(x.volume24h || 0),
      natr: Math.max(.05, range / 2.7),
      range,
      trades: Math.round(Number(x.volume24h || 0) * .18),
      source: sourceCode(),
      fundingRate: Number(x.fundingRate || 0),
    };
  }

  async function fetchInstrumentUniverse(category) {
    const instruments = [];
    if (category === 'spot') {
      const json = await fetchJSON(`${API}/instruments-info?category=spot&status=Trading`, 9000);
      instruments.push(...(json?.result?.list || []));
    } else {
      let cursor = '';
      let guard = 0;
      do {
        const url = new URL(`${API}/instruments-info`, window.location.origin);
        url.searchParams.set('category', 'linear');
        url.searchParams.set('status', 'Trading');
        url.searchParams.set('limit', '1000');
        if (cursor) url.searchParams.set('cursor', cursor);
        const json = await fetchJSON(url.toString(), 9000);
        instruments.push(...(json?.result?.list || []));
        cursor = json?.result?.nextPageCursor || '';
        guard += 1;
      } while (cursor && guard < 8);
    }

    const filtered = instruments.filter(x => {
      if (x.status !== 'Trading' || x.quoteCoin !== 'USDT') return false;
      if (category === 'linear') return x.contractType === 'LinearPerpetual' && (!x.settleCoin || x.settleCoin === 'USDT');
      return true;
    });

    state.instrumentMeta = new Map(filtered.map(x => [x.symbol, x]));
    state.qualifiedSymbols = new Set(filtered.map(x => x.symbol));
    return filtered;
  }

  async function loadMarkets(silent=false) {
    try {
      await fetchInstrumentUniverse(state.category);
      const json = await fetchJSON(`${API}/tickers?category=${state.category}`, 9000);
      if (!json?.result?.list) throw new Error('Unexpected API payload');
      state.allMarkets = json.result.list
        .filter(x => state.qualifiedSymbols.has(x.symbol) && Number(x.lastPrice) > 0)
        .map(x => ({ ...normalizeTicker(x), instrument: state.instrumentMeta.get(x.symbol) }));
      state.restConnected = true;
      if (!silent) toast(`${state.allMarkets.length} Bybit ${marketName()} USDT markets loaded`);
    } catch (err) {
      console.warn('Bybit market bootstrap failed', err);
      if (!state.allMarkets.length) state.allMarkets = syntheticMarkets();
      state.restConnected = false;
      jitterSynthetic();
      if (!silent) toast(`Market bootstrap failed: ${err?.message || 'API unavailable'}`, true);
    }
    deriveMarkets();
    await hydrateVisibleCandles();
    renderAll();
    connectVisibleWebSocket();
  }

  function setConnection() {
    const live = state.wsConnected;
    els.connectionBadge.classList.toggle('live', live);
    els.connectionBadge.classList.toggle('live-ws', live);
    els.connectionBadge.classList.toggle('offline', !live);
    els.connectionBadge.innerHTML = `<i></i>${live ? 'live ws' : 'reconnecting'}`;
    els.sourceLabel.textContent = `Bybit ${marketName()} · ${live ? 'WebSocket' : 'REST/bootstrap'}`;
  }

  function jitterSynthetic() {
    state.allMarkets = state.allMarkets.map(m => {
      const d = (Math.random() - .5) * .004;
      const p = m.lastPrice * (1 + d);
      return { ...m, lastPrice: p, price24hPcnt: m.price24hPcnt + d/5, highPrice24h: Math.max(m.highPrice24h,p), lowPrice24h: Math.min(m.lowPrice24h,p) };
    });
  }

  function deriveMarkets() {
    let list = state.allMarkets.filter(m => m.turnover24h >= state.minVolume);
    const key = state.sortBy;
    list.sort((a,b) => {
      if (key === 'change') return Math.abs(b.price24hPcnt) - Math.abs(a.price24hPcnt);
      if (key === 'range') return b.range - a.range;
      if (key === 'natr') return b.natr - a.natr;
      if (key === 'density') return liveDensityDistance(a) - liveDensityDistance(b);
      return b.turnover24h - a.turnover24h;
    });
    const stars = list.filter(m => state.starred.has(m.symbol));
    const rest = list.filter(m => !state.starred.has(m.symbol));
    state.markets = [...stars, ...rest];
    const maxPage = Math.max(0, Math.ceil(state.markets.length / state.perPage) - 1);
    state.page = Math.min(state.page, maxPage);
  }

  function liveDensityDistance(m) {
    const ds = state.bookDensities.get(m.symbol) || [];
    return ds.length ? Math.min(...ds.map(d => d.distance)) : 999;
  }

  async function fetchCandles(symbol, tf=state.timeframe, limit=160) {
    const key = `${symbol}:${tf}`;
    try {
      const json = await fetchJSON(`${API}/kline?category=${state.category}&symbol=${symbol}&interval=${tf}&limit=${limit}`, 5500);
      const rows = json?.result?.list;
      if (rows?.length) {
        const candles = rows.slice().reverse().map(r => ({ t:Number(r[0]), o:Number(r[1]), h:Number(r[2]), l:Number(r[3]), c:Number(r[4]), v:Number(r[5]) }));
        state.candles.set(key, candles);
        return candles;
      }
    } catch (_) {}
    const market = state.allMarkets.find(m => m.symbol === symbol) || { lastPrice: 100 };
    const candles = generateCandles(symbol, market.lastPrice, limit, Number(tf));
    state.candles.set(key, candles);
    return candles;
  }

  function generateCandles(symbol, endPrice, count=120, tf=1) {
    const seed = Math.abs(hash(symbol + tf + state.category));
    let p = endPrice / (1 + ((seed % 20) - 10)/100);
    const out = [];
    let t = Date.now() - count * tf * 60_000;
    for (let i=0;i<count;i++) {
      const drift = Math.sin((i + seed%17)/8) * .0012 + (Math.random()-.49) * .008;
      const o = p, c = Math.max(.0000001, o * (1 + drift));
      const h = Math.max(o,c) * (1 + Math.random()*.0035);
      const l = Math.min(o,c) * (1 - Math.random()*.0035);
      out.push({t, o,h,l,c,v:500+Math.random()*6000*(1+Math.abs(drift)*80)});
      p = c; t += tf*60_000;
    }
    const scale = endPrice / out[out.length-1].c;
    return out.map(c => ({...c,o:c.o*scale,h:c.h*scale,l:c.l*scale,c:c.c*scale}));
  }

  async function hydrateVisibleCandles() {
    await Promise.all(visibleMarkets().map(m => fetchCandles(m.symbol)));
  }

  function visibleMarkets() {
    return state.markets.slice(state.page*state.perPage, state.page*state.perPage + state.perPage);
  }

  function boardLayout(count = state.perPage) {
    if (count >= 12) return { cols: 4, rows: 3 };
    if (count >= 9) return { cols: 3, rows: 3 };
    return { cols: 3, rows: 2 };
  }

  function syncLayoutControls() {
    document.querySelectorAll('#layoutPicker button').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.count) === state.perPage);
    });
    const select = document.getElementById('chartsPerPage');
    if (select) select.value = String(state.perPage);
  }

  async function setChartsPerPage(count) {
    const allowed = [6, 9, 12];
    state.perPage = allowed.includes(Number(count)) ? Number(count) : 6;
    state.page = 0;
    const layout = boardLayout(state.perPage);
    state.layoutCols = layout.cols;
    syncLayoutControls();
    await hydrateVisibleCandles();
    renderAll();
    connectVisibleWebSocket();
    await bootstrapOrderbooks();
  }

  function connectVisibleWebSocket() {
    disconnectSocket(false);
    const generation = ++state.socketGeneration;
    const visible = visibleMarkets();
    const focusMarket = state.focusSymbol ? state.allMarkets.find(m => m.symbol === state.focusSymbol) : null;
    const subscribedMarkets = focusMarket && !visible.some(m => m.symbol === focusMarket.symbol) ? [...visible, focusMarket] : visible;
    if (!subscribedMarkets.length) return;

    let socket;
    try { socket = new WebSocket(WS_URL[state.category]); }
    catch (_) { scheduleReconnect(); return; }
    state.socket = socket;
    setConnection();

    socket.onopen = () => {
      if (generation !== state.socketGeneration) return socket.close();
      state.wsConnected = true;
      state.reconnectAttempt = 0;
      setConnection();
      const args = [];
      for (const m of subscribedMarkets) {
        args.push(`tickers.${m.symbol}`);
        args.push(`kline.${state.timeframe}.${m.symbol}`);
        args.push(`orderbook.50.${m.symbol}`);
        if (state.focusSymbol === m.symbol) {
          for (const tf of ['1','5','15','60']) {
            if (tf !== state.timeframe) args.push(`kline.${tf}.${m.symbol}`);
          }
        }
      }
      socket.send(JSON.stringify({ op: 'subscribe', args }));
      state.socketPing = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 'ping' }));
      }, 20000);
    };

    socket.onmessage = ev => {
      if (generation !== state.socketGeneration) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (msg.ts) {
        state.lastMessageAt = Date.now();
        const latency = Math.max(0, Date.now() - Number(msg.ts));
        if (els.latencyLabel) els.latencyLabel.textContent = `${Math.min(latency,9999)} ms`;
      }
      if (!msg.topic) return;
      if (msg.topic.startsWith('tickers.')) handleTickerMessage(msg);
      else if (msg.topic.startsWith('kline.')) handleKlineMessage(msg);
      else if (msg.topic.startsWith('orderbook.')) handleOrderbookMessage(msg);
    };

    socket.onerror = () => { state.wsConnected = false; setConnection(); };
    socket.onclose = () => {
      if (generation !== state.socketGeneration) return;
      state.wsConnected = false;
      setConnection();
      if (state.socketPing) clearInterval(state.socketPing);
      state.socketPing = null;
      scheduleReconnect();
    };
  }

  function disconnectSocket(incrementGeneration=true) {
    if (incrementGeneration) state.socketGeneration++;
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    if (state.socketPing) clearInterval(state.socketPing);
    state.socketPing = null;
    const s = state.socket;
    state.socket = null;
    state.wsConnected = false;
    if (s && (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING)) {
      try { s.close(1000, 'resubscribe'); } catch (_) {}
    }
  }

  function scheduleReconnect() {
    clearTimeout(state.reconnectTimer);
    const delay = Math.min(15000, 1000 * Math.pow(1.7, state.reconnectAttempt++));
    state.reconnectTimer = setTimeout(connectVisibleWebSocket, delay);
  }

  function handleTickerMessage(msg) {
    const d = Array.isArray(msg.data) ? msg.data[0] : msg.data;
    if (!d?.symbol) return;
    const idx = state.allMarkets.findIndex(m => m.symbol === d.symbol);
    if (idx < 0) return;
    const old = state.allMarkets[idx];
    const last = Number(d.lastPrice ?? old.lastPrice);
    const hi = Number(d.highPrice24h ?? old.highPrice24h);
    const lo = Number(d.lowPrice24h ?? old.lowPrice24h);
    const range = last ? ((hi-lo)/last)*100 : old.range;
    state.previousPrices.set(d.symbol, old.lastPrice);
    state.allMarkets[idx] = {
      ...old,
      lastPrice: last,
      highPrice24h: hi,
      lowPrice24h: lo,
      price24hPcnt: Number(d.price24hPcnt ?? old.price24hPcnt),
      turnover24h: Number(d.turnover24h ?? old.turnover24h),
      volume24h: Number(d.volume24h ?? old.volume24h),
      range,
      natr: Math.max(.05, range/2.7),
      fundingRate: Number(d.fundingRate ?? old.fundingRate ?? 0),
      source: sourceCode(),
    };
    evaluatePriceAlerts(state.allMarkets[idx]);
    if (!state.autoSort) patchVisiblePrice(d.symbol);
    else {
      deriveMarkets();
      patchVisiblePrice(d.symbol);
    }
  }

  function handleKlineMessage(msg) {
    const d = msg.data?.[0];
    if (!d) return;
    const parts = msg.topic.split('.');
    const tf = parts[1], symbol = parts[2];
    const key = `${symbol}:${tf}`;
    const candles = [...(state.candles.get(key) || [])];
    const next = { t:Number(d.start), o:Number(d.open), h:Number(d.high), l:Number(d.low), c:Number(d.close), v:Number(d.volume) };
    const last = candles[candles.length-1];
    if (last?.t === next.t) candles[candles.length-1] = next;
    else {
      candles.push(next);
      if (candles.length > 180) candles.splice(0, candles.length - 180);
    }
    state.candles.set(key, candles);
    redrawSymbol(symbol, tf);
  }

  function handleOrderbookMessage(msg) {
    const symbol = msg.topic.split('.').pop();
    const data = msg.data;
    if (!symbol || !data) return;
    let book = state.books.get(symbol);
    if (!book || msg.type === 'snapshot') book = { bids:new Map(), asks:new Map(), updated:Date.now() };
    applyBookSide(book.bids, data.b || []);
    applyBookSide(book.asks, data.a || []);
    book.updated = Date.now();
    state.books.set(symbol, book);
    computeDensities(symbol);
    redrawSymbol(symbol);
  }

  function applyBookSide(map, rows) {
    for (const row of rows) {
      const p = String(row[0]), q = Number(row[1]);
      if (!q) map.delete(p); else map.set(p, q);
    }
  }

  function computeDensities(symbol) {
    const book = state.books.get(symbol);
    const market = state.allMarkets.find(m => m.symbol === symbol);
    if (!book || !market?.lastPrice) return;
    const mid = market.lastPrice;
    const make = (map, side) => [...map.entries()].map(([p,q]) => {
      const price = Number(p), qty = Number(q), notional = price * qty;
      return { symbol, side, price, qty, notional, distance: Math.abs((price-mid)/mid*100), updated:book.updated };
    }).filter(x => x.notional >= state.densityThreshold && x.distance <= state.densityMaxDistance)
      .sort((a,b) => b.notional-a.notional).slice(0,4);
    const ds = [...make(book.asks,'ask'), ...make(book.bids,'bid')].sort((a,b) => a.distance-b.distance);
    state.bookDensities.set(symbol, ds);
    rebuildDensityMap();
  }

  function rebuildDensityMap() {
    state.densities = visibleMarkets().flatMap(m => state.bookDensities.get(m.symbol) || [])
      .sort((a,b) => a.distance-b.distance).slice(0,30);
    renderDensityMap();
  }

  async function bootstrapOrderbooks() {
    await Promise.all(visibleMarkets().map(async m => {
      try {
        const json = await fetchJSON(`${API}/orderbook?category=${state.category}&symbol=${m.symbol}&limit=50`, 4500);
        const data = json?.result;
        if (!data) return;
        const book = { bids:new Map(), asks:new Map(), updated:Date.now() };
        applyBookSide(book.bids, data.b || []);
        applyBookSide(book.asks, data.a || []);
        state.books.set(m.symbol, book);
        computeDensities(m.symbol);
      } catch (_) {}
    }));
  }

  function renderAll() {
    renderBoard(); renderCoinList(); renderDensityMap(); renderAlerts(); updatePager();
  }

  function destroyChart(card) {
    const id = card?.dataset?.chartId;
    if (!id) return;
    const item = chartRegistry.get(id);
    if (item) {
      try { item.resizeObserver?.disconnect(); } catch (_) {}
      try { item.chart?.remove?.(); } catch (_) {}
      chartRegistry.delete(id);
    }
  }

  function destroyChartsWithin(root) {
    root?.querySelectorAll?.('.chart-card').forEach(destroyChart);
  }

  function renderBoard() {
    const visible = visibleMarkets();
    destroyChartsWithin(els.chartGrid);
    els.chartGrid.innerHTML = '';
    const layout = boardLayout(state.perPage);
    state.layoutCols = layout.cols;
    els.chartGrid.dataset.layout = String(state.perPage);
    els.chartGrid.style.gridTemplateColumns = `repeat(${layout.cols},minmax(0,1fr))`;
    els.chartGrid.style.gridTemplateRows = `repeat(${layout.rows},minmax(0,1fr))`;
    if (!visible.length) {
      els.chartGrid.innerHTML = '<div class="empty-board">No markets match the current volume filter.</div>';
      return;
    }
    visible.forEach(m => els.chartGrid.appendChild(makeChartCard(m, state.timeframe)));
    requestAnimationFrame(redrawCanvases);
  }

  function makeChartCard(m, tf, opts={}) {
    const card = document.createElement('article');
    card.className = 'chart-card';
    card.dataset.symbol = m.symbol;
    card.dataset.tf = tf;
    card.dataset.chartId = `tv-${++state.chartSeq}`;
    const direction = m.price24hPcnt >= 0 ? 'up' : 'down';
    const hotChange = Math.abs(m.price24hPcnt*100) >= 5 ? 'hot' : direction;
    const funding = state.category === 'linear' && Number.isFinite(m.fundingRate) ? `<span class="metric">F <strong>${(m.fundingRate*100).toFixed(3)}%</strong></span>` : '';
    card.innerHTML = `
      <div class="chart-head ${state.compactHeaders ? 'compact' : ''}">
        <span class="market-dot"></span>
        <span class="ticker">${m.symbol.replace('USDT','')}</span>
        <span class="exchange">${m.source}</span>
        <span class="metric ${hotChange} live-change">${pct(m.price24hPcnt*100)}</span>
        <span class="metric">↕ <strong>${m.range.toFixed(1)}</strong></span>
        <span class="metric">N <strong>${m.natr.toFixed(1)}</strong></span>
        <span class="metric">V <strong>${compact(m.turnover24h)}</strong></span>
        ${funding}
        <span class="chart-actions">
          <button class="tiny-btn star-btn" title="Watchlist">${state.starred.has(m.symbol) ? '★' : '☆'}</button>
          ${opts.focus ? '' : '<button class="tiny-btn focus-btn" title="Focus mode">⛶</button>'}
        </span>
      </div>
      <div class="chart-canvas tv-chart" aria-label="TradingView Lightweight Chart"></div>
      <div class="chart-watermark">${m.symbol.replace('USDT','')}</div>
      <div class="price-tag live-price">${priceFmt(m.lastPrice)}</div>
    `;
    card.querySelector('.star-btn')?.addEventListener('click', e => { e.stopPropagation(); toggleStar(m.symbol); });
    card.querySelector('.focus-btn')?.addEventListener('click', e => { e.stopPropagation(); openFocus(m.symbol); });
    card.addEventListener('dblclick', () => openFocus(m.symbol));
    return card;
  }

  function patchVisiblePrice(symbol) {
    const m = state.allMarkets.find(x => x.symbol === symbol);
    if (!m) return;
    document.querySelectorAll(`.chart-card[data-symbol="${CSS.escape(symbol)}"]`).forEach(card => {
      const p = card.querySelector('.live-price');
      const c = card.querySelector('.live-change');
      if (p) p.textContent = priceFmt(m.lastPrice);
      if (c) { c.textContent = pct(m.price24hPcnt*100); c.className = `metric live-change ${m.price24hPcnt>=0?'up':'down'}`; }
    });
  }

  function tvCandle(c) {
    return { time: Math.floor(c.t / 1000), open: c.o, high: c.h, low: c.l, close: c.c };
  }

  function tvVolume(c) {
    return { time: Math.floor(c.t / 1000), value: c.v, color: c.c >= c.o ? 'rgba(57,201,129,.28)' : 'rgba(237,93,101,.28)' };
  }

  function removeDensityLines(item) {
    for (const line of item.densityLines || []) {
      try { item.candles.removePriceLine(line); } catch (_) {}
    }
    item.densityLines = [];
  }

  function applyDensityLines(item, market) {
    removeDensityLines(item);
    if (!state.showDensity) return;
    const ds = state.bookDensities.get(market.symbol) || [];
    item.densityLines = ds.slice(0, 8).map(d => item.candles.createPriceLine({
      price: d.price,
      color: d.side === 'ask' ? 'rgba(237,93,101,.9)' : 'rgba(57,201,129,.9)',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: `${d.side.toUpperCase()} ${compact(d.notional)} ${d.distance.toFixed(2)}%`,
    }));
  }

  function applyCascadeMarker(item, candles) {
    if (!item.markerApi || !state.showCascade || candles.length < 20) {
      try { item.markerApi?.setMarkers([]); } catch (_) {}
      return;
    }
    const recent = candles.slice(-18);
    const bodies = recent.map(c => Math.abs(c.c-c.o)/Math.max(c.o,.00000001));
    const maxBody = Math.max(...bodies);
    if (maxBody <= .003) { item.markerApi.setMarkers([]); return; }
    const i = bodies.indexOf(maxBody);
    const c = recent[i];
    item.markerApi.setMarkers([{
      time: Math.floor(c.t / 1000),
      position: c.c >= c.o ? 'belowBar' : 'aboveBar',
      color: '#b788ff',
      shape: c.c >= c.o ? 'arrowUp' : 'arrowDown',
      text: 'IMP',
    }]);
  }

  function drawFallbackChart(item, candles, market) {
    const canvas = item.canvas;
    const container = item.container;
    if (!canvas || !container || !candles.length) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = container.getBoundingClientRect();
    const width = Math.max(120, Math.floor(rect.width));
    const height = Math.max(100, Math.floor(rect.height));
    const targetW = Math.floor(width*dpr), targetH = Math.floor(height*dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW; canvas.height = targetH;
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle = '#101216'; ctx.fillRect(0,0,width,height);
    const left=8,right=42,top=8,bottom=state.showVolume?42:18;
    const cw=Math.max(10,width-left-right), ch=Math.max(10,height-top-bottom);
    const shown=candles.slice(-90);
    let min=Math.min(...shown.map(c=>c.l)), max=Math.max(...shown.map(c=>c.h));
    const pad=(max-min||Math.max(max*.002,.000001))*.08; min-=pad; max+=pad;
    const y=p=>top+(max-p)/(max-min)*ch;
    if(state.showGrid){ctx.strokeStyle='#1a1e24';ctx.lineWidth=1;for(let i=1;i<5;i++){const gy=top+ch*i/5;ctx.beginPath();ctx.moveTo(left,gy);ctx.lineTo(left+cw,gy);ctx.stroke();}}
    const step=cw/Math.max(1,shown.length), body=Math.max(1,Math.min(7,step*.62));
    const vmax=Math.max(1,...shown.map(c=>c.v||0));
    shown.forEach((c,i)=>{const x=left+i*step+step/2;const up=c.c>=c.o;ctx.strokeStyle=up?'#39c981':'#ed5d65';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(x,y(c.h));ctx.lineTo(x,y(c.l));ctx.stroke();const yo=y(c.o),yc=y(c.c);ctx.fillRect(x-body/2,Math.min(yo,yc),body,Math.max(1,Math.abs(yc-yo)));if(state.showVolume){const vh=(c.v||0)/vmax*30;ctx.globalAlpha=.28;ctx.fillRect(x-body/2,height-4-vh,body,vh);ctx.globalAlpha=1;}});
    if(state.showDensity){for(const d of (state.bookDensities.get(market.symbol)||[]).slice(0,8)){if(d.price<min||d.price>max)continue;const yy=y(d.price);ctx.setLineDash([5,4]);ctx.strokeStyle=d.side==='ask'?'#ed5d65':'#39c981';ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+cw,yy);ctx.stroke();ctx.setLineDash([]);}}
    ctx.fillStyle='#707782';ctx.font='10px system-ui,sans-serif';ctx.textAlign='right';ctx.fillText(priceFmt(max),width-4,top+8);ctx.fillText(priceFmt(min),width-4,top+ch);
  }

  function createFallbackChart(card, candles, market) {
    const container = card.querySelector('.tv-chart');
    if (!container) return null;
    container.innerHTML='';
    const canvas=document.createElement('canvas');
    canvas.className='fallback-chart';
    container.appendChild(canvas);
    const item={engine:'canvas',canvas,container,card,marketSymbol:market.symbol};
    const resizeObserver=new ResizeObserver(()=>drawFallbackChart(item,state.candles.get(`${card.dataset.symbol}:${card.dataset.tf}`)||[],market));
    resizeObserver.observe(container);
    item.resizeObserver=resizeObserver;
    chartRegistry.set(card.dataset.chartId,item);
    drawFallbackChart(item,candles,market);
    return item;
  }

  function createTradingViewChart(card, candles, market) {
    const container = card.querySelector('.tv-chart');
    if (!container) return null;
    if (!window.LightweightCharts) return createFallbackChart(card, candles, market);
    const rect = container.getBoundingClientRect();
    const chart = LightweightCharts.createChart(container, {
      width: Math.max(80, Math.floor(rect.width)),
      height: Math.max(80, Math.floor(rect.height)),
      layout: {
        background: { type: LightweightCharts.ColorType.Solid, color: '#101216' },
        textColor: '#707782',
        attributionLogo: true,
      },
      grid: {
        vertLines: { visible: state.showGrid, color: '#1a1e24' },
        horzLines: { visible: state.showGrid, color: '#1a1e24' },
      },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#262b32', scaleMargins: { top: .08, bottom: state.showVolume ? .24 : .08 } },
      timeScale: { borderColor: '#262b32', timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 5 },
      localization: { locale: 'en-GB' },
      handleScale: true,
      handleScroll: true,
    });

    const candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
      upColor: '#39c981', downColor: '#ed5d65', borderVisible: false,
      wickUpColor: '#39c981', wickDownColor: '#ed5d65', priceLineVisible: true, lastValueVisible: true,
    });
    candleSeries.setData(candles.map(tvCandle));

    let volumeSeries = null;
    if (state.showVolume) {
      volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
        priceFormat: { type: 'volume' }, priceScaleId: '', lastValueVisible: false, priceLineVisible: false,
      });
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: .82, bottom: 0 } });
      volumeSeries.setData(candles.map(tvVolume));
    }

    let markerApi = null;
    if (typeof LightweightCharts.createSeriesMarkers === 'function') {
      markerApi = LightweightCharts.createSeriesMarkers(candleSeries, []);
    }

    const item = { engine:'tradingview', chart, candles: candleSeries, volume: volumeSeries, markerApi, densityLines: [], card, container };
    applyDensityLines(item, market);
    applyCascadeMarker(item, candles);
    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r?.width > 20 && r?.height > 20) chart.resize(Math.floor(r.width), Math.floor(r.height));
    });
    resizeObserver.observe(container);
    item.resizeObserver = resizeObserver;
    chartRegistry.set(card.dataset.chartId, item);
    return item;
  }

  function redrawSymbol(symbol, tf=null) {
    document.querySelectorAll(`.chart-card[data-symbol="${CSS.escape(symbol)}"]`).forEach(card => {
      if (tf && card.dataset.tf !== tf) return;
      redrawChartCard(card);
    });
  }

  function redrawChartCard(card) {
    const m = state.allMarkets.find(x => x.symbol === card.dataset.symbol);
    const candles = state.candles.get(`${card.dataset.symbol}:${card.dataset.tf}`) || [];
    if (!m || !candles.length) return;
    let item = chartRegistry.get(card.dataset.chartId);
    if (!item) item = createTradingViewChart(card, candles, m);
    if (!item) return;
    if (item.engine === 'canvas') { drawFallbackChart(item, candles, m); return; }
    item.chart.applyOptions({
      grid: { vertLines: { visible: state.showGrid, color: '#1a1e24' }, horzLines: { visible: state.showGrid, color: '#1a1e24' } },
      rightPriceScale: { scaleMargins: { top: .08, bottom: state.showVolume ? .24 : .08 } },
    });
    item.candles.setData(candles.map(tvCandle));
    if (state.showVolume) {
      if (!item.volume) {
        item.volume = item.chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat:{type:'volume'}, priceScaleId:'', lastValueVisible:false, priceLineVisible:false });
        item.volume.priceScale().applyOptions({ scaleMargins:{top:.82,bottom:0} });
      }
      item.volume.setData(candles.map(tvVolume));
    } else if (item.volume) {
      try { item.chart.removeSeries(item.volume); } catch (_) {}
      item.volume = null;
    }
    applyDensityLines(item, m);
    applyCascadeMarker(item, candles);
  }

  function redrawCanvases() {
    document.querySelectorAll('.chart-card').forEach(redrawChartCard);
  }

  function sortedCoinUniverse() {
    const list = [...state.allMarkets];
    const key = state.coinSortKey;
    const dir = state.coinSortDir === 'asc' ? 1 : -1;
    list.sort((a,b) => {
      let av = 0, bv = 0;
      if (key === 'change') { av = a.price24hPcnt; bv = b.price24hPcnt; }
      else if (key === 'volume') { av = a.turnover24h; bv = b.turnover24h; }
      else if (key === 'range') { av = a.range; bv = b.range; }
      else if (key === 'natr') { av = a.natr; bv = b.natr; }
      else { av = a.turnover24h; bv = b.turnover24h; }
      const diff = (av - bv) * dir;
      return diff || a.symbol.localeCompare(b.symbol);
    });
    return list;
  }

  function updateCoinSortHeaders() {
    document.querySelectorAll('.coin-sort').forEach(btn => {
      const active = btn.dataset.coinSort === state.coinSortKey;
      btn.classList.toggle('active', active);
      const arrow = btn.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = active ? (state.coinSortDir === 'desc' ? '▼' : '▲') : '↕';
      btn.setAttribute('aria-sort', active ? (state.coinSortDir === 'desc' ? 'descending' : 'ascending') : 'none');
    });
  }

  function setCoinSort(key) {
    if (state.coinSortKey === key) state.coinSortDir = state.coinSortDir === 'desc' ? 'asc' : 'desc';
    else { state.coinSortKey = key; state.coinSortDir = 'desc'; }
    renderCoinList();
  }

  function renderCoinList() {
    els.coinList.innerHTML='';
    sortedCoinUniverse().forEach(m=>{
      const row=document.createElement('div');row.className='coin-row';row.dataset.symbol=m.symbol;
      row.innerHTML=`<span class="coin-symbol"><b class="mini-star ${state.starred.has(m.symbol)?'starred':''}">★</b>${m.symbol.replace('USDT','')} <small>${m.source}</small></span><span class="${m.price24hPcnt>=0?'up':'down'}">${pct(m.price24hPcnt*100)}</span><span>${m.range.toFixed(1)}</span><span>${m.natr.toFixed(1)}</span><span title="24h turnover: ${fmt.format(m.turnover24h)} USDT">${compact(m.turnover24h)}</span>`;
      row.addEventListener('click',()=>openFocus(m.symbol)); els.coinList.appendChild(row);
    });
    updateCoinSortHeaders();
    els.boardCount.textContent=state.markets.length;
    const coinsTab = document.querySelector('.side-tabs button[data-tab="coins"]');
    if (coinsTab) coinsTab.innerHTML = `Coins <span class="pill">${state.allMarkets.length}</span>`;
  }

  function renderDensityMap(){
    els.densityMap.innerHTML='<div class="density-center"></div>';
    els.densityCoinLabel.textContent = `L50 · ${marketName().toLowerCase()} · live`;
    const maxD = state.densityMaxDistance;
    [1,2,3].filter(n=>n<maxD+.01).forEach(n=>{['top','bottom'].forEach(pos=>{const d=document.createElement('div');d.className='density-distance';d.style[pos]=`calc(50% + ${n/maxD*43}%)`;if(pos==='bottom') d.style[pos]=`calc(50% + ${n/maxD*43}% - 9px)`;d.textContent=`${n}%`;els.densityMap.appendChild(d);});});
    if (!state.densities.length) {
      const empty=document.createElement('div');empty.className='empty-board';empty.style.position='absolute';empty.style.inset='40% 0 auto';empty.style.background='transparent';empty.textContent='Waiting for live order-book walls…';els.densityMap.appendChild(empty);return;
    }
    state.densities.slice(0,22).forEach((d,i)=>{
      const chip=document.createElement('div');chip.className=`density-chip ${d.side}`;
      const y=50+(d.side==='ask'?-1:1)*clamp(d.distance/maxD*44,4,44);
      const left=4+((Math.abs(hash(d.symbol+i))%62));
      chip.style.top=`${y}%`;chip.style.left=`${left}%`;chip.innerHTML=`<b>${d.symbol.replace('USDT','')}</b> ${compact(d.notional)} <strong>${d.distance.toFixed(2)}%</strong>`;
      chip.title=`${d.symbol} · ${d.side.toUpperCase()} · ${d.distance.toFixed(2)}% · ${compact(d.notional)} USDT at ${priceFmt(d.price)}`;
      chip.addEventListener('click',()=>openFocus(d.symbol));els.densityMap.appendChild(chip);
    });
  }

  function renderAlerts(){
    els.alertsList.innerHTML='';els.alertCount.textContent=state.alerts.filter(a=>a.active).length;
    state.alerts.forEach(a=>{
      const card=document.createElement('div');card.className='alert-card';
      const desc=a.type==='price'?`Crosses ${priceFmt(a.value)}`:a.type==='impulse'?`Live candle moves ≥ ${a.value}%`:`Volume spike ≥ ${a.value}x`;
      card.innerHTML=`<header><div><span class="alert-type">${a.type}</span> <strong>${a.symbol.replace('USDT','')}</strong></div><div class="alert-actions"><button class="toggle-alert">${a.active?'●':'○'}</button><button class="delete-alert">×</button></div></header><p>${desc}</p><p>${a.active?'Watching browser session':'Paused'} · ${marketName()}</p>`;
      card.querySelector('.toggle-alert').onclick=()=>{a.active=!a.active;renderAlerts()};
      card.querySelector('.delete-alert').onclick=()=>{state.alerts=state.alerts.filter(x=>x.id!==a.id);renderAlerts()};
      els.alertsList.appendChild(card);
    });
  }

  function evaluatePriceAlerts(m) {
    const prev = state.previousPrices.get(m.symbol);
    if (!Number.isFinite(prev)) return;
    for (const a of state.alerts) {
      if (!a.active || a.type !== 'price' || a.symbol !== m.symbol) continue;
      if ((prev < a.value && m.lastPrice >= a.value) || (prev > a.value && m.lastPrice <= a.value)) {
        toast(`${m.symbol} crossed ${priceFmt(a.value)}`, true);
      }
    }
  }

  function updatePager(){
    const pages=Math.max(1,Math.ceil(state.markets.length/state.perPage));els.pageLabel.textContent=`${Math.min(state.page+1,pages)} / ${pages}`;
  }

  function toggleStar(symbol){
    state.starred.has(symbol)?state.starred.delete(symbol):state.starred.add(symbol);deriveMarkets();renderAll();connectVisibleWebSocket();toast(`${symbol.replace('USDT','')} ${state.starred.has(symbol)?'added to':'removed from'} watchlist`);
  }

  async function openFocus(symbol){
    const m=state.allMarkets.find(x=>x.symbol===symbol);if(!m)return;
    state.focusSymbol=symbol;
    els.focusTitle.textContent=`${symbol} · ${marketName()} · multi-timeframe focus`;destroyChartsWithin(els.focusGrid);els.focusGrid.innerHTML='';
    openModal(els.focusModal);
    const tfs=['1','5','15','60'];
    await Promise.all(tfs.map(tf=>fetchCandles(symbol,tf,160)));
    tfs.forEach(tf=>{const card=makeChartCard(m,tf,{focus:true});card.querySelector('.ticker').textContent=`${symbol.replace('USDT','')} · ${tf==='60'?'1h':tf+'m'}`;els.focusGrid.appendChild(card)});
    requestAnimationFrame(redrawCanvases);
    connectVisibleWebSocket();
  }

  function openModal(modal){modal.classList.add('open');modal.setAttribute('aria-hidden','false')}
  function closeModal(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');if(modal===els.focusModal){state.focusSymbol=null;destroyChartsWithin(els.focusGrid);connectVisibleWebSocket()}}

  function renderSearch(query=''){
    const q=query.trim().toUpperCase();let list=state.allMarkets.filter(m=>!q||m.symbol.includes(q)).slice(0,30);
    els.searchResults.innerHTML='';list.forEach((m,i)=>{const r=document.createElement('div');r.className=`search-result${i===0?' selected':''}`;r.innerHTML=`<strong>${m.symbol.replace('USDT','')}</strong><span class="sr-price">${priceFmt(m.lastPrice)}</span><small class="${m.price24hPcnt>=0?'up':'down'}">${pct(m.price24hPcnt*100)}</small>`;r.onclick=()=>{closeModal(els.searchModal);openFocus(m.symbol)};els.searchResults.appendChild(r)});
  }

  async function setTimeframe(tf){
    state.timeframe=tf;document.querySelectorAll('#timeframePicker button').forEach(b=>b.classList.toggle('active',b.dataset.tf===tf));
    await hydrateVisibleCandles();renderBoard();connectVisibleWebSocket();
  }

  async function setCategory(category) {
    if (!['spot','linear'].includes(category) || category === state.category) return;
    state.category = category;
    state.page = 0;
    state.allMarkets = [];
    state.markets = [];
    state.qualifiedSymbols = new Set();
    state.instrumentMeta = new Map();
    state.candles.clear();
    state.books.clear();
    state.bookDensities.clear();
    state.densities = [];
    document.querySelectorAll('#marketPicker button').forEach(b=>b.classList.toggle('active',b.dataset.category===category));
    setConnection();
    await loadMarkets(true);
    await bootstrapOrderbooks();
    renderAll();
    toast(`Switched to Bybit ${marketName()}`);
  }

  function scheduleRefresh(){
    clearInterval(state.timer);
    state.timer=setInterval(async()=>{
      try {
        const json = await fetchJSON(`${API}/tickers?category=${state.category}`,5000);
        if (json?.result?.list) {
          const current = new Map(state.allMarkets.map(m=>[m.symbol,m]));
          for (const x of json.result.list.filter(x=>state.qualifiedSymbols.has(x.symbol)&&Number(x.lastPrice)>0)) {
            const n=normalizeTicker(x); current.set(n.symbol,{...(current.get(n.symbol)||{}),...n});
          }
          state.allMarkets=[...current.values()];deriveMarkets();renderCoinList();updatePager();
        }
      } catch (_) {}
      if (!state.wsConnected) connectVisibleWebSocket();
    },state.refreshSec*1000);
  }

  function wireEvents(){
    document.querySelectorAll('.coin-sort').forEach(btn => btn.addEventListener('click', () => setCoinSort(btn.dataset.coinSort)));
    document.getElementById('toggleDensity').onclick=e=>{state.showDensity=!state.showDensity;e.currentTarget.classList.toggle('active',state.showDensity);redrawCanvases()};
    document.getElementById('toggleCascade').onclick=e=>{state.showCascade=!state.showCascade;e.currentTarget.classList.toggle('active',state.showCascade);redrawCanvases()};
    document.getElementById('marketPicker').onclick=e=>{if(e.target.dataset.category)setCategory(e.target.dataset.category)};
    document.getElementById('timeframePicker').onclick=e=>{if(e.target.dataset.tf)setTimeframe(e.target.dataset.tf)};
    document.getElementById('volumeFilter').onchange=async e=>{state.minVolume=+e.target.value;state.page=0;deriveMarkets();await hydrateVisibleCandles();renderAll();connectVisibleWebSocket();await bootstrapOrderbooks()};
    document.getElementById('sortBy').onchange=async e=>{state.sortBy=e.target.value;deriveMarkets();await hydrateVisibleCandles();renderAll();connectVisibleWebSocket();await bootstrapOrderbooks()};
    document.getElementById('refreshBtn').onclick=async()=>{await loadMarkets();await bootstrapOrderbooks()};
    document.getElementById('autoSortBtn').onclick=e=>{state.autoSort=!state.autoSort;e.currentTarget.classList.toggle('active',state.autoSort);toast(`Auto-sort ${state.autoSort?'enabled':'paused'}`)};
    document.getElementById('searchBtn').onclick=()=>{renderSearch();openModal(els.searchModal);setTimeout(()=>els.coinSearchInput.focus(),30)};
    document.getElementById('settingsBtn').onclick=()=>openModal(els.settingsModal);
    document.querySelectorAll('#layoutPicker button').forEach(btn => {
      btn.onclick = () => setChartsPerPage(Number(btn.dataset.count));
    });
    document.getElementById('prevPage').onclick=async()=>{if(state.page>0){state.page--;await hydrateVisibleCandles();renderAll();connectVisibleWebSocket();await bootstrapOrderbooks()}};
    document.getElementById('nextPage').onclick=async()=>{const max=Math.ceil(state.markets.length/state.perPage)-1;if(state.page<max){state.page++;await hydrateVisibleCandles();renderAll();connectVisibleWebSocket();await bootstrapOrderbooks()}};
    document.querySelectorAll('.side-tabs button').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.side-tabs button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));document.getElementById(`${btn.dataset.tab}Tab`).classList.add('active')});
    document.querySelectorAll('.close-modal').forEach(btn=>btn.onclick=()=>closeModal(btn.closest('.modal-backdrop')));
    document.querySelectorAll('.modal-backdrop').forEach(bg=>bg.addEventListener('mousedown',e=>{if(e.target===bg)closeModal(bg)}));
    els.coinSearchInput.oninput=e=>renderSearch(e.target.value);
    els.coinSearchInput.onkeydown=e=>{if(e.key==='Enter'){els.searchResults.querySelector('.search-result')?.click()}};
    document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-backdrop.open').forEach(closeModal);if(e.key==='/'&&!['INPUT','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();document.getElementById('searchBtn').click()}});
    document.getElementById('chartsPerPage').onchange=e=>setChartsPerPage(Number(e.target.value));
    document.getElementById('showGridLines').onchange=e=>{state.showGrid=e.target.checked;redrawCanvases()};
    document.getElementById('showVolume').onchange=e=>{state.showVolume=e.target.checked;redrawCanvases()};
    document.getElementById('compactHeaders').onchange=e=>{state.compactHeaders=e.target.checked;renderBoard()};
    document.getElementById('refreshInterval').onchange=e=>{state.refreshSec=+e.target.value;scheduleRefresh()};
    document.getElementById('densityThreshold').onchange=e=>{state.densityThreshold=Math.max(0,+e.target.value||0);for(const s of state.books.keys())computeDensities(s);redrawCanvases()};
    document.getElementById('densityMaxDistance').onchange=e=>{state.densityMaxDistance=clamp(+e.target.value||4,.25,10);for(const s of state.books.keys())computeDensities(s);redrawCanvases()};
    document.getElementById('newAlertBtn').onclick=()=>openModal(els.alertModal);
    document.getElementById('saveAlertBtn').onclick=()=>{const symbol=document.getElementById('alertSymbol').value.trim().toUpperCase();const type=document.getElementById('alertType').value;const value=+document.getElementById('alertValue').value;if(!symbol||!value)return;state.alerts.unshift({id:Date.now(),symbol,type,value,active:true});renderAlerts();closeModal(els.alertModal);toast(`Alert created for ${symbol}`)};
    window.addEventListener('resize',()=>requestAnimationFrame(redrawCanvases));
    window.addEventListener('beforeunload',()=>{disconnectSocket();chartRegistry.forEach(x=>{try{x.resizeObserver?.disconnect()}catch(_){};try{x.chart?.remove()}catch(_){}});chartRegistry.clear()});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!state.wsConnected)connectVisibleWebSocket()});
  }

  async function init(){
    wireEvents();renderAlerts();setConnection();
    const tvReady = await ensureTradingViewCharts();
    await loadMarkets(true);await bootstrapOrderbooks();renderAll();scheduleRefresh();
    setTimeout(()=>toast(tvReady ? 'ScalpDeck v4.4: TradingView charts ready' : 'ScalpDeck v4.4: chart CDN blocked — canvas fallback active', !tvReady),500);
  }

  init();
})();

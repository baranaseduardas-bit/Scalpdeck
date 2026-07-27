(() => {
  'use strict';

  const API = 'https://api.bybit.com/v5/market';
  const state = {
    markets: [],
    allMarkets: [],
    candles: new Map(),
    densities: [],
    timeframe: '1',
    page: 0,
    perPage: 6,
    sortBy: 'turnover',
    minVolume: 50_000_000,
    showDensity: true,
    showCascade: true,
    showGrid: true,
    showVolume: true,
    compactHeaders: false,
    autoSort: true,
    layoutCols: 3,
    connected: false,
    refreshSec: 10,
    timer: null,
    starred: new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']),
    alerts: [
      { id: 1, type: 'price', symbol: 'BTCUSDT', value: 70000, active: true },
      { id: 2, type: 'impulse', symbol: 'SOLUSDT', value: 3, active: true },
      { id: 3, type: 'volume', symbol: 'ETHUSDT', value: 2, active: true },
    ],
  };

  const els = Object.fromEntries([
    'chartGrid','coinList','densityMap','boardCount','pageLabel','connectionBadge','sourceLabel','densityCoinLabel','alertsList','alertCount',
    'searchModal','coinSearchInput','searchResults','settingsModal','focusModal','focusGrid','focusTitle','alertModal','toastStack'
  ].map(id => [id, document.getElementById(id)]));

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

  function toast(message, hot=false) {
    const t = document.createElement('div');
    t.className = `toast${hot ? ' hot' : ''}`;
    t.textContent = message;
    els.toastStack.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  async function fetchJSON(url, timeout=4500) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(tid); }
  }

  function syntheticMarkets() {
    const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','LINKUSDT','AVAXUSDT','SUIUSDT','TONUSDT','APTUSDT','NEARUSDT','WIFUSDT','ARBUSDT','OPUSDT','INJUSDT','ENAUSDT','PEPEUSDT','FETUSDT','SEIUSDT','LTCUSDT','BCHUSDT','TRXUSDT','ATOMUSDT'];
    return symbols.map((symbol, i) => {
      const seed = Math.abs(hash(symbol));
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
      price24hPcnt: Number(x.price24hPcnt),
      highPrice24h: hi,
      lowPrice24h: lo,
      turnover24h: Number(x.turnover24h),
      volume24h: Number(x.volume24h),
      natr: Math.max(.05, range / 2.7),
      range,
      trades: Math.round(Number(x.volume24h) * .18),
      source: 'BY-F',
    };
  }

  async function loadMarkets(silent=false) {
    try {
      const json = await fetchJSON(`${API}/tickers?category=linear`);
      if (!json?.result?.list) throw new Error('Unexpected API payload');
      state.allMarkets = json.result.list
        .filter(x => x.symbol.endsWith('USDT') && Number(x.lastPrice) > 0)
        .map(normalizeTicker);
      state.connected = true;
      setConnection(true);
      if (!silent) toast('Live Bybit market feed connected');
    } catch (err) {
      if (!state.allMarkets.length) state.allMarkets = syntheticMarkets();
      state.connected = false;
      setConnection(false);
      if (!silent) toast('Live feed unavailable — using simulator');
      jitterSynthetic();
    }
    deriveMarkets();
    await hydrateVisibleCandles();
    renderAll();
  }

  function setConnection(live) {
    els.connectionBadge.classList.toggle('live', live);
    els.connectionBadge.classList.toggle('offline', !live);
    els.connectionBadge.innerHTML = `<i></i>${live ? 'live' : 'sim'}`;
    els.sourceLabel.textContent = live ? 'Bybit linear' : 'simulated feed';
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
      if (key === 'density') return pseudoDensityDistance(a) - pseudoDensityDistance(b);
      return b.turnover24h - a.turnover24h;
    });
    const stars = list.filter(m => state.starred.has(m.symbol));
    const rest = list.filter(m => !state.starred.has(m.symbol));
    state.markets = [...stars, ...rest];
    const maxPage = Math.max(0, Math.ceil(state.markets.length / state.perPage) - 1);
    state.page = Math.min(state.page, maxPage);
  }

  function pseudoDensityDistance(m) {
    return .15 + (Math.abs(hash(m.symbol)) % 350) / 100;
  }

  async function fetchCandles(symbol, tf=state.timeframe, limit=120) {
    const key = `${symbol}:${tf}`;
    try {
      if (state.connected) {
        const json = await fetchJSON(`${API}/kline?category=linear&symbol=${symbol}&interval=${tf}&limit=${limit}`, 4000);
        const rows = json?.result?.list;
        if (rows?.length) {
          const candles = rows.slice().reverse().map(r => ({ t:Number(r[0]), o:Number(r[1]), h:Number(r[2]), l:Number(r[3]), c:Number(r[4]), v:Number(r[5]) }));
          state.candles.set(key, candles);
          return candles;
        }
      }
    } catch (_) {}
    const market = state.allMarkets.find(m => m.symbol === symbol) || { lastPrice: 100 };
    const candles = generateCandles(symbol, market.lastPrice, limit, Number(tf));
    state.candles.set(key, candles);
    return candles;
  }

  function generateCandles(symbol, endPrice, count=120, tf=1) {
    const seed = Math.abs(hash(symbol + tf));
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
    const visible = visibleMarkets();
    await Promise.all(visible.map(m => fetchCandles(m.symbol)));
  }

  function visibleMarkets() {
    return state.markets.slice(state.page*state.perPage, state.page*state.perPage + state.perPage);
  }

  function renderAll() {
    renderBoard(); renderCoinList(); renderDensityMap(); renderAlerts(); updatePager();
  }

  function renderBoard() {
    const visible = visibleMarkets();
    els.chartGrid.innerHTML = '';
    els.chartGrid.style.gridTemplateColumns = `repeat(${state.layoutCols},minmax(0,1fr))`;
    const rows = Math.ceil(state.perPage / state.layoutCols);
    els.chartGrid.style.gridTemplateRows = `repeat(${rows},minmax(0,1fr))`;
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
    const direction = m.price24hPcnt >= 0 ? 'up' : 'down';
    const hotChange = Math.abs(m.price24hPcnt*100) >= 5 ? 'hot' : direction;
    card.innerHTML = `
      <div class="chart-head ${state.compactHeaders ? 'compact' : ''}">
        <span class="market-dot"></span>
        <span class="ticker">${m.symbol.replace('USDT','')}</span>
        <span class="exchange">${m.source}</span>
        <span class="metric ${hotChange}">${pct(m.price24hPcnt*100)}</span>
        <span class="metric">↕ <strong>${m.range.toFixed(1)}</strong></span>
        <span class="metric">N <strong>${m.natr.toFixed(1)}</strong></span>
        <span class="metric">V <strong>${compact(m.turnover24h)}</strong></span>
        <span class="chart-actions">
          <button class="tiny-btn star-btn" title="Watchlist">${state.starred.has(m.symbol) ? '★' : '☆'}</button>
          ${opts.focus ? '' : '<button class="tiny-btn focus-btn" title="Focus mode">⛶</button>'}
        </span>
      </div>
      <canvas class="chart-canvas"></canvas>
      <div class="chart-watermark">${m.symbol.replace('USDT','')}</div>
    `;
    card.querySelector('.star-btn')?.addEventListener('click', e => { e.stopPropagation(); toggleStar(m.symbol); });
    card.querySelector('.focus-btn')?.addEventListener('click', e => { e.stopPropagation(); openFocus(m.symbol); });
    card.addEventListener('dblclick', () => openFocus(m.symbol));
    return card;
  }

  function redrawCanvases() {
    document.querySelectorAll('.chart-card').forEach(card => {
      const m = state.allMarkets.find(x => x.symbol === card.dataset.symbol);
      const candles = state.candles.get(`${card.dataset.symbol}:${card.dataset.tf}`) || [];
      const canvas = card.querySelector('canvas');
      if (m && canvas) drawChart(canvas, candles, m);
    });
  }

  function drawChart(canvas, candles, market) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width*dpr); canvas.height = Math.round(rect.height*dpr);
    const ctx = canvas.getContext('2d'); ctx.scale(dpr,dpr);
    const w=rect.width,h=rect.height;
    ctx.clearRect(0,0,w,h);
    if (!candles.length) return;
    const pad={l:5,r:38,t:8,b:16};
    const priceH = state.showVolume ? h*.77 : h-pad.b;
    let min=Math.min(...candles.map(c=>c.l)), max=Math.max(...candles.map(c=>c.h));
    const spread=max-min || max*.01 || 1; min-=spread*.07; max+=spread*.07;
    const y=p=>pad.t+(max-p)/(max-min)*(priceH-pad.t);
    const x=i=>pad.l+i*(w-pad.l-pad.r)/(candles.length-1);
    if(state.showGrid){
      ctx.strokeStyle='#191d22';ctx.lineWidth=1;
      for(let i=1;i<5;i++){const yy=pad.t+i*(priceH-pad.t)/5;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();}
      for(let i=1;i<6;i++){const xx=pad.l+i*(w-pad.l-pad.r)/6;ctx.beginPath();ctx.moveTo(xx,pad.t);ctx.lineTo(xx,priceH);ctx.stroke();}
    }
    if(state.showDensity){
      const seed=Math.abs(hash(market.symbol));
      const levels=[
        market.lastPrice*(1+(0.004+(seed%15)/1000)),
        market.lastPrice*(1-(0.005+((seed>>3)%18)/1000))
      ];
      levels.forEach((p,i)=>{if(p<min||p>max)return;ctx.strokeStyle=i===0?'rgba(237,93,101,.75)':'rgba(57,201,129,.75)';ctx.setLineDash([3,2]);ctx.beginPath();ctx.moveTo(w*.56,y(p));ctx.lineTo(w-pad.r,y(p));ctx.stroke();ctx.setLineDash([]);ctx.font='7px sans-serif';ctx.fillStyle=i===0?'#d78991':'#79c79a';ctx.fillText(`${i===0?'R':'S'} · ${compact(200000+(seed%4_000_000))}`, w*.57, y(p)-2);});
    }
    const cw=Math.max(1,(w-pad.l-pad.r)/candles.length*.65);
    if(state.showVolume){
      const maxV=Math.max(...candles.map(c=>c.v));
      candles.forEach((c,i)=>{const xx=x(i);const vh=(c.v/maxV)*(h-priceH-4);ctx.fillStyle=c.c>=c.o?'rgba(57,201,129,.20)':'rgba(237,93,101,.20)';ctx.fillRect(xx-cw/2,h-pad.b-vh,cw,vh);});
      ctx.strokeStyle='#1c2026';ctx.beginPath();ctx.moveTo(pad.l,priceH+1);ctx.lineTo(w-pad.r,priceH+1);ctx.stroke();
    }
    candles.forEach((c,i)=>{
      const xx=x(i), up=c.c>=c.o; ctx.strokeStyle=up?'#52c97f':'#dc5b61'; ctx.fillStyle=ctx.strokeStyle; ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(xx,y(c.h));ctx.lineTo(xx,y(c.l));ctx.stroke();
      const yy=Math.min(y(c.o),y(c.c)), bh=Math.max(1,Math.abs(y(c.o)-y(c.c)));ctx.fillRect(xx-cw/2,yy,cw,bh);
    });
    if(state.showCascade){
      const idx=Math.max(12,candles.length-15-(Math.abs(hash(market.symbol))%35));const c=candles[idx];if(c){ctx.strokeStyle='#b788ff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x(idx)-7,y(c.h)-8);ctx.lineTo(x(idx),y(c.h));ctx.lineTo(x(idx)+7,y(c.h)-8);ctx.stroke();}
    }
    const last=candles[candles.length-1].c;ctx.strokeStyle='#6b737e';ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(pad.l,y(last));ctx.lineTo(w-pad.r,y(last));ctx.stroke();ctx.setLineDash([]);
    ctx.font='7px ui-monospace, monospace';ctx.fillStyle='#7d858f';ctx.textAlign='left';
    for(let i=0;i<5;i++){const p=max-i*(max-min)/4;ctx.fillText(priceFmt(p),w-pad.r+3,y(p)+2);}
    const now=new Date();ctx.fillStyle='#59616b';ctx.fillText(now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),5,h-4);
  }

  function renderCoinList() {
    els.coinList.innerHTML='';
    state.markets.slice(0,120).forEach(m=>{
      const row=document.createElement('div');row.className='coin-row';
      row.innerHTML=`<span class="coin-symbol"><b class="mini-star ${state.starred.has(m.symbol)?'starred':''}">★</b>${m.symbol.replace('USDT','')} <small>${m.source}</small></span><span class="${m.price24hPcnt>=0?'up':'down'}">${pct(m.price24hPcnt*100)}</span><span>${m.range.toFixed(1)}</span><span>${m.natr.toFixed(1)}</span><span>${compact(m.turnover24h)}</span>`;
      row.addEventListener('click',()=>openFocus(m.symbol)); els.coinList.appendChild(row);
    });
    els.boardCount.textContent=state.markets.length;
  }

  async function loadDensities() {
    const sample=visibleMarkets().slice(0,5);
    const densities=[];
    for(const m of sample){
      try{
        if(!state.connected) throw new Error('sim');
        const json=await fetchJSON(`${API}/orderbook?category=linear&symbol=${m.symbol}&limit=200`,2500);
        const bids=json?.result?.b||[], asks=json?.result?.a||[];
        const mid=m.lastPrice;
        const top=(rows,side)=>rows.map(([p,q])=>({symbol:m.symbol,side,price:+p,qty:+q,notional:+p*+q,distance:Math.abs((+p-mid)/mid*100)})).filter(x=>x.notional>=250000&&x.distance<4).sort((a,b)=>b.notional-a.notional).slice(0,3);
        densities.push(...top(bids,'bid'),...top(asks,'ask'));
      }catch(_){
        const seed=Math.abs(hash(m.symbol));
        densities.push({symbol:m.symbol,side:'ask',notional:300000+seed%8_000_000,distance:.3+(seed%250)/100},{symbol:m.symbol,side:'bid',notional:250000+(seed>>2)%5_000_000,distance:.25+((seed>>3)%260)/100});
      }
    }
    state.densities=densities.sort((a,b)=>a.distance-b.distance).slice(0,24);
    renderDensityMap();
  }

  function renderDensityMap(){
    els.densityMap.innerHTML='<div class="density-center"></div>';
    [1,2,3].forEach(n=>{['top','bottom'].forEach(pos=>{const d=document.createElement('div');d.className='density-distance';d.style[pos]=`calc(50% + ${n*14.5}%)`;if(pos==='bottom') d.style[pos]=`calc(50% + ${n*14.5}% - 9px)`;d.textContent=`${n}%`;els.densityMap.appendChild(d);});});
    const items=state.densities.length?state.densities:state.markets.slice(0,14).map((m,i)=>({symbol:m.symbol,side:i%2?'bid':'ask',notional:300000+(Math.abs(hash(m.symbol))%7_000_000),distance:.2+(i%8)*.38}));
    items.slice(0,18).forEach((d,i)=>{
      const chip=document.createElement('div');chip.className=`density-chip ${d.side}`;
      const y=50+(d.side==='ask'?-1:1)*clamp(d.distance/4*44,4,44);
      const left=4+((Math.abs(hash(d.symbol+i))%62));
      chip.style.top=`${y}%`;chip.style.left=`${left}%`;chip.innerHTML=`<b>${d.symbol.replace('USDT','')}</b> ${compact(d.notional)}`;chip.title=`${d.symbol} · ${d.side.toUpperCase()} · ${d.distance.toFixed(2)}% · ${compact(d.notional)} USDT`;
      chip.addEventListener('click',()=>openFocus(d.symbol));els.densityMap.appendChild(chip);
    });
  }

  function renderAlerts(){
    els.alertsList.innerHTML='';els.alertCount.textContent=state.alerts.filter(a=>a.active).length;
    state.alerts.forEach(a=>{
      const card=document.createElement('div');card.className='alert-card';
      const desc=a.type==='price'?`Crosses ${priceFmt(a.value)}`:a.type==='impulse'?`1m candle moves ≥ ${a.value}%`:`Volume spike ≥ ${a.value}x`;
      card.innerHTML=`<header><div><span class="alert-type">${a.type}</span> <strong>${a.symbol.replace('USDT','')}</strong></div><div class="alert-actions"><button class="toggle-alert">${a.active?'●':'○'}</button><button class="delete-alert">×</button></div></header><p>${desc}</p><p>${a.active?'Watching now':'Paused'} · local demo notification</p>`;
      card.querySelector('.toggle-alert').onclick=()=>{a.active=!a.active;renderAlerts()};
      card.querySelector('.delete-alert').onclick=()=>{state.alerts=state.alerts.filter(x=>x.id!==a.id);renderAlerts()};
      els.alertsList.appendChild(card);
    });
  }

  function updatePager(){
    const pages=Math.max(1,Math.ceil(state.markets.length/state.perPage));els.pageLabel.textContent=`${Math.min(state.page+1,pages)} / ${pages}`;
  }

  function toggleStar(symbol){
    state.starred.has(symbol)?state.starred.delete(symbol):state.starred.add(symbol);deriveMarkets();renderAll();toast(`${symbol.replace('USDT','')} ${state.starred.has(symbol)?'added to':'removed from'} watchlist`);
  }

  async function openFocus(symbol){
    const m=state.allMarkets.find(x=>x.symbol===symbol);if(!m)return;
    els.focusTitle.textContent=`${symbol} · multi-timeframe focus`;els.focusGrid.innerHTML='';
    openModal(els.focusModal);
    const tfs=['1','5','15','60'];
    await Promise.all(tfs.map(tf=>fetchCandles(symbol,tf,120)));
    tfs.forEach(tf=>{const card=makeChartCard(m,tf,{focus:true});card.querySelector('.ticker').textContent=`${symbol.replace('USDT','')} · ${tf==='60'?'1h':tf+'m'}`;els.focusGrid.appendChild(card)});
    requestAnimationFrame(redrawCanvases);
  }

  function openModal(modal){modal.classList.add('open');modal.setAttribute('aria-hidden','false')}
  function closeModal(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}

  function renderSearch(query=''){
    const q=query.trim().toUpperCase();let list=state.allMarkets.filter(m=>!q||m.symbol.includes(q)).slice(0,30);
    els.searchResults.innerHTML='';list.forEach((m,i)=>{const r=document.createElement('div');r.className=`search-result${i===0?' selected':''}`;r.innerHTML=`<strong>${m.symbol.replace('USDT','')}</strong><span class="sr-price">${priceFmt(m.lastPrice)}</span><small class="${m.price24hPcnt>=0?'up':'down'}">${pct(m.price24hPcnt*100)}</small>`;r.onclick=()=>{closeModal(els.searchModal);openFocus(m.symbol)};els.searchResults.appendChild(r)});
  }

  function setTimeframe(tf){state.timeframe=tf;document.querySelectorAll('#timeframePicker button').forEach(b=>b.classList.toggle('active',b.dataset.tf===tf));hydrateVisibleCandles().then(renderBoard)}

  function scheduleRefresh(){clearInterval(state.timer);state.timer=setInterval(async()=>{await loadMarkets(true);await loadDensities();},state.refreshSec*1000)}

  function wireEvents(){
    document.getElementById('toggleDensity').onclick=e=>{state.showDensity=!state.showDensity;e.currentTarget.classList.toggle('active',state.showDensity);redrawCanvases()};
    document.getElementById('toggleCascade').onclick=e=>{state.showCascade=!state.showCascade;e.currentTarget.classList.toggle('active',state.showCascade);redrawCanvases()};
    document.getElementById('timeframePicker').onclick=e=>{if(e.target.dataset.tf)setTimeframe(e.target.dataset.tf)};
    document.getElementById('volumeFilter').onchange=e=>{state.minVolume=+e.target.value;state.page=0;deriveMarkets();hydrateVisibleCandles().then(renderAll)};
    document.getElementById('sortBy').onchange=e=>{state.sortBy=e.target.value;deriveMarkets();hydrateVisibleCandles().then(renderAll)};
    document.getElementById('refreshBtn').onclick=async()=>{await loadMarkets();await loadDensities()};
    document.getElementById('autoSortBtn').onclick=e=>{state.autoSort=!state.autoSort;e.currentTarget.classList.toggle('active',state.autoSort);toast(`Auto-sort ${state.autoSort?'enabled':'paused'}`)};
    document.getElementById('searchBtn').onclick=()=>{renderSearch();openModal(els.searchModal);setTimeout(()=>els.coinSearchInput.focus(),30)};
    document.getElementById('settingsBtn').onclick=()=>openModal(els.settingsModal);
    document.getElementById('layoutBtn').onclick=()=>{state.layoutCols=state.layoutCols===3?2:state.layoutCols===2?4:3;renderBoard()};
    document.getElementById('prevPage').onclick=()=>{if(state.page>0){state.page--;hydrateVisibleCandles().then(renderAll)}};
    document.getElementById('nextPage').onclick=()=>{const max=Math.ceil(state.markets.length/state.perPage)-1;if(state.page<max){state.page++;hydrateVisibleCandles().then(renderAll)}};
    document.querySelectorAll('.side-tabs button').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.side-tabs button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));document.getElementById(`${btn.dataset.tab}Tab`).classList.add('active')});
    document.querySelectorAll('.close-modal').forEach(btn=>btn.onclick=()=>closeModal(btn.closest('.modal-backdrop')));
    document.querySelectorAll('.modal-backdrop').forEach(bg=>bg.addEventListener('mousedown',e=>{if(e.target===bg)closeModal(bg)}));
    els.coinSearchInput.oninput=e=>renderSearch(e.target.value);
    els.coinSearchInput.onkeydown=e=>{if(e.key==='Enter'){els.searchResults.querySelector('.search-result')?.click()}};
    document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-backdrop.open').forEach(closeModal);if(e.key==='/'&&!['INPUT','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();document.getElementById('searchBtn').click()}});
    document.getElementById('chartsPerPage').onchange=e=>{state.perPage=+e.target.value;state.page=0;renderAll()};
    document.getElementById('showGridLines').onchange=e=>{state.showGrid=e.target.checked;redrawCanvases()};
    document.getElementById('showVolume').onchange=e=>{state.showVolume=e.target.checked;redrawCanvases()};
    document.getElementById('compactHeaders').onchange=e=>{state.compactHeaders=e.target.checked;renderBoard()};
    document.getElementById('refreshInterval').onchange=e=>{state.refreshSec=+e.target.value;scheduleRefresh()};
    document.getElementById('newAlertBtn').onclick=()=>openModal(els.alertModal);
    document.getElementById('saveAlertBtn').onclick=()=>{const symbol=document.getElementById('alertSymbol').value.trim().toUpperCase();const type=document.getElementById('alertType').value;const value=+document.getElementById('alertValue').value;if(!symbol||!value)return;state.alerts.unshift({id:Date.now(),symbol,type,value,active:true});renderAlerts();closeModal(els.alertModal);toast(`Alert created for ${symbol}`)};
    window.addEventListener('resize',()=>requestAnimationFrame(redrawCanvases));
  }

  async function init(){
    wireEvents();renderAlerts();setConnection(false);await loadMarkets(true);await loadDensities();scheduleRefresh();
    setTimeout(()=>toast('Tip: double-click any chart to open Focus mode'),700);
  }

  init();
})();

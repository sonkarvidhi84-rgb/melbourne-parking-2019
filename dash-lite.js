// Minimal stand-in for the claude.ai dashboard runtime ("dash"), so the page runs locally.
(function () {
  const FILES = { bays: 'bays.csv', segments: 'segments.csv', streets: 'streets.csv', city_slots: 'city_slots.csv',
    area_hour: 'area_hour.csv', price_hour: 'price_hour.csv', prices_2019: 'prices_2019.csv' };
  for (let i = 1; i <= 12; i++) { const m = String(i).padStart(2, '0'); FILES['status_' + m] = 'status_2019_' + m + '.csv'; }
  const DATA_DIR = window.PK_DATA_DIR || '../';   // folder holding the CSV files
  // Load data/<name>.js (works from GitHub Pages, a local server, or a double-clicked file://), falling back to the .csv
  function loadCsv(name) {
    return new Promise((resolve, reject) => {
      const store = (window.PK_CSV = window.PK_CSV || {});
      if (store[name]) return resolve(store[name]);
      const sc = document.createElement('script');
      sc.src = DATA_DIR + name.replace(/\.csv$/, '.js');
      sc.onload = () => store[name] ? resolve(store[name]) : reject(new Error('empty ' + name));
      sc.onerror = () => fetch(DATA_DIR + name).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.text(); }).then(resolve, reject);
      document.head.appendChild(sc);
    });
  }
  function showError(msg) {
    let b = document.getElementById('pk-load-error');
    if (!b) { b = document.createElement('div'); b.id = 'pk-load-error'; b.style.cssText = 'margin:12px 0;padding:12px 16px;border-radius:8px;background:#7a1f1f;color:#fff;font:14px system-ui'; const r = document.getElementById('dash-root'); r.insertBefore(b, r.firstChild); }
    b.textContent = msg;
  }
  const DATA = {}, CALCS = {}, DRAWS = {}, MADE = new WeakMap();
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; runAll(); }); };
  window.dash = {
    colors: ['#2a78d6', '#eb6834', '#2d9d5b', '#9b59b6', '#c49a00', '#e0457b'],
    data(id) {
      if (CALCS[id]) {
        const c = CALCS[id]; const ins = c.inputs.map((i) => dash.data(i));
        if (ins.some((x) => x.status !== 'ok')) return { status: 'loading', data: null };
        const key = ins.map((x) => x.data);
        if (!c.key || c.key.some((k, i) => k !== key[i])) { c.val = c.fn(...key); c.key = key; }
        return { status: 'ok', data: c.val };
      }
      if (DATA[id]) return DATA[id];
      if (!FILES[id]) return { status: 'missing', data: [] };
      DATA[id] = { status: 'loading', data: [] };
      loadCsv(FILES[id])
        .then((t) => { const rows = d3.csvParse(t, (r) => { for (const k in r) if (r[k] === '') r[k] = null; return r; }); DATA[id] = { status: 'ok', data: rows }; schedule(); })
        .catch((e) => { DATA[id] = { status: 'error', data: [], message: String(e) }; console.error('Could not load ' + FILES[id], e); showError('Could not load data file "' + DATA_DIR + FILES[id] + '". Check that the data folder sits next to index.html.'); schedule(); });
      return DATA[id];
    },
    calc(id, o) { CALCS[id] = o; },
    loader() {},
    onData(fn) { fn(); },
    draw(name, fn) { if (fn === undefined) { run(name); return; } DRAWS[name] = fn; },
    refresh() {}, setLink() {}, params() { return {}; }, setParams() {}, resetParams() {}
  };
  function run(name) {
    const f = DRAWS[name]; if (!f) return;
    document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
      try {
        if (typeof f === 'function') f(el);
        else { if (!MADE.has(el)) { el.replaceChildren(); MADE.set(el, f.mount ? f.mount(el) || {} : {}); } f.update && f.update(el, MADE.get(el)); }
      } catch (e) { console.error('Drawing "' + name + '" failed', e); }
    });
  }
  function runAll() { Object.keys(DRAWS).forEach(run); }
  window.addEventListener('DOMContentLoaded', () => {
    runAll();
    let w = window.innerWidth;
    window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - w) > 20) { w = window.innerWidth; clearTimeout(window.__rz); window.__rz = setTimeout(runAll, 200); } });
  });
})();

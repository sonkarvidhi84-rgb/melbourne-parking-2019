// Minimal stand-in for the claude.ai dashboard runtime ("dash"), so the page runs locally.
(function () {
  const FILES = { bays: 'bays.csv', segments: 'segments.csv', streets: 'streets.csv', city_slots: 'city_slots.csv',
    area_hour: 'area_hour.csv', price_hour: 'price_hour.csv', prices_2019: 'prices_2019.csv', area_landuse: 'area_landuse.csv' };
  for (let i = 1; i <= 12; i++) { const m = String(i).padStart(2, '0'); FILES['status_' + m] = 'status_2019_' + m + '.csv'; }
  const DATA_DIR = window.PK_DATA_DIR || '../';   // folder holding the CSV files
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
      fetch(DATA_DIR + FILES[id]).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.text(); })
        .then((t) => { const rows = d3.csvParse(t, (r) => { for (const k in r) if (r[k] === '') r[k] = null; return r; }); DATA[id] = { status: 'ok', data: rows }; schedule(); })
        .catch((e) => { DATA[id] = { status: 'error', data: [], message: String(e) }; console.error('Could not load ' + FILES[id], e); schedule(); });
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

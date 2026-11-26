
(function () {
  const PK = window.PK = window.PK || {
    date: '2019-08-14', slot: 24, mode: 'moment', layer: 'both', sel: null,
    hmDt: 'Weekday', prDt: 'Weekday', playing: null, view: null
  };
  const DT = ['Weekday', 'Saturday', 'Sunday/holiday'];
  const HOL = new Set(['2019-01-01','2019-01-28','2019-03-11','2019-04-19','2019-04-20','2019-04-22','2019-04-25','2019-06-10','2019-11-05','2019-09-27','2019-12-25','2019-12-26']);
  PK.dayType = (iso) => { const d = new Date(iso + 'T00:00:00Z'); const w = d.getUTCDay(); return (HOL.has(iso) || w === 0) ? 2 : (w === 6 ? 1 : 0); };
  PK.slotLabel = (s) => { const m = 360 + 15 * s; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  PK.fmtDate = (iso) => d3.utcFormat('%a %-d %b %Y')(new Date(iso + 'T00:00:00Z'));
  PK.statusId = () => 'status_' + PK.date.slice(5, 7);
  PK.dayIdx = () => +PK.date.slice(8, 10) - 1;
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const LUT = new Int8Array(128).fill(0); for (let i = 0; i < 64; i++) LUT[B64.charCodeAt(i)] = i;
  PK.code = (str, i) => { if (!str) return 0; const c = str.charCodeAt((i / 3) | 0); if (c !== c) return 0; const v = LUT[c]; const p = i % 3; return p === 0 ? (v >> 4) & 3 : p === 1 ? (v >> 2) & 3 : v & 3; };
  // cache: status rows -> Map(bay -> string)
  PK._smap = new WeakMap();
  PK.statusMap = () => {
    const r = dash.data(PK.statusId());
    if (r.status !== 'ok') return null;
    let m = PK._smap.get(r.data);
    if (!m) { m = new Map(); for (const row of r.data) m.set(String(row.bay), row.s); PK._smap.set(r.data, m); }
    return m;
  };
  PK.bayState = (m, bay, slot) => m ? PK.code(m.get(String(bay)), PK.dayIdx() * 64 + (slot ?? PK.slot)) : 0; // 0 unk 1 vac 2 occ
  PK.profVal = (prof, dt, hour) => { if (!prof) return null; const c = prof.charCodeAt(dt * 16 + (hour - 6)); return (c >= 65 && c <= 85) ? (c - 65) / 20 : null; };
  PK.freeColor = d3.scaleSequential(d3.interpolateRdYlGn).domain([0, 1]);
  PK.stateFill = ['#9aa0a6', 'var(--color-ok)', 'var(--color-bad)'];
  PK.pct = d3.format('.0%');
  PK.num = d3.format(',');
  PK.hour = () => Math.floor((360 + 15 * PK.slot) / 60);
  PK.redraw = (names) => { for (const n of names || ['takeaway','timelabel','kpi-known','kpi-daytype','kpi-vacant','kpi-occ','kpi-free','kpi-typical','map','detail','daycurve','streettable']) dash.draw(n); };
  PK.select = (sel) => { PK.sel = sel; PK.redraw(['map', 'detail', 'streettable']); if (sel && PK.focus) PK.focus(sel); };

  // ---- controls (listen only)
  const q = (id) => document.getElementById(id);
  const dateEl = q('pk-date');
  if (dateEl) {
    dateEl.value = PK.date;
    dateEl.addEventListener('change', () => { if (dateEl.value && dateEl.validity.valid && dateEl.value.startsWith('2019')) { PK.date = dateEl.value; PK.redraw(); } });
    dateEl.addEventListener('blur', () => { dateEl.value = PK.date; });
  }
  const slotEl = q('pk-slot');
  if (slotEl) { slotEl.value = PK.slot; slotEl.addEventListener('input', () => { PK.slot = +slotEl.value; PK.redraw(); }); }
  const playEl = q('pk-play');
  if (playEl) playEl.addEventListener('click', () => {
    if (PK.playing) { clearInterval(PK.playing); PK.playing = null; playEl.setAttribute('aria-pressed', 'false'); return; }
    playEl.setAttribute('aria-pressed', 'true');
    PK.playing = setInterval(() => { PK.slot = (PK.slot + 1) % 64; if (slotEl) slotEl.value = PK.slot; PK.redraw(); }, 700);
  });
  const modeEl = q('pk-mode'); if (modeEl) modeEl.addEventListener('change', () => { PK.mode = modeEl.value; PK.redraw(['map', 'detail']); });
  const layerEl = q('pk-layer'); if (layerEl) layerEl.addEventListener('change', () => { PK.layer = layerEl.value; PK.redraw(['map']); });
  const hmEl = q('pk-hm-dt'); if (hmEl) hmEl.addEventListener('change', () => { PK.hmDt = hmEl.value; dash.draw('heatmap'); });
  const prEl = q('pk-pr-dt'); if (prEl) prEl.addEventListener('change', () => { PK.prDt = prEl.value; dash.draw('pricechart'); dash.draw('pricetable'); });
  const zin = q('pk-zin'), zout = q('pk-zout'), zr = q('pk-zreset');
  if (zin) zin.addEventListener('click', () => PK.zoomBy && PK.zoomBy(1.6));
  if (zout) zout.addEventListener('click', () => PK.zoomBy && PK.zoomBy(1 / 1.6));
  if (zr) zr.addEventListener('click', () => PK.zoomReset && PK.zoomReset());
})();


// ---- calcs
dash.calc('city_free', {
  title: 'Share of reporting bays free, citywide',
  description: 'vacant / (vacant + occupied) at each date and 15-minute step, plus the 2019 average for that day type and time.',
  inputs: ['city_slots'],
  fn: (city_slots) => {
    const avg = new Map();
    for (const r of city_slots) {
      const v = +r.vacant, o = +r.occupied; if (v + o === 0) continue;
      const k = r.day_type + '|' + r.time; const a = avg.get(k) || [0, 0]; a[0] += v / (v + o); a[1] += 1; avg.set(k, a);
    }
    return city_slots.filter((r) => +r.vacant + +r.occupied > 0).map((r) => {
      const v = +r.vacant, o = +r.occupied; const a = avg.get(r.day_type + '|' + r.time);
      return { date: r.date, time: r.time, day_type: r.day_type, free_pct: Math.round(1000 * v / (v + o)) / 10, typical_free_pct: Math.round(1000 * a[0] / a[1]) / 10 };
    });
  }
});
dash.calc('price_peak', {
  title: 'Peak occupancy by price band',
  description: 'For each price band and day type, the hour with the highest average share of bays occupied.',
  inputs: ['price_hour'],
  fn: (price_hour) => {
    const best = new Map();
    for (const r of price_hour) {
      const k = r.price_band + '|' + r.day_type; const v = +r.occupied_pct;
      const b = best.get(k); if (!b || v > b.peak_occupied_pct) best.set(k, { price_band: r.price_band, day_type: r.day_type, rate_per_hour: +r.rate_per_hour, bays: +r.bays, peak_occupied_pct: v, peak_hour: r.hour });
    }
    return [...best.values()];
  }
});


// ---- header, KPIs
(function () {
  const PK = window.PK;
  const cityRow = () => {
    const r = dash.data('city_free'); if (r.status !== 'ok' || !r.data) return null;
    if (!PK._cfIdx || PK._cfIdx.src !== r.data) { const m = new Map(); r.data.forEach((x, i) => m.set(x.date + '|' + x.time, i)); PK._cfIdx = { src: r.data, m }; }
    const i = PK._cfIdx.m.get(PK.date + '|' + PK.slotLabel(PK.slot)); return i == null ? null : { row: r.data[i], i };
  };
  const slotRow = () => {
    const r = dash.data('city_slots'); if (r.status !== 'ok') return null;
    if (!PK._csIdx || PK._csIdx.src !== r.data) { const m = new Map(); r.data.forEach((x, i) => m.set(x.date + '|' + x.time, i)); PK._csIdx = { src: r.data, m }; }
    const i = PK._csIdx.m.get(PK.date + '|' + PK.slotLabel(PK.slot)); return i == null ? null : { row: r.data[i], i };
  };
  const mark = (el, src, field, i) => { el.setAttribute('data-source', src); el.setAttribute('data-field', field); el.setAttribute('data-row', String(i)); };
  dash.draw('timelabel', (el) => { el.textContent = PK.slotLabel(PK.slot); });
  dash.draw('kpi-daytype', (el) => { el.textContent = PK.fmtDate(PK.date) + ' · ' + ['Weekday', 'Saturday', 'Sunday / holiday'][PK.dayType(PK.date)]; });
  dash.draw('kpi-known', (el) => { const s = slotRow(); if (!s) { el.textContent = '—'; return; } const n = +s.row.vacant + +s.row.occupied; el.textContent = PK.num(n); });
  dash.draw('kpi-vacant', (el) => { const s = slotRow(); if (!s) { el.textContent = '—'; return; } mark(el, 'city_slots', 'vacant', s.i); el.textContent = PK.num(+s.row.vacant); });
  dash.draw('kpi-occ', (el) => { const s = slotRow(); if (!s) { el.textContent = '—'; return; } mark(el, 'city_slots', 'occupied', s.i); el.textContent = PK.num(+s.row.occupied); });
  dash.draw('kpi-free', (el) => { const c = cityRow(); if (!c || c.row.free_pct == null) { el.textContent = '—'; return; } mark(el, 'city_free', 'free_pct', c.i); el.textContent = c.row.free_pct.toFixed(1); });
  dash.draw('kpi-typical', (el) => { const c = cityRow(); if (!c || c.row.typical_free_pct == null) { el.textContent = '—'; return; } const d = c.row.free_pct - c.row.typical_free_pct; el.textContent = 'typical ' + c.row.typical_free_pct.toFixed(1) + '% · ' + (d >= 0 ? '+' : '') + d.toFixed(1) + ' pts vs usual'; el.style.color = d >= 0 ? 'var(--color-ok)' : 'var(--color-warn)'; });
  dash.draw('takeaway', (el) => {
    const c = cityRow(); const s = slotRow();
    if (!c || !s || c.row.free_pct == null) { el.textContent = '—'; return; }
    const d = c.row.free_pct - c.row.typical_free_pct;
    el.textContent = `At ${PK.slotLabel(PK.slot)} on ${PK.fmtDate(PK.date)}, ${c.row.free_pct.toFixed(0)}% of the ${PK.num(+s.row.vacant + +s.row.occupied)} reporting bays were free — ${Math.abs(d) < 2 ? 'about usual' : (d > 0 ? Math.abs(d).toFixed(0) + ' points more than usual' : Math.abs(d).toFixed(0) + ' points fewer than usual')} for that day type and time.`;
  });
})();


// ---- map
(function () {
  const PK = window.PK;
  const decode = (s) => { const v = s.split(' ').map(Number); const out = []; let x = 0, y = 0; for (let i = 0; i < v.length; i += 2) { x += v[i]; y += v[i + 1]; out.push([144.9 + x / 1e5, -37.85 + y / 1e5]); } return out; };
  const KX = Math.cos(-37.81 * Math.PI / 180);
  dash.draw('map', {
    mount(el) {
      const box = el.closest('.mapbox');
      const svg = d3.select(el).append('svg').attr('role', 'img').attr('aria-label', 'Map of Melbourne street network with every 2019 parking sensor bay coloured by availability');
      const root = svg.append('g');
      const gStreets = root.append('g'), gSegs = root.append('g'), gBays = root.append('g'), gSel = root.append('g');
      const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
      const made = { svg, root, gStreets, gSegs, gBays, gSel, tip, k: 1, w: 0, h: 0, built: false };
      made.zoom = d3.zoom().scaleExtent([0.7, 60]).on('zoom', (ev) => {
        root.attr('transform', ev.transform); made.k = ev.transform.k; PK.view = ev.transform;
        const r = Math.max(1.4, 1.2 + 1.3 * Math.log2(ev.transform.k)) / ev.transform.k;
        gBays.selectAll('circle').attr('r', r);
        gSel.selectAll('circle').attr('r', r * 2.2);
      });
      svg.call(made.zoom).on('dblclick.zoom', null);
      PK.zoomBy = (f) => svg.transition().duration(300).call(made.zoom.scaleBy, f);
      PK.zoomReset = () => svg.transition().duration(400).call(made.zoom.transform, d3.zoomIdentity);
      PK.focus = (sel) => {
        if (!made.proj) return;
        let pts = [];
        if (sel.type === 'bay') { const b = made.bayById && made.bayById.get(String(sel.id)); if (b) pts = [[b.lon, b.lat]]; }
        else if (sel.type === 'seg') { (made.bays || []).forEach((b) => { if (b.seg === sel.id) pts.push([b.lon, b.lat]); }); }
        else if (sel.type === 'area') { (made.bays || []).forEach((b) => { if (b.area === sel.id) pts.push([b.lon, b.lat]); }); }
        if (!pts.length) return;
        const xy = pts.map(made.proj); const [x0, x1] = d3.extent(xy, (p) => p[0]); const [y0, y1] = d3.extent(xy, (p) => p[1]);
        const k = Math.min(sel.type === 'bay' ? 18 : 12, 0.6 * Math.min(made.w / Math.max(x1 - x0, 20), made.h / Math.max(y1 - y0, 20)));
        const t = d3.zoomIdentity.translate(made.w / 2, made.h / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
        svg.transition().duration(600).call(made.zoom.transform, t);
      };
      const showTip = (ev, html) => {
        const r = box.getBoundingClientRect();
        tip.style('display', null).selectAll('*').remove();
        html.forEach(([t, cls]) => tip.append('div').attr('class', cls || null).text(t));
        let x = ev.clientX - r.left + 12, y = ev.clientY - r.top + 12;
        const tw = tip.node().offsetWidth, th = tip.node().offsetHeight;
        if (x + tw > r.width - 4) x = ev.clientX - r.left - tw - 12; if (y + th > r.height - 4) y = ev.clientY - r.top - th - 12;
        tip.style('left', x + 'px').style('top', y + 'px');
      };
      made.showTip = showTip; made.hideTip = () => tip.style('display', 'none');
      return made;
    },
    update(el, made) {
      const B = dash.data('bays'), S = dash.data('segments'), N = dash.data('streets');
      const box = el.closest('.mapbox');
      const w = Math.max(300, box.clientWidth), h = Math.max(420, Math.min(720, Math.round(w * 0.78)));
      made.svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);
      if (B.status !== 'ok' || S.status !== 'ok' || N.status !== 'ok') return;
      if (!made.built || made.w !== w || made.h !== h) {
        made.w = w; made.h = h;
        const bays = B.data.filter((d) => d.lon !== '' && d.lon != null).map((d) => ({ ...d, lon: +d.lon, lat: +d.lat }));
        made.bays = bays; made.bayById = new Map(bays.map((b) => [String(b.bay), b]));
        const [lx0, lx1] = d3.extent(bays, (d) => d.lon), [ly0, ly1] = d3.extent(bays, (d) => d.lat);
        const pad = 16, sx = (w - 2 * pad) / ((lx1 - lx0) * KX), sy = (h - 2 * pad) / (ly1 - ly0), s = Math.min(sx, sy);
        const ox = (w - s * (lx1 - lx0) * KX) / 2, oy = (h - s * (ly1 - ly0)) / 2;
        made.proj = ([lon, lat]) => [ox + (lon - lx0) * KX * s, oy + (ly1 - lat) * s];
        const line = (pts) => 'M' + pts.map((p) => made.proj(p).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z';
        made.gStreets.selectAll('path').data(N.data).join('path')
          .attr('d', (d) => line(decode(d.path)))
          .style('fill', (d) => d.kind === 'River' ? '#9ec5e8' : (d.kind === 'Rail/Tram' ? 'var(--cds-chart-grid)' : 'var(--cds-chart-grid)'))
          .style('stroke', 'var(--cds-chart-axis)').style('stroke-width', 0.4).attr('vector-effect', 'non-scaling-stroke').style('opacity', 0.9)
          .on('mousemove', (ev, d) => made.showTip(ev, [[d.name || 'Road'], [d.kind, 'm']])).on('mouseleave', made.hideTip);
        made.gSegs.selectAll('path').data(S.data, (d) => d.seg).join('path')
          .attr('d', (d) => d.poly.split('|').map((p) => line(decode(p))).join(''))
          .style('stroke', 'var(--color-fg-muted)').style('stroke-width', 0.6).attr('vector-effect', 'non-scaling-stroke').style('cursor', 'pointer')
          .on('click', (ev, d) => { ev.stopPropagation(); PK.select({ type: 'seg', id: d.seg }); })
          .on('mousemove', (ev, d) => made.showTip(ev, made.segTip(d))).on('mouseleave', made.hideTip);
        made.gBays.selectAll('circle').data(bays, (d) => d.bay).join('circle')
          .attr('cx', (d) => made.proj([d.lon, d.lat])[0]).attr('cy', (d) => made.proj([d.lon, d.lat])[1])
          .attr('r', Math.max(1.4, 1.2 + 1.3 * Math.log2(made.k)) / made.k)
          .style('stroke', 'var(--color-panel)').style('stroke-width', 0.4).attr('vector-effect', 'non-scaling-stroke').style('cursor', 'pointer')
          .on('click', (ev, d) => { ev.stopPropagation(); PK.select({ type: 'bay', id: String(d.bay) }); })
          .on('mousemove', (ev, d) => made.showTip(ev, made.bayTip(d))).on('mouseleave', made.hideTip);
        made.built = true;
        if (PK.view) made.svg.call(made.zoom.transform, PK.view);
      }
      // colours
      const smap = PK.statusMap();
      const dt = PK.dayType(PK.date), hr = PK.hour();
      const segCount = new Map();
      for (const b of made.bays) {
        const st = PK.bayState(smap, b.bay);
        const c = segCount.get(b.seg) || [0, 0]; if (st === 1) c[0]++; if (st) c[1]++; segCount.set(b.seg, c);
      }
      PK._segCount = segCount;
      made.segTip = (d) => { const c = segCount.get(d.seg) || [0, 0]; const tv = PK.profVal(d.prof, dt, hr);
        return [[d.street + ' — ' + d.block], [d.area + ' · ' + d.bays + ' bays · est. $' + (+d.typical_rate).toFixed(2) + '/h', 'm'],
          [smap ? `Now: ${c[0]} vacant of ${c[1]} reporting` : 'Status loading…'], [tv == null ? 'Typical: no data' : 'Typical ' + PK.pct(tv) + ' free at this hour', 'm']]; };
      made.bayTip = (d) => { const st = PK.bayState(smap, d.bay); const p = PK.profVal(d.prof, dt, hr);
        const lu = PK.luRow ? PK.luRow(d.area) : null;
        return [['Bay ' + d.bay + ' · marker ' + d.marker], [d.street + ' (' + d.between1 + ' – ' + d.between2 + ')', 'm'], [d.area + (lu ? ' · ' + lu.land_use : ''), 'm'], [PK.priceText ? PK.priceText(d.bay) : ''], [d.sign || 'No sign recorded', 'm'],
          [['No reading', 'Vacant', 'Occupied'][st] + ' at ' + PK.slotLabel(PK.slot)], [p == null ? '' : 'Usually occupied ' + PK.pct(p) + ' of the time at this hour', 'm']]; };
      const LUm = PK.luMap ? PK.luMap() : null;
      const luFill = (area) => { const i = LUm && LUm.get(area); return i == null ? 'var(--cds-chart-muted)' : PK.luCol(i); };
      const showSegs = PK.layer !== 'bays', showBays = PK.layer !== 'segs';
      made.gSegs.style('display', showSegs ? null : 'none'); made.gBays.style('display', showBays ? null : 'none');
      made.gSegs.selectAll('path').style('fill', (d) => {
        let f;
        if (PK.mode === 'landuse') return luFill(d.area);
        if (PK.mode === 'price') return PK.priceSegFill ? PK.priceSegFill(d.seg) : 'var(--cds-chart-muted)';
        if (PK.mode === 'typical') f = PK.profVal(d.prof, dt, hr); else { const c = segCount.get(d.seg); f = c && c[1] ? c[0] / c[1] : null; }
        return f == null ? 'var(--cds-chart-muted)' : PK.freeColor(f);
      }).style('fill-opacity', PK.layer === 'segs' ? 0.9 : 0.45);
      made.gBays.selectAll('circle').style('fill', (d) => {
        if (PK.mode === 'landuse') return luFill(d.area);
        if (PK.mode === 'price') return PK.priceFill ? PK.priceFill(d.bay) : '#9aa0a6';
        if (PK.mode === 'typical') { const p = PK.profVal(d.prof, dt, hr); return p == null ? '#9aa0a6' : PK.freeColor(1 - p); }
        return PK.stateFill[PK.bayState(smap, d.bay)];
      });
      // selection highlight
      made.gSegs.selectAll('path').style('stroke-width', (d) => PK.sel && PK.sel.type === 'seg' && PK.sel.id === d.seg ? 3 : 0.6).style('stroke', (d) => PK.sel && PK.sel.type === 'seg' && PK.sel.id === d.seg ? 'var(--color-fg)' : 'var(--color-fg-muted)');
      const selB = PK.sel && PK.sel.type === 'bay' ? [made.bayById.get(String(PK.sel.id))].filter(Boolean) : [];
      const r = Math.max(1.4, 1.2 + 1.3 * Math.log2(made.k)) / made.k;
      made.gSel.selectAll('circle').data(selB).join('circle').attr('cx', (d) => made.proj([d.lon, d.lat])[0]).attr('cy', (d) => made.proj([d.lon, d.lat])[1]).attr('r', r * 2.2)
        .style('fill', 'none').style('stroke', 'var(--color-fg)').style('stroke-width', 2).attr('vector-effect', 'non-scaling-stroke').style('pointer-events', 'none');
    },
    unmount() { window.PK.zoomBy = null; window.PK.zoomReset = null; window.PK.focus = null; }
  });
})();


// ---- detail panel
(function () {
  const PK = window.PK;
  const lineChart = (host, series, opts) => {
    const w = Math.max(240, host.node().clientWidth || 300), h = 170, m = { t: 8, r: 10, b: 22, l: 34 };
    const svg = host.append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', opts.label);
    const x = d3.scaleLinear().domain([0, 63]).range([m.l, w - m.r]); const y = d3.scaleLinear().domain([0, 1]).range([h - m.b, m.t]);
    svg.append('g').attr('class', 'grid').selectAll('line').data([0.25, 0.5, 0.75, 1]).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y).attr('y2', y);
    svg.append('g').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues([0, 12, 24, 36, 48, 60]).tickFormat((s) => PK.slotLabel(s)).tickSizeOuter(0));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0%')).tickSizeOuter(0));
    series.forEach((s) => {
      const ln = d3.line().defined((d) => d != null).x((d, i) => x(s.xs ? s.xs[i] : i)).y((d) => y(d));
      svg.append('path').attr('d', ln(s.vals)).style('fill', 'none').style('stroke', s.color).style('stroke-width', s.width || 2).style('stroke-dasharray', s.dash || null);
    });
    svg.append('line').attr('x1', x(PK.slot)).attr('x2', x(PK.slot)).attr('y1', m.t).attr('y2', h - m.b).style('stroke', 'var(--cds-chart-reference)').style('stroke-width', 1.5);
    return svg;
  };
  dash.draw('detail', (el) => {
    el.replaceChildren();
    const host = d3.select(el);
    const B = dash.data('bays'), S = dash.data('segments');
    if (B.status !== 'ok' || S.status !== 'ok') { el.textContent = '—'; return; }
    const smap = PK.statusMap(); const dt = PK.dayType(PK.date), hr = PK.hour();
    if (!PK.sel) {
      host.append('div').attr('class', 'dt-title').text('Click a street block or a bay');
      host.append('p').attr('class', 'muted').text('Scroll or pinch to zoom, drag to pan. Each dot is one sensor bay; blocks are shaded by the share of their bays that are free. Pick a street from the list above to jump to it.');
      const counts = [0, 0, 0]; if (smap) for (const b of B.data) counts[PK.bayState(smap, b.bay)]++;
      host.append('p').attr('class', 'muted').text(smap ? `Bays shown: ${PK.num(B.data.length)}. At ${PK.slotLabel(PK.slot)}: ${PK.num(counts[1])} vacant, ${PK.num(counts[2])} occupied, ${PK.num(counts[0])} without a reading.` : 'Loading the sensor states for this month…');
      return;
    }
    if (PK.sel.type === 'bay') {
      const i = B.data.findIndex((b) => String(b.bay) === String(PK.sel.id)); if (i < 0) { el.textContent = '—'; return; }
      const b = B.data[i]; const st = PK.bayState(smap, b.bay);
      host.append('div').attr('class', 'dt-title').text(`Bay ${b.bay} · ${b.street}`);
      host.append('div').attr('class', 'muted').text(`between ${b.between1} and ${b.between2}`);
      host.append('div').style('font-size', 'var(--cds-font-size-heading)').style('color', PK.stateFill[st]).text(smap ? ['No sensor reading', 'Vacant', 'Occupied'][st] + ' at ' + PK.slotLabel(PK.slot) : 'Loading…');
      const dl = host.append('dl').attr('class', 'facts');
      const fact = (k, v, f) => { dl.append('dt').text(k); const dd = dl.append('dd').text(v); if (f) { dd.attr('data-source', 'bays').attr('data-field', f).attr('data-where', 'bay=' + encodeURIComponent(b.bay)); } };
      fact('Street marker', b.marker, 'marker'); fact('Area', b.area, 'area');
      { const lu = PK.luRow ? PK.luRow(b.area) : null; if (lu) { dl.append('dt').text('Land-use type'); dl.append('dd').attr('data-source', 'area_landuse').attr('data-field', 'land_use').attr('data-where', 'area=' + encodeURIComponent(b.area)).text(lu.land_use); } }
      fact('Sign (2019)', b.sign || '—', 'sign');
      fact('Time limit', b.limit_min ? (+b.limit_min >= 60 ? (+b.limit_min / 60) + ' h' : b.limit_min + ' min') : '—', null);
      fact('Est. 2019 rate', +b.rate > 0 ? '$' + (+b.rate).toFixed(2) + ' per hour' : 'Free (no meter)', null);
      fact('Loading zone', +b.loading_zone ? 'Yes' : 'No', null); fact('Sensor active', b.first + ' to ' + b.last, null);
      host.append('div').attr('class', 'muted').text(`This bay on ${PK.fmtDate(PK.date)}, 06:00–22:00 (green vacant, red occupied):`);
      const strip = host.append('div').attr('class', 'strip').attr('role', 'img').attr('aria-label', 'Bay status for each 15 minutes of the day');
      for (let s = 0; s < 64; s++) strip.append('div').style('background', PK.stateFill[PK.bayState(smap, b.bay, s)]).style('outline', s === PK.slot ? '2px solid var(--color-fg)' : null).attr('title', PK.slotLabel(s));
      host.append('div').attr('class', 'muted').text('How often it is free, by hour (2019 average):');
      const chart = host.append('div');
      const xs = d3.range(16).map((h) => h * 4 + 2);
      lineChart(chart, [0, 1, 2].map((t) => ({ vals: d3.range(16).map((h) => { const p = PK.profVal(b.prof, t, h + 6); return p == null ? null : 1 - p; }), xs, color: dash.colors[t], width: t === dt ? 2.5 : 1.2, dash: t === dt ? null : '3 3' })), { label: 'Share of time this bay is free by hour for weekday, Saturday and Sunday' });
      const lg = host.append('div').attr('class', 'muted');
      ['Weekday', 'Saturday', 'Sun/holiday'].forEach((n, t) => { lg.append('span').style('color', dash.colors[t]).text('● '); lg.append('span').text(n + '  '); });
      if (PK.priceDetail) PK.priceDetail(host, b);
      host.append('button').attr('class', 'pkbtn').text('Show its street block').on('click', () => PK.select({ type: 'seg', id: b.seg }));
      return;
    }
    // segment
    const si = S.data.findIndex((s) => s.seg === PK.sel.id); if (si < 0) { el.textContent = '—'; return; }
    const sg = S.data[si];
    const bays = B.data.filter((b) => b.seg === sg.seg).sort((a, b) => (parseInt(a.marker) || 0) - (parseInt(b.marker) || 0));
    let vac = 0, rep = 0; for (const b of bays) { const s = PK.bayState(smap, b.bay); if (s === 1) vac++; if (s) rep++; }
    host.append('div').attr('class', 'dt-title').append('span').attr('data-source', 'segments').attr('data-field', 'street').attr('data-row', String(si)).text(sg.street);
    host.append('div').attr('class', 'muted').text('between ' + sg.block.replace(' - ', ' and ') + ' · ' + sg.area);
    const big = host.append('div').style('font-size', 'var(--cds-font-size-heading)');
    big.text(smap ? `${vac} of ${rep} reporting bays vacant at ${PK.slotLabel(PK.slot)}` : 'Loading…');
    const dl = host.append('dl').attr('class', 'facts');
    const f = (k, v, field) => { dl.append('dt').text(k); const dd = dl.append('dd').text(v); if (field) dd.attr('data-source', 'segments').attr('data-field', field).attr('data-row', String(si)); };
    f('Sensor bays', sg.bays, 'bays'); f('Loading-zone bays', sg.loading_zone_bays, 'loading_zone_bays');
    f('Est. 2019 rate', +sg.max_rate > 0 ? (+sg.min_rate === +sg.max_rate ? '$' + (+sg.max_rate).toFixed(2) + '/h' : '$' + (+sg.min_rate).toFixed(2) + '–$' + (+sg.max_rate).toFixed(2) + '/h') : 'Free', null);
    f('Block length', sg.length_m + ' m', 'length_m');
    // day curve for this block
    const day = d3.range(64).map((s) => { let v = 0, k = 0; for (const b of bays) { const c = PK.bayState(smap, b.bay, s); if (c === 1) v++; if (c) k++; } return k ? v / k : null; });
    const typ = d3.range(16).map((h) => PK.profVal(sg.prof, dt, h + 6));
    host.append('div').attr('class', 'muted').text('Share of this block’s bays free through the day:');
    lineChart(host.append('div'), [{ vals: smap ? day : [], color: dash.colors[0] }, { vals: typ, xs: d3.range(16).map((h) => h * 4 + 2), color: 'var(--cds-chart-muted)', dash: '4 3', width: 1.5 }], { label: 'Share of bays free on this block through the selected day, with the typical pattern' });
    const lg = host.append('div').attr('class', 'muted'); lg.append('span').style('color', dash.colors[0]).text('— '); lg.append('span').text(PK.fmtDate(PK.date) + '   '); lg.append('span').text('- - typical ' + ['weekday', 'Saturday', 'Sunday/holiday'][dt]);
    if (PK.priceDetailSeg) PK.priceDetailSeg(host, bays);
    host.append('div').attr('class', 'muted').text('Bays on this block (click one):');
    const chips = host.append('div').attr('class', 'chips');
    bays.forEach((b) => chips.append('div').attr('class', 'chip').style('background', PK.stateFill[PK.bayState(smap, b.bay)]).attr('title', 'Bay ' + b.bay + ' · ' + b.marker + ' · ' + (b.sign || '')).on('click', () => PK.select({ type: 'bay', id: String(b.bay) })));
  });
})();


// ---- street picker, day curve, heatmap, price, tables
(function () {
  const PK = window.PK;
  dash.draw('streetpick', (sel) => {
    const S = dash.data('segments');
    const segs = S.status === 'ok' ? S.data.slice().sort((a, b) => d3.ascending(a.street, b.street) || d3.ascending(a.block, b.block)) : [];
    sel.replaceChildren(new Option('Choose a block…', ''), ...segs.map((s) => new Option(s.street + ' — ' + s.block, s.seg)));
    sel.value = PK.sel && PK.sel.type === 'seg' ? PK.sel.id : '';
    sel.onchange = () => { if (sel.value) PK.select({ type: 'seg', id: sel.value }); };
  });

  dash.draw('daycurve', (el) => {
    el.replaceChildren();
    const r = dash.data('city_free'); if (r.status !== 'ok' || !r.data) { el.textContent = r.status === 'error' ? 'Failed to load' : '—'; return; }
    const rows = r.data.filter((d) => d.date === PK.date);
    const w = Math.max(300, el.clientWidth), h = 230, m = { t: 10, r: 14, b: 26, l: 42 };
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', 'Citywide share of bays free through the selected day compared with the typical day');
    const x = d3.scaleLinear().domain([0, 63]).range([m.l, w - m.r]); const y = d3.scaleLinear().domain([0, 100]).range([h - m.b, m.t]);
    svg.append('g').attr('class', 'grid').selectAll('line').data([25, 50, 75, 100]).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y).attr('y2', y);
    const tv = w < 500 ? [0, 16, 32, 48, 63] : [0, 8, 16, 24, 32, 40, 48, 56, 63];
    svg.append('g').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues(tv).tickFormat((s) => PK.slotLabel(s)).tickSizeOuter(0));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => v + '%').tickSizeOuter(0));
    const xi = (d) => { const [hh, mm] = d.time.split(':').map(Number); return ((hh * 60 + mm) - 360) / 15; };
    svg.append('path').attr('d', d3.line().defined((d) => d.typical_free_pct != null).x((d) => x(xi(d))).y((d) => y(d.typical_free_pct))(rows)).style('fill', 'none').style('stroke', 'var(--cds-chart-muted)').style('stroke-dasharray', '4 3').style('stroke-width', 1.5);
    svg.append('path').attr('d', d3.line().defined((d) => d.free_pct != null).x((d) => x(xi(d))).y((d) => y(d.free_pct))(rows)).style('fill', 'none').style('stroke', dash.colors[0]).style('stroke-width', 2.2);
    svg.append('line').attr('x1', x(PK.slot)).attr('x2', x(PK.slot)).attr('y1', m.t).attr('y2', h - m.b).style('stroke', 'var(--cds-chart-reference)').style('stroke-width', 1.5);
    const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
    const dot = svg.append('circle').attr('r', 4).style('fill', dash.colors[0]).style('display', 'none');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', w - m.l - m.r).attr('height', h - m.t - m.b).style('fill', 'transparent').style('cursor', 'pointer')
      .on('mousemove', (ev) => {
        const [px] = d3.pointer(ev); const s = Math.max(0, Math.min(63, Math.round(x.invert(px)))); const d = rows.find((r) => xi(r) === s); if (!d) return;
        dot.style('display', null).attr('cx', x(s)).attr('cy', y(d.free_pct ?? 0));
        tip.style('display', null).selectAll('*').remove();
        tip.append('div').text(d.time + ' · ' + (d.free_pct == null ? 'no data' : d.free_pct.toFixed(1) + '% free'));
        tip.append('div').attr('class', 'm').text('typical ' + (d.typical_free_pct ?? 0).toFixed(1) + '% · click to jump the map here');
        const bw = el.clientWidth; let lx = x(s) / w * bw + 10; if (lx > bw - 200) lx -= 220; tip.style('left', lx + 'px').style('top', '8px');
      })
      .on('mouseleave', () => { tip.style('display', 'none'); dot.style('display', 'none'); })
      .on('click', (ev) => { const [px] = d3.pointer(ev); PK.slot = Math.max(0, Math.min(63, Math.round(x.invert(px)))); const se = document.getElementById('pk-slot'); if (se) se.value = PK.slot; PK.redraw(); });
  });

  dash.draw('heatmap', (el) => {
    el.replaceChildren();
    const r = dash.data('area_hour'); if (r.status !== 'ok') { el.textContent = r.status === 'error' ? 'Failed to load' : '—'; return; }
    const rows = r.data.filter((d) => d.day_type === PK.hmDt);
    const hours = d3.range(6, 22).map((h) => String(h).padStart(2, '0') + ':00');
    const byArea = d3.group(rows, (d) => d.area);
    const areas = [...byArea.keys()].sort((a, b) => { const g = (k) => { const x = byArea.get(k).find((d) => d.hour === '12:00'); return x ? +x.free_pct : 101; }; return g(a) - g(b); });
    const w = Math.max(320, el.clientWidth); const ml = 120, mt = 22, cw = (w - ml - 8) / hours.length, ch = 18; const h = mt + areas.length * ch + 6;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', 'Heatmap of average share of bays free by sensor area and hour');
    svg.append('g').selectAll('text').data(hours).join('text').attr('x', (d, i) => ml + i * cw + cw / 2).attr('y', 14).attr('text-anchor', 'middle').text((d, i) => (w < 560 && i % 2) ? '' : d.slice(0, 2));
    const rowsG = svg.append('g').selectAll('g').data(areas).join('g').attr('transform', (d, i) => `translate(0,${mt + i * ch})`).style('cursor', 'pointer')
      .on('click', (ev, a) => { if (PK.focus) PK.focus({ type: 'area', id: a }); const m = document.getElementById('map'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    rowsG.append('text').attr('x', ml - 6).attr('y', ch / 2 + 4).attr('text-anchor', 'end').text((d) => d);
    const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
    rowsG.selectAll('rect').data((a) => hours.map((hh) => byArea.get(a).find((d) => d.hour === hh) || { area: a, hour: hh, free_pct: null })).join('rect')
      .attr('x', (d) => ml + hours.indexOf(d.hour) * cw + 0.5).attr('y', 0.5).attr('width', cw - 1).attr('height', ch - 1).attr('rx', 2)
      .style('fill', (d) => d.free_pct == null || d.free_pct === '' ? 'var(--cds-chart-muted)' : PK.freeColor(+d.free_pct / 100))
      .on('mousemove', (ev, d) => { const [px, py] = d3.pointer(ev, el); tip.style('display', null).selectAll('*').remove(); tip.append('div').text(d.area + ' · ' + d.hour); tip.append('div').attr('class', 'm').text(d.free_pct == null ? 'no data' : (+d.free_pct).toFixed(0) + '% of bays free · ~' + Math.round(+d.avg_reporting_bays) + ' bays reporting'); let lx = px + 12; if (lx > el.clientWidth - 220) lx = px - 220; tip.style('left', lx + 'px').style('top', (py + 10) + 'px'); })
      .on('mouseleave', () => tip.style('display', 'none'));
    rowsG.append('rect').attr('class', 'lu-dot').attr('x', 2).attr('y', ch / 2 - 4).attr('width', 8).attr('height', 8).attr('rx', 2).style('fill', (a) => (PK.luColor ? PK.luColor(a) : 'none'));
  });

  dash.draw('pricechart', (el) => {
    el.replaceChildren();
    const r = dash.data('price_hour'); if (r.status !== 'ok') { el.textContent = r.status === 'error' ? 'Failed to load' : '—'; return; }
    const rows = r.data.filter((d) => d.day_type === PK.prDt);
    const bands = [...d3.group(rows, (d) => d.price_band).entries()].sort((a, b) => +b[1][0].rate_per_hour - +a[1][0].rate_per_hour);
    const w = Math.max(300, el.clientWidth), h = 250, m = { t: 10, r: 12, b: 26, l: 40 };
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', 'Average occupancy by hour for each estimated price band');
    const x = d3.scaleLinear().domain([6, 21]).range([m.l, w - m.r]); const y = d3.scaleLinear().domain([0, 100]).range([h - m.b, m.t]);
    svg.append('g').attr('class', 'grid').selectAll('line').data([25, 50, 75, 100]).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y).attr('y2', y);
    svg.append('g').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(w < 420 ? 4 : 8).tickFormat((v) => String(v).padStart(2, '0') + ':00').tickSizeOuter(0));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => v + '%').tickSizeOuter(0));
    bands.forEach(([b, rs], i) => {
      svg.append('path').attr('d', d3.line().x((d) => x(+d.hour.slice(0, 2))).y((d) => y(+d.occupied_pct))(rs)).style('fill', 'none').style('stroke', dash.colors[i % dash.colors.length]).style('stroke-width', 2);
    });
    const leg = d3.select(el).append('div').attr('class', 'muted').style('display', 'flex').style('flex-wrap', 'wrap').style('gap', '4px 14px');
    bands.forEach(([b], i) => { const s = leg.append('span'); s.append('span').style('color', dash.colors[i % dash.colors.length]).text('● '); s.append('span').text(b); });
    const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', w - m.l - m.r).attr('height', h - m.t - m.b).style('fill', 'transparent')
      .on('mousemove', (ev) => { const [px] = d3.pointer(ev); const hh = Math.round(x.invert(px)); const lab = String(hh).padStart(2, '0') + ':00';
        tip.style('display', null).selectAll('*').remove(); tip.append('div').text(lab + ' · ' + PK.prDt);
        bands.forEach(([b, rs], i) => { const d = rs.find((q) => q.hour === lab); if (d) { const row = tip.append('div').attr('class', 'm'); row.append('span').style('color', dash.colors[i % dash.colors.length]).text('● '); row.append('span').text(b + ': ' + (+d.occupied_pct).toFixed(0) + '% occupied'); } });
        const bw = el.clientWidth; let lx = x(hh) / w * bw + 10; if (lx > bw - 240) lx -= 260; tip.style('left', lx + 'px').style('top', '8px'); })
      .on('mouseleave', () => tip.style('display', 'none'));
  });

  dash.draw('pricetable', (tb) => {
    const r = dash.data('price_peak'); tb.replaceChildren(); if (r.status !== 'ok' || !r.data) return;
    r.data.filter((d) => d.day_type === PK.prDt).sort((a, b) => b.rate_per_hour - a.rate_per_hour).forEach((d) => {
      const tr = document.createElement('tr'); tr.setAttribute('data-key', encodeURIComponent(d.price_band) + ',' + encodeURIComponent(d.day_type));
      [d.price_band, d.rate_per_hour.toFixed(2), PK.num(d.bays), d.peak_occupied_pct.toFixed(1), d.peak_hour].forEach((v, i) => { const td = document.createElement('td'); if (i) td.className = 'n'; td.textContent = v; tr.appendChild(td); });
      tb.appendChild(tr);
    });
  });
  dash.draw('ratetable', (tb) => {
    const r = dash.data('prices_2019'); tb.replaceChildren(); if (r.status !== 'ok') return;
    r.data.forEach((d) => { const tr = document.createElement('tr'); [d.price_band, (+d.rate_per_hour).toFixed(2), d.applies_to].forEach((v, i) => { const td = document.createElement('td'); if (i === 1) td.className = 'n'; if (i === 2) td.style.whiteSpace = 'normal'; td.textContent = v; tr.appendChild(td); }); tb.appendChild(tr); });
  });

  dash.draw('streettable', (tb) => {
    const S = dash.data('segments'); tb.replaceChildren(); if (S.status !== 'ok') return;
    const B = dash.data('bays'); const smap = PK.statusMap();
    const cnt = new Map(); if (B.status === 'ok' && smap) for (const b of B.data) { if (!b.seg) continue; const s = PK.bayState(smap, b.bay); const c = cnt.get(b.seg) || [0, 0]; if (s === 1) c[0]++; if (s) c[1]++; cnt.set(b.seg, c); }
    const rows = S.data.map((s) => ({ s, c: cnt.get(s.seg) || [0, 0] })).sort((a, b) => b.c[0] - a.c[0] || d3.ascending(a.s.street, b.s.street));
    rows.forEach(({ s, c }) => {
      const tr = document.createElement('tr'); tr.setAttribute('data-key', encodeURIComponent(s.seg)); if (PK.sel && PK.sel.type === 'seg' && PK.sel.id === s.seg) tr.className = 'on';
      const f = c[1] ? c[0] / c[1] : null;
      const cells = [s.street, s.block, s.area, (+s.typical_rate).toFixed(2), s.bays, smap ? c[0] : '…', smap ? c[1] : '…'];
      cells.forEach((v, i) => { const td = document.createElement('td'); if (i >= 3) td.className = 'n'; td.textContent = v; tr.appendChild(td); });
      const td = document.createElement('td'); const bar = document.createElement('span'); bar.className = 'bar'; bar.style.width = (f == null ? 0 : Math.max(2, f * 60)) + 'px'; bar.style.background = f == null ? 'transparent' : PK.freeColor(f); td.appendChild(bar); td.appendChild(document.createTextNode(f == null ? '—' : PK.pct(f))); tr.appendChild(td);
      tr.addEventListener('click', () => { PK.select({ type: 'seg', id: s.seg }); const m = document.getElementById('map'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      tb.appendChild(tr);
    });
  });
})();

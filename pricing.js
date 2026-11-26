// ---- parking price by time: per-bay schedule from the 2019 sign, map colouring, bay/block detail, price section
(function () {
  const PK = window.PK;
  // Victorian public holidays 2019 (same list the dashboard uses for day types)
  const HOL = new Set(['2019-01-01', '2019-01-28', '2019-03-11', '2019-04-19', '2019-04-20', '2019-04-22', '2019-04-25', '2019-06-10', '2019-09-27', '2019-11-05', '2019-12-25', '2019-12-26']);
  const BANDS = [
    { r: 0, label: 'Free', col: '#c9ced6' },
    { r: 2.2, label: '$2.20/h', col: '#fdd49e' },
    { r: 2.5, label: '$2.50/h', col: '#fdae6b' },
    { r: 4, label: '$4.00/h', col: '#e6550d' },
    { r: 7, label: '$7.00/h', col: '#7f2704' }
  ];
  PK.priceBands = BANDS;
  PK.bandOf = (r) => (r <= 0 ? 0 : r <= 2.2 ? 1 : r <= 2.5 ? 2 : r <= 4 ? 3 : 4);
  PK.priceCol = (r) => BANDS[PK.bandOf(r)].col;
  PK.priceDt = PK.priceDt || 'weekday';
  const DAYN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const money = (r) => '$' + (+r).toFixed(2);
  const hm = (m) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

  // ---- schedule lookup
  let IDX = null;
  const idx = () => {
    const d = dash.data('bay_price');
    if (d.status !== 'ok') return null;
    if (!IDX || IDX.src !== d.data) {
      const m = new Map();
      d.data.forEach((r) => m.set(String(r.bay), {
        rate: +r.rate || 0, days: r.days || '1111111', hasDays: String(r.has_days) === '1',
        st: r.start_min == null || r.start_min === '' ? null : +r.start_min,
        en: r.end_min == null || r.end_min === '' ? null : +r.end_min,
        rule: r.rule, assumed: String(r.assumed) === '1'
      }));
      IDX = { src: d.data, m };
    }
    return IDX.m;
  };
  PK.priceRow = (bay) => { const m = idx(); return m ? m.get(String(bay)) || null : null; };
  // day key: 0..6 = Mon..Sun, 'hol' = public holiday
  PK.dayKeyOf = (iso) => { if (HOL.has(iso)) return 'hol'; const w = new Date(iso + 'T00:00:00Z').getUTCDay(); return (w + 6) % 7; };
  PK.rateAt = (p, dk, minute) => {
    if (!p || p.rate <= 0 || p.st == null) return 0;
    if (dk === 'hol') { if (p.hasDays) return 0; } else if (p.days[dk] !== '1') return 0;
    return minute >= p.st && minute < p.en ? p.rate : 0;
  };
  PK.minuteNow = () => 360 + 15 * PK.slot;
  PK.priceFill = (bay) => { const p = PK.priceRow(bay); return p ? PK.priceCol(PK.rateAt(p, PK.dayKeyOf(PK.date), PK.minuteNow())) : '#9aa0a6'; };
  let SEGB = null;
  const segBays = () => {
    const B = dash.data('bays'); if (B.status !== 'ok') return null;
    if (!SEGB || SEGB.src !== B.data) { const m = new Map(); B.data.forEach((b) => { if (!b.seg) return; if (!m.has(b.seg)) m.set(b.seg, []); m.get(b.seg).push(String(b.bay)); }); SEGB = { src: B.data, m }; }
    return SEGB.m;
  };
  PK.priceSegFill = (seg) => {
    const m = segBays(); const list = m && m.get(seg); if (!list || !idx()) return 'var(--cds-chart-muted)';
    const dk = PK.dayKeyOf(PK.date), t = PK.minuteNow();
    const rs = list.map((b) => PK.rateAt(PK.priceRow(b), dk, t));
    return PK.priceCol(d3.max(rs) || 0);
  };
  PK.priceText = (bay) => {
    const p = PK.priceRow(bay); if (!p) return '';
    const r = PK.rateAt(p, PK.dayKeyOf(PK.date), PK.minuteNow());
    return r > 0 ? 'Price now: ' + money(r) + ' per hour' : 'Price now: free' + (p.rate > 0 ? ' (meter not running)' : '');
  };
  PK.describeSchedule = (p) => {
    if (!p) return 'No schedule recorded.';
    if (p.rate <= 0) return 'No fee (' + p.rule.toLowerCase() + ').';
    let days = '';
    if (p.days === '1111111') days = 'every day'; else if (p.days === '1111110') days = 'Mon–Sat'; else if (p.days === '1111100') days = 'Mon–Fri';
    else days = DAYN.filter((d, i) => p.days[i] === '1').join(', ');
    return money(p.rate) + ' per hour, ' + days + ' ' + hm(p.st) + '–' + hm(p.en) + '. Free at other times' +
      (p.hasDays ? ' and on public holidays.' : '; the sign names no days, so it also applies on public holidays.') +
      (p.assumed ? ' (Hours assumed: the 2019 sign text was blank.)' : '');
  };

  // ---- day profile chart (00:00-24:00, 15-min steps) used in the detail panel
  const DK = [
    { k: 0, label: 'Weekday' }, { k: 5, label: 'Saturday' }, { k: 6, label: 'Sunday' }, { k: 'hol', label: 'Public holiday' }
  ];
  const profile = (rateFn) => d3.range(97).map((i) => rateFn(Math.min(i * 15, 1439)));
  const stepChart = (host, series, maxR, label) => {
    const w = Math.max(240, host.node().clientWidth || 300), h = 150, m = { t: 8, r: 18, b: 22, l: 40 };
    const svg = host.append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', label);
    const x = d3.scaleLinear().domain([0, 1440]).range([m.l, w - m.r]);
    const y = d3.scaleLinear().domain([0, Math.max(1, maxR)]).nice().range([h - m.b, m.t]);
    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(3)).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y).attr('y2', y);
    svg.append('g').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues([0, 360, 720, 1080, 1440]).tickFormat((v) => (v === 1440 ? '24:00' : hm(v))).tickSizeOuter(0));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickFormat((v) => '$' + v).tickSizeOuter(0));
    series.forEach((s) => {
      svg.append('path').attr('d', d3.line().curve(d3.curveStepAfter).x((d, i) => x(i * 15)).y((d) => y(d))(s.vals))
        .style('fill', 'none').style('stroke', s.color).style('stroke-width', s.width || 2).style('stroke-dasharray', s.dash || null);
    });
    svg.append('line').attr('x1', x(PK.minuteNow())).attr('x2', x(PK.minuteNow())).attr('y1', m.t).attr('y2', h - m.b).style('stroke', 'var(--cds-chart-reference)').style('stroke-width', 1.5);
  };
  const legendRow = (host, series) => {
    const lg = host.append('div').attr('class', 'muted');
    series.forEach((s) => { lg.append('span').style('color', s.color).text(s.dash ? '- - ' : '— '); lg.append('span').text(s.label + '   '); });
  };
  PK.priceDetail = (host, b) => {
    const p = PK.priceRow(b.bay); if (!p) return;
    const dkNow = PK.dayKeyOf(PK.date);
    host.append('div').attr('class', 'muted').text('Price through the day (2019 sign: ' + (b.sign || 'blank') + '):');
    host.append('div').style('font-size', 'var(--cds-font-size-caption)').text(PK.describeSchedule(p));
    const today = { label: PK.fmtDate(PK.date), vals: profile((t) => PK.rateAt(p, dkNow, t)), color: dash.colors[0], width: 2.5 };
    const same = (k) => k === dkNow || (k === 0 && typeof dkNow === 'number' && dkNow < 5);
    const others = DK.filter((d) => !same(d.k)).map((d, i) => ({ label: d.label, vals: profile((t) => PK.rateAt(p, d.k, t)), color: dash.colors[(i + 1) % dash.colors.length], width: 1.2, dash: '3 3' }));
    const series = [today, ...others];
    stepChart(host.append('div'), series, d3.max(series, (s) => d3.max(s.vals)), 'Hourly parking price of this bay through the day');
    legendRow(host, series);
  };
  PK.priceDetailSeg = (host, bays) => {
    if (!idx()) return;
    const dkNow = PK.dayKeyOf(PK.date);
    const avg = (dk) => profile((t) => d3.mean(bays, (b) => PK.rateAt(PK.priceRow(b.bay), dk, t)) || 0);
    const series = [{ label: PK.fmtDate(PK.date), vals: avg(dkNow), color: dash.colors[0], width: 2.5 },
      ...DK.filter((d) => !(d.k === dkNow || (d.k === 0 && typeof dkNow === 'number' && dkNow < 5))).map((d, i) => ({ label: d.label, vals: avg(d.k), color: dash.colors[(i + 1) % dash.colors.length], width: 1.2, dash: '3 3' }))];
    host.append('div').attr('class', 'muted').text('Average hourly price of this block’s bays through the day:');
    stepChart(host.append('div'), series, d3.max(series, (s) => d3.max(s.vals)), 'Average hourly price of the bays on this block through the day');
    legendRow(host, series);
  };

  // ---- legends and controls (listen; set hidden/style/value only)
  document.querySelectorAll('[data-price-band]').forEach((sw) => { sw.style.background = BANDS[+sw.getAttribute('data-price-band')].col; });
  const syncLegends = () => {
    const mode = PK.mode;
    document.querySelectorAll('#map-legend').forEach((e) => { e.hidden = mode === 'landuse' || mode === 'price'; });
    document.querySelectorAll('#map-legend-lu').forEach((e) => { e.hidden = mode !== 'landuse'; });
    document.querySelectorAll('#map-legend-price').forEach((e) => { e.hidden = mode !== 'price'; });
  };
  PK.syncLegends = syncLegends;
  document.querySelectorAll('#pk-mode').forEach((sel) => sel.addEventListener('change', () => setTimeout(syncLegends, 0)));
  document.querySelectorAll('#pk-show-landuse').forEach((b) => b.addEventListener('click', () => setTimeout(syncLegends, 0)));
  syncLegends();
  document.querySelectorAll('#pk-price-dt').forEach((sel) => {
    sel.value = PK.priceDt;
    sel.addEventListener('change', () => { PK.priceDt = sel.value; ['price-takeaway', 'pricestack', 'priceavg'].forEach((n) => dash.draw(n)); });
  });
  document.querySelectorAll('#pk-show-price').forEach((b) => b.addEventListener('click', () => {
    PK.mode = 'price';
    document.querySelectorAll('#pk-mode').forEach((s) => { s.value = 'price'; });
    syncLegends(); PK.redraw(['map', 'detail']);
    const m = document.getElementById('map'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  if (!PK._priceWrapped) {
    const orig = PK.redraw;
    PK.redraw = (names) => { orig(names); if (!names) { dash.draw('pricestack'); dash.draw('priceavg'); } };
    PK._priceWrapped = true;
  }
})();

// ---- calcs
dash.calc('price_slots', {
  title: 'Sensor bays charging each price, every 15 minutes',
  description: 'From each bay’s 2019 sign: number of bays charging each hourly rate at each 15-minute step, for a weekday (Monday), Saturday, Sunday and a public holiday. Signs that name days do not apply on public holidays.',
  inputs: ['bay_price'],
  fn: (bay_price) => {
    const DTS = [['weekday', 0], ['saturday', 5], ['sunday', 6], ['holiday', 'hol']];
    const bands = ['Free', '$2.20/h', '$2.50/h', '$4.00/h', '$7.00/h'];
    const bandOf = (r) => (r <= 0 ? 0 : r <= 2.2 ? 1 : r <= 2.5 ? 2 : r <= 4 ? 3 : 4);
    const P = bay_price.map((r) => ({ rate: +r.rate || 0, days: r.days || '1111111', hasDays: String(r.has_days) === '1',
      st: r.start_min == null || r.start_min === '' ? null : +r.start_min, en: r.end_min == null || r.end_min === '' ? null : +r.end_min }));
    const at = (p, dk, t) => { if (p.rate <= 0 || p.st == null) return 0; if (dk === 'hol') { if (p.hasDays) return 0; } else if (p.days[dk] !== '1') return 0; return t >= p.st && t < p.en ? p.rate : 0; };
    const out = [];
    for (const [dt, dk] of DTS) {
      for (let i = 0; i < 96; i++) {
        const t = i * 15; const c = [0, 0, 0, 0, 0];
        for (const p of P) c[bandOf(at(p, dk, t))]++;
        const time = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
        c.forEach((n, j) => out.push({ day_type: dt, time, band: bands[j], bays: n }));
      }
    }
    return out;
  }
});

dash.calc('price_landuse', {
  title: 'Average hourly price by land-use type, every 15 minutes',
  description: 'Mean hourly price of the sensor bays in each land-use type (free bays count as $0), from each bay’s 2019 sign, for a weekday, Saturday, Sunday and a public holiday.',
  inputs: ['bay_price', 'bays', 'area_landuse'],
  fn: (bay_price, bays, area_landuse) => {
    const lu = new Map(area_landuse.map((r) => [r.area, r]));
    const area = new Map(bays.map((b) => [String(b.bay), b.area]));
    const DTS = [['weekday', 0], ['saturday', 5], ['sunday', 6], ['holiday', 'hol']];
    const groups = new Map();
    for (const r of bay_price) {
      const t = lu.get(area.get(String(r.bay))); if (!t) continue;
      const p = { rate: +r.rate || 0, days: r.days || '1111111', hasDays: String(r.has_days) === '1',
        st: r.start_min == null || r.start_min === '' ? null : +r.start_min, en: r.end_min == null || r.end_min === '' ? null : +r.end_min };
      if (!groups.has(t.land_use)) groups.set(t.land_use, { order: +t.land_use_order, list: [] });
      groups.get(t.land_use).list.push(p);
    }
    const at = (p, dk, t) => { if (p.rate <= 0 || p.st == null) return 0; if (dk === 'hol') { if (p.hasDays) return 0; } else if (p.days[dk] !== '1') return 0; return t >= p.st && t < p.en ? p.rate : 0; };
    const out = [];
    for (const [name, g] of groups) for (const [dt, dk] of DTS) for (let i = 0; i < 96; i++) {
      const t = i * 15; let s = 0; for (const p of g.list) s += at(p, dk, t);
      out.push({ land_use: name, land_use_order: g.order, day_type: dt, time: String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'), avg_price: Math.round(100 * s / g.list.length) / 100, bays: g.list.length });
    }
    return out.sort((a, b) => a.land_use_order - b.land_use_order);
  }
});

dash.calc('price_schedules', {
  title: 'When paid bays charge',
  description: 'Paid sensor bays grouped by hourly rate, days and hours charged, read from their 2019 signs.',
  inputs: ['bay_price'],
  fn: (bay_price) => {
    const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    const dl = (d) => (d === '1111111' ? 'Every day' : d === '1111110' ? 'Mon–Sat' : d === '1111100' ? 'Mon–Fri' : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].filter((x, i) => d[i] === '1').join(', '));
    const g = new Map();
    for (const r of bay_price) {
      const rate = +r.rate || 0; if (rate <= 0 || r.start_min == null || r.start_min === '') continue;
      const k = [rate, r.days, r.start_min, r.end_min, r.has_days].join('|');
      const a = g.get(k) || { rate_per_hour: rate, days: dl(r.days), hours: hm(+r.start_min) + '–' + hm(+r.end_min), public_holidays: String(r.has_days) === '1' ? 'Free' : 'Charged', hours_per_week: 0, bays: 0 };
      a.bays += 1; a.hours_per_week = Math.round(((+r.end_min - +r.start_min) / 60) * [...String(r.days)].filter((c) => c === '1').length * 10) / 10; g.set(k, a);
    }
    return [...g.values()].map((a) => ({ ...a, schedule: a.rate_per_hour.toFixed(2) + ' ' + a.days + ' ' + a.hours })).sort((a, b) => b.bays - a.bays);
  }
});

(function () {
  const PK = window.PK;
  const DTL = { weekday: 'weekdays', saturday: 'Saturdays', sunday: 'Sundays', holiday: 'public holidays' };
  const xi = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  const hm = (m) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const placeTip = (el, tip, px) => { const bw = el.clientWidth; let lx = px + 12; const tw = tip.node().offsetWidth || 220; if (lx + tw > bw - 4) lx = px - tw - 12; tip.style('left', Math.max(0, lx) + 'px').style('top', '8px'); };

  dash.draw('price-takeaway', (el) => {
    el.replaceChildren();
    const r = dash.data('price_slots'); if (r.status !== 'ok' || !r.data) { el.textContent = '—'; return; }
    const rows = r.data.filter((d) => d.day_type === PK.priceDt);
    const paid = d3.rollups(rows.filter((d) => d.band !== 'Free'), (v) => d3.sum(v, (d) => d.bays), (d) => d.time).map(([time, n]) => ({ time, n })).sort((a, b) => xi(a.time) - xi(b.time));
    const total = d3.sum(rows.filter((d) => d.time === '00:00'), (d) => d.bays);
    const peak = paid.reduce((a, b) => (b.n > a.n ? b : a), { n: 0, time: '' });
    if (!peak.n) { el.textContent = 'On ' + DTL[PK.priceDt] + ', none of the ' + d3.format(',')(total) + ' sensor bays charge a fee: signs that name days of the week do not apply.'; return; }
    const first = paid.find((d) => d.n > 0), last = [...paid].reverse().find((d) => d.n > 0);
    const at19 = paid.find((d) => d.time === '19:00');
    el.textContent = `On ${DTL[PK.priceDt]}, meters start at ${first.time}. At the peak (${peak.time}) ${d3.format(',')(peak.n)} of the ${d3.format(',')(total)} sensor bays charge a fee. ` +
      (at19 ? `By 19:00 only ${d3.format(',')(at19.n)} still charge, ` : '') + `and from ${hm(xi(last.time) + 15)} every bay is free until the next morning.`;
  });

  dash.draw('pricestack', (el) => {
    el.replaceChildren();
    const r = dash.data('price_slots'); if (r.status !== 'ok' || !r.data) { el.textContent = r.status === 'error' ? 'Failed to load' : '—'; return; }
    const rows = r.data.filter((d) => d.day_type === PK.priceDt);
    const bands = PK.priceBands;
    const times = [...new Set(rows.map((d) => d.time))].sort((a, b) => xi(a) - xi(b));
    const wide = times.map((t) => { const o = { t: xi(t), time: t }; rows.filter((d) => d.time === t).forEach((d) => { o[d.band] = d.bays; }); return o; });
    const keys = bands.slice().reverse().map((b) => b.label); // free on top
    const stack = d3.stack().keys(keys)(wide);
    const w = Math.max(300, el.clientWidth), h = 260, m = { t: 10, r: 20, b: 26, l: 48 };
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', 'Number of sensor bays charging each hourly price through the day');
    const x = d3.scaleLinear().domain([0, 1440]).range([m.l, w - m.r]);
    const y = d3.scaleLinear().domain([0, d3.max(wide, (d) => d3.sum(keys, (k) => d[k] || 0)) || 1]).nice().range([h - m.b, m.t]);
    const col = (k) => bands.find((b) => b.label === k).col;
    svg.append('g').selectAll('path').data(stack).join('path').attr('d', d3.area().curve(d3.curveStepAfter).x((d) => x(d.data.t)).y0((d) => y(d[0])).y1((d) => y(d[1]))).style('fill', (s) => col(s.key)).style('opacity', 0.95);
    svg.append('g').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues(d3.range(0, 1441, w < 500 ? 360 : 180)).tickFormat((v) => (v >= 1440 ? '24:00' : hm(v))).tickSizeOuter(0));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(',')).tickSizeOuter(0));
    const now = PK.minuteNow();
    svg.append('line').attr('x1', x(now)).attr('x2', x(now)).attr('y1', m.t).attr('y2', h - m.b).style('stroke', 'var(--cds-chart-reference)').style('stroke-width', 1.5);
    const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
    const guide = svg.append('line').attr('y1', m.t).attr('y2', h - m.b).style('stroke', 'var(--color-fg)').style('display', 'none');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', w - m.l - m.r).attr('height', h - m.t - m.b).style('fill', 'transparent').style('cursor', 'pointer')
      .on('mousemove', (ev) => {
        const [px] = d3.pointer(ev); const t = Math.max(0, Math.min(1425, Math.round(x.invert(px) / 15) * 15)); const d = wide.find((q) => q.t === t); if (!d) return;
        guide.style('display', null).attr('x1', x(t)).attr('x2', x(t));
        tip.style('display', null).selectAll('*').remove();
        tip.append('div').text(d.time + ' · ' + DTL[PK.priceDt]);
        bands.slice().reverse().forEach((b) => { const row = tip.append('div').attr('class', 'm'); row.append('span').style('color', b.col).text('■ '); row.append('span').text(b.label + ': ' + d3.format(',')(d[b.label] || 0) + ' bays'); });
        if (t >= 360 && t < 1320) tip.append('div').attr('class', 'm').text('Click to set the map to this time');
        placeTip(el, tip, x(t) / w * el.clientWidth);
      })
      .on('mouseleave', () => { tip.style('display', 'none'); guide.style('display', 'none'); })
      .on('click', (ev) => {
        const [px] = d3.pointer(ev); const t = Math.round(x.invert(px) / 15) * 15; if (t < 360 || t >= 1320) return;
        PK.slot = (t - 360) / 15; document.querySelectorAll('#pk-slot').forEach((s) => { s.value = PK.slot; }); PK.redraw();
      });
  });

  dash.draw('priceavg', (el) => {
    el.replaceChildren();
    const r = dash.data('price_landuse'); if (r.status !== 'ok' || !r.data) { el.textContent = r.status === 'error' ? 'Failed to load' : '—'; return; }
    const rows = r.data.filter((d) => d.day_type === PK.priceDt);
    const series = d3.groups(rows, (d) => d.land_use_order).sort((a, b) => a[0] - b[0]);
    const w = Math.max(300, el.clientWidth), h = 240, m = { t: 10, r: 20, b: 26, l: 44 };
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', 'Average hourly parking price by land-use type through the day');
    const x = d3.scaleLinear().domain([0, 1440]).range([m.l, w - m.r]);
    const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(rows, (d) => d.avg_price))]).nice().range([h - m.b, m.t]);
    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(4)).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y).attr('y2', y);
    svg.append('g').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues(d3.range(0, 1441, w < 500 ? 360 : 180)).tickFormat((v) => (v >= 1440 ? '24:00' : hm(v))).tickSizeOuter(0));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => '$' + v.toFixed(v < 1 ? 2 : 0)).tickSizeOuter(0));
    series.forEach(([k, rs]) => svg.append('path').attr('d', d3.line().curve(d3.curveStepAfter).x((d) => x(xi(d.time))).y((d) => y(d.avg_price))(rs))
      .style('fill', 'none').style('stroke', PK.luCol ? PK.luCol(k - 1) : dash.colors[(k - 1) % dash.colors.length]).style('stroke-width', 2));
    const now = PK.minuteNow();
    svg.append('line').attr('x1', x(now)).attr('x2', x(now)).attr('y1', m.t).attr('y2', h - m.b).style('stroke', 'var(--cds-chart-reference)').style('stroke-width', 1.5);
    const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
    const guide = svg.append('line').attr('y1', m.t).attr('y2', h - m.b).style('stroke', 'var(--cds-chart-axis)').style('display', 'none');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', w - m.l - m.r).attr('height', h - m.t - m.b).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [px] = d3.pointer(ev); const t = Math.max(0, Math.min(1425, Math.round(x.invert(px) / 15) * 15)); const lab = hm(t);
        guide.style('display', null).attr('x1', x(t)).attr('x2', x(t));
        tip.style('display', null).selectAll('*').remove();
        tip.append('div').text(lab + ' · ' + DTL[PK.priceDt] + ' · average $/hour');
        series.map(([k, rs]) => [k, rs.find((d) => d.time === lab)]).filter(([, d]) => d).sort((a, b) => b[1].avg_price - a[1].avg_price)
          .forEach(([k, d]) => { const row = tip.append('div').attr('class', 'm'); row.append('span').style('color', PK.luCol ? PK.luCol(k - 1) : dash.colors[0]).text('● '); row.append('span').text(d.land_use + ': $' + d.avg_price.toFixed(2)); });
        placeTip(el, tip, x(t) / w * el.clientWidth);
      })
      .on('mouseleave', () => { tip.style('display', 'none'); guide.style('display', 'none'); });
  });

  dash.draw('pricesched', (tb) => {
    tb.replaceChildren();
    const r = dash.data('price_schedules'); if (r.status !== 'ok' || !r.data) return;
    r.data.forEach((d) => {
      const tr = document.createElement('tr'); tr.setAttribute('data-key', encodeURIComponent(d.schedule));
      const td0 = document.createElement('td'); const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = PK.priceCol(d.rate_per_hour); sw.style.marginRight = '6px';
      td0.append(sw, '$' + d.rate_per_hour.toFixed(2)); tr.appendChild(td0);
      [d.days, d.hours, d.public_holidays, d.hours_per_week, d.bays].forEach((v, i) => { const td = document.createElement('td'); if (i >= 3) td.className = 'n'; td.textContent = v; tr.appendChild(td); });
      tb.appendChild(tr);
    });
  });
})();

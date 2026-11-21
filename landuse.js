// ---- land-use types: helpers, calcs, map legend, availability-by-type section
(function () {
  const PK = window.PK;
  const FALLBACK = ['#2f5d8a', '#7fa6d4', '#d1495b', '#e8a33d', '#3a9d5d', '#8e6bb8'];
  PK.luHex = FALLBACK;
  PK.luCol = (i) => (dash.colors && dash.colors.length >= 6 ? dash.colors[i] : FALLBACK[i]);
  PK.luDt = PK.luDt || 'Weekday';
  if (!PK._luWrapped) {
    const orig = PK.redraw;
    PK.redraw = (names) => { orig(names); if (!names) dash.draw('luchart'); };
    PK._luWrapped = true;
  }
  PK._luIdx = null;
  const luIndex = () => {
    const r = dash.data('area_landuse');
    if (r.status !== 'ok') return null;
    if (!PK._luIdx || PK._luIdx.src !== r.data) {
      const m = new Map();
      r.data.forEach((row, i) => m.set(row.area, { row, i, k: +row.land_use_order - 1 }));
      PK._luIdx = { src: r.data, m };
    }
    return PK._luIdx.m;
  };
  PK.luMap = () => { const m = luIndex(); return m ? new Map([...m].map(([a, v]) => [a, v.k])) : null; };
  PK.luRow = (area) => { const m = luIndex(); const v = m && m.get(area); return v ? v.row : null; };
  PK.luColor = (area) => { const m = luIndex(); const v = m && m.get(area); return v ? PK.luCol(v.k) : 'var(--cds-chart-muted)'; };

  // swatches and legend switching (listen and set style/hidden only)
  document.querySelectorAll('[data-lu]').forEach((sw) => { sw.style.background = PK.luCol(+sw.getAttribute('data-lu')); });
  const syncLegend = () => {
    const lu = PK.mode === 'landuse';
    document.querySelectorAll('#map-legend').forEach((e) => { e.hidden = lu; });
    document.querySelectorAll('#map-legend-lu').forEach((e) => { e.hidden = !lu; });
  };
  document.querySelectorAll('#pk-mode').forEach((sel) => { sel.value = PK.mode; sel.addEventListener('change', syncLegend); });
  syncLegend();
  document.querySelectorAll('#pk-lu-dt').forEach((sel) => {
    sel.value = PK.luDt;
    sel.addEventListener('change', () => { PK.luDt = sel.value; ['lu-takeaway', 'luchart', 'lupeak'].forEach((n) => dash.draw(n)); });
  });
  document.querySelectorAll('#pk-show-landuse').forEach((b) => b.addEventListener('click', () => {
    PK.mode = 'landuse';
    document.querySelectorAll('#pk-mode').forEach((s) => { s.value = 'landuse'; });
    syncLegend(); PK.redraw(['map', 'detail']);
    const m = document.getElementById('map'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
})();

dash.calc('landuse_hour', {
  title: 'Share of bays free by land-use type and hour',
  description: 'Each sensor area takes the land-use type from the land-use file; areas of the same type are averaged, weighted by how many of their bays were reporting.',
  inputs: ['area_hour', 'area_landuse'],
  fn: (area_hour, area_landuse) => {
    const lu = new Map(area_landuse.map((r) => [r.area, r]));
    const acc = new Map();
    for (const r of area_hour) {
      const t = lu.get(r.area); if (!t) continue;
      const w = +r.avg_reporting_bays, f = +r.free_pct; if (!(w > 0) || r.free_pct === '' || r.free_pct == null) continue;
      const k = t.land_use + '|' + r.day_type + '|' + r.hour;
      const a = acc.get(k) || { land_use: t.land_use, land_use_order: +t.land_use_order, day_type: r.day_type, hour: r.hour, s: 0, w: 0, areas: 0 };
      a.s += f * w; a.w += w; a.areas += 1; acc.set(k, a);
    }
    return [...acc.values()].map((a) => ({ land_use: a.land_use, land_use_order: a.land_use_order, day_type: a.day_type, hour: a.hour,
      free_pct: Math.round(10 * a.s / a.w) / 10, reporting_bays: Math.round(a.w), areas: a.areas }))
      .sort((p, q) => p.land_use_order - q.land_use_order || (p.day_type < q.day_type ? -1 : p.day_type > q.day_type ? 1 : 0) || (p.hour < q.hour ? -1 : 1));
  }
});

dash.calc('landuse_peak', {
  title: 'Fullest and emptiest hour by land-use type',
  description: 'For each land-use type and day type: the hour with the lowest share of bays free, the hour with the highest, and the average over 06:00-21:00.',
  inputs: ['landuse_hour'],
  fn: (landuse_hour) => {
    const g = new Map();
    for (const r of landuse_hour) {
      const k = r.land_use + '|' + r.day_type;
      const a = g.get(k) || { land_use: r.land_use, land_use_order: r.land_use_order, day_type: r.day_type, min_free_pct: Infinity, fullest_hour: '', max_free_pct: -Infinity, emptiest_hour: '', sum: 0, n: 0 };
      if (r.free_pct < a.min_free_pct) { a.min_free_pct = r.free_pct; a.fullest_hour = r.hour; }
      if (r.free_pct > a.max_free_pct) { a.max_free_pct = r.free_pct; a.emptiest_hour = r.hour; }
      a.sum += r.free_pct; a.n += 1; g.set(k, a);
    }
    return [...g.values()].map((a) => ({ land_use: a.land_use, land_use_order: a.land_use_order, day_type: a.day_type,
      fullest_hour: a.fullest_hour, min_free_pct: a.min_free_pct, emptiest_hour: a.emptiest_hour, max_free_pct: a.max_free_pct,
      avg_free_pct: Math.round(10 * a.sum / a.n) / 10 }));
  }
});

(function () {
  const PK = window.PK;
  const enc = (s) => encodeURIComponent(String(s));
  const dtWord = { 'Weekday': 'weekdays', 'Saturday': 'Saturdays', 'Sunday/holiday': 'Sundays and public holidays' };

  dash.draw('lu-takeaway', (el) => {
    el.replaceChildren();
    const r = dash.data('landuse_peak');
    if (r.status !== 'ok' || !r.data) { el.textContent = '—'; return; }
    const rows = r.data.filter((d) => d.day_type === PK.luDt);
    if (!rows.length) { el.textContent = '—'; return; }
    const hard = rows.reduce((a, b) => (b.min_free_pct < a.min_free_pct ? b : a));
    const easy = rows.reduce((a, b) => (b.min_free_pct > a.min_free_pct ? b : a));
    const where = (d) => 'land_use=' + enc(d.land_use) + '&day_type=' + enc(d.day_type);
    const span = (d, field, text) => { const s = document.createElement('b'); s.setAttribute('data-source', 'landuse_peak'); s.setAttribute('data-field', field); s.setAttribute('data-where', where(d)); s.textContent = text; return s; };
    el.append('On ' + dtWord[PK.luDt] + ', parking is tightest in ', span(hard, 'land_use', hard.land_use), ' areas at ', span(hard, 'fullest_hour', hard.fullest_hour),
      ', when ', span(hard, 'min_free_pct', hard.min_free_pct.toFixed(0)), '% of bays are free. ', span(easy, 'land_use', easy.land_use),
      ' areas stay easiest: even at their fullest (', span(easy, 'fullest_hour', easy.fullest_hour), '), ', span(easy, 'min_free_pct', easy.min_free_pct.toFixed(0)), '% of bays are free.');
  });

  dash.draw('luchart', (el) => {
    el.replaceChildren();
    const r = dash.data('landuse_hour');
    if (r.status !== 'ok' || !r.data) { el.textContent = r.status === 'error' ? 'Failed to load' : '—'; return; }
    const rows = r.data.filter((d) => d.day_type === PK.luDt);
    const series = d3.groups(rows, (d) => d.land_use_order).sort((a, b) => a[0] - b[0]);
    const hr = (d) => +d.hour.slice(0, 2);
    const w = Math.max(300, el.clientWidth), h = 280, m = { t: 12, r: 14, b: 26, l: 42 };
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img')
      .attr('aria-label', 'Average share of bays free by hour for each land-use type, ' + PK.luDt);
    const x = d3.scaleLinear().domain([6, 21]).range([m.l, w - m.r]);
    const y = d3.scaleLinear().domain([0, 100]).range([h - m.b, m.t]);
    svg.append('g').attr('class', 'grid').selectAll('line').data([25, 50, 75, 100]).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y).attr('y2', y);
    svg.append('g').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(w < 460 ? 4 : 8).tickFormat((v) => String(v).padStart(2, '0') + ':00').tickSizeOuter(0));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => v + '%').tickSizeOuter(0));
    const cur = PK.hour();
    svg.append('line').attr('x1', x(cur)).attr('x2', x(cur)).attr('y1', m.t).attr('y2', h - m.b).style('stroke', 'var(--cds-chart-reference)').style('stroke-width', 1.5);
    series.forEach(([k, rs]) => {
      svg.append('path').attr('d', d3.line().x((d) => x(hr(d))).y((d) => y(d.free_pct))(rs))
        .style('fill', 'none').style('stroke', PK.luCol(k - 1)).style('stroke-width', 2.2);
      svg.append('g').selectAll('circle').data(rs).join('circle').attr('cx', (d) => x(hr(d))).attr('cy', (d) => y(d.free_pct)).attr('r', 2.2).style('fill', PK.luCol(k - 1));
    });
    const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
    const guide = svg.append('line').attr('y1', m.t).attr('y2', h - m.b).style('stroke', 'var(--cds-chart-axis)').style('display', 'none');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', w - m.l - m.r).attr('height', h - m.t - m.b).style('fill', 'transparent').style('cursor', 'pointer')
      .on('mousemove', (ev) => {
        const [px] = d3.pointer(ev); const hh = Math.max(6, Math.min(21, Math.round(x.invert(px)))); const lab = String(hh).padStart(2, '0') + ':00';
        guide.style('display', null).attr('x1', x(hh)).attr('x2', x(hh));
        tip.style('display', null).selectAll('*').remove();
        tip.append('div').text(lab + ' · ' + PK.luDt + ' · % of bays free');
        series.map(([k, rs]) => [k, rs.find((d) => d.hour === lab)]).filter(([, d]) => d).sort((a, b) => a[1].free_pct - b[1].free_pct)
          .forEach(([k, d]) => { const row = tip.append('div').attr('class', 'm'); row.append('span').style('color', PK.luCol(k - 1)).text('● '); row.append('span').text(d.land_use + ': ' + d.free_pct.toFixed(0) + '%'); });
        tip.append('div').attr('class', 'm').text('Click to set the map to this hour');
        const bw = el.clientWidth; let lx = x(hh) / w * bw + 12; if (lx > bw - 290) lx = x(hh) / w * bw - 300; tip.style('left', Math.max(0, lx) + 'px').style('top', '8px');
      })
      .on('mouseleave', () => { tip.style('display', 'none'); guide.style('display', 'none'); })
      .on('click', (ev) => {
        const [px] = d3.pointer(ev); const hh = Math.max(6, Math.min(21, Math.round(x.invert(px))));
        PK.slot = (hh - 6) * 4; document.querySelectorAll('#pk-slot').forEach((s) => { s.value = PK.slot; }); PK.redraw();
      });
  });

  dash.draw('lupeak', (tb) => {
    tb.replaceChildren();
    const r = dash.data('landuse_peak'); if (r.status !== 'ok' || !r.data) return;
    r.data.filter((d) => d.day_type === PK.luDt).sort((a, b) => a.land_use_order - b.land_use_order).forEach((d) => {
      const tr = document.createElement('tr'); tr.setAttribute('data-key', enc(d.land_use) + ',' + enc(d.day_type));
      const td0 = document.createElement('td'); const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = PK.luCol(d.land_use_order - 1); sw.style.marginRight = '6px';
      td0.append(sw, d.land_use); td0.style.whiteSpace = 'normal'; tr.appendChild(td0);
      [d.fullest_hour, d.min_free_pct.toFixed(1), d.emptiest_hour, d.max_free_pct.toFixed(1), d.avg_free_pct.toFixed(1)].forEach((v, i) => {
        const td = document.createElement('td'); if (i % 2 === 1 || i === 4) td.className = 'n'; td.textContent = v; tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  });

  dash.draw('luareas', (tb) => {
    tb.replaceChildren();
    const r = dash.data('area_landuse'); if (r.status !== 'ok') return;
    r.data.slice().sort((a, b) => +a.land_use_order - +b.land_use_order || +b.sensor_bays - +a.sensor_bays).forEach((d) => {
      const tr = document.createElement('tr'); tr.setAttribute('data-key', enc(d.area));
      const td0 = document.createElement('td'); const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = PK.luCol(+d.land_use_order - 1); sw.style.marginRight = '6px';
      td0.append(sw, d.area === 'All' ? 'All (area name in the data)' : d.area); tr.appendChild(td0);
      [d.land_use, d.place, d.sensor_bays, d.businesses_per_bay, d.main_uses].forEach((v, i) => {
        const td = document.createElement('td'); if (i === 2 || i === 3) td.className = 'n'; if (i === 4 || i === 1) td.style.whiteSpace = 'normal'; td.textContent = v; tr.appendChild(td);
      });
      tr.addEventListener('click', () => {
        if (PK.mode !== 'landuse') { document.querySelectorAll('#pk-show-landuse').forEach((b) => b.click()); }
        if (PK.focus) PK.focus({ type: 'area', id: d.area });
        const m = document.getElementById('map'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      tb.appendChild(tr);
    });
  });
})();

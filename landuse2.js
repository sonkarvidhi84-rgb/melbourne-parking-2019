// ---- land-use charts: hour grid, fullest/emptiest range, business mix
dash.calc('landuse_mix', {
  title: 'Business mix by land-use type',
  description: 'Share of 2019 businesses in each industry group, for all areas of each land-use type together (each area weighted by its number of businesses).',
  inputs: ['area_landuse'],
  fn: (area_landuse) => {
    const cols = ['offices_pct', 'shops_pct', 'food_drink_pct', 'accommodation_pct', 'health_pct', 'education_pct', 'government_pct', 'arts_recreation_pct', 'industrial_logistics_pct', 'personal_services_pct'];
    const g = new Map();
    for (const r of area_landuse) {
      const n = +r.businesses_2019 || 0;
      const a = g.get(r.land_use) || { land_use: r.land_use, land_use_order: +r.land_use_order, areas: 0, sensor_bays: 0, businesses_2019: 0, s: Object.fromEntries(cols.map((c) => [c, 0])) };
      a.areas += 1; a.sensor_bays += +r.sensor_bays || 0; a.businesses_2019 += n;
      cols.forEach((c) => { a.s[c] += n * (+r[c] || 0); });
      g.set(r.land_use, a);
    }
    return [...g.values()].sort((p, q) => p.land_use_order - q.land_use_order).map((a) => {
      const out = { land_use: a.land_use, land_use_order: a.land_use_order, areas: a.areas, sensor_bays: a.sensor_bays, businesses_2019: a.businesses_2019 };
      cols.forEach((c) => { out[c] = a.businesses_2019 ? Math.round(10 * a.s[c] / a.businesses_2019) / 10 : 0; });
      return out;
    });
  }
});

(function () {
  const PK = window.PK;
  const MIX = [
    ['offices_pct', 'Offices'], ['shops_pct', 'Shops'], ['food_drink_pct', 'Cafés & restaurants'], ['accommodation_pct', 'Hotels & student housing'],
    ['health_pct', 'Health'], ['education_pct', 'Education'], ['government_pct', 'Government'], ['arts_recreation_pct', 'Arts & recreation'],
    ['industrial_logistics_pct', 'Trades, warehousing & industry'], ['personal_services_pct', 'Personal services']
  ];
  const mixCol = (i) => d3.schemeTableau10[i % 10];
  document.querySelectorAll('[data-mix]').forEach((sw) => { sw.style.background = mixCol(+sw.getAttribute('data-mix')); });
  const textW = (svg, s, cls) => { const t = svg.append('text').attr('class', cls || null).text(s); const w = t.node().getComputedTextLength(); t.remove(); return w; };
  const placeTip = (el, tip, ev) => {
    const r = el.getBoundingClientRect(); let x = ev.clientX - r.left + 12, y = ev.clientY - r.top + 12;
    const tw = tip.node().offsetWidth; if (x + tw > r.width - 4) x = ev.clientX - r.left - tw - 12;
    tip.style('left', Math.max(0, x) + 'px').style('top', y + 'px');
  };
  const DTS = ['Weekday', 'Saturday', 'Sunday/holiday'];
  const DTL = { 'Weekday': 'Weekday', 'Saturday': 'Saturday', 'Sunday/holiday': 'Sunday / holiday' };

  // A. hour grid: type x hour, one panel per day type
  dash.draw('luheat', (el) => {
    el.replaceChildren();
    const r = dash.data('landuse_hour');
    if (r.status !== 'ok' || !r.data) { el.textContent = r.status === 'error' ? 'Failed to load' : '—'; return; }
    const types = d3.groups(r.data, (d) => d.land_use_order).sort((a, b) => a[0] - b[0]).map(([k, rs]) => ({ k, name: rs[0].land_use }));
    const idx = new Map(r.data.map((d) => [d.land_use_order + '|' + d.day_type + '|' + d.hour, d]));
    const hours = d3.range(6, 22);
    const W = Math.max(300, el.clientWidth);
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('role', 'img')
      .attr('aria-label', 'Grid of the share of bays free by land-use type and hour, for weekdays, Saturdays and Sundays');
    const short = (n) => n.replace('Mixed-use: apartments with shops & offices', 'Mixed-use (apartments + shops)').replace('CBD mixed: offices, shops & dining', 'CBD mixed').replace('Institutional: health & government', 'Health & government').replace('Shopping, markets & dining', 'Shopping & dining');
    const labW = Math.ceil(d3.max(types, (t) => textW(svg, short(t.name)))) + 22;
    const narrow = W < 760;
    const panels = narrow ? 1 : 3, gap = 14;
    const cw = Math.max(9, ((W - labW - (panels - 1) * gap) / panels) / hours.length);
    const ch = 22, head = 34, panelH = head + types.length * ch;
    const H = (narrow ? 3 : 1) * (panelH + 8);
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
    DTS.forEach((dt, p) => {
      const ox = narrow ? labW : labW + p * (hours.length * cw + gap), oy = narrow ? p * (panelH + 8) : 0;
      const g = svg.append('g').attr('transform', `translate(${ox},${oy})`);
      g.append('text').attr('x', 0).attr('y', 12).style('font-weight', 600).style('fill', 'var(--color-fg)').text(DTL[dt]);
      g.append('g').selectAll('text').data(hours).join('text').attr('x', (h, i) => i * cw + cw / 2).attr('y', head - 6).attr('text-anchor', 'middle')
        .text((h, i) => (cw < 18 ? (i % 3 === 0 ? h : '') : (cw < 26 ? (i % 2 === 0 ? h : '') : String(h).padStart(2, '0'))));
      if (p === 0 || narrow) {
        svg.append('g').selectAll('g').data(types).join('g').attr('transform', (t, i) => `translate(0,${oy + head + i * ch})`).each(function (t) {
          const gg = d3.select(this);
          gg.append('circle').attr('cx', 6).attr('cy', ch / 2).attr('r', 4.5).style('fill', PK.luCol(t.k - 1));
          gg.append('text').attr('x', 15).attr('y', ch / 2 + 4).text(short(t.name));
        });
      }
      types.forEach((t, i) => {
        hours.forEach((h, j) => {
          const hh = String(h).padStart(2, '0') + ':00'; const d = idx.get(t.k + '|' + dt + '|' + hh);
          const cell = g.append('g').attr('transform', `translate(${j * cw},${head + i * ch})`).style('cursor', 'pointer');
          cell.append('rect').attr('x', 0.5).attr('y', 0.5).attr('width', cw - 1).attr('height', ch - 1).attr('rx', 2)
            .style('fill', d ? PK.freeColor(d.free_pct / 100) : 'var(--cds-chart-muted)');
          if (d && cw >= 19) cell.append('text').attr('x', cw / 2).attr('y', ch / 2 + 4).attr('text-anchor', 'middle').style('font-size', cw >= 22 ? '10px' : '9px')
            .style('fill', d.free_pct < 25 || d.free_pct > 75 ? '#fff' : '#222').text(Math.round(d.free_pct));
          cell.on('mousemove', (ev) => {
            tip.style('display', null).selectAll('*').remove();
            tip.append('div').text(t.name);
            tip.append('div').attr('class', 'm').text(DTL[dt] + ' · ' + hh + ' · ' + (d ? d.free_pct.toFixed(0) + '% of bays free' : 'no data'));
            tip.append('div').attr('class', 'm').text('Click to show this day type and hour above');
            placeTip(el, tip, ev);
          }).on('mouseleave', () => tip.style('display', 'none'))
            .on('click', () => {
              PK.luDt = dt; document.querySelectorAll('#pk-lu-dt').forEach((s) => { s.value = dt; });
              PK.slot = (h - 6) * 4; document.querySelectorAll('#pk-slot').forEach((s) => { s.value = PK.slot; });
              PK.redraw(); ['lu-takeaway', 'lupeak', 'ludumbbell'].forEach((n) => dash.draw(n));
            });
        });
      });
    });
  });

  // B. range chart: fullest -> emptiest, with day average
  dash.draw('ludumbbell', (el) => {
    el.replaceChildren();
    const r = dash.data('landuse_peak');
    if (r.status !== 'ok' || !r.data) { el.textContent = r.status === 'error' ? 'Failed to load' : '—'; return; }
    const rows = r.data.filter((d) => d.day_type === PK.luDt).sort((a, b) => a.land_use_order - b.land_use_order);
    const W = Math.max(280, el.clientWidth), rh = 34, mt = 8, mb = 26;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('role', 'img')
      .attr('aria-label', 'For each land-use type, the share of bays free at its fullest and emptiest hour, and the day average');
    const short = (n) => n.replace('Mixed-use: apartments with shops & offices', 'Mixed-use').replace('CBD mixed: offices, shops & dining', 'CBD mixed').replace('Institutional: health & government', 'Health & govt').replace('Shopping, markets & dining', 'Shopping & dining');
    const ml = Math.ceil(d3.max(rows, (d) => textW(svg, short(d.land_use))) || 80) + 20, mr = Math.ceil(textW(svg, '100% free') / 2) + 8;
    const H = mt + rows.length * rh + mb;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scaleLinear().domain([0, 100]).range([ml, W - mr]);
    svg.append('g').attr('class', 'grid').selectAll('line').data([0, 25, 50, 75, 100]).join('line').attr('x1', x).attr('x2', x).attr('y1', mt).attr('y2', H - mb);
    svg.append('g').attr('transform', `translate(0,${H - mb})`).call(d3.axisBottom(x).tickValues([0, 25, 50, 75, 100]).tickFormat((v) => v + '% free').tickSizeOuter(0));
    const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
    rows.forEach((d, i) => {
      const y = mt + i * rh + rh / 2, c = PK.luCol(d.land_use_order - 1);
      const g = svg.append('g');
      g.append('circle').attr('cx', 8).attr('cy', y).attr('r', 4.5).style('fill', c);
      g.append('text').attr('x', 17).attr('y', y + 4).text(short(d.land_use));
      g.append('line').attr('x1', x(d.min_free_pct)).attr('x2', x(d.max_free_pct)).attr('y1', y).attr('y2', y).style('stroke', c).style('stroke-width', 4).style('stroke-linecap', 'round').style('opacity', 0.45);
      g.append('line').attr('x1', x(d.avg_free_pct)).attr('x2', x(d.avg_free_pct)).attr('y1', y - 7).attr('y2', y + 7).style('stroke', 'var(--color-fg)').style('stroke-width', 1.5);
      g.append('circle').attr('cx', x(d.min_free_pct)).attr('cy', y).attr('r', 5.5).style('fill', 'var(--color-bad)').style('stroke', 'var(--color-panel)');
      g.append('circle').attr('cx', x(d.max_free_pct)).attr('cy', y).attr('r', 5.5).style('fill', 'var(--color-ok)').style('stroke', 'var(--color-panel)');
      g.append('text').attr('x', x(d.min_free_pct)).attr('y', y - 9).attr('text-anchor', 'middle').style('font-size', '10px').text(d.fullest_hour);
      g.append('text').attr('x', x(d.max_free_pct)).attr('y', y - 9).attr('text-anchor', 'middle').style('font-size', '10px').text(d.emptiest_hour);
      g.append('rect').attr('x', 0).attr('y', y - rh / 2).attr('width', W).attr('height', rh).style('fill', 'transparent')
        .on('mousemove', (ev) => {
          tip.style('display', null).selectAll('*').remove();
          tip.append('div').text(d.land_use + ' · ' + DTL[d.day_type]);
          tip.append('div').attr('class', 'm').text('Fullest ' + d.fullest_hour + ': ' + d.min_free_pct.toFixed(0) + '% free');
          tip.append('div').attr('class', 'm').text('Emptiest ' + d.emptiest_hour + ': ' + d.max_free_pct.toFixed(0) + '% free');
          tip.append('div').attr('class', 'm').text('Day average: ' + d.avg_free_pct.toFixed(0) + '% free');
          placeTip(el, tip, ev);
        }).on('mouseleave', () => tip.style('display', 'none'));
    });
  });

  // C. business mix per type, 100% stacked bars
  dash.draw('lumix', (el) => {
    el.replaceChildren();
    const r = dash.data('landuse_mix');
    if (r.status !== 'ok' || !r.data) { el.textContent = r.status === 'error' ? 'Failed to load' : '—'; return; }
    const rows = r.data;
    const W = Math.max(280, el.clientWidth), rh = 40, mt = 6, mb = 22;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('role', 'img')
      .attr('aria-label', 'Share of businesses by industry group for each land-use type');
    const short = (n) => n.replace('Mixed-use: apartments with shops & offices', 'Mixed-use').replace('CBD mixed: offices, shops & dining', 'CBD mixed').replace('Institutional: health & government', 'Health & govt').replace('Shopping, markets & dining', 'Shopping & dining');
    const sub = (d) => d.areas + (d.areas === 1 ? ' area · ' : ' areas · ') + PK.num(d.sensor_bays) + ' bays';
    const subW = (d) => { const t = svg.append('text').style('font-size', '10px').text(sub(d)); const w = t.node().getComputedTextLength(); t.remove(); return w; };
    const ml = Math.ceil(d3.max(rows, (d) => Math.max(textW(svg, short(d.land_use)), subW(d))) || 80) + 26, mr = Math.ceil(textW(svg, '100%') / 2) + 8;
    const H = mt + rows.length * rh + mb;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scaleLinear().domain([0, 100]).range([ml, W - mr]);
    svg.append('g').attr('transform', `translate(0,${H - mb})`).call(d3.axisBottom(x).tickValues([0, 25, 50, 75, 100]).tickFormat((v) => v + '%').tickSizeOuter(0));
    const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
    rows.forEach((d, i) => {
      const y = mt + i * rh;
      svg.append('circle').attr('cx', 8).attr('cy', y + 12).attr('r', 4.5).style('fill', PK.luCol(d.land_use_order - 1));
      svg.append('text').attr('x', 17).attr('y', y + 16).text(short(d.land_use));
      svg.append('text').attr('x', 17).attr('y', y + 29).style('font-size', '10px').text(d.areas + (d.areas === 1 ? ' area · ' : ' areas · ') + PK.num(d.sensor_bays) + ' bays');
      const tot = d3.sum(MIX, ([c]) => d[c]) || 100;
      let acc = 0;
      MIX.forEach(([c, name], j) => {
        const v = d[c] / tot * 100; if (!(v > 0)) return;
        const x0 = x(acc), x1 = x(acc + v); acc += v;
        const seg = svg.append('g');
        seg.append('rect').attr('x', x0).attr('y', y + 4).attr('width', Math.max(0, x1 - x0 - 0.5)).attr('height', 24).style('fill', mixCol(j));
        if (x1 - x0 > 30) seg.append('text').attr('x', (x0 + x1) / 2).attr('y', y + 20).attr('text-anchor', 'middle').style('font-size', '10px').style('fill', '#fff').text(Math.round(d[c]) + '%');
        seg.on('mousemove', (ev) => {
          tip.style('display', null).selectAll('*').remove();
          tip.append('div').text(d.land_use);
          tip.append('div').attr('class', 'm').text(name + ': ' + d[c].toFixed(0) + '% of ' + PK.num(d.businesses_2019) + ' businesses');
          placeTip(el, tip, ev);
        }).on('mouseleave', () => tip.style('display', 'none'));
      });
    });
  });

  // keep the range chart in step with the day-type picker
  document.querySelectorAll('#pk-lu-dt').forEach((sel) => sel.addEventListener('change', () => dash.draw('ludumbbell')));
})();

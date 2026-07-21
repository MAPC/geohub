function renderDataPanel() {
  const panel = document.getElementById('data-panel');
  if (panel.style.display !== 'flex') return;
  // The Subregion/Municipality control only applies to the two chart views, not the raw table.
  document.getElementById('chart-groupby').style.display =
    (state.panelView === 'pie' || state.panelView === 'bar') ? 'flex' : 'none';
  if (state.panelView === 'pie') renderPieChart();
  else if (state.panelView === 'bar') renderBarChart();
  else renderTable();
}

function renderTable() {
  const body = document.getElementById('data-panel-body');
  const col = state.selectedColumn;
  const rows = state.data.filter(r => r._muniId && state.selectedTowns.has(r._muniId)).sort((a, b) => (a._canonical || '').localeCompare(b._canonical || ''));
  let html = '<table><thead><tr><th>Municipality</th><th>' + col + '</th></tr></thead><tbody>';
  for (const r of rows) {
    html += '<tr><td>' + r._canonical + '</td><td>' + formatValue(col, parseFloat(r[col])) + '</td></tr>';
  }
  html += '</tbody></table>';
  body.innerHTML = html;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function describeArcPath(cx, cy, r, startAngle, endAngle) {
  const startPt = polarToCartesian(cx, cy, r, startAngle);
  const endPt = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
  return ['M', cx, cy, 'L', startPt.x, startPt.y, 'A', r, r, 0, largeArc, 1, endPt.x, endPt.y, 'Z'].join(' ');
}

// Builds the {label, value, color}[] the pie/bar charts render from, honoring
// state.chartGroupBy. Subregion mode sums the selected column per subregion (a fixed,
// stable taxonomy, so each gets a stable color). Municipality mode is one entry per
// selected town, capped to the top PIE_TOP_N + "Other" so it stays legible — colors
// there are assigned by rank, not identity, since the top-N set changes with the data.
// Shared by the pie chart's subregion mode and the bar chart's subregion mode — same sum,
// different output shape per caller.
function sumBySubregion(col) {
  const totals = {};
  state.data.forEach(r => {
    if (!r._muniId || !state.selectedTowns.has(r._muniId)) return;
    const v = parseFloat(r[col]);
    if (isNaN(v)) return;
    const muni = MUNI_BY_ID[r._muniId];
    if (!muni) return;
    totals[muni.subregion] = (totals[muni.subregion] || 0) + v;
  });
  return totals;
}

function computeChartEntries(col) {
  if (state.chartGroupBy === 'municipality') {
    const raw = state.data
      .filter(r => r._muniId && state.selectedTowns.has(r._muniId))
      .map(r => ({ label: r._canonical, value: parseFloat(r[col]) }))
      .filter(e => !isNaN(e.value) && e.value > 0);
    const entries = topNPlusOther(raw, PIE_TOP_N);
    entries.forEach((e, i) => { e.color = e.label.indexOf('Other (') === 0 ? OTHER_SLICE_COLOR : SUBREGION_PALETTE[i % SUBREGION_PALETTE.length]; });
    return { entries, title: col + ' by municipality' };
  }
  const entries = Object.entries(sumBySubregion(col))
    .filter(([, v]) => v > 0)
    .map(([label, value]) => ({ label, value, color: SUBREGION_COLOR[label] || '#999999' }))
    .sort((a, b) => b.value - a.value);
  return { entries, title: col + ' by subregion' };
}

// Pie chart: reads state.selectedTowns the same way the map itself does, so the chart
// always matches what's colored on the map.
function renderPieChart() {
  const body = document.getElementById('data-panel-body');
  const col = state.selectedColumn;
  if (!col) { body.innerHTML = '<div class="chart-empty">Upload data and pick a column to see the chart.</div>'; return; }

  const { entries, title } = computeChartEntries(col);
  const grandTotal = entries.reduce((sum, e) => sum + e.value, 0);

  if (!entries.length || grandTotal <= 0) {
    body.innerHTML = '<div class="chart-title">' + title + '</div>' +
      '<div class="chart-empty">No numeric data for the current selection.</div>';
    return;
  }

  const cx = 110, cy = 110, r = 95;
  let pieMarkup;
  if (entries.length === 1) {
    // A single 100% slice degenerates to a zero-length arc — draw a plain circle instead.
    pieMarkup = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + entries[0].color +
      '" stroke="#FFFFFF" stroke-width="1.5"><title>' + entries[0].label + ': 100%</title></circle>';
  } else {
    let angle = 0;
    pieMarkup = entries.map(e => {
      const startAngle = angle;
      const endAngle = angle + (e.value / grandTotal) * 360;
      angle = endAngle;
      const d = describeArcPath(cx, cy, r, startAngle, endAngle);
      const pct = ((e.value / grandTotal) * 100).toFixed(1);
      return '<path d="' + d + '" fill="' + e.color + '" stroke="#FFFFFF" stroke-width="1.5">' +
        '<title>' + e.label + ': ' + formatValue(col, e.value) + ' (' + pct + '%)</title></path>';
    }).join('');
  }

  const legend = entries.map(e => {
    const pct = ((e.value / grandTotal) * 100).toFixed(1);
    return '<div class="chart-legend-row"><span class="chart-legend-swatch" style="background:' + e.color + '"></span>' +
      '<span>' + e.label + '</span><span style="margin-left:auto;color:var(--text-secondary);">' + pct + '%</span></div>';
  }).join('');

  body.innerHTML =
    '<div class="chart-title">' + title + '</div>' +
    '<svg viewBox="0 0 220 220" class="pie-chart-svg" role="img" aria-label="Pie chart of ' + title + '">' + pieMarkup + '</svg>' +
    '<div class="chart-legend">' + legend + '</div>';
}

// Bar chart. Municipality mode: every currently selected/filtered municipality, alphabetical,
// uncapped (unlike the pie, a scrolling list of bars stays legible at 101 rows). Subregion
// mode: one ranked bar per subregion, highest total first. Missing values get a "No Data" row
// instead of a zero-length bar — a zero-length bar would visually claim the value IS zero,
// which the hard rule against treating N/A as zero (see CLAUDE.md) applies to just as much
// as the choropleth fill does.
function renderBarChart() {
  const body = document.getElementById('data-panel-body');
  const col = state.selectedColumn;
  if (!col) { body.innerHTML = '<div class="chart-empty">Upload data and pick a column to see the chart.</div>'; return; }

  let rows, title;
  if (state.chartGroupBy === 'subregion') {
    rows = Object.entries(sumBySubregion(col)).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    title = col + ' by subregion';
  } else {
    rows = state.data
      .filter(r => r._muniId && state.selectedTowns.has(r._muniId))
      .map(r => ({ name: r._canonical, value: parseFloat(r[col]) }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    title = col;
  }

  if (!rows.length) {
    body.innerHTML = '<div class="chart-title">' + title + '</div><div class="chart-empty">No municipalities selected.</div>';
    return;
  }

  const maxVal = Math.max(0, ...rows.filter(row => !isNaN(row.value)).map(row => row.value));

  const barRows = rows.map(row => {
    const isNoData = isNaN(row.value);
    const widthPct = (!isNoData && maxVal > 0) ? Math.max((row.value / maxVal) * 100, row.value > 0 ? 1.5 : 0) : 0;
    return '<div class="bar-row' + (isNoData ? ' no-data' : '') + '">' +
      '<div class="bar-row-label" title="' + row.name + '">' + row.name + '</div>' +
      '<div class="bar-row-track"><div class="bar-row-fill" style="width:' + widthPct + '%"></div></div>' +
      '<div class="bar-row-value">' + (isNoData ? 'No Data' : formatValue(col, row.value)) + '</div>' +
      '</div>';
  }).join('');

  body.innerHTML = '<div class="chart-title">' + title + '</div><div class="bar-chart-wrap">' + barRows + '</div>';
}

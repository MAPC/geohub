const HOME_VIEW = { center: [42.36, -71.06], zoom: 10 };

// Base tiles always render below the choropleth and region outline layers
function setBasemap(key) {
  const def = BASEMAPS[key] || BASEMAPS['carto-light'];
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = L.tileLayer(def.url, {
    attribution: def.attribution, subdomains: def.subdomains, maxZoom: 19, crossOrigin: true
  }).addTo(map);
}

function initMap() {
  map = L.map('map', { zoomControl: false }).setView(HOME_VIEW.center, HOME_VIEW.zoom);

  // Added before the zoom/home controls so it stacks above them in the same corner
  const SpatialSearchControl = L.Control.extend({
    // topright, not topleft, since the sidebar overlay covers the topleft corner
    options: { position: 'topright' },
    onAdd: function() {
      const container = L.DomUtil.create('div', 'spatial-search-control');
      container.innerHTML =
        '<div class="spatial-search-box">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
          '<input type="text" id="spatial-search-input" placeholder="Search municipality&hellip;" ' +
            'aria-label="Search and zoom to a municipality" autocomplete="off" role="combobox" ' +
            'aria-expanded="false" aria-controls="spatial-search-results" aria-autocomplete="list">' +
        '</div>' +
        '<ul id="spatial-search-results" class="spatial-search-results" role="listbox" aria-label="Municipality search results"></ul>';
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      return container;
    }
  });
  new SpatialSearchControl().addTo(map);
  initSpatialSearch();

  L.control.zoom({ position: 'topright' }).addTo(map);
  setBasemap(state.basemap);

  const regionOutlineGeoJSON = topojson.feature(REGION_OUTLINE_TOPOJSON, REGION_OUTLINE_TOPOJSON.objects.outline);

  // Backdrop fill for the region, covering tiny native gaps between adjacent town polygons
  L.geoJSON(regionOutlineGeoJSON, {
    interactive: false,
    style: { fill: true, fillColor: '#F5F5F5', fillOpacity: 1, stroke: false }
  }).addTo(map);

  // Dedicated pane so the region outline always stays on top of the choropleth
  map.createPane('regionOutlinePane');
  map.getPane('regionOutlinePane').style.zIndex = 450;
  map.getPane('regionOutlinePane').style.pointerEvents = 'none';

  L.geoJSON(regionOutlineGeoJSON, {
    pane: 'regionOutlinePane',
    interactive: false,
    style: { color: '#1F4E79', weight: 2, opacity: 1, fill: false, className: 'region-outline-path' }
  }).addTo(map);

  const HomeControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function() {
      const btn = L.DomUtil.create('button', 'leaflet-bar home-btn');
      btn.innerHTML = '&#8962;';
      btn.title = 'Reset view';
      btn.setAttribute('aria-label', 'Reset map view');
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, 'click', () => map.setView(HOME_VIEW.center, HOME_VIEW.zoom));
      return btn;
    }
  });
  new HomeControl().addTo(map);

  initLabels();
}

// Zooms to and highlights a searched municipality, as a standalone overlay layer
// (so the highlight survives renderChoropleth() rebuilding the choropleth layer underneath it)
let spotlightLayer = null;
let spotlightTimer = null;

function zoomAndHighlightMuni(muniId) {
  const geojson = topojson.feature(BOUNDARY_TOPOJSON, BOUNDARY_TOPOJSON.objects.municipalities);
  const feature = geojson.features.find(f => String(f.properties.muni_id) === muniId);
  if (!feature) return;

  if (spotlightLayer) { map.removeLayer(spotlightLayer); spotlightLayer = null; }
  clearTimeout(spotlightTimer);

  // White halo plus colored stroke, so the outline is visible against any basemap or fill color
  spotlightLayer = L.layerGroup([
    L.geoJSON(feature, { pane: 'regionOutlinePane', interactive: false,
      style: { color: '#FFFFFF', weight: 7, opacity: 0.9, fill: false } }),
    L.geoJSON(feature, { pane: 'regionOutlinePane', interactive: false,
      style: { color: '#E4572E', weight: 3, opacity: 1, fill: false, className: 'spatial-search-highlight' } })
  ]).addTo(map);

  map.flyToBounds(L.geoJSON(feature).getBounds(), { padding: [48, 48], maxZoom: 13, duration: 0.75 });

  spotlightTimer = setTimeout(() => {
    if (spotlightLayer) { map.removeLayer(spotlightLayer); spotlightLayer = null; }
  }, 4000);
}

function initSpatialSearch() {
  const input = document.getElementById('spatial-search-input');
  const list = document.getElementById('spatial-search-results');
  let matches = [];
  let activeIndex = -1;

  function renderMatches(q) {
    matches = q ? MUNI_LIST
      .filter(m => m.canonical.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.canonical.localeCompare(b.canonical))
      .slice(0, 8) : [];
    activeIndex = -1;
    list.innerHTML = matches.length
      ? matches.map((m, i) => '<li role="option" id="spatial-search-opt-' + i + '" data-idx="' + i + '">' +
          '<span>' + m.canonical + '</span><span class="spatial-search-subregion">' + m.subregion + '</span></li>').join('')
      : (q ? '<li class="spatial-search-empty">No matching municipality</li>' : '');
    const open = matches.length > 0 || q.length > 0;
    list.classList.toggle('open', open);
    input.setAttribute('aria-expanded', String(open));
  }

  function setActive(idx) {
    activeIndex = idx;
    list.querySelectorAll('li[data-idx]').forEach(li => li.classList.toggle('active', Number(li.dataset.idx) === idx));
    input.setAttribute('aria-activedescendant', idx >= 0 ? 'spatial-search-opt-' + idx : '');
    const activeLi = list.querySelector('li.active');
    if (activeLi) activeLi.scrollIntoView({ block: 'nearest' });
  }

  function pick(m) {
    if (!m) return;
    input.value = m.canonical;
    matches = []; list.innerHTML = ''; list.classList.remove('open'); input.setAttribute('aria-expanded', 'false');
    zoomAndHighlightMuni(String(m.muniId));
  }

  input.addEventListener('input', () => renderMatches(input.value.trim()));

  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { if (matches.length) { e.preventDefault(); setActive(Math.min(activeIndex + 1, matches.length - 1)); } }
    else if (e.key === 'ArrowUp') { if (matches.length) { e.preventDefault(); setActive(Math.max(activeIndex - 1, 0)); } }
    else if (e.key === 'Enter') { e.preventDefault(); pick(matches[activeIndex] || matches[0]); }
    else if (e.key === 'Escape') { list.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); input.blur(); }
  });

  list.addEventListener('click', e => {
    const li = e.target.closest('li[data-idx]');
    if (li) pick(matches[Number(li.dataset.idx)]);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.spatial-search-control')) { list.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); }
  });
}

// Municipality name labels, built once from the boundary geometry
let labelLayer;

function initLabels() {
  const geojson = topojson.feature(BOUNDARY_TOPOJSON, BOUNDARY_TOPOJSON.objects.municipalities);
  labelLayer = L.layerGroup(
    geojson.features.map(feature => L.marker(L.geoJSON(feature).getBounds().getCenter(), {
      icon: L.divIcon({ className: 'town-label', html: feature.properties.NAME, iconSize: null }),
      interactive: false
    }))
  );
}

function formatValue(col, value) {
  if (value === null || isNaN(value)) return 'No Data';
  const isCurrency = /\$|income|cost|price/i.test(col);
  const isPercent = /%|percent/i.test(col) ;
  if (isPercent) return (value * 100).toFixed(1) + '%';
  if (isCurrency) return '$' + Math.round(value).toLocaleString('en-US');
  return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(2);
}

function renderChoropleth() {
  if (choroplethLayer) { map.removeLayer(choroplethLayer); choroplethLayer = null; }
  const col = state.selectedColumn;
  if (!col) return;

  const values = state.data
    .filter(r => r._muniId && state.selectedTowns.has(r._muniId))
    .map(r => parseFloat(r[col]))
    .filter(v => !isNaN(v));

  const { breaks, getClass } = classify(values, state.classMethod, state.numClasses);
  const colors = getColorRamp(state.colorRamp, breaks.length || state.numClasses);

  // Per-class counts, for the mini histogram behind each legend swatch
  const classCounts = new Array(breaks.length).fill(0);
  values.forEach(v => {
    const idx = getClass(v);
    if (idx >= 0 && idx < classCounts.length) classCounts[idx]++;
  });
  const selectedRowCount = state.data.filter(r => r._muniId && state.selectedTowns.has(r._muniId)).length;
  const noDataCount = selectedRowCount - values.length;

  const geojson = topojson.feature(BOUNDARY_TOPOJSON, BOUNDARY_TOPOJSON.objects.municipalities);

  choroplethLayer = L.geoJSON(geojson, {
    style: function(feature) {
      const muniId = String(feature.properties.muni_id);
      const isSelected = state.selectedTowns.has(muniId);
      if (!isSelected) return { fillColor: '#F0F0F0', fillOpacity: 0.3, weight: 0.5, color: '#CCC' };
      const row = state.data.find(r => r._muniId === muniId);
      const value = row ? parseFloat(row[col]) : null;
      const classIdx = getClass(isNaN(value) ? null : value);
      const fillColor = classIdx === -1 ? NO_DATA_COLOR : colors[classIdx];
      // Isolation is just a display filter — it dims non-matching towns but doesn't
      // change state.selectedTowns, so the classification breaks stay stable.
      const isIsolating = state.isolatedClass !== null;
      const matchesIsolation = state.isolatedClass === 'nodata' ? classIdx === -1 : classIdx === state.isolatedClass;
      if (isIsolating && !matchesIsolation) {
        return { fillColor, fillOpacity: 0.12, weight: 0.5, color: '#FFFFFF', opacity: 0.6 };
      }
      return { fillColor, fillOpacity: 0.85, weight: isIsolating ? 1.5 : 1, color: '#FFFFFF', opacity: 1 };
    },
    onEachFeature: function(feature, layer) {
      const muniId = String(feature.properties.muni_id);
      const row = state.data.find(r => r._muniId === muniId);
      const value = row ? parseFloat(row[col]) : null;
      const lookupEntry = Object.values(MAPC_LOOKUP).find(v => String(v.muniId) === muniId);
      const subregion = lookupEntry ? lookupEntry.subregion : '';
      layer.bindTooltip(
        '<div class="tt-name">' + feature.properties.NAME + '</div>' +
        '<div class="tt-subregion">' + subregion + '</div>' +
        '<div class="tt-value">' + col + ': ' + formatValue(col, isNaN(value) ? null : value) + '</div>',
        { className: 'mapc-tooltip', direction: 'right', offset: [10, 0], sticky: true }
      );
      layer.on({
        mouseover: e => e.target.setStyle({ weight: 2, fillOpacity: 1 }),
        mouseout: e => choroplethLayer.resetStyle(e.target)
      });
    }
  }).addTo(map);

  updateLegend(breaks, colors, col, classCounts, noDataCount);
  updateRampPreview(colors);
  renderDataPanel();
}

// Mirrors the colors currently used on the map/legend, in the swatch strip under the dropdown
function updateRampPreview(colors) {
  document.getElementById('ramp-preview').innerHTML =
    colors.map(c => '<span style="background:' + c + '"></span>').join('');
}

function updateLegend(breaks, colors, col, classCounts, noDataCount) {
  const el = document.getElementById('legend');
  let title = col.length > 30 ? col.slice(0, 27) + '...' : col;
  const isolating = state.isolatedClass !== null;
  let html = '<div class="legend-title-row"><span class="legend-title">' + title + '</span>' +
    (isolating ? '<button type="button" id="legend-clear-isolation" class="legend-clear-btn">Show all</button>' : '') +
    '</div>';
  // One shared scale across every row (including No Data) so histogram bars are comparable
  const maxCount = Math.max(1, ...classCounts, noDataCount || 0);
  const histBar = (count, extraClass) => {
    const pct = (count / maxCount) * 100;
    // Force zero width for an empty class, overriding the CSS min-width floor
    const style = 'width:' + pct + '%' + (count === 0 ? ';min-width:0' : '');
    return '<span class="legend-hist"><span class="legend-hist-bar' + (extraClass ? ' ' + extraClass : '') +
      '" style="' + style + '"></span></span><span class="legend-count">(' + count + ')</span>';
  };
  // Legend rows double as click-to-isolate controls. classIdx is a number for a
  // color class, or the string 'nodata'.
  const legendRow = (classIdx, swatchColor, label, count, histExtraClass) => {
    const active = state.isolatedClass === classIdx;
    return '<div class="legend-row legend-row-clickable" data-class-idx="' + classIdx + '" role="button" tabindex="0" ' +
      'aria-pressed="' + active + '" aria-label="Isolate the ' + count + ' municipalities in this class">' +
      '<span class="legend-swatch" style="background:' + swatchColor + '"></span>' +
      '<span class="legend-label">' + label + '</span>' + histBar(count, histExtraClass) + '</div>';
  };
  let lower = null;
  breaks.forEach((b, i) => {
    const label = lower === null ? '&le; ' + formatValue(col, b) : formatValue(col, lower) + '\u2013' + formatValue(col, b);
    html += legendRow(i, colors[i], label, classCounts[i] || 0);
    lower = b;
  });
  html += '<div class="legend-rule"></div>' + legendRow('nodata', NO_DATA_COLOR, 'No Data', noDataCount || 0, 'no-data-bar');
  el.innerHTML = html;
}

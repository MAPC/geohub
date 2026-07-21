// 6. MAP MODULE
// ============================================================
const HOME_VIEW = { center: [42.36, -71.06], zoom: 10 };

// Tile layers always live in Leaflet's tilePane (z-index 200), below the choropleth's
// overlayPane (400) and the region-outline's own pane (450) — no z-index juggling needed
// when swapping the base layer.
function setBasemap(key) {
  const def = BASEMAPS[key] || BASEMAPS['carto-light'];
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = L.tileLayer(def.url, {
    attribution: def.attribution, subdomains: def.subdomains, maxZoom: 19, crossOrigin: true
  }).addTo(map);
}

function initMap() {
  map = L.map('map', { zoomControl: false }).setView(HOME_VIEW.center, HOME_VIEW.zoom);
  L.control.zoom({ position: 'topright' }).addTo(map);
  setBasemap(state.basemap);

  // Backdrop fill of the whole region, added before the choropleth layer exists so it
  // always renders underneath. The official per-town polygons have a handful of tiny
  // native gaps where they don't perfectly share a border (e.g. Boston/Watertown,
  // Chelsea/Boston) — this backdrop shows through those hairline slivers instead of
  // the basemap, without altering any town's actual boundary.
  L.geoJSON(REGION_OUTLINE, {
    interactive: false,
    style: { fill: true, fillColor: '#F5F5F5', fillOpacity: 1, stroke: false }
  }).addTo(map);

  // Dedicated pane above the choropleth (overlayPane, z-index 400) so the
  // region outline always stays on top even after renderChoropleth() swaps layers.
  map.createPane('regionOutlinePane');
  map.getPane('regionOutlinePane').style.zIndex = 450;
  map.getPane('regionOutlinePane').style.pointerEvents = 'none';

  L.geoJSON(REGION_OUTLINE, {
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

// Municipality name labels — built once from the static boundary geometry,
// independent of renderChoropleth() so toggling doesn't require a data re-render.
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

  // Per-class counts, for the mini histogram behind each legend swatch — lets a planner see
  // at a glance whether the classification is actually spreading municipalities out or
  // clustering most of them into one or two classes (the latter is the known failure mode
  // of Equal Interval on skewed data, per references/cartographic-standards.md).
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
      // Legend-click isolation: a pure display filter, never touches state.selectedTowns
      // (doing so would shrink the value pool classify() draws from and shift the Jenks/
      // Quantile breaks mid-isolation). Municipalities outside the isolated class just dim.
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

// Mirrors the exact colors just used for the legend/map so the swatch strip under the
// ramp dropdown never drifts out of sync with what's actually rendered.
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
  // One shared scale across every row, including No Data, so the mini histogram bars are
  // comparable to each other — a class bar twice as long really does mean twice the towns.
  const maxCount = Math.max(1, ...classCounts, noDataCount || 0);
  const histBar = (count, extraClass) => {
    const pct = (count / maxCount) * 100;
    // The CSS min-width floor keeps small-but-real counts from rounding away to nothing —
    // but a genuinely empty class must render with no bar at all, not a fake sliver implying
    // it has municipalities when it has none. Override the floor with an inline min-width:0.
    const style = 'width:' + pct + '%' + (count === 0 ? ';min-width:0' : '');
    return '<span class="legend-hist"><span class="legend-hist-bar' + (extraClass ? ' ' + extraClass : '') +
      '" style="' + style + '"></span></span><span class="legend-count">(' + count + ')</span>';
  };
  // Legend rows double as click-to-isolate controls — see the style() function inside
  // renderChoropleth(), which reads state.isolatedClass to dim everything else on the map.
  // classIdx is this row's data-class-idx: a number for a color class, or the string 'nodata'.
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

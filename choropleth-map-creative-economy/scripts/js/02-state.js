// 3. APPLICATION STATE
// ============================================================
const state = {
  data: [],              // parsed rows, each with _muniId attached after matching
  selectedColumn: null,
  selectedTowns: new Set(),   // muni_ids currently included
  classMethod: 'jenks',
  numClasses: 5,
  colorRamp: 'mapc-blue',
  basemap: 'carto-light',
  workbook: null,        // parsed SheetJS workbook, kept so switching sheets doesn't need re-upload
  panelView: 'table',    // which tab is active in the data panel: 'table' | 'pie' | 'bar'
  chartGroupBy: 'subregion',  // shared by the Pie and Bar tabs: 'subregion' | 'municipality'
  isolatedClass: null    // legend-click isolation: null | 0..numClasses-1 | 'nodata'
};

let map, choroplethLayer, baseLayer;
const RAMPS = {
  'mapc-blue':  ['#D6E8F7','#93C4DE','#4A97C9','#1F6FB5','#1F4E79'],
  'mapc-green': ['#E8F5E0','#B8DFA3','#88C96D','#6BAA3D','#3D7A1C'],
  'blues':      ['#EFF3FF','#BDD7E7','#6BAED6','#3182BD','#08519C'],
  'greens':     ['#EDF8E9','#BAE4B3','#74C476','#31A354','#006D2C'],
  // Custom Oranges ramp (not stock ColorBrewer), widened for colorblind contrast
  'oranges':    ['#FAF2EB','#E0B285','#B8732E','#623D18','#3D260F'],
  'purples':    ['#F2F0F7','#CBC9E2','#9E9AC8','#756BB1','#54278F'],
  'ylgnbu':     ['#FFFFCC','#A1DAB4','#41B6C4','#2C7FB8','#253494']
};
const NO_DATA_COLOR = '#D9D9D9';
// Free basemap tile sets, no API key required
const BASEMAPS = {
  'carto-light':   { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd' },
  'carto-voyager': { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd' },
  'carto-dark':    { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd' },
  'osm':           { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', subdomains: 'abc' }
};

// Categorical colors for subregions (ColorBrewer "Paired"), separate from the choropleth ramps above
const SUBREGION_PALETTE = ['#A6CEE3','#1F78B4','#B2DF8A','#33A02C','#FB9A99','#E31A1C','#FDBF6F','#FF7F00','#CAB2D6','#6A3D9A','#FFFF99','#B15928'];

function getMuniList() {
  const seen = new Set(), list = [];
  for (const v of Object.values(MAPC_LOOKUP)) {
    const id = String(v.muniId);
    if (seen.has(id)) continue;
    seen.add(id);
    list.push(v);
  }
  return list;
}
const MUNI_LIST = getMuniList();
const MUNI_BY_ID = {};
MUNI_LIST.forEach(m => { MUNI_BY_ID[String(m.muniId)] = m; });
const ALL_SUBREGIONS = Array.from(new Set(MUNI_LIST.map(m => m.subregion))).sort();
const SUBREGION_COLOR = {};
ALL_SUBREGIONS.forEach((sr, i) => { SUBREGION_COLOR[sr] = SUBREGION_PALETTE[i % SUBREGION_PALETTE.length]; });

// Cap chart entries at this many, grouping the rest into "Other"
const PIE_TOP_N = 8;
const OTHER_SLICE_COLOR = '#B0B0B0';

// Collapses a {label, value} list down to the top N by value plus one summed "Other" entry.
function topNPlusOther(entries, n) {
  const sorted = entries.slice().sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;
  const top = sorted.slice(0, n);
  const otherTotal = sorted.slice(n).reduce((sum, e) => sum + e.value, 0);
  if (otherTotal > 0) top.push({ label: 'Other (' + (sorted.length - n) + ')', value: otherTotal });
  return top;
}

// ============================================================

function normalizeName(name) {
  return String(name).trim().toLowerCase()
    .replace(/^(town of |city of |the )/, '')
    // Trailing qualifiers: "Boston, MA", Census-style "Watertown Town city, Middlesex County, Massachusetts"
    .replace(/\s*,.*$/, '')
    .replace(/( town| city)+$/, '')
    .replace(/\bmt\.\b/g, 'mount')
    .replace(/\bst\.\b/g, 'saint')
    .replace(/\bn\.\s?/g, 'north ')
    .replace(/\bs\.\s?/g, 'south ')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({length: m+1}, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = a[i-1] === b[j-1] ? d[i-1][j-1]
        : 1 + Math.min(d[i-1][j], d[i][j-1], d[i-1][j-1]);
    }
  }
  return d[m][n];
}
function levenshteinSimilarity(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - dist / maxLen;
}

function matchMunicipality(rawName) {
  const normalized = normalizeName(rawName);
  if (MAPC_LOOKUP[normalized]) return MAPC_LOOKUP[normalized];
  let best = null, bestScore = 0;
  for (const [key, val] of Object.entries(MAPC_LOOKUP)) {
    const score = levenshteinSimilarity(normalized, key);
    if (score > bestScore && score >= 0.85) { bestScore = score; best = val; }
  }
  return best;
}

function detectMunicipalityColumn(headers, rows) {
  let best = headers[0], bestHits = -1;
  for (const h of headers) {
    let hits = 0;
    for (const r of rows) if (matchMunicipality(r[h])) hits++;
    if (hits > bestHits) { bestHits = hits; best = h; }
  }
  return best;
}

function matchAndRender(rows) {
  const headers = Object.keys(rows[0] || {});
  const townCol = detectMunicipalityColumn(headers, rows);
  const numericCols = headers.filter(h => h !== townCol &&
    rows.some(r => r[h] !== null && r[h] !== '' && !isNaN(parseFloat(r[h]))));

  const unmatched = [], duplicates = [];
  const seen = new Set();
  for (const r of rows) {
    const m = matchMunicipality(r[townCol]);
    if (!m) { unmatched.push(r[townCol]); continue; }
    const id = String(m.muniId);
    // Only the first row per town gets an id, so a repeat can't feed the breaks or chart totals twice
    if (seen.has(id)) { duplicates.push(r[townCol]); continue; }
    seen.add(id);
    r._muniId = id; r._canonical = m.canonical;
  }

  state.data = rows;
  state.selectedTowns = new Set(Object.keys(MUNI_BY_ID));
  state.isolatedClass = null;

  showMatchWarnings(unmatched, duplicates);
  populateColumnDropdown(numericCols);
  populateTownFilter();
  state.selectedColumn = numericCols[0] || null;
  document.getElementById('column-select').value = state.selectedColumn;
  renderChoropleth();
}

function showMatchWarnings(unmatched, duplicates) {
  const panel = document.getElementById('warning-panel');
  const parts = [];
  if (unmatched.length) parts.push('<strong>' + unmatched.length + ' unmatched name(s)</strong> — not shown on map: ' +
    unmatched.map(esc).join(', '));
  if (duplicates.length) parts.push('<strong>' + duplicates.length + ' duplicate row(s)</strong> — only the first row per town is used: ' +
    duplicates.map(esc).join(', '));
  if (!parts.length) { panel.style.display = 'none'; panel.textContent = ''; return; }
  panel.style.display = 'block';
  panel.innerHTML = parts.join('<br>');
}

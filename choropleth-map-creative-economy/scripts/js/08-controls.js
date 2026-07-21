// UI wiring: dropdown population, all event listeners, docking, file upload/parsing.
function populateColumnDropdown(columns) {
  const sel = document.getElementById('column-select');
  sel.innerHTML = columns.map(c => '<option value="' + c + '">' + c + '</option>').join('');
}

function bindControls() {
  document.getElementById('sheet-select').addEventListener('change', e => {
    loadSheet(e.target.value);
  });
  document.getElementById('column-select').addEventListener('change', e => {
    // Drop isolation, since it doesn't apply to the new column's breaks
    state.selectedColumn = e.target.value; state.isolatedClass = null; renderChoropleth();
  });
  document.getElementById('method-select').addEventListener('change', e => {
    state.classMethod = e.target.value; state.isolatedClass = null; renderChoropleth();
  });
  document.querySelectorAll('.classes-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.classes-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      state.numClasses = parseInt(btn.dataset.classes, 10); state.isolatedClass = null; renderChoropleth();
    });
  });
  document.getElementById('ramp-select').addEventListener('change', e => {
    state.colorRamp = e.target.value; renderChoropleth();
  });
  document.getElementById('basemap-select').addEventListener('change', e => {
    state.basemap = e.target.value; setBasemap(state.basemap);
  });
  document.getElementById('select-all').addEventListener('click', () => {
    document.querySelectorAll('.town-toggle, .region-toggle').forEach(cb => cb.checked = true);
    state.selectedTowns = new Set(Object.values(MAPC_LOOKUP).map(v => String(v.muniId)));
    updateTownCount(); renderChoropleth();
  });
  document.getElementById('deselect-all').addEventListener('click', () => {
    document.querySelectorAll('.town-toggle, .region-toggle').forEach(cb => cb.checked = false);
    state.selectedTowns = new Set();
    updateTownCount(); renderChoropleth();
  });
  document.getElementById('town-search').addEventListener('input', filterTowns);
  document.getElementById('label-toggle').addEventListener('change', e => {
    if (e.target.checked) labelLayer.addTo(map);
    else map.removeLayer(labelLayer);
  });
  document.getElementById('panel-toggle').addEventListener('change', e => {
    document.getElementById('data-panel').style.display = e.target.checked ? 'flex' : 'none';
    renderDataPanel();
    // Tell Leaflet to resize, since it doesn't detect container resizes on its own
    map.invalidateSize();
  });
  document.querySelectorAll('.panel-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      state.panelView = btn.dataset.view;
      renderDataPanel();
    });
  });
  document.querySelectorAll('.groupby-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.groupby-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      state.chartGroupBy = btn.dataset.group;
      renderDataPanel();
    });
  });

  const fileInput = document.getElementById('file-input');
  const uploadZone = document.getElementById('upload-zone');
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault(); uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e => { if (e.target.files.length) handleFileUpload(e.target.files[0]); });

  document.getElementById('export-png').addEventListener('click', exportPNG);
  document.getElementById('export-pdf').addEventListener('click', exportPDF);

  // Delegate from the static #legend container, since its contents are replaced on every render
  const legendEl = document.getElementById('legend');
  legendEl.addEventListener('click', e => {
    if (e.target.closest('#legend-clear-isolation')) { state.isolatedClass = null; renderChoropleth(); return; }
    const row = e.target.closest('.legend-row-clickable');
    if (row) toggleIsolation(row.dataset.classIdx);
  });
  legendEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.legend-row-clickable');
    if (row) { e.preventDefault(); toggleIsolation(row.dataset.classIdx); }
  });

  bindDocking();
}

// Toggles legend-click isolation. rawIdx is 'nodata' or a stringified class number.
function toggleIsolation(rawIdx) {
  const idx = rawIdx === 'nodata' ? 'nodata' : parseInt(rawIdx, 10);
  state.isolatedClass = (state.isolatedClass === idx) ? null : idx;
  renderChoropleth();
}

// Burger handle toggles the control panel open/closed (desktop only — see CSS media query)
function bindDocking() {
  const appEl = document.getElementById('app');
  const handleEl = document.getElementById('controls-handle');
  handleEl.addEventListener('click', () => appEl.classList.toggle('docked'));
}

function handleFileUpload(file) {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
    alert('Please upload an .xlsx or .csv file'); return;
  }
  if (file.size > 10 * 1024 * 1024) { alert('File exceeds 10MB limit'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    state.workbook = workbook;
    document.getElementById('upload-status').textContent = 'Loaded: ' + file.name;

    const sheetGroup = document.getElementById('sheet-group');
    const sheetSelect = document.getElementById('sheet-select');
    sheetSelect.innerHTML = workbook.SheetNames.map(n => '<option value="' + n + '">' + n + '</option>').join('');
    sheetGroup.style.display = workbook.SheetNames.length > 1 ? 'block' : 'none';

    loadSheet(workbook.SheetNames[0]);
  };
  reader.readAsArrayBuffer(file);
}

function loadSheet(sheetName) {
  const sheet = state.workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (!rows.length) { alert('The "' + sheetName + '" sheet appears to be empty'); return; }
  matchAndRender(rows);
}


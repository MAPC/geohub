function populateTownFilter() {
  const container = document.getElementById('town-filter');
  const bySubregion = {};
  for (const [key, v] of Object.entries(MAPC_LOOKUP)) {
    if (key === 'manchester') continue; // alias, skip duplicate row
    (bySubregion[v.subregion] = bySubregion[v.subregion] || []).push(v);
  }
  let html = '';
  for (const region of Object.keys(bySubregion).sort()) {
    const towns = bySubregion[region].sort((a, b) => a.canonical.localeCompare(b.canonical));
    // Starts collapsed by default
    html += '<div class="subregion-group collapsed">' +
      '<div class="subregion-header">' +
        '<label><input type="checkbox" class="region-toggle" checked> ' + region +
          ' <span class="subregion-count">(' + towns.length + ')</span></label>' +
        '<button type="button" class="subregion-toggle-btn" data-region="' + region + '" aria-expanded="false" aria-label="Expand ' + region + '">' +
          '<svg class="chevron-icon" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
      '</div><div class="subregion-towns">';
    for (const t of towns) {
      html += '<div class="town-item"><label><input type="checkbox" class="town-toggle" data-muni-id="' + t.muniId + '" checked> ' + t.canonical + '</label></div>';
    }
    html += '</div></div>';
  }
  container.innerHTML = html;
  updateTownCount();
  filterTowns();

  container.querySelectorAll('.town-toggle').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) state.selectedTowns.add(cb.dataset.muniId);
    else state.selectedTowns.delete(cb.dataset.muniId);
    updateTownCount();
    renderChoropleth();
  }));
  container.querySelectorAll('.region-toggle').forEach(cb => cb.addEventListener('change', () => {
    const group = cb.closest('.subregion-group');
    group.querySelectorAll('.town-toggle').forEach(t => {
      t.checked = cb.checked;
      if (cb.checked) state.selectedTowns.add(t.dataset.muniId);
      else state.selectedTowns.delete(t.dataset.muniId);
    });
    updateTownCount();
    renderChoropleth();
  }));
  // Separate collapse button, so it doesn't interfere with the region-select label above
  container.querySelectorAll('.subregion-toggle-btn').forEach(btn => btn.addEventListener('click', () => {
    const group = btn.closest('.subregion-group');
    const collapsed = group.classList.toggle('collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.setAttribute('aria-label', (collapsed ? 'Expand ' : 'Collapse ') + btn.dataset.region);
  }));
}

function updateTownCount() {
  document.getElementById('town-count').textContent = state.selectedTowns.size;
}

// Text filter over the town checklist — display-only, doesn't change state.selectedTowns
function filterTowns() {
  const q = document.getElementById('town-search').value.trim().toLowerCase();
  document.querySelectorAll('.subregion-group').forEach(group => {
    let anyVisible = false;
    group.querySelectorAll('.town-item').forEach(item => {
      const match = item.textContent.toLowerCase().includes(q);
      item.style.display = match ? '' : 'none';
      if (match) anyVisible = true;
    });
    group.style.display = anyVisible ? '' : 'none';
    // Auto-expand subregions with a match while searching; collapse again once cleared
    const shouldCollapse = q ? !anyVisible : true;
    group.classList.toggle('collapsed', shouldCollapse);
    const btn = group.querySelector('.subregion-toggle-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', String(!shouldCollapse));
      btn.setAttribute('aria-label', (shouldCollapse ? 'Expand ' : 'Collapse ') + btn.dataset.region);
    }
  });
}

// 8. EXPORT MODULE
// ============================================================
// foreignObjectRendering (below) is needed to keep the town-name labels aligned with their
// polygons, but it rasterizes through the browser's native SVG pipeline, which taints on the
// cross-origin CARTO tile images even with useCORS — the basemap ends up as broken image
// icons. Swap each visible tile to a fully self-contained base64 data: URI for the duration of
// the capture (blob: URLs can fail to resolve from inside the serialized SVG foreignObject
// builds). Leaflet manages each tile's fade-in via its own img.onload handler (setting
// opacity to 1 once loaded); overwriting onload here to wait for our swap to finish clobbers
// that handler, so the re-loaded tile is left at opacity:0 — force it back to 1 once our load
// fires. Restore the CDN URLs afterward.
async function withInlinedTiles(captureFn) {
  const imgs = Array.from(document.querySelectorAll('#map .leaflet-tile-pane img'));
  const originalSrcs = imgs.map(img => img.src);
  await Promise.all(imgs.map(async (img, i) => {
    try {
      const resp = await fetch(originalSrcs[i], { mode: 'cors' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const blob = await resp.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      await new Promise(resolve => {
        img.onload = () => { img.style.opacity = '1'; resolve(); };
        img.onerror = resolve; // don't let one bad tile hang the whole export
        img.src = dataUrl;
      });
    } catch (e) { /* leave this tile as-is if it can't be fetched */ }
  }));
  try {
    return await captureFn();
  } finally {
    imgs.forEach((img, i) => { img.src = originalSrcs[i]; img.style.opacity = ''; });
  }
}

// Export the map at its true full extent — the sidebar is a floating overlay panel (see
// docking CSS), not part of the map itself, so its open/docked state shouldn't change what
// gets exported. The town-name labels (marker-pane divIcons) and the municipality polygons
// (a single SVG via Leaflet's SVG renderer) are two different rendering mechanisms;
// foreignObjectRendering hands rendering off to the browser's native SVG engine instead of
// html2canvas's manual DOM-walking reimplementation, which is what keeps them aligned.
function captureMain() {
  const el = document.getElementById('main');
  return withInlinedTiles(() => html2canvas(el, {
    scale: 2, useCORS: true, foreignObjectRendering: true,
    width: el.clientWidth, height: el.clientHeight, x: 0, y: 0
  }));
}

function exportPNG() {
  captureMain().then(canvas => {
    const link = document.createElement('a');
    const col = (state.selectedColumn || 'map').replace(/[^a-z0-9]+/gi, '_');
    link.download = 'MAPC_Choropleth_' + col + '_' + new Date().toISOString().slice(0, 10) + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }).catch(() => alert('Export failed. Try reducing the map zoom level.'));
}

function exportPDF() {
  captureMain().then(canvas => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: 'letter' });
    const imgData = canvas.toDataURL('image/png');
    const pageW = 11, pageH = 8.5;
    const ratio = Math.min((pageW - 1) / canvas.width, (pageH - 1.5) / canvas.height);
    const w = canvas.width * ratio, h = canvas.height * ratio;
    pdf.setFontSize(14);
    pdf.text(state.selectedColumn || '', 0.5, 0.5);
    pdf.setFontSize(9);
    pdf.text('Generated ' + new Date().toISOString().slice(0, 10), 0.5, 0.75);
    pdf.addImage(imgData, 'PNG', (pageW - w) / 2, 0.9, w, h);
    pdf.setFontSize(8);
    pdf.text('Boundaries: Metropolitan Area Planning Council | Data: user upload | Map: MAPC', 0.5, pageH - 0.3);
    const col = (state.selectedColumn || 'map').replace(/[^a-z0-9]+/gi, '_');
    pdf.save('MAPC_Choropleth_' + col + '_' + new Date().toISOString().slice(0, 10) + '.pdf');
  }).catch(() => alert('Export failed. Try reducing the map zoom level.'));
}


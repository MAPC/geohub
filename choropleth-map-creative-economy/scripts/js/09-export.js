// Swaps each map tile to a base64 data URI during export, so cross-origin basemap tiles
// don't break the capture, then restores the original tile URLs afterward.
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

// Captures the map (labels and polygons together) at full extent, regardless of sidebar state
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


// 5. CLASSIFICATION
// ============================================================
function classify(values, method, numClasses) {
  const clean = values.filter(v => v !== null && !isNaN(v));
  if (clean.length === 0) return { breaks: [], getClass: () => -1 };
  if (new Set(clean).size < 2) {
    return { breaks: [clean[0]], getClass: v => (v === null || isNaN(v)) ? -1 : 0 };
  }
  let breaks;
  const n = Math.min(numClasses, new Set(clean).size);
  switch (method) {
    case 'jenks': {
      const clusters = ss.ckmeans(clean, n);
      breaks = clusters.map(c => c[c.length - 1]);
      break;
    }
    case 'quantile': {
      breaks = [];
      for (let i = 1; i <= n; i++) breaks.push(ss.quantile(clean, i / n));
      break;
    }
    case 'equal': {
      const min = Math.min(...clean), max = Math.max(...clean);
      const step = (max - min) / n;
      breaks = Array.from({length: n}, (_, i) => min + step * (i + 1));
      break;
    }
  }
  return {
    breaks,
    getClass(value) {
      if (value === null || isNaN(value)) return -1;
      for (let i = 0; i < breaks.length; i++) if (value <= breaks[i]) return i;
      return breaks.length - 1;
    }
  };
}

function getColorRamp(rampName, numClasses) {
  const base = RAMPS[rampName] || RAMPS['mapc-blue'];
  if (numClasses === base.length) return base;
  const interp = d3.interpolateRgbBasis(base);
  return d3.quantize(interp, numClasses);
}

// ============================================================

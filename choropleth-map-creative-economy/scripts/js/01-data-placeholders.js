// ============================================================
// 1. BOUNDARY DATA (inlined TopoJSON, build-time fetch — no runtime geometry API calls)
// ============================================================
const BOUNDARY_TOPOJSON = __BOUNDARY_TOPOJSON__;

// ============================================================
// 2. CANONICAL MUNICIPALITY LOOKUP (normalized name -> {muniId, canonical, subregion})
// ============================================================
const MAPC_LOOKUP = __MAPC_LOOKUP__;

// Sample dataset preloaded so the map renders immediately without an upload
const SAMPLE_DATA = __SAMPLE_DATA__;

// Official single-outline boundary of all 101 MAPC municipalities — the "Greater Boston" region edge
const REGION_OUTLINE = __REGION_OUTLINE__;

// ============================================================

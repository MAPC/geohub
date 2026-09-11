// Sanity check for upload name matching. Run: node scripts/check_matching.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');

const ctx = vm.createContext({
  MAPC_LOOKUP: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'mapc-lookup.json'), 'utf8'))
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', '03-data-matching.js'), 'utf8'), ctx);
const canonicalOf = name => (ctx.matchMunicipality(name) || {}).canonical;

// Every official name still has to match itself after normalization
for (const v of Object.values(ctx.MAPC_LOOKUP)) assert.strictEqual(canonicalOf(v.canonical), v.canonical);

for (const [input, expected] of [
  ['Town of Acton', 'Acton'],
  ['ARLINGTON ', 'Arlington'],
  ['Framingam', 'Framingham'],
  ['N. Reading', 'North Reading'],
  ['Manchester-by-the-Sea', 'Manchester'],
  ['Foxboro', 'Foxborough'],
  ['Boston, MA', 'Boston'],
  ['Acton town, Middlesex County, Massachusetts', 'Acton'],
  ['Watertown Town city, Middlesex County, Massachusetts', 'Watertown'],
  ['Lyn', undefined],    // too short to fuzzy-match safely
  ['Total', undefined],
]) assert.strictEqual(canonicalOf(input), expected, JSON.stringify(input));

console.log('Name matching OK');

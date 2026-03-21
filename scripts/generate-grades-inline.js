/**
 * Génère data/grades-mapping-inline.js depuis darkorbit-grades-mapping.json
 * Usage: node scripts/generate-grades-inline.js
 */
const fs = require('fs');
const path = require('path');
const jsonPath = path.join(__dirname, '..', 'src', 'data', 'darkorbit-grades-mapping.json');
const outPath = path.join(__dirname, '..', 'src', 'data', 'grades-mapping-inline.js');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const out = 'window.GRADES_MAPPING_JSON=' + JSON.stringify({ grades: data.grades, language_detection: data.language_detection }) + ';';
fs.writeFileSync(outPath, out, 'utf8');
console.log('Generated', outPath);

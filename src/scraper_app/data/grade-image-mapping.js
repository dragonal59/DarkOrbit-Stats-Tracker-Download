/**
 * Maps grade level (1–21) or rank key to image filename.
 * Aligned with src/data/grades-mapping-inline.js and src/img/ranks/
 */
const LEVEL_TO_RANK = {
  1: 'basic_space_pilot',
  2: 'space_pilot',
  3: 'chief_space_pilot',
  4: 'basic_sergeant',
  5: 'sergeant',
  6: 'chief_sergeant',
  7: 'basic_lieutenant',
  8: 'lieutenant',
  9: 'chief_lieutenant',
  10: 'basic_captain',
  11: 'captain',
  12: 'chief_captain',
  13: 'basic_major',
  14: 'major',
  15: 'chief_major',
  16: 'basic_colonel',
  17: 'colonel',
  18: 'chief_colonel',
  19: 'basic_general',
  20: 'general',
  21: 'chief_general',
};

const RANK_KEYS = new Set(Object.values(LEVEL_TO_RANK));

/**
 * @param {number|string} grade - Level 1–21 or rank key (e.g. 'major')
 * @returns {string|null} - Filename without path, e.g. 'major.png', or null if unmapped
 */
export function getGradeImageFilename(grade) {
  if (grade == null) return null;
  const key = typeof grade === 'number' || (typeof grade === 'string' && /^\d+$/.test(grade))
    ? LEVEL_TO_RANK[Number(grade)]
    : RANK_KEYS.has(grade) ? grade : null;
  return key ? `${key}.png` : null;
}

/**
 * @param {number|string} grade
 * @returns {string} - Path for <img src>. Build copies src/img to scraper root, so use 'ranks/major.png'
 */
export function getGradeImagePath(grade) {
  const filename = getGradeImageFilename(grade);
  return filename ? `ranks/${filename}` : '';
}

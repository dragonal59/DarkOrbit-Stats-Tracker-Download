/**
 * Extraction des données de classement depuis le DOM DarkOrbit
 */
function getText(el) {
  if (!el) return '';
  return (el.textContent || '').trim();
}

function parseNumber(str) {
  if (str == null || str === '') return null;
  const cleaned = String(str).replace(/\s/g, '').replace(/[.,]/g, '');
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

/** Préfixes/suffixes à ignorer (éléments graphiques DarkOrbit, pas des grades) */
var GRADE_BLACKLIST = /^(splitter_|spacer_|line_|decoration|hof_|rank_arrow|rank_bg)/i;

function extractGradeFromRow(tr) {
  var map = typeof GRADE_TEXT_TO_ID !== 'undefined' ? GRADE_TEXT_TO_ID : {};
  var cells = tr.querySelectorAll('td, th, span, div');
  for (var i = 0; i < cells.length; i++) {
    var text = (cells[i].textContent || '').trim();
    if (text && map[text]) {
      var gradeId = map[text];
      if (gradeId && !GRADE_BLACKLIST.test(gradeId)) return gradeId;
    }
  }
  var gradeImg = tr.querySelector('img[src*="/ranks/"]');
  if (gradeImg && gradeImg.src) {
    var m = gradeImg.src.match(/\/ranks\/([a-zA-Z0-9_-]+)\.(png|gif|webp|jpg)/i);
    if (m) {
      var raw = m[1].replace(/-/g, '_');
      if (!GRADE_BLACKLIST.test(raw)) return raw;
    }
  }
  var imgs = tr.querySelectorAll('img');
  for (var j = 0; j < imgs.length; j++) {
    var src = (imgs[j].getAttribute('src') || '').trim();
    if (src.indexOf('/ranks/') === -1) continue;
    m = src.match(/\/ranks\/([a-zA-Z0-9_-]+)\.(png|gif|webp|jpg)/i);
    if (m) {
      raw = m[1].replace(/-/g, '_');
      if (!GRADE_BLACKLIST.test(raw)) return raw;
    }
  }
  return null;
}

/**
 * Extrait les joueurs d'un tableau de classement
 * @param {string} rankKey - 'honor_rank', 'experience_rank', 'top_user_rank'
 * @param {string} valueKey - 'honor_value', 'experience_value', 'top_user_value'
 */
function extractRankingData(rankKey, valueKey) {
  const players = [];
  const table = document.querySelector('.hof_ranking_table') ||
    document.querySelector('table[class*="hof"]') ||
    document.querySelector('table[class*="ranking"]');
  if (!table) return players;

  const rows = table.querySelectorAll('tr');
  for (const tr of rows) {
    if (tr.querySelector('.hof_spacer_vc')) continue;
    const posEl = tr.querySelector('.rank_position, .rank_position_font, td:first-child');
    const nameEl = tr.querySelector('.rank_name, .rank_name_font, td.rank_name');
    const pointsEl = tr.querySelector('.rank_points, .rank_points_font, td.rank_points');
    if (!posEl || !nameEl || !pointsEl) continue;

    const rank = parseInt(getText(posEl), 10);
    const rawName = (nameEl.getAttribute('title') || '').trim() || getText(nameEl);
    const name = rawName.slice(0, 100);
    const value = parseNumber(getText(pointsEl)) || 0;
    const grade = extractGradeFromRow(tr);
    if (rank <= 5 && name) {
      console.log('[SCRAPER DEBUG]', rankKey === 'top_user_rank' ? 'Top User' : rankKey, '- Joueur:', name, 'Grade brut:', grade);
    }

    if (!rank || rank < 1 || rank > 200 || !name) continue;

    players.push({
      name,
      grade: grade || null,
      [rankKey]: rank,
      [valueKey]: value
    });
  }
  return players;
}

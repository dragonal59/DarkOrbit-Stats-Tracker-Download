/**
 * Compare DOSTATS "Server" column labels vs app mapping (SERVER_LABEL_TO_CODE).
 * Run: node scripts/check-dostats-server-labels.mjs
 */
const GROUPS = {
  g1_europe_countries: ['de2', 'de4', 'es1', 'fr1', 'pl3'],
  g2_europe_global: ['int1', 'int5', 'int7', 'int11', 'int14'],
  g3_global_pve: ['gbl1', 'gbl2', 'gbl3', 'gbl4', 'gbl5'],
  g4_east: ['ru1', 'ru5', 'tr3', 'tr4', 'tr5'],
  g5_america: ['int2', 'int6', 'mx1', 'us2', 'usa2'],
};

const SERVER_LABEL_TO_CODE = {
  'Allemagne 2': 'de2', 'Germany 2': 'de2',
  'Allemagne 4': 'de4', 'Germany 4': 'de4',
  'Espagne 1': 'es1', 'Spain 1': 'es1',
  'France 1': 'fr1',
  'Global PvE': 'gbl1', 'Global PvE 1': 'gbl1',
  'Global 2 (Ganymede)': 'gbl2', 'Global PvE 2': 'gbl2',
  'Global 3 (Titan)': 'gbl3', 'Global PvE 3': 'gbl3',
  'Global 4': 'gbl4',
  'Global 4 (Europa)': 'gbl4', 'Global PvE 4': 'gbl4',
  'Global 5 (Callisto)': 'gbl5', 'Global 5 (Steam)': 'gbl5', 'Global PvE 5': 'gbl5', 'GBL5': 'gbl5', 'gbl5': 'gbl5',
  'Europe Global 1': 'int1', 'Global Europe 1': 'int1',
  'Europe Global 2': 'int5', 'Global Europe 2': 'int5',
  'Europe Global 3': 'int7', 'Global Europe 3': 'int7',
  'Europe Global 5': 'int11', 'Global Europe 5': 'int11',
  'Europe Global 7': 'int14', 'Global Europe 7': 'int14',
  'Amérique Global 1': 'int2', 'Global America 1': 'int2',
  'Amérique Global 2': 'int6', 'Global America 2': 'int6',
  'Mexique 1': 'mx1', 'Mexico 1': 'mx1',
  'Pologne 3': 'pl3', 'Poland 3': 'pl3',
  'Russie 1': 'ru1', 'Russia 1': 'ru1',
  'Russie 5': 'ru5', 'Russia 5': 'ru5',
  'Turquie 3': 'tr3', 'Turkey 3': 'tr3',
  'Turquie 4': 'tr4', 'Turkey 4': 'tr4',
  'Turquie 5': 'tr5', 'Turkey 5': 'tr5',
  'USA 2 (Côte Ouest)': 'us2', 'USA 2 (West Coast)': 'us2',
  'USA West': 'us2', 'USA 2': 'us2',
};

function entryServerCodeFromLabel(label) {
  const l = String(label || '').trim();
  if (!l) return null;
  const fromMap = SERVER_LABEL_TO_CODE[l];
  if (fromMap) return fromMap;
  if (/^[a-z]{2,4}\d+$/i.test(l)) return l.toLowerCase();
  return null;
}

function stripTd(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractServerLabelsFromHtml(html) {
  const labels = new Set();
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRegex.exec(html)) !== null) {
    const inner = m[1];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let tm;
    while ((tm = tdRegex.exec(inner)) !== null) {
      cells.push(stripTd(tm[1]));
    }
    if (cells.length >= 5) labels.add(cells[3]);
  }
  return [...labels];
}

const servers = [...new Set(Object.values(GROUPS).flat())].sort();

async function main() {
  const problematic = [];
  const ok = [];
  const empty = [];

  for (const srv of servers) {
    const url = `https://dostats.info/hall-of-fame?server=${encodeURIComponent(srv)}&type=honor`;
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 25000);
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: ac.signal,
      });
      clearTimeout(t);
      const html = await r.text();
      if (/No results found/i.test(html)) {
        empty.push({ srv, url, reason: 'aucune ligne (No results found)' });
        await new Promise((res) => setTimeout(res, 100));
        continue;
      }
      const labels = extractServerLabelsFromHtml(html);
      if (labels.length === 0) {
        empty.push({ srv, url, reason: 'tableau parsé vide' });
        await new Promise((res) => setTimeout(res, 100));
        continue;
      }

      const resolutions = labels.map((l) => ({ label: l, code: entryServerCodeFromLabel(l) }));
      const wrong = resolutions.filter((x) => x.code !== srv);
      const unmapped = resolutions.filter((x) => x.code === null);

      if (wrong.length > 0 || unmapped.length > 0) {
        problematic.push({
          srv,
          url,
          uniqueLabels: labels,
          resolutions,
          wrong,
          unmapped,
        });
      } else {
        ok.push(srv);
      }
    } catch (e) {
      empty.push({ srv, url: `honor current`, reason: `erreur: ${e.message}` });
    }
    await new Promise((res) => setTimeout(res, 120));
  }

  console.log('=== Serveurs où le libellé DOSTATS ne mappe pas vers le code demandé (risque filtre à 0) ===\n');
  if (problematic.length === 0) {
    console.log('(aucun détecté sur honor/current avec ce parseur)\n');
  } else {
    for (const p of problematic) {
      console.log(`• ${p.srv.toUpperCase()}`);
      console.log(`  URL test: ${p.url}`);
      console.log(`  Libellés "Server" vus: ${JSON.stringify(p.uniqueLabels)}`);
      for (const w of p.wrong) {
        console.log(`  → "${w.label}" → code résolu: ${w.code === null ? 'NULL (rejeté)' : w.code} (attendu: ${p.srv})`);
      }
      console.log('');
    }
  }

  console.log('=== Serveurs OK (tous les libellés résolus vers le bon code) ===');
  console.log(ok.join(', ') || '(aucun)');
  console.log('\n=== Sans données page ou erreur (impossible de conclure sur le mapping) ===');
  for (const e of empty) {
    console.log(`• ${e.srv}: ${e.reason}`);
  }

  console.log(`\nRésumé: ${problematic.length} serveur(s) avec décalage mapping, ${ok.length} OK, ${empty.length} vide/erreur.`);
}

main().catch(console.error);

/**
 * Vérification des tables Supabase existantes.
 * À exécuter depuis la racine du projet : node scripts/check-supabase-tables.js
 * Nécessite un fichier .env avec SUPABASE_URL et SUPABASE_ANON_KEY.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const TABLES = [
  'admin_logs',
  'profiles',
  'user_sessions',
  'user_events',
  'user_settings',
  'booster_predictions',
  'admin_messages',
  'permissions_config'
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key || url.includes('your-project') || key.includes('your_anon')) {
    console.error('❌ Configuration manquante. Créez un fichier .env avec SUPABASE_URL et SUPABASE_ANON_KEY réels.');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const results = { exists: {}, columns: {}, error: {} };

  for (const table of TABLES) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(0);
      if (error) {
        results.error[table] = error.message;
        results.exists[table] = false;
        continue;
      }
      results.exists[table] = true;
      // Pour récupérer les colonnes, on fait un select limit 1 (retourne les clés des objets)
      const { data: one } = await supabase.from(table).select('*').limit(1);
      if (one && one[0]) {
        results.columns[table] = Object.keys(one[0]).sort();
      } else {
        results.columns[table] = [];
      }
    } catch (e) {
      results.error[table] = e.message;
      results.exists[table] = false;
    }
  }

  // OpenAPI pour récupérer les colonnes des tables (y compris vides)
  let openApi = null;
  try {
    const base = url.replace(/\/$/, '');
    const res = await fetch(`${base}/rest/v1/`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/openapi+json'
      }
    });
    if (res.ok) {
      openApi = await res.json();
    }
  } catch (_) {}

  if (openApi && openApi.components && openApi.components.schemas) {
    for (const table of TABLES) {
      const schema = openApi.components.schemas[table];
      if (schema && schema.properties) {
        results.columns[table] = Object.keys(schema.properties).sort();
      }
    }
  }

  // Sortie JSON pour traitement
  console.log(JSON.stringify({
    tables: results,
    openApiAvailable: !!openApi
  }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

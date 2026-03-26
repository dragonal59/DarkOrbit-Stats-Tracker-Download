/**
 * Injection des clés Supabase au moment du build.
 * Génère config.supabase.prod.js dans build/src/ à partir des variables d'environnement.
 * Ce fichier est lu par preload.js au runtime (app empaquetée) ; jamais versionné (build/ dans .gitignore).
 *
 * Utilisation :
 *   - En dev : .env avec SUPABASE_URL et SUPABASE_ANON_KEY, ou config.supabase.local.js à la racine (même export que ce fichier)
 *   - Build : npm run prebuild (charge .env via dotenv si présent, ou variables d'env système)
 *
 * Contraintes : n'injecte jamais SUPABASE_SERVICE_ROLE_KEY (uniquement URL + anon key).
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Charger .env si présent (pour build local avec .env)
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // dotenv optionnel
}

const BUILD_DIR = path.join(__dirname, '..', 'build', 'src');
const OUTPUT_FILE = path.join(BUILD_DIR, 'config.supabase.prod.js');

const url = process.env.SUPABASE_URL || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';
const authRedirectBase = process.env.AUTH_REDIRECT_BASE || 'https://dragonal59.github.io/darkorbit-tracker-auth/';
const paypalClientId = process.env.PAYPAL_CLIENT_ID || '';
const paypalPlanId = process.env.PAYPAL_PLAN_ID || '';

function run() {
  if (!url || !anonKey) {
    console.error('');
    console.error('❌ Erreur : SUPABASE_URL et SUPABASE_ANON_KEY sont requis pour le build.');
    console.error('');
    console.error('   Définissez-les dans .env à la racine du projet, ou en variables d\'environnement :');
    console.error('   set SUPABASE_URL=https://xxx.supabase.co');
    console.error('   set SUPABASE_ANON_KEY=eyJhbGciOi...');
    console.error('');
    process.exit(1);
  }

  if (!fs.existsSync(BUILD_DIR)) {
    console.error('');
    console.error('❌ Erreur : Le dossier build/src/ n\'existe pas.');
    console.error('   Exécutez d\'abord : node scripts/obfuscate-build.js');
    console.error('');
    process.exit(1);
  }

  const content = `/**
 * Config Supabase + PayPal injectée au build — NE PAS VERSIONNER
 * Généré par scripts/inject-supabase-config.js
 */
module.exports = {
  url: ${JSON.stringify(url)},
  anonKey: ${JSON.stringify(anonKey)},
  authRedirectBase: ${JSON.stringify(authRedirectBase)},
  paypalClientId: ${JSON.stringify(paypalClientId)},
  paypalPlanId: ${JSON.stringify(paypalPlanId)}
};
`;

  fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
  console.log('✅ Config Supabase injectée dans build/src/config.supabase.prod.js');
}

run();

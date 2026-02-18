/**
 * Vérification des limites de sessions côté Supabase.
 * Usage : node scripts/verify-session-limits.js
 * Optionnel : .env avec TEST_USER_EMAIL et TEST_USER_PASSWORD (compte FREE ou PRO) pour tests fonctionnels.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const testEmail = process.env.TEST_USER_EMAIL;
const testPassword = process.env.TEST_USER_PASSWORD;

const results = { ok: [], fail: [], skip: [], details: {} };

function log(msg, type = 'info') {
  const prefix = type === 'fail' ? '❌' : type === 'ok' ? '✅' : type === 'skip' ? '⏭️' : 'ℹ️';
  console.log(`${prefix} ${msg}`);
}

async function main() {
  if (!url || !key || url.includes('your-project') || key.includes('your_anon')) {
    log('SUPABASE_URL et SUPABASE_ANON_KEY requis dans .env', 'fail');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  // --- ÉTAPE 2 : Vérifications structurelles (anon) ---
  log('--- Vérifications structurelles ---');

  const { data: tableCheck, error: tableErr } = await supabase.from('user_sessions').select('id').limit(0);
  if (tableErr) {
    results.fail.push('Table user_sessions: ' + tableErr.message);
    results.details.table_user_sessions = { error: tableErr.message, code: tableErr.code };
  } else {
    results.ok.push('Table user_sessions existe et accessible (SELECT)');
    results.details.table_user_sessions = { exists: true };
  }

  const { data: permsData, error: permsErr } = await supabase.rpc('get_user_permissions', { p_user_id: null });
  if (permsErr) {
    results.fail.push('RPC get_user_permissions (sans auth): ' + permsErr.message);
    results.details.get_user_permissions = { error: permsErr.message };
  } else {
    const maxSessions = permsData?.limits?.maxSessions;
    if (maxSessions === 1) {
      results.ok.push('get_user_permissions (anon/default) retourne maxSessions: 1');
    } else {
      results.fail.push(`get_user_permissions (anon) maxSessions attendu 1, reçu: ${maxSessions}`);
    }
    results.details.get_user_permissions = permsData || {};
  }

  const { data: insertRpcData, error: insertRpcErr } = await supabase.rpc('insert_user_session_secure', {
    p_row: { local_id: 'test-verify-' + Date.now(), honor: 0, xp: 0, rank_points: 0, next_rank_points: 0, session_timestamp: Date.now(), is_baseline: false }
  });
  if (insertRpcErr) {
    results.fail.push('Appel insert_user_session_secure (sans auth): ' + insertRpcErr.message);
    results.details.insert_rpc_anon = { error: insertRpcErr.message };
  } else if (insertRpcData && insertRpcData.success === false && (insertRpcData.code === 'AUTH_REQUIRED' || insertRpcData.error)) {
    results.ok.push('insert_user_session_secure sans auth → refus explicite (AUTH_REQUIRED ou erreur)');
    results.details.insert_rpc_anon = insertRpcData;
  } else {
    results.details.insert_rpc_anon = insertRpcData;
    if (insertRpcData?.success === true) results.fail.push('INSERT RPC aurait dû échouer sans auth');
    else results.ok.push('insert_user_session_secure sans auth → pas de succès');
  }

  const { data: directInsertData, error: directInsertErr } = await supabase.from('user_sessions').insert({
    user_id: '00000000-0000-0000-0000-000000000000',
    local_id: 'direct-insert-test',
    honor: 0,
    xp: 0,
    rank_points: 0,
    next_rank_points: 0,
    session_timestamp: Date.now()
  }).select('id');
  if (directInsertErr) {
    results.ok.push('INSERT direct sur user_sessions refusé (RLS ou contrainte): ' + (directInsertErr.message || directInsertErr.code));
    results.details.direct_insert = { expected: 'refused', error: directInsertErr.message, code: directInsertErr.code };
  } else {
    results.fail.push('INSERT direct sur user_sessions aurait dû être refusé par RLS');
    results.details.direct_insert = { data: directInsertData };
  }

  // --- ÉTAPE 3 : Tests fonctionnels (si compte test fourni) ---
  if (testEmail && testPassword) {
    log('--- Tests fonctionnels (compte test) ---');
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: testEmail, password: testPassword });
    if (signInErr) {
      results.skip.push('Connexion compte test: ' + signInErr.message);
      results.details.test_user_signin = { error: signInErr.message };
    } else {
      const uid = signInData.user?.id;
      const { data: perms } = await supabase.rpc('get_user_permissions', { p_user_id: uid });
      const badge = perms?.badge || 'FREE';
      const maxSessions = perms?.limits?.maxSessions ?? 1;
      results.details.test_user = { badge, maxSessions };

      const localId1 = 'verify-free-1-' + Date.now();
      const pRow = { local_id: localId1, honor: 100, xp: 200, rank_points: 50, next_rank_points: 100, session_timestamp: Date.now(), is_baseline: false };

      const { data: r1, error: e1 } = await supabase.rpc('insert_user_session_secure', { p_row: pRow });
      if (e1) {
        results.fail.push('1ère session (compte test): ' + e1.message);
        results.details.test_first_insert = { error: e1.message };
      } else if (r1?.success) {
        results.ok.push('1ère session insérée (RPC) → succès');
        results.details.test_first_insert = r1;
      } else {
        results.details.test_first_insert = r1;
        if (r1?.code === 'SESSION_LIMIT_FREE') results.ok.push('1ère session refusée (déjà 1 session FREE) — cohérent');
        else results.fail.push('1ère session: succès attendu, reçu ' + JSON.stringify(r1));
      }

      const localId2 = 'verify-free-2-' + Date.now();
      const { data: r2 } = await supabase.rpc('insert_user_session_secure', { p_row: { ...pRow, local_id: localId2, session_timestamp: Date.now() + 1 } });
      if (badge === 'FREE' && r2?.success === false && (r2?.code === 'SESSION_LIMIT_FREE' || r2?.code === 'SESSION_LIMIT_PRO')) {
        results.ok.push('2e session (FREE) refusée par RPC avec code explicite → OK');
        results.details.test_second_insert = r2;
      } else if (badge === 'PRO' && maxSessions === 10) {
        results.skip.push('Test 2e session PRO : exécuter manuellement jusqu’à 11 sessions pour valider le blocage');
        results.details.test_second_insert = r2;
      } else {
        results.details.test_second_insert = r2;
        if (r2?.success === false) results.ok.push('2e session refusée (quota)');
        else results.fail.push('2e session: refus attendu pour FREE, reçu ' + JSON.stringify(r2));
      }

      await supabase.auth.signOut();
    }
  } else {
    results.skip.push('Tests fonctionnels avec compte (TEST_USER_EMAIL / TEST_USER_PASSWORD non définis)');
  }

  // --- Rapport ---
  console.log('\n--- RAPPORT ---');
  results.ok.forEach((m) => log(m, 'ok'));
  results.fail.forEach((m) => log(m, 'fail'));
  results.skip.forEach((m) => log(m, 'skip'));
  console.log('\nDétails:', JSON.stringify(results.details, null, 2));

  const hasFailure = results.fail.length > 0;
  if (hasFailure) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

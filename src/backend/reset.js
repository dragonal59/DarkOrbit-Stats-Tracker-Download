// ==========================================
// MODULE: HARD RESET
// Supprime toutes les sauvegardes (sessions + stats) en local et sur Supabase,
// puis affiche le popup formulaire obligatoire pour ressaisir les stats.
// ==========================================

async function hardReset() {
  const confirmText = "RESET";
  const userInput = prompt(
    "⚠️ ATTENTION ⚠️\n\n" +
    "Cette action va SUPPRIMER DÉFINITIVEMENT :\n" +
    "• Toutes vos sessions sauvegardées (local et Supabase)\n" +
    "• Votre historique complet\n" +
    "• Vos statistiques actuelles\n" +
    "• Toutes vos données liées aux sessions et stats\n\n" +
    "Cette action est IRRÉVERSIBLE !\n\n" +
    "Pour confirmer, tapez exactement : " + confirmText
  );

  if (userInput !== confirmText) {
    if (userInput !== null) showToast("❌ Reset annulé - Texte de confirmation incorrect", "warning");
    return;
  }

  try {
    // 1. Supprimer les sessions côté Supabase pour l'utilisateur connecté
    if (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function" && typeof getSupabaseClient === "function") {
      const user = await AuthManager.getCurrentUser();
      if (user && user.id) {
        const supabase = getSupabaseClient();
        await supabase.from("user_sessions").delete().eq("user_id", user.id);
      }
    }

    // 2. Supprimer toutes les données locales (sessions + stats)
    SafeStorage.remove(CONFIG.STORAGE_KEYS.SESSIONS);
    SafeStorage.remove(CONFIG.STORAGE_KEYS.CURRENT_STATS);
    SafeStorage.remove(CONFIG.STORAGE_KEYS.THEME);
    SafeStorage.remove(CONFIG.STORAGE_KEYS.VIEW_MODE);

    // 3. Réinitialiser les champs du formulaire (éditables par l'utilisateur)
    const honorEl = document.getElementById("honor");
    const xpEl = document.getElementById("xp");
    const rankPointsEl = document.getElementById("rankPoints");
    const nextRankPointsEl = document.getElementById("nextRankPoints");
    const sessionNoteEl = document.getElementById("sessionNote");
    const currentLevelEl = document.getElementById("currentLevel");
    if (honorEl) honorEl.value = "";
    if (xpEl) xpEl.value = "";
    if (rankPointsEl) rankPointsEl.value = "";
    if (nextRankPointsEl) nextRankPointsEl.value = "";
    if (sessionNoteEl) sessionNoteEl.value = "";
    if (currentLevelEl) currentLevelEl.value = "";

    const selected = document.getElementById("selected");
    if (selected) selected.innerHTML = "<span>Sélectionner votre grade actuel</span>";

    renderHistory();
    updateStatsDisplay();
    updateProgressionTab();
    stopSessionTimer();

    setTheme(CONFIG.DEFAULTS.THEME);
    setViewMode(CONFIG.DEFAULTS.VIEW_MODE);

    // 4. Bloquer l'accès : popup formulaire obligatoire pour saisir de nouvelles stats
    if (typeof setAppAccessFromSessions === "function") setAppAccessFromSessions(0);
    if (typeof initBaselineSetup === "function") initBaselineSetup(true);

    showToast("🔥 Hard Reset effectué ! Saisissez vos stats pour continuer.", "warning");
  } catch (error) {
    console.error("Hard reset error:", error);
    showToast("❌ Erreur lors du reset", "error");
  }
}

console.log('🔥 Module Reset chargé');
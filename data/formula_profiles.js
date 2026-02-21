// Profiles de formules (ajustables).
// Objectif : encapsuler des hypothèses par version/patch.
// IMPORTANT: ce ne sont PAS des formules officielles; elles servent de base de travail.

window.__FORMULA_PROFILES__ = {
  cbt_v1: {
    label: "CBT v1 (conservateur)",
    notes: "Profil prudent basé sur CBT: mitigation DEF standard (DEF/(DEF+K)), Burst modéré.",
    settings: {
      mitigation_model: "def_over_def_plus_k",
      mitigation_k: 1200,
      crit_cap: 100,
      burst_bonus_pct: 25.0,
      burst_mode: "auto",
      combined_attack_triggers_burst: false,
      tag_gauge_gain_per_hit: 1,
      orb_gain_per_skill: 2,
      initial_orbs: 0
    }
  },

  devnotes_march_guess_v1: {
    label: "Release (dev notes) — guess v1",
    notes: "Hypothèse post-CBT (dev notes): Combined Attack déclenche un Burst immédiatement; contrôle plus réactif; UI plus claire. Les chiffres exacts restent inconnus.",
    settings: {
      mitigation_model: "def_over_def_plus_k",
      mitigation_k: 900,
      crit_cap: 100,
      burst_bonus_pct: 30.0,
      burst_mode: "auto",
      combined_attack_triggers_burst: true,
      tag_gauge_gain_per_hit: 1,
      orb_gain_per_skill: 2,
      initial_orbs: 0
    }
  },

  patch_template: {
    label: "Template patch (à copier)",
    notes: "Duplique ce profil pour chaque patch: patch_1_0_1, patch_1_1, etc.",
    settings: {
      mitigation_model: "def_over_def_plus_k",
      mitigation_k: 1000,
      crit_cap: 100,
      burst_bonus_pct: 25.0,
      burst_mode: "auto",
      combined_attack_triggers_burst: true,
      tag_gauge_gain_per_hit: 1,
      orb_gain_per_skill: 2,
      initial_orbs: 0
    }
  }
};

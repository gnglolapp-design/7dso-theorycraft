// 7DS: Origin — Theorycraft (Guidé v9)
// Offline-first: compatible file:// (no fetch required for defaults).
// Données: localStorage + Import/Export (Discord-friendly).

const STORAGE_KEY = "7ds_origin_theorycraft_guided_v9";

// UI complexity mode (Simple vs Expert): controls which sections appear in the sidebar.
const UI_MODE_KEY = "bh_ui_mode"; // "simple" | "expert"
function getUiMode(){ return localStorage.getItem(UI_MODE_KEY) || "simple"; }
function setUiMode(v){ localStorage.setItem(UI_MODE_KEY, v); }

function applyUiModeToNav(){
  const mode = getUiMode();
  document.querySelectorAll('.nav-item[data-mode]').forEach(el=>{
    const req = el.getAttribute('data-mode') || 'simple';
    el.style.display = (mode === 'expert' || req === 'simple') ? '' : 'none';
  });
  const badge = document.getElementById('uiModeBadge');
  if (badge) badge.textContent = (mode === 'expert') ? 'EXPERT' : 'SIMPLE';
  const btn = document.getElementById('btnToggleUiMode');
  if (btn) btn.textContent = (mode === 'expert') ? 'Mode simple' : 'Mode expert';
}

function bindUiMode(){
  const btn = document.getElementById('btnToggleUiMode');
  if (!btn) return;
  btn.addEventListener('click', ()=>{
    const next = (getUiMode() === 'simple') ? 'expert' : 'simple';
    setUiMode(next);
    applyUiModeToNav();
  });
  applyUiModeToNav();
}

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function uid(prefix="id"){ return prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16); }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
function pctToMul(p){ return 1 + (p/100); }
function toNum(x, d=0){ const n = Number(x); return Number.isFinite(n) ? n : d; }
function deepCopy(x){ return JSON.parse(JSON.stringify(x)); }
function escapeHtml(s){ return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }

function fmt(n){
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("fr-FR", {maximumFractionDigits: 0});
  return n.toLocaleString("fr-FR", {maximumFractionDigits: 2});
}
function fmtPct(n){
  if (!isFinite(n)) return "—";
  return (n).toLocaleString("fr-FR", {maximumFractionDigits: 2}) + "%";
}

function quantile(sorted, q){
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base+1] === undefined) return sorted[base];
  return sorted[base] + rest*(sorted[base+1]-sorted[base]);
}

function readEmbeddedDefaults(){
  try{
    const el = document.getElementById("defaults-json");
    if (!el) return null;
    const txt = el.textContent || "";
    return JSON.parse(txt);
  }catch(e){
    console.warn("defaults-json parse error", e);
    return null;
  }
}

function readEmbeddedJson(id){
  try{
    const el = document.getElementById(id);
    if (!el) return null;
    const txt = el.textContent || "";
    return JSON.parse(txt);
  }catch(e){
    console.warn(id + " parse error", e);
    return null;
  }
}

// Character kits (skills + potentials): pre-release placeholders; to be refined after launch.
const KITS_PACKAGE = readEmbeddedJson("kits-json") || {schema_version:"0.0", characters:[]};

let defaults = readEmbeddedDefaults() || {
  meta:{version:"guided-3.0.0", updated:"—"},
  settings:{mode:"simple", mitigation_model:"def_over_def_plus_k", mitigation_k:1200, crit_cap:100, burst_bonus_pct:25, burst_mode:"auto", orb_gain_per_skill:2, initial_orbs:0, mc_seed:12345, hist_bins:24, verbose_trace:false},
  limits:{confirmed_like:[], unknown:[], how_to_use:[]},
  builds:[], rotations:[], scenarios:[], db:{schema_version:"0.1", characters:[], weapons:[]}
};

// ----- External packs (optional) -----
const FORMULA_PROFILES = (window.__FORMULA_PROFILES__ || {});
const LIVE_DB_PACKAGE = (window.__DB_LIVE__ || null);
const LIVE_DB = (LIVE_DB_PACKAGE && LIVE_DB_PACKAGE.db) ? LIVE_DB_PACKAGE.db : null;
const LIVE_DB_META = (LIVE_DB_PACKAGE && LIVE_DB_PACKAGE.meta) ? LIVE_DB_PACKAGE.meta : null;
const LIVE_DBX = (LIVE_DB_PACKAGE && LIVE_DB_PACKAGE.dbx) ? LIVE_DB_PACKAGE.dbx : null;
let _settingsSnapshotBeforeProfile = null;

function mergeDefaults(defs, st){
  const out = deepCopy(defs);
  if (!st) return out;
  // Top-level merge
  for (const k of Object.keys(out)){
    if (st[k] !== undefined) out[k] = st[k];
  }
  out.meta = out.meta || defs.meta;
  out.settings = Object.assign({}, defs.settings, out.settings || {});
  out.limits = Object.assign({}, defs.limits, out.limits || {});
  out.builds = Array.isArray(out.builds) ? out.builds : defs.builds;
  out.rotations = Array.isArray(out.rotations) ? out.rotations : defs.rotations;
  out.scenarios = Array.isArray(out.scenarios) ? out.scenarios : defs.scenarios;
  out.db = Object.assign({}, defs.db, out.db || {});
  out.db.characters = Array.isArray(out.db.characters) ? out.db.characters : (defs.db?.characters || []);
  out.db.weapons = Array.isArray(out.db.weapons) ? out.db.weapons : (defs.db?.weapons || []);
  return out;
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepCopy(defaults);
    return mergeDefaults(defaults, JSON.parse(raw));
  }catch(e){
    console.warn(e);
    return deepCopy(defaults);
  }
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();
if (!state.settings.formula_profile) state.settings.formula_profile = 'cbt_v1';
if (!state.settings.db_source) state.settings.db_source = 'auto';
if (state.settings.hidden_global_multiplier == null) state.settings.hidden_global_multiplier = 1;
if (state.settings.hidden_defense_coefficient == null) state.settings.hidden_defense_coefficient = 1;
if (!state.settings.crit_order) state.settings.crit_order = "afterDef";
if (!state.settings.pierce_mode) state.settings.pierce_mode = "multiplicative";
if (!state.settings.element_stage) state.settings.element_stage = "late";

if (state.settings.context_enemy_debuffed == null) state.settings.context_enemy_debuffed = false;
if (state.settings.context_hp_pct == null) state.settings.context_hp_pct = 100;
if (state.settings.context_stacks == null) state.settings.context_stacks = 0;
if (state.settings.context_debuff_count == null) state.settings.context_debuff_count = 0;
if (state.settings.context_ally_count == null) state.settings.context_ally_count = 4;

function getActiveDb(){
  if (state.settings.db_source === 'session' && state._sessionDb) return state._sessionDb;
  if (state.settings.db_source === 'imported') return state.db;
  if (LIVE_DB) return LIVE_DB;
  return state.db;
}

function getActiveDbLabel(){
  if (state.settings.db_source === 'session') return 'DB session';
  if (state.settings.db_source === 'imported') return 'DB importée';
  if (LIVE_DB_META) return 'DB live (auto)';
  if ((state.db.characters?.length||0) || (state.db.weapons?.length||0)) return 'DB locale';
  return 'DB exemple';
}

function getKitCharacters(){
  // Prefer DB characters if they already contain skills/potentials; else use embedded kits.
  const db = getActiveDb();
  const fromDb = (db?.characters || []).filter(c => Array.isArray(c.skills) || Array.isArray(c.potentials));
  if (fromDb.length) return fromDb.map(c => ({
    id: c.id || c.slug || c.name,
    name: c.name || c.id || "Character",
    element: c.element || c.elem || "neutral",
    skills: Array.isArray(c.skills) ? c.skills : [],
    potentials: Array.isArray(c.potentials) ? c.potentials : []
  }));
  return (KITS_PACKAGE.characters || []).map(c => deepCopy(c));
}

function findKitCharById(id){
  if (!id) return null;
  return getKitCharacters().find(c => String(c.id) === String(id)) || null;
}

function modelSignature(){
  const s = state.settings || {};
  return [
    s.crit_order || "",
    s.defense_formula || s.mitigation_model || "",
    s.pierce_mode || "",
    s.element_stage || "",
    String(s.hidden_global_multiplier ?? ""),
    String(s.hidden_defense_coefficient ?? "")
  ].join("|");
}


function isConditionMet(cond, ctx){
  if (!cond) return true;
  const t = cond.type || cond.kind;
  if (!t) return true;
  const hp = toNum(ctx?.hpPct, 100);
  const stacks = Math.max(0, Math.round(toNum(ctx?.stacks, 0)));
  const debuffs = Math.max(0, Math.round(toNum(ctx?.debuffCount, 0)));
  const allies = Math.max(0, Math.round(toNum(ctx?.allyCount, 0)));
  switch (t){
    case "hp_below":
    case "hp_pct_below":
      return hp <= toNum(cond.threshold, 0);
    case "hp_above":
    case "hp_pct_above":
      return hp >= toNum(cond.threshold, 0);
    case "stacks_at_least":
      return stacks >= Math.max(0, Math.round(toNum(cond.threshold, 0)));
    case "debuffs_at_least":
      return debuffs >= Math.max(0, Math.round(toNum(cond.threshold, 0)));
    case "ally_count_at_least":
      return allies >= Math.max(0, Math.round(toNum(cond.threshold, 0)));
    case "enemy_debuffed":
      return !!ctx?.enemyDebuffed;
    default:
      return true;
  }
}

function getGlobalContextFromSettings(){
  return {
    enemyDebuffed: !!state.settings.context_enemy_debuffed,
    hpPct: toNum(state.settings.context_hp_pct, 100),
    stacks: toNum(state.settings.context_stacks, 0),
    debuffCount: toNum(state.settings.context_debuff_count, 0),
    allyCount: toNum(state.settings.context_ally_count, 4),
  };
}

function applyPotentialsToBuild(build, ctx=null){
  const b = deepCopy(build);
  b.stats = b.stats || {};
  const charId = b.character_id || b.characterId || "";
  const enabled = new Set((b.potentials_enabled || b.potentialsEnabled || []).map(String));
  const ch = findKitCharById(charId);
  if (!ch || !enabled.size) return b;

  const gctx = ctx || getGlobalContextFromSettings();

  // Ensure buffs array exists.
  if (!Array.isArray(b.buffs)) b.buffs = [];

  for (const p of (ch.potentials || [])){
    if (!enabled.has(String(p.id))) continue;

    // Condition (optional)
    if (!isConditionMet(p.condition, gctx)) continue;

    // Parsed effects (preferred) – same handler as skill effects
    if (Array.isArray(p.parsed_effects) && p.parsed_effects.length){
      const cs = computedStatsForContext({stats: b.stats, buffs: b.buffs}, {kind:"skill"}, state.settings);
      const cs2 = applyParsedEffectsToComputedStats(cs, p.parsed_effects, gctx);
      // write back only supported stat keys that are safe to merge
      // (minimal: atk, crit_rate, crit_dmg, dmg_bonus handled via buffs)
      b.stats.atk = cs2.atk;
      b.stats.crit_rate_pct = cs2.crit_rate_pct;
      b.stats.crit_dmg_pct = cs2.crit_dmg_pct;
      // dmg_bonus_pct is a bucket -> store as buff
      const deltaBonus = (cs2.dmg_bonus_pct || 0) - (cs.dmg_bonus_pct || 0);
      if (Math.abs(deltaBonus) > 1e-9){
        b.buffs.push({stat:"dmg", value: deltaBonus, type:"add", scope:"all", enabled:true, source:"potential", id:"potfx_"+String(p.id)});
      }
      continue;
    }

    // Legacy schema
    const t = p.type || "stat_add";
    if (t === "stat_add"){
      const k = p.stat;
      b.stats[k] = toNum(b.stats[k], 0) + toNum(p.value, 0);
    }else if (t === "buff"){
      // Expect same schema as build.buffs[]
      b.buffs.push({
        stat: p.stat || "dmg",
        value: toNum(p.value, 0),
        type: p.buff_type || p.calc || "add",
        scope: p.scope || "all",
        enabled: true,
        source: "potential",
        id: "pot_" + String(p.id)
      });
    }
  }
  return b;
}


function getActiveDbX(){
  if (state.settings.db_source === 'session' && state._sessionDbX) return state._sessionDbX;
  if (state.settings.db_source === 'imported' && state.dbx) return state.dbx;
  if (LIVE_DBX) return LIVE_DBX;
  return null;
}

function flattenNormalizedDb(dbx){
  // Convert normalized modular DB (schema 1.x) into legacy lists used by the UI.
  const mods = (dbx && dbx.modules) ? dbx.modules : {};
  const chars = Object.values(mods.characters || {}).map(c => ({
    id: c.id,
    name: c.name,
    icon: c.image_url || null,
    element: c.element || null,
    role: c.role || null,
    weapon_types: c.weapon_types || [],
    base_stats: c.base_stats || {atk:0,crit_rate:0,crit_dmg:0},
    source: {
      source_url: (c.sources && c.sources.genshin && c.sources.genshin.source_url) ? c.sources.genshin.source_url : null,
      patch_version: c.patch_version || null,
      last_seen: (dbx.generated_at || dbx.updated || null)
    },
    summary: (c.description || "").slice(0,220) + ((c.description||"").length>220 ? "…" : "")
  }));
  const wps = Object.values(mods.weapons || {}).map(w => ({
    id: w.id,
    name: w.name,
    weapon_type: w.weapon_type || null,
    element: w.element || null,
    icon: w.image_url || null,
    atk_bonus: w.equipment_attack || w.atk_bonus || 0,
    substat: {name: w.substat_name || (w.substat && w.substat.name) || null, value: w.substat_value || (w.substat && w.substat.value) || null},
    passive: w.passive_text || w.passive || "",
    source: {
      source_url: (w.sources && w.sources.genshin && w.sources.genshin.source_url) ? w.sources.genshin.source_url : null,
      patch_version: w.patch_version || null,
      last_seen: (dbx.generated_at || dbx.updated || null)
    }
  }));
  return {schema_version:"0.3", characters: chars.sort((a,b)=>a.name.localeCompare(b.name)), weapons: wps.sort((a,b)=>a.name.localeCompare(b.name))};
}

function unpackDbPayload(obj){
  // Accept:
  // 1) {db, dbx, meta}
  // 2) legacy {characters,weapons}
  // 3) normalized {schema_version, modules}
  if (obj && obj.db && obj.db.characters && obj.db.weapons){
    return {db: obj.db, dbx: obj.dbx || null, meta: obj.meta || null};
  }
  if (obj && obj.schema_version && obj.modules){
    return {db: flattenNormalizedDb(obj), dbx: obj, meta: {generated_at: obj.generated_at || obj.updated || null, sources: (obj.source_priority||[])}};
  }
  if (obj && obj.characters && obj.weapons){
    return {db: obj, dbx: null, meta: null};
  }
  throw new Error("Format DB inconnu");
}


// ---------- UI NAV ----------
function setView(view){
  $$(".view").forEach(v => v.classList.remove("active"));
  const tgt = $("#view-" + view);
  if (tgt) tgt.classList.add("active");
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  if (view === "simulate") refreshSimSelectors();
  if (view === "compare") refreshCompareSelectors();
  if (view === "weights") refreshWeightsSelectors();
  if (view === "meta") refreshMetaSnapshot();
  if (view === "bravehearts") refreshBraveHeartsUI();
  if (view === "database") refreshDbUI();
  if (view === "calibrate") refreshCalSelectors();
  if (view === "sandbox") refreshSandboxSelectors();
  if (view === "boss") refreshBossSelectors();
  if (view === "bravehearts") refreshBraveHeartsUI();
}

function bindNav(){
  $$(".nav-item").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));
  $$("[data-go]").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.go)));
}

// ---------- Mode ----------
function setMode(mode){
  state.settings.mode = mode;
  const simple = mode === "simple";
  $("#modeSimple")?.classList.toggle("active", simple);
  $("#modeAdvanced")?.classList.toggle("active", !simple);
  $("#uiMode").textContent = simple ? "Guidé" : "Avancé";
  $("#modeHint").textContent = simple
    ? "Guidé : peu de champs, explications, valeurs conseillées."
    : "Avancé : accès à plus de paramètres (scénarios/builds/MC).";
  $$(".advancedBlock").forEach(el => el.classList.toggle("show", !simple));
  saveState();
}

function bindMode(){
  $("#modeSimple")?.addEventListener("click", () => setMode("simple"));
  $("#modeAdvanced")?.addEventListener("click", () => setMode("advanced"));
}

// ---------- Tooltip ----------
function bindTooltips(){
  const tip = $("#tooltip");
  if (!tip) return;
  function showTip(e, text){
    tip.textContent = text;
    tip.style.display = "block";
    tip.setAttribute("aria-hidden", "false");
    const pad = 14;
    const x = clamp(e.clientX + 12, pad, window.innerWidth - pad - 340);
    const y = clamp(e.clientY + 12, pad, window.innerHeight - pad - 160);
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function hideTip(){
    tip.style.display = "none";
    tip.setAttribute("aria-hidden", "true");
  }
  document.addEventListener("mousemove", (e) => {
    const el = e.target.closest?.(".help");
    if (!el) return;
    showTip(e, el.dataset.tip || "—");
  });
  document.addEventListener("mouseout", (e) => { if (e.target.closest?.(".help")) hideTip(); });
  document.addEventListener("scroll", hideTip, {passive:true});
  window.addEventListener("resize", hideTip);
}

// ---------- Modal ----------
function openModal(title, bodyHtml, actions=[]){
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = bodyHtml;
  const a = $("#modalActions");
  a.innerHTML = "";
  for (const act of actions){
    const b = document.createElement("button");
    b.className = "btn " + (act.kind || "");
    b.textContent = act.label;
    b.addEventListener("click", act.onClick);
    a.appendChild(b);
  }
  $("#modalOverlay").classList.remove("hidden");
}
function closeModal(){ $("#modalOverlay").classList.add("hidden"); }
function bindModal(){
  $("#modalClose")?.addEventListener("click", closeModal);
  $("#modalOverlay")?.addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });
}

// ---------- Toast ----------
function showToast(msg, kind=""){
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "toast" + (kind ? (" " + kind) : "");
  t.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add("hidden"), 2600);
}

async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(_e){
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly','');
      ta.style.position='fixed';
      ta.style.left='-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    }catch(_e2){
      return false;
    }
  }
}

// ---------- About / Tour ----------
function renderLimitsHtml(){
  const L = state.limits || {};
  const li = (arr) => "<ul class='list'>" + (arr||[]).map(x => `<li>${escapeHtml(x)}</li>`).join("") + "</ul>";
  return `
    <div class="p"><b>Confirmé / robuste</b>${li(L.confirmed_like)}</div>
    <div class="p"><b>Inconnu / à calibrer</b>${li(L.unknown)}</div>
    <div class="p"><b>Conseils</b>${li(L.how_to_use)}</div>
    <div class="hint warn">La DB + la calibration rendent l’outil beaucoup plus fiable.</div>
  `;
}
function startTour(){
  const steps = [
    {t:"1) Quickstart", b:"Clique <b>Quickstart</b> pour un résultat immédiat."},
    {t:"2) Assistant build", b:"L’<b>Assistant build</b> crée un build sans connaissance des stats."},
    {t:"3) Comparer", b:"<b>Comparer</b> = l’onglet clé pour la guilde (A vs B)."},
    {t:"4) Base de données", b:"Si tu as une DB persos/armes, importe-la. Tu pourras créer des builds automatiquement."},
    {t:"5) Calibration", b:"Avec un dégât observé, calibre <b>K</b> et améliore la fiabilité du modèle DEF."},
  ];
  let i = 0;
  function show(){
    const s = steps[i];
    openModal(s.t, `<div class="p">${s.b}</div>`, [
      {label: i===0 ? "Fermer" : "←", kind:"ghost", onClick: () => { if (i===0) closeModal(); else { i--; show(); } }},
      {label: i===steps.length-1 ? "Terminer" : "→", kind:"primary", onClick: () => { if (i===steps.length-1) closeModal(); else { i++; show(); } }},
    ]);
  }
  show();
}

function bindTopButtons(){
  $("#btnAbout")?.addEventListener("click", () => openModal("Limites & hypothèses", renderLimitsHtml(), [
    {label:"OK", kind:"primary", onClick: closeModal}
  ]));
  $("#btnTour")?.addEventListener("click", () => startTour());
  $("#btnHomeWhat")?.addEventListener("click", () => openModal("Que faire ici ?", `
    <div class="p"><b>But</b> : comparer des builds et décider quoi améliorer.</div>
    <ol class="list">
      <li>Crée un build (Assistant build ou DB).</li>
      <li>Choisis un scénario (DEF boss) et une rotation simple.</li>
      <li>Simule, puis compare A vs B.</li>
      <li>“Priorité des stats” te dit ce qui rapporte le plus dans ce contexte.</li>
    </ol>
  `, [{label:"OK", kind:"primary", onClick: closeModal}]));
}

// ---------- Export / Import ----------
function downloadJson(filename, obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function bindExportImport(){
  $("#btnExport")?.addEventListener("click", () => {
    const pack = {
      meta: { exported: new Date().toISOString(), app: state.meta },
      settings: state.settings,
      builds: state.builds,
      rotations: state.rotations,
      scenarios: state.scenarios,
      db: state.db
    };
    downloadJson("7ds_origin_theorycraft_export.json", pack);
  });

  $("#btnImport")?.addEventListener("click", () => $("#fileImport").click());
  $("#fileImport")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try{
      const text = await file.text();
      const obj = JSON.parse(text);
      if (obj.settings) state.settings = Object.assign({}, state.settings, obj.settings);
      if (Array.isArray(obj.builds)) state.builds = obj.builds;
      if (Array.isArray(obj.rotations)) state.rotations = obj.rotations;
      if (Array.isArray(obj.scenarios)) state.scenarios = obj.scenarios;
      if (obj.db) state.db = Object.assign({}, state.db, obj.db);
      ensureIds();
      saveState();
      refreshAll();
      openModal("Import terminé", "<div class='p'>Données importées.</div>", [
        {label:"OK", kind:"primary", onClick: closeModal}
      ]);
    }catch(err){
      openModal("Erreur import", `<div class='p'>Fichier invalide.</div><div class='mono'>${escapeHtml(String(err))}</div>`, [
        {label:"OK", kind:"primary", onClick: closeModal}
      ]);
    }finally{
      e.target.value = "";
    }
  });
}

// ---------- Share (lien Discord) ----------
const SHARE_SCHEMA_VERSION = 1;
const SHARE_MAX_JSON_CHARS = 12000; // safety
const SHARE_SOFT_URL_MAX = 9000;
const SHARE_ALLOWED_SETTINGS = [
  'formula_profile','mitigation_model','mitigation_k','crit_cap','burst_bonus_pct',
  'burst_mode','orb_gain_per_skill','initial_orbs','mc_seed','hist_bins',
  'pierce_cap','resist_cap','elem_adv_bonus_pct','elem_disadv_penalty_pct'
];

function base64UrlEncode(str){
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function base64UrlDecode(b64url){
  let b64 = (b64url||"").replace(/-/g,'+').replace(/_/g,'/');
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function getCurrentSimSelection(){
  const buildId = $("#simBuild")?.value || state.builds[0]?.id || null;
  const rotId = $("#simRot")?.value || state.rotations[0]?.id || null;
  const scId = $("#simSc")?.value || state.scenarios[0]?.id || null;
  const duration = Math.max(1, toNum($("#simDur")?.value, 30));
  const iters = Math.max(1, Math.round(toNum($("#simIters")?.value, 2000)));
  const mode = $("#simMode")?.value || 'expected';
  return {buildId, rotId, scId, duration, iters, mode};
}

function buildSharePayloadFromPreset(preset){
  return {
    version: 1,
    created_at: new Date().toISOString(),
    items: {
      preset: deepCopy(preset),
      model: {
        settings: deepCopy(state.settings || {}),
        model_sig: getBhCurrentModelSig(),
      }
    }
  };
}

function buildSharePayload(){
  const sel = getCurrentSimSelection();
  const build = findById(state.builds, sel.buildId) || state.builds[0];
  const rot = findById(state.rotations, sel.rotId) || state.rotations[0];
  const scen = findById(state.scenarios, sel.scId) || state.scenarios[0];
  if (!build || !rot || !scen) throw new Error('Aucun setup à partager.');

  const db = getActiveDb();
  const dbWhen = (LIVE_DB_META && (LIVE_DB_META.generated_at || LIVE_DB_META.updated)) || (db && db.updated) || state.meta?.updated || null;

  const settings = {};
  for (const k of SHARE_ALLOWED_SETTINGS){
    if (state.settings && (k in state.settings)) settings[k] = state.settings[k];
  }

  const payload = {
    v: SHARE_SCHEMA_VERSION,
    id: uid('sh'),
    name: (build.name ? (build.name + ' · ' + (scen.name || 'Scénario')) : 'Setup partagé').slice(0, 90),
    exported_at: new Date().toISOString(),
    app: { version: state.meta?.version || '—' },
    db: {
      label: getActiveDbLabel(),
      when: dbWhen,
      counts: { characters: db.characters?.length||0, weapons: db.weapons?.length||0 },
      sources: (LIVE_DB_META && LIVE_DB_META.sources) ? LIVE_DB_META.sources : null
    },
    sim: { duration: sel.duration, iters: sel.iters, mode: sel.mode },
    items: {
      build: {
        name: build.name || 'Build',
        stats: deepCopy(build.stats || {}),
        source: deepCopy(build.source || {character_id:null, weapon_id:null}),
        notes: build.notes || ''
      },
      rotation: {
        name: rot.name || 'Rotation',
        type: rot.type || 'priority',
        actions: deepCopy(rot.actions || []),
        timeline: deepCopy(rot.timeline || []),
        loop: !!rot.loop,
        period: rot.period ?? 20,
        burstPlan: deepCopy(rot.burstPlan || {enabled:true,start:10,duration:7})
      },
      scenario: {
        name: scen.name || 'Scénario',
        enemy: deepCopy(scen.enemy || {})
      }
    },
    settings
  };

  // Attach last result if it matches current selection
  const last = state._lastSimSummary;
  if (last && last.sim && last.sim.build_id === sel.buildId && last.sim.rot_id === sel.rotId && last.sim.scen_id === sel.scId){
    payload.last_result = { at: last.at, mean: last.result?.mean, p10: last.result?.p10, p50: last.result?.p50, p90: last.result?.p90, mode: last.sim.mode };
  }
  return payload;
}

function encodeSharePayload(payload){
  const json = JSON.stringify(payload);
  if (json.length > SHARE_MAX_JSON_CHARS) throw new Error('Setup trop volumineux pour un lien. Utilise Export JSON.');
  return base64UrlEncode(json);
}

function decodeSharePayload(encoded){
  const json = base64UrlDecode(encoded);
  if (json.length > SHARE_MAX_JSON_CHARS) throw new Error('Payload trop volumineux.');
  const obj = JSON.parse(json);
  validateSharePayload(obj);
  return obj;
}

function validateSharePayload(o){
  if (!o || typeof o !== 'object') throw new Error('Payload invalide.');
  if (o.v !== SHARE_SCHEMA_VERSION) throw new Error('Version de partage non supportée.');
  if (typeof o.name !== 'string' || o.name.length > 120) throw new Error('Nom invalide.');
  if (!o.items || typeof o.items !== 'object') throw new Error('Items manquants.');
  if (!o.items.build || !o.items.rotation || !o.items.scenario) throw new Error('Build/rotation/scénario manquants.');

  const b = o.items.build;
  if (typeof b.name !== 'string' || b.name.length > 120) throw new Error('Build.name invalide.');
  if (!b.stats || typeof b.stats !== 'object') throw new Error('Build.stats invalide.');
  const allowedStats = ['atk','def','hp','element','crit_rate_pct','crit_dmg_pct','crit_resist_pen_pct','crit_def_pen_pct','dmg_bonus_pct','dmg_taken_pct','skill_dmg_pct','ult_dmg_pct','dmg_mult_pct','def_pen_pct','res_pen_pct','pierce_pct'];
  for (const k of Object.keys(b.stats)){
    if (!allowedStats.includes(k)) delete b.stats[k];
  }
  for (const k of Object.keys(b.stats)){
    const v = b.stats[k];
    if (k === 'element'){
      if (typeof v !== 'string' || v.length>20) b.stats[k]='neutral';
      continue;
    }
    if (typeof v !== 'number' || !isFinite(v)) b.stats[k] = 0;
  }

  const r = o.items.rotation;
  if (typeof r.name !== 'string' || r.name.length > 120) throw new Error('Rotation.name invalide.');
  if (!['priority','timeline'].includes(r.type)) r.type = 'priority';
  const arr = (r.type === 'timeline') ? (r.timeline||[]) : (r.actions||[]);
  if (!Array.isArray(arr)) throw new Error('Rotation actions/timeline invalide.');
  if (arr.length > 120) throw new Error('Rotation trop longue.');
  for (const a of arr){
    if (!a || typeof a !== 'object') throw new Error('Action invalide.');
    if (typeof a.label !== 'string') a.label = (a.kind || 'Action');
    if (a.label.length > 80) a.label = a.label.slice(0,80);
    if (r.type === 'timeline') a.t = clamp(toNum(a.t,0), 0, 600);
    a.kind = ['skill','ultimate','wait'].includes(a.kind) ? a.kind : 'skill';
    a.mult = clamp(toNum(a.mult,1), 0, 50);
    a.hits = Math.max(1, Math.min(200, Math.round(toNum(a.hits,1))));
    a.cd = clamp(toNum(a.cd,0), 0, 120);
    if (a.requiresOrbs != null) a.requiresOrbs = Math.max(0, Math.min(20, Math.round(toNum(a.requiresOrbs,0))));
    a.burstEligible = !!a.burstEligible;
  }

  const s = o.items.scenario;
  if (typeof s.name !== 'string' || s.name.length > 120) throw new Error('Scenario.name invalide.');
  if (!s.enemy || typeof s.enemy !== 'object') s.enemy = {};
  const e = s.enemy;
  e.def = clamp(toNum(e.def,0), 0, 200000);
  e.burst_resist = clamp(toNum(e.burst_resist,0), 0, 1);
  e.dmg_reduction_pct = clamp(toNum(e.dmg_reduction_pct,0), 0, 95);
  e.resistance_pct = clamp(toNum(e.resistance_pct,0), -100, 300);
  e.crit_resist_pct = clamp(toNum(e.crit_resist_pct,0), 0, 200);
  e.crit_def_pct = clamp(toNum(e.crit_def_pct,0), 0, 300);
  e.element = (typeof e.element === 'string' && e.element.length<=20) ? e.element : 'neutral';
  e.hp = clamp(toNum(e.hp,0), 0, 1e12);

  if (o.settings && typeof o.settings === 'object'){
    for (const k of Object.keys(o.settings)){
      if (!SHARE_ALLOWED_SETTINGS.includes(k)) delete o.settings[k];
    }
  } else {
    o.settings = {};
  }
}

function shareUrlFromEncoded(encoded){
  const base = window.location.href.split('#')[0];
  return base + '#share=' + encoded;
}

function buildDiscordMessage(payload, url){
  const b = payload.items?.build?.name || 'Build';
  const r = payload.items?.rotation?.name || 'Rotation';
  const s = payload.items?.scenario?.name || 'Scénario';
  const fp = payload.settings?.formula_profile ? `
Modèle: \`${payload.settings.formula_profile}\`` : '';
  let resLine = '';
  if (payload.last_result && typeof payload.last_result.mean === 'number'){
    resLine = `
Résultat (DPS moyen): **${fmt(payload.last_result.mean)}**`;
  }
  return `**[7DSO Theorycraft] ${b}**
Scenario: **${s}**
Rotation: **${r}**${fp}${resLine}

Lien: ${url}`;
}

function openShareModal(){
  let payload;
  try{
    payload = buildSharePayload();
  }catch(err){
    openModal('Partager', `<div class='p'>Impossible de générer un setup partageable.</div><div class='mono'>${escapeHtml(String(err))}</div>`, [
      {label:'OK', kind:'primary', onClick: closeModal}
    ]);
    return;
  }

  let encoded = '';
  let url = '';
  let warn = '';
  try{
    encoded = encodeSharePayload(payload);
    url = shareUrlFromEncoded(encoded);
    if (url.length > SHARE_SOFT_URL_MAX){
      warn = `<div class='hint warn'>Lien long (${url.length} caractères). Si un navigateur refuse, utilise Export JSON.</div>`;
    }
  }catch(err){
    warn = `<div class='hint warn'>${escapeHtml(String(err))}</div>`;
  }

  const discordMsg = url ? buildDiscordMessage(payload, url) : '';

  const body = `
    <div class='p'>Partage un setup complet (build + rotation + scénario + paramètres). Les autres pourront l'importer en ouvrant le lien.</div>
    ${warn}
    <div class='form'>
      <label>Lien partage
        <input id='shareLink' value='${escapeHtml(url)}' readonly/>
      </label>
      <label>Message Discord (copiable)
        <textarea id='shareMsg' readonly>${escapeHtml(discordMsg)}</textarea>
      </label>
      <div class='hint tiny'>Astuce : lance une simulation avant de partager pour inclure le DPS moyen.</div>
    </div>
  `;

  openModal('Partager', body, [
    {label:'Copier le lien', kind:'primary', onClick: async () => {
      const link = $("#shareLink")?.value || url;
      if (!link){ showToast('Lien indisponible', 'warn'); return; }
      const ok = await copyToClipboard(link);
      showToast(ok ? 'Lien copié' : 'Copie impossible', ok ? 'good' : 'bad');
    }},
    {label:'Copier message Discord', kind:'ghost', onClick: async () => {
      const msg = $("#shareMsg")?.value || discordMsg;
      if (!msg){ showToast('Message indisponible', 'warn'); return; }
      const ok = await copyToClipboard(msg);
      showToast(ok ? 'Message copié' : 'Copie impossible', ok ? 'good' : 'bad');
    }},
    {label:'Exporter JSON', kind:'ghost', onClick: () => downloadJson('7dso_share_payload.json', payload)},
    {label:'Fermer', kind:'ghost', onClick: closeModal},
  ]);
}

function parseShareFromHash(){
  const h = (window.location.hash || '').replace(/^#/, '');
  if (!h) return null;
  // allow multiple params in hash e.g. share=...&view=...
  const params = new URLSearchParams(h.replace(/\?/g,''));
  const encoded = params.get('share');
  if (encoded) return encoded;
  if (h.startsWith('share=')) return h.slice(6);
  return null;
}

function clearShareFromUrl(){
  const base = window.location.href.split('#')[0];
  history.replaceState(null, '', base + '#');
}

function renderShareImportSummary(o){
  const b = o.items?.build?.name || '—';
  const r = o.items?.rotation?.name || '—';
  const s = o.items?.scenario?.name || '—';
  const db = o.db ? `${escapeHtml(o.db.label||'DB')} · ${(o.db.when||'—')}` : '—';
  const fp = o.settings?.formula_profile || state.settings.formula_profile;
  return `
    <div class='p'><b>${escapeHtml(o.name||'Setup partagé')}</b></div>
    <div class='kv'>
      <div class='k'>Build</div><div class='v'>${escapeHtml(b)}</div>
      <div class='k'>Rotation</div><div class='v'>${escapeHtml(r)}</div>
      <div class='k'>Scénario</div><div class='v'>${escapeHtml(s)}</div>
      <div class='k'>Modèle</div><div class='v'>${escapeHtml(fp||'—')}</div>
      <div class='k'>DB</div><div class='v'>${db}</div>
    </div>
    <div class='hint'>Importer ajoutera ces éléments à ta liste locale (modifiable). Tu pourras ensuite simuler / comparer.</div>
  `;
}

function importSharePayload(o){
  validateSharePayload(o);

  const b = deepCopy(o.items.build);
  const r = deepCopy(o.items.rotation);
  const s = deepCopy(o.items.scenario);

  const newBuild = {
    id: uid('b'),
    name: (b.name || 'Build importé').slice(0,120),
    stats: b.stats || {},
    source: b.source || {character_id:null, weapon_id:null},
    notes: b.notes || ''
  };

  const newRot = {
    id: uid('r'),
    name: (r.name || 'Rotation importée').slice(0,120),
    type: r.type || 'priority',
    burstPlan: r.burstPlan || {enabled:true,start:10,duration:7}
  };
  if (newRot.type === 'timeline'){
    newRot.timeline = Array.isArray(r.timeline) ? r.timeline : [];
    newRot.loop = !!r.loop;
    newRot.period = r.period ?? 20;
  } else {
    newRot.actions = Array.isArray(r.actions) ? r.actions : [];
  }

  const newSc = {
    id: uid('s'),
    name: (s.name || 'Scénario importé').slice(0,120),
    enemy: s.enemy || {def:0, burst_resist:0, dmg_reduction_pct:0, element:'neutral', hp:0}
  };

  // Apply allowed settings
  if (o.settings){
    for (const k of SHARE_ALLOWED_SETTINGS){
      if (k in o.settings) state.settings[k] = o.settings[k];
    }
  }

  state.builds.unshift(newBuild);
  state.rotations.unshift(newRot);
  state.scenarios.unshift(newSc);

  selectedBuildId = newBuild.id;
  selectedRotId = newRot.id;
  selectedScId = newSc.id;

  ensureIds();
  saveState();
  refreshAll();

  // Select in simulate
  $("#simBuild").value = newBuild.id;
  $("#simRot").value = newRot.id;
  $("#simSc").value = newSc.id;

  // Apply sim defaults if present
  if (o.sim){
    $("#simDur").value = o.sim.duration ?? 30;
    $("#simIters").value = o.sim.iters ?? 2000;
    $("#simMode").value = o.sim.mode ?? 'expected';
  }
}

function maybePromptShareImport(){
  const encoded = parseShareFromHash();
  if (!encoded) return;

  // prevent loops in same tab
  const key = '7dso_share_seen_' + encoded.slice(0, 16);
  if (sessionStorage.getItem(key) === '1') return;

  let payload;
  try{
    payload = decodeSharePayload(encoded);
  }catch(err){
    sessionStorage.setItem(key, '1');
    openModal('Lien de partage invalide', `<div class='p'>Le lien ne peut pas être importé.</div><div class='mono'>${escapeHtml(String(err))}</div>`, [
      {label:'OK', kind:'primary', onClick: () => { closeModal(); clearShareFromUrl(); }}
    ]);
    return;
  }

  sessionStorage.setItem(key, '1');
  openModal('Importer un setup', renderShareImportSummary(payload), [
    {label:'Annuler', kind:'ghost', onClick: () => { closeModal(); clearShareFromUrl(); }},
    {label:'Importer', kind:'primary', onClick: () => {
      try{
        importSharePayload(payload);
        closeModal();
        clearShareFromUrl();
        setView('simulate');
        showToast('Setup importé', 'good');
      }catch(err2){
        openModal('Erreur import', `<div class='p'>Import impossible.</div><div class='mono'>${escapeHtml(String(err2))}</div>`, [
          {label:'OK', kind:'primary', onClick: closeModal}
        ]);
      }
    }}
  ]);
}

function bindShare(){
  $("#btnShare")?.addEventListener('click', openShareModal);
}

// ---------- Data helpers ----------
function findById(arr, id){ return (arr||[]).find(x => x.id === id); }

function ensureIds(){
  state.builds = Array.isArray(state.builds) ? state.builds : [];
  state.rotations = Array.isArray(state.rotations) ? state.rotations : [];
  state.scenarios = Array.isArray(state.scenarios) ? state.scenarios : [];
  state.db = state.db || {schema_version:"0.1", characters:[], weapons:[]};
  state.dbx = state.dbx || null;
  state._sessionDbX = state._sessionDbX || null;
  state.db.characters = Array.isArray(state.db.characters) ? state.db.characters : [];
  state.db.weapons = Array.isArray(state.db.weapons) ? state.db.weapons : [];

  for (const b of state.builds){ if (!b.id) b.id = uid("b"); if (!b.stats) b.stats = {}; if (!b.source) b.source = {character_id:null, weapon_id:null}; }
  for (const r of state.rotations){ if (!r.id) r.id = uid("r"); if (!r.burstPlan) r.burstPlan = {enabled:true,start:10,duration:7}; }
  for (const s of state.scenarios){ if (!s.id) s.id = uid("s"); if (!s.enemy) s.enemy = {def:0, burst_resist:0, dmg_reduction_pct:0, element:"neutral", hp:0}; }

  // Ensure settings presence
  state.settings = Object.assign({}, defaults.settings, state.settings || {});
  state.limits = Object.assign({}, defaults.limits, state.limits || {});
  state.meta = Object.assign({}, defaults.meta, state.meta || {});
}

// ---------- Quickstart ----------
function bindQuickstart(){
  $("#btnQuickstart")?.addEventListener("click", () => {
    setView("simulate");
    setTimeout(() => {
      $("#simBuild").value = state.builds[0]?.id || "";
      $("#simRot").value = state.rotations[0]?.id || "";
      $("#simSc").value = state.scenarios[0]?.id || "";
      $("#simDur").value = 30;
      $("#simIters").value = 2000;
      $("#simMode").value = "expected";
      runSim();
    }, 30);
  });

  $("#btnLoadExample1")?.addEventListener("click", () => {
    openModal("Exemples", "<div class='p'>Les exemples sont déjà dans le site. Va sur “Simuler”.</div>", [
      {label:"Simuler", kind:"primary", onClick: () => { closeModal(); setView("simulate"); }},
      {label:"OK", kind:"ghost", onClick: closeModal}
    ]);
  });

  $("#btnLoadExample2")?.addEventListener("click", () => {
    setView("simulate");
    setTimeout(() => {
      const b = state.builds.find(x => x.id === "example_burst") || state.builds[0];
      const r = state.rotations.find(x => x.id === "burst_nuke") || state.rotations[0];
      const s = state.scenarios.find(x => x.id === "boss") || state.scenarios[0];
      $("#simBuild").value = b?.id || "";
      $("#simRot").value = r?.id || "";
      $("#simSc").value = s?.id || "";
      $("#simDur").value = 30;
      $("#simIters").value = 4000;
      $("#simMode").value = "mc";
      runSim();
    }, 30);
  });
}

// ---------- Wizard (build) ----------
const wizard = { step: 0, model: { name:"", style:"dps", atk:5000, critTier:"mid", critDmgTier:"mid", bonusTier:"low" } };
function wizStepsDef(){
  return [
    {key:"name", label:"Nom"},
    {key:"style", label:"Style"},
    {key:"atk", label:"ATK"},
    {key:"crit", label:"Crit"},
    {key:"critdmg", label:"Crit DMG"},
    {key:"bonus", label:"Bonus"},
    {key:"done", label:"Créer"},
  ];
}
function renderWizSteps(){
  const steps = wizStepsDef();
  const box = $("#wizSteps");
  if (!box) return;
  box.innerHTML = "";
  steps.forEach((s, i) => {
    const d = document.createElement("div");
    d.className = "step " + (i===wizard.step ? "active" : (i<wizard.step ? "done" : ""));
    d.textContent = `${i+1}. ${s.label}`;
    box.appendChild(d);
  });
}
function choiceGrid(choices, selected, onSelect){
  const g = document.createElement("div");
  g.className = "choiceGrid";
  choices.forEach(c => {
    const div = document.createElement("div");
    div.className = "choice" + (c.value===selected ? " active" : "");
    div.innerHTML = `<div class="t">${escapeHtml(c.title)}</div><div class="d">${escapeHtml(c.desc)}</div>`;
    div.addEventListener("click", () => onSelect(c.value));
    g.appendChild(div);
  });
  return g;
}
function buildFromWizard(m){
  const name = (m.name && m.name.trim()) ? m.name.trim() : (m.style === "burst" ? "build_burst" : "build_dps");
  const critTierMap = { low: 20, mid: 35, high: 55 };
  const critDmgTierMap = { low: 45, mid: 65, high: 95 };
  const bonusTierMap = { none: 0, low: 10, mid: 20, high: 35 };
  return {
    id: uid("b"),
    name,
    stats: {
      atk: Math.round(toNum(m.atk, 5000)),
      def: 0,
      crit_rate_pct: critTierMap[m.critTier] ?? 35,
      crit_dmg_pct: critDmgTierMap[m.critDmgTier] ?? 65,
      dmg_bonus_pct: bonusTierMap[m.bonusTier] ?? 10,
      def_pen_pct: 0,
      dmg_taken_pct: 0,
      element: (m.style === "burst" ? "fire" : "neutral"),
    },
    source: {character_id:null, weapon_id:null}
  };
}
function renderWizard(){
  renderWizSteps();
  const steps = wizStepsDef();
  const stepKey = steps[wizard.step].key;
  const body = $("#wizBody"); if (!body) return;
  $("#wizHint").textContent = "";
  body.innerHTML = "";

  const nextBtn = $("#wizNext");
  const backBtn = $("#wizBack");
  backBtn.disabled = wizard.step === 0;

  if (stepKey === "name"){
    $("#wizTitle").textContent = "Donne un nom à ton build";
    body.innerHTML = `
      <div class="form">
        <label>Nom <input id="wizName" placeholder="ex: mon_dps"/></label>
        <div class="hint">Exemple : <b>tristan_dps</b> ou <b>diane_burst</b>.</div>
      </div>`;
    setTimeout(()=> { $("#wizName").value = wizard.model.name; $("#wizName").focus(); }, 0);
    nextBtn.textContent = "Suivant";
    $("#wizHint").textContent = "Astuce : perso + but (dps/burst).";
  } else if (stepKey === "style"){
    $("#wizTitle").textContent = "Quel style de dégâts ?";
    body.appendChild(choiceGrid([
      {value:"dps", title:"DPS constant", desc:"Plus stable. Bon pour comparer des builds."},
      {value:"burst", title:"Burst / Nuke", desc:"Gros pic de dégâts pendant une fenêtre Burst."},
    ], wizard.model.style, (v)=>{ wizard.model.style=v; renderWizard(); }));
    nextBtn.textContent = "Suivant";
  } else if (stepKey === "atk"){
    $("#wizTitle").textContent = "Choisis ton ATK";
    body.innerHTML = `
      <div class="p"><span class="pill good">ATK : <b><span id="atkVal">${fmt(wizard.model.atk)}</span></b></span></div>
      <div class="form">
        <input id="atkRange" type="range" min="1000" max="15000" step="50" value="${wizard.model.atk}">
        <div class="hint">Si tu ne sais pas : laisse par défaut, puis compare A vs B.</div>
      </div>`;
    const r = $("#atkRange"), v = $("#atkVal");
    r.addEventListener("input", () => { wizard.model.atk = Number(r.value); v.textContent = fmt(wizard.model.atk); });
    nextBtn.textContent = "Suivant";
  } else if (stepKey === "crit"){
    $("#wizTitle").textContent = "Taux de crit";
    body.appendChild(choiceGrid([
      {value:"low", title:"Bas (10–25%)", desc:"Si tu as peu de crit."},
      {value:"mid", title:"Moyen (25–45%)", desc:"Cas courant."},
      {value:"high", title:"Élevé (45–70%)", desc:"Build orienté crit."},
    ], wizard.model.critTier, (v)=>{ wizard.model.critTier=v; renderWizard(); }));
    nextBtn.textContent = "Suivant";
  } else if (stepKey === "critdmg"){
    $("#wizTitle").textContent = "Dégâts crit";
    body.appendChild(choiceGrid([
      {value:"low", title:"Faible (+30–50%)", desc:"Crit peu rentable."},
      {value:"mid", title:"Moyen (+50–80%)", desc:"Standard."},
      {value:"high", title:"Élevé (+80–120%)", desc:"Gros crits."},
    ], wizard.model.critDmgTier, (v)=>{ wizard.model.critDmgTier=v; renderWizard(); }));
    nextBtn.textContent = "Suivant";
  } else if (stepKey === "bonus"){
    $("#wizTitle").textContent = "Bonus dégâts (buffs / passifs)";
    body.appendChild(choiceGrid([
      {value:"none", title:"0%", desc:"Je ne sais pas / je mets 0."},
      {value:"low", title:"~10%", desc:"Un petit buff/passif."},
      {value:"mid", title:"~20%", desc:"Plusieurs buffs."},
      {value:"high", title:"~35%", desc:"Setup complet."},
    ], wizard.model.bonusTier, (v)=>{ wizard.model.bonusTier=v; renderWizard(); }));
    nextBtn.textContent = "Suivant";
  } else if (stepKey === "done"){
    $("#wizTitle").textContent = "Résumé";
    const preview = buildFromWizard(wizard.model);
    const s = preview.stats;
    body.innerHTML = `
      <div class="p"><b>Nom :</b> ${escapeHtml(preview.name)}</div>
      <div class="p"><b>ATK :</b> ${fmt(s.atk)} — <b>Crit :</b> ${fmtPct(s.crit_rate_pct)} — <b>Crit DMG :</b> ${fmtPct(s.crit_dmg_pct)} — <b>Bonus :</b> ${fmtPct(s.dmg_bonus_pct)}</div>
      <div class="hint">Clique “Créer” pour l’ajouter à tes builds.</div>`;
    nextBtn.textContent = "Créer";
    $("#wizHint").textContent = "Après : va sur Simuler ou Comparer.";
  }
}
function bindWizard(){
  $("#wizBack")?.addEventListener("click", () => { if (wizard.step>0){ wizard.step--; renderWizard(); }});
  $("#wizNext")?.addEventListener("click", () => {
    const stepKey = wizStepsDef()[wizard.step].key;
    if (stepKey === "name"){
      wizard.model.name = ($("#wizName")?.value || "").trim();
      wizard.step++; renderWizard(); return;
    }
    if (stepKey === "done"){
      const b = buildFromWizard(wizard.model);
      if (state.builds.some(x => (x.name||"").toLowerCase() === b.name.toLowerCase())){
        b.name = b.name + "_" + Math.floor(Math.random()*1000);
      }
      state.builds.unshift(b);
      selectedBuildId = b.id;
      saveState();
      refreshAll();
      openModal("Build créé", "<div class='p'>Build ajouté. Tu peux simuler ou comparer.</div>", [
        {label:"Simuler", kind:"primary", onClick: () => { closeModal(); setView("simulate"); }},
        {label:"OK", kind:"ghost", onClick: closeModal}
      ]);
      wizard.step = 0;
      wizard.model = { name:"", style:"dps", atk:5000, critTier:"mid", critDmgTier:"mid", bonusTier:"low" };
      renderWizard();
      return;
    }
    wizard.step = Math.min(wizard.step+1, wizStepsDef().length-1);
    renderWizard();
  });
  renderWizard();
}

// ---------- Builds CRUD ----------
let selectedBuildId = null;

function buildSummary(b){
  const s = b.stats || {};
  const src = b.source?.character_id ? " · DB" : "";
  return `ATK ${fmt(s.atk||0)} · Crit ${fmtPct(s.crit_rate_pct||0)} · CritDMG ${fmtPct(s.crit_dmg_pct||0)} · Bonus ${fmtPct(s.dmg_bonus_pct||0)}${src}`;
}

function refreshBuildsUI(){
  const list = $("#buildList"); if (!list) return;
  list.innerHTML = "";
  state.builds.forEach(b => {
    const div = document.createElement("div");
    div.className = "item" + (b.id===selectedBuildId ? " active" : "");
    div.innerHTML = `<div class="item-title">${escapeHtml(b.name)}</div><div class="item-sub">${escapeHtml(buildSummary(b))}</div>`;
    div.addEventListener("click", () => { selectedBuildId = b.id; loadBuildToForm(b); refreshBuildsUI(); refreshAllSelectors(); });
    list.appendChild(div);
  });
}

function loadBuildToForm(b){
  const s = b.stats || {};
  $("#buildName").value = b.name || "";
  // Character link + potentials
  const charId = b.character_id || b.characterId || "";
  const sel = $("#buildCharacter");
  if (sel) sel.value = charId;
  renderBuildPotentials(charId, b.potentials_enabled || b.potentialsEnabled || []);
  $("#statAtk").value = s.atk ?? 0;
  $("#statDef").value = s.def ?? 0;
  $("#statCrit").value = s.crit_rate_pct ?? 0;
  $("#statCritDmg").value = s.crit_dmg_pct ?? 0;
  $("#statDmgBonus").value = s.dmg_bonus_pct ?? 0;
  $("#statDefPen").value = s.def_pen_pct ?? 0;
  $("#statDmgTaken").value = s.dmg_taken_pct ?? 0;
  $("#statElement").value = s.element ?? "neutral";
}

function renderBuildPotentials(charId, enabledIds=[]){
  const wrap = $("#buildPotentials");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!charId){
    wrap.innerHTML = "<span class='hint tiny'>Sélectionne un personnage pour afficher ses potentiels.</span>";
    return;
  }
  const ch = findKitCharById(charId);
  if (!ch){
    wrap.innerHTML = "<span class='hint tiny'>Aucun kit trouvé pour ce personnage (DB/kits).</span>";
    return;
  }
  const enabled = new Set((enabledIds||[]).map(String));
  const pots = Array.isArray(ch.potentials) ? ch.potentials : [];
  if (!pots.length){
    wrap.innerHTML = "<span class='hint tiny'>Ce personnage n’a pas de potentiels définis (pour l’instant).</span>";
    return;
  }
  for (const p of pots){
    const id = String(p.id);
    const pill = document.createElement("label");
    pill.className = "pill";
    pill.innerHTML = `<input type='checkbox' data-pot='${escapeHtml(id)}' ${enabled.has(id)?"checked":""}/> <span>${escapeHtml(p.name||id)}</span>`;
    wrap.appendChild(pill);
  }
}

function readBuildForm(){
  const charId = $("#buildCharacter")?.value || "";
  const enabled = $$("#buildPotentials input[data-pot]").filter(x=>x.checked).map(x=>x.getAttribute("data-pot"));
  return {
    name: ($("#buildName").value || "").trim(),
    character_id: charId || undefined,
    potentials_enabled: enabled,
    stats: {
      atk: toNum($("#statAtk").value, 0),
      def: toNum($("#statDef").value, 0),
      crit_rate_pct: toNum($("#statCrit").value, 0),
      crit_dmg_pct: toNum($("#statCritDmg").value, 0),
      dmg_bonus_pct: toNum($("#statDmgBonus").value, 0),
      def_pen_pct: toNum($("#statDefPen").value, 0),
      dmg_taken_pct: toNum($("#statDmgTaken").value, 0),
      element: $("#statElement").value || "neutral"
    }
  };
}

function refreshBuildCharacterSelect(){
  const sel = $("#buildCharacter");
  if (!sel) return;
  const cur = sel.value;
  // Keep first option (none)
  sel.querySelectorAll("option").forEach((o,i)=>{ if (i>0) o.remove(); });
  const chars = getKitCharacters();
  for (const c of chars){
    const opt = document.createElement("option");
    opt.value = String(c.id);
    opt.textContent = c.name || String(c.id);
    sel.appendChild(opt);
  }
  if (cur && chars.some(c => String(c.id) === String(cur))) sel.value = cur;
}

function bindBuilds(){
  // Character select -> potentials
  $("#buildCharacter")?.addEventListener("change", () => {
    const charId = $("#buildCharacter").value || "";
    renderBuildPotentials(charId, []);
  });

  $("#btnNewBuild")?.addEventListener("click", () => {
    selectedBuildId = null;
    $("#buildName").value = "";
    if ($("#buildCharacter")) $("#buildCharacter").value = "";
    renderBuildPotentials("", []);
    $("#statAtk").value = 5000;
    $("#statDef").value = 0;
    $("#statCrit").value = 35;
    $("#statCritDmg").value = 65;
    $("#statDmgBonus").value = 0;
    $("#statDefPen").value = 0;
    $("#statDmgTaken").value = 0;
    $("#statElement").value = "neutral";
    $("#buildMsg").textContent = "Nouveau build.";
    refreshBuildsUI();
    refreshAllSelectors();
  });

  $("#btnSaveBuild")?.addEventListener("click", () => {
    const data = readBuildForm();
    if (!data.name){ $("#buildMsg").textContent = "Donne un nom au build."; return; }
    if (selectedBuildId){
      const b = findById(state.builds, selectedBuildId);
      if (!b){ $("#buildMsg").textContent = "Build introuvable."; return; }
      b.name = data.name;
      b.stats = data.stats;
      b.character_id = data.character_id;
      b.potentials_enabled = data.potentials_enabled;
      // keep source if already set
      b.source = b.source || {character_id:null, weapon_id:null};
      $("#buildMsg").textContent = "Build modifié.";
    }else{
      const b = {id: uid("b"), name: data.name, stats: data.stats, source:{character_id:null, weapon_id:null}};
      if (data.character_id) b.character_id = data.character_id;
      b.potentials_enabled = data.potentials_enabled || [];
      state.builds.unshift(b);
      selectedBuildId = b.id;
      $("#buildMsg").textContent = "Build créé.";
    }
    saveState();
    refreshAll();
  });

  $("#btnDeleteBuild")?.addEventListener("click", () => {
    if (!selectedBuildId){ $("#buildMsg").textContent = "Sélectionne un build."; return; }
    const b = findById(state.builds, selectedBuildId);
    if (!b) return;
    openModal("Supprimer ?", `<div class='p'>Supprimer <b>${escapeHtml(b.name)}</b> ?</div>`, [
      {label:"Annuler", kind:"ghost", onClick: closeModal},
      {label:"Supprimer", kind:"danger", onClick: () => {
        state.builds = state.builds.filter(x => x.id !== selectedBuildId);
        selectedBuildId = state.builds[0]?.id || null;
        saveState();
        refreshAll();
        closeModal();
        $("#buildMsg").textContent = "Build supprimé.";
      }}
    ]);
  });
}

// ---------- Rotations CRUD ----------
let selectedRotId = null;

function refreshRotationCharacterSelect(){
  const sel = $("#rotChar"); 
  if (!sel) return;
  const chars = getKitCharacters();
  sel.innerHTML = '<option value="">— Aucun —</option>' + chars.map(c => `<option value="${escapeHtml(String(c.id))}">${escapeHtml(c.name)}</option>`).join("");
  const r = currentRot();
  if (r && r.character_id) sel.value = String(r.character_id);
}

function getSkillsForCharacter(charId){
  const ch = findKitCharById(charId);
  return (ch && Array.isArray(ch.skills)) ? ch.skills : [];
}

function rotSummary(r){
  if (r.type === "priority") return `Priority · ${(r.actions||[]).length} actions`;
  return `Timeline · ${(r.timeline||[]).length} events`;
}
function refreshRotationsUI(){
  const list = $("#rotList"); if (!list) return;
  list.innerHTML = "";
  state.rotations.forEach(r => {
    const div = document.createElement("div");
    div.className = "item" + (r.id===selectedRotId ? " active" : "");
    div.innerHTML = `<div class="item-title">${escapeHtml(r.name)}</div><div class="item-sub">${escapeHtml(rotSummary(r))}</div>`;
    div.addEventListener("click", () => { selectedRotId = r.id; loadRotToForm(r); refreshRotationsUI(); refreshAllSelectors(); });
    list.appendChild(div);
  });
}
function loadRotToForm(r){
  $("#rotName").value = r.name || "";
  $("#rotType").value = r.type || "priority";
  refreshRotationCharacterSelect();
  $("#rotChar") && ($("#rotChar").value = r.character_id ? String(r.character_id) : "");
  renderRotActions(r);
}
function currentRot(){ return selectedRotId ? findById(state.rotations, selectedRotId) : null; }
function renderRotActions(r){
  const box = $("#rotActions"); if (!box) return;
  box.innerHTML = "";
  const arr = (r.type === "priority") ? (r.actions || []) : (r.timeline || []);
  arr.forEach((a, i) => {
    const div = document.createElement("div");
    div.className = "item";
    const sub = (r.type === "timeline")
      ? `t=${a.t ?? 0}s · mult ${a.mult ?? 0} · hits ${a.hits ?? 1} · cd ${a.cd ?? 0}s`
      : `mult ${a.mult ?? 0} · hits ${a.hits ?? 1} · cd ${a.cd ?? 0}s`;
    div.innerHTML = `<div class="item-title">${escapeHtml(a.label || a.kind)}</div><div class="item-sub">${escapeHtml(sub)}</div>`;
    div.addEventListener("click", () => editAction(r, i));
    box.appendChild(div);
  });
  if (arr.length === 0){
    const d = document.createElement("div");
    d.className = "hint";
    d.textContent = "Aucune action. Utilise l’assistant rotation ou ajoute une action.";
    box.appendChild(d);
  }
}
function saveRotDraft(r){
  saveState();
  renderRotActions(r);
  refreshRotationsUI();
  refreshAllSelectors();
}
function editAction(rot, idx){
  const isTimeline = rot.type === "timeline";
  const arr = isTimeline ? (rot.timeline || []) : (rot.actions || []);
  const a = arr[idx];
  const charId = rot.character_id || "";
  const skills = charId ? getSkillsForCharacter(charId) : [];
  const skillOptions = skills.map((s,i)=>`<option value="${i}">${escapeHtml(s.name || ('Skill '+(i+1)))}</option>`).join("");
  const skillSelectHtml = charId
    ? `<label class="withHelp">Skill (DB) <span class="help" data-tip="Sélectionne une skill du personnage (auto mult/hits/type + effets).">?</span><select id="eaSkill"><option value="">— Manuel —</option>${skillOptions}</select></label>`
    : `<div class="hint tiny">Définis un personnage sur la rotation pour activer le Skill Picker.</div>`;
  const body = `
    <div class="form">
      <label>Label <input id="eaLabel" value="${escapeHtml(a.label || "")}"/></label>
      ${skillSelectHtml}
      <div id="eaSkillDebug" class="hint tiny" style="margin-top:-6px"></div>
      ${isTimeline ? `<label>Temps (s) <input id="eaT" type="number" step="0.1" value="${a.t ?? 0}"/></label>` : ``}
      <div class="grid3">
        <label>Multiplicateur <input id="eaMult" type="number" step="0.1" value="${a.mult ?? 1}"/></label>
        <label>Hits <input id="eaHits" type="number" step="1" min="1" value="${a.hits ?? 1}"/></label>
        <label>CD (s) <input id="eaCd" type="number" step="0.1" min="0" value="${a.cd ?? 0}"/></label>
      </div>
      <div class="grid3">
        <label>Orbes requis <input id="eaOrbs" type="number" step="1" min="0" value="${a.requiresOrbs ?? 0}"/></label>
        <label>Burst éligible
          <select id="eaBurst">
            <option value="1" ${a.burstEligible ? "selected":""}>Oui</option>
            <option value="0" ${!a.burstEligible ? "selected":""}>Non</option>
          </select>
        </label>
        <label>Type
          <select id="eaKind">
            <option value="skill" ${a.kind==="skill"?"selected":""}>Skill</option>
            <option value="ultimate" ${a.kind==="ultimate"?"selected":""}>Ultimate</option>
            <option value="wait" ${a.kind==="wait"?"selected":""}>Wait</option>
          </select>
        </label>
      </div>
      <div class="hint">Tip : si tu ne sais pas, garde hits=1 et change surtout mult + CD.</div>
    </div>
  `;
  openModal("Éditer action", body, [
    {label:"Supprimer", kind:"danger", onClick: () => {
      arr.splice(idx, 1);
      saveRotDraft(rot);
      closeModal();
    }},
    {label:"OK", kind:"primary", onClick: () => {
      a.label = ($("#eaLabel").value || a.label || "").trim();
      if (isTimeline) a.t = toNum($("#eaT").value, a.t ?? 0);
      a.mult = toNum($("#eaMult").value, a.mult ?? 1);
      a.hits = Math.max(1, Math.round(toNum($("#eaHits").value, a.hits ?? 1)));
      a.cd = Math.max(0, toNum($("#eaCd").value, a.cd ?? 0));
      const orbs = Math.max(0, Math.round(toNum($("#eaOrbs").value, a.requiresOrbs ?? 0)));
      if (orbs > 0) a.requiresOrbs = orbs; else delete a.requiresOrbs;
      a.burstEligible = ($("#eaBurst").value === "1");
      a.kind = $("#eaKind").value || a.kind;

      const skSel = $("#eaSkill");
      const skIdx = skSel ? skSel.value : "";
      if (skIdx !== ""){
        a.skill_index = Number(skIdx);
        const sk = skills[Number(skIdx)];
        if (sk){
          const m = toNum(sk.multiplier, null);
          if (m !== null) a.mult = m/100;
          a.hits = Math.max(1, Math.round(toNum(sk.hits, a.hits)));
          const t = String(sk.type||"").toLowerCase();
          a.kind = t.includes("ult") ? "ultimate" : "skill";
          if (!a.label) a.label = sk.name || a.label;
          // Store parsed effects snapshot on the action (optional debug)
          if (Array.isArray(sk.parsed_effects)) a.skill_effects = deepCopy(sk.parsed_effects);
          if (sk.confidence_score != null) a.skill_confidence = sk.confidence_score;
          if (sk.description_raw) a.skill_raw = sk.description_raw;
        }
      }else{
        delete a.skill_index;
        delete a.skill_effects;
        delete a.skill_confidence;
        delete a.skill_raw;
      }

      saveRotDraft(rot);
      closeModal();
    }},
  ]);
  setTimeout(() => {
    const sel = $("#eaSkill");
    const dbg = $("#eaSkillDebug");
    if (!sel || !dbg) return;
    const render = () => {
      const v = sel.value;
      if (v === "") { dbg.textContent = "Mode manuel."; return; }
      const sk = skills[Number(v)];
      if (!sk) { dbg.textContent = "—"; return; }
      const conf = sk.confidence_score != null ? sk.confidence_score : sk.confidenceScore;
      const eff = Array.isArray(sk.parsed_effects) ? sk.parsed_effects : [];
      const raw = sk.description_raw || sk.description || '';
      dbg.innerHTML = `Conf: <b>${escapeHtml(String(conf ?? '—'))}</b> · Effets: <span class="mono">${escapeHtml(JSON.stringify(eff))}</span>` + (raw ? `<br>Raw: <span class="mono">${escapeHtml(raw.slice(0,220))}${raw.length>220?'…':''}</span>` : '');
    };
    sel.addEventListener('change', render);
    render();
  }, 0);
  // Prefill selected skill
  setTimeout(() => {
    const s = $("#eaSkill");
    if (s && a.skill_index !== undefined && a.skill_index !== null) s.value = String(a.skill_index);
  }, 0);
}

function addRotAction(kind){
  if (!selectedRotId){ $("#rotMsg").textContent = "Sélectionne une rotation (ou crée-en une)."; return; }
  const r = currentRot();
  if (!r) return;
  const action = {
    kind,
    label: kind === "skill" ? "Skill" : (kind === "ultimate" ? "Ultimate" : "Wait"),
    mult: kind === "wait" ? 0 : (kind === "ultimate" ? 6.0 : 2.2),
    hits: 1,
    cd: kind === "ultimate" ? 30 : (kind === "skill" ? 8 : 1),
    burstEligible: kind !== "wait"
  };
  if (kind === "ultimate") action.requiresOrbs = 7;
  if (r.type === "priority"){
    r.actions = r.actions || [];
    r.actions.push(action);
  } else {
    r.timeline = r.timeline || [];
    const t = (r.timeline.length ? (r.timeline[r.timeline.length-1].t ?? 0) + 2 : 0);
    r.timeline.push({t, ...action});
  }
  saveRotDraft(r);
}

function rotationWizard(){
  const body = `
    <div class="p"><b>Assistant rotation</b> : crée une rotation de base (modifiable).</div>
    <div class="choiceGrid">
      <div class="choice" id="rw1"><div class="t">DPS simple</div><div class="d">2 skills + ultimate si possible</div></div>
      <div class="choice" id="rw2"><div class="t">Burst / Nuke</div><div class="d">Setup → nuke à 10s → follow</div></div>
    </div>
  `;
  openModal("Assistant rotation", body, [{label:"Fermer", kind:"ghost", onClick: closeModal}]);
  $("#rw1").addEventListener("click", () => {
    closeModal();
    const r = {
      id: uid("r"),
      name: "Rotation DPS",
      type: "priority",
      actions: [
        {kind:"skill", label:"Skill 1", mult:2.2, hits:1, cd:8, burstEligible:true},
        {kind:"skill", label:"Skill 2", mult:2.8, hits:1, cd:10, burstEligible:true},
        {kind:"ultimate", label:"Ultimate", mult:6.0, hits:1, cd:30, requiresOrbs:7, burstEligible:true},
      ],
      burstPlan: {enabled:true, start:10, duration:7}
    };
    state.rotations.unshift(r);
    selectedRotId = r.id;
    saveState();
    refreshAll();
    loadRotToForm(r);
    $("#rotMsg").textContent = "Rotation créée (modifiable).";
  });
  $("#rw2").addEventListener("click", () => {
    closeModal();
    const r = {
      id: uid("r"),
      name: "Rotation Burst",
      type: "timeline",
      loop: true,
      period: 20,
      timeline: [
        {t:0, kind:"skill", label:"Setup", mult:1.8, hits:1, cd:8, burstEligible:false},
        {t:7, kind:"skill", label:"Prep", mult:2.2, hits:1, cd:8, burstEligible:false},
        {t:10, kind:"ultimate", label:"Nuke", mult:7.2, hits:1, cd:30, requiresOrbs:7, burstEligible:true},
        {t:18, kind:"skill", label:"Follow", mult:2.8, hits:1, cd:10, burstEligible:true},
      ],
      burstPlan: {enabled:true, start:10, duration:7}
    };
    state.rotations.unshift(r);
    selectedRotId = r.id;
    saveState();
    refreshAll();
    loadRotToForm(r);
    $("#rotMsg").textContent = "Rotation créée (modifiable).";
  });
}

function bindRotations(){
  $("#rotChar")?.addEventListener("change", () => {
    const r = currentRot();
    if (!r) return;
    const v = $("#rotChar").value;
    if (v) r.character_id = v; else delete r.character_id;
    saveRotDraft(r);
  });

  $("#btnRotClear")?.addEventListener("click", () => {
    if (!selectedRotId){ $("#rotMsg").textContent = "Sélectionne une rotation."; return; }
    const r = currentRot();
    if (!r) return;
    if (r.type === "priority") r.actions = [];
    else r.timeline = [];
    saveRotDraft(r);
    $("#rotMsg").textContent = "Rotation vidée.";
  });

  $("#btnAddSkill")?.addEventListener("click", () => addRotAction("skill"));
  $("#btnAddUlt")?.addEventListener("click", () => addRotAction("ultimate"));
  $("#btnAddWait")?.addEventListener("click", () => addRotAction("wait"));

  $("#rotType")?.addEventListener("change", () => {
    if (!selectedRotId) return;
    const r = currentRot();
    if (!r) return;
    const newType = $("#rotType").value;
    if (r.type === newType) return;
    if (newType === "priority"){
      r.type = "priority";
      r.actions = (r.timeline || []).map(ev => ({kind: ev.kind, label: ev.label, mult: ev.mult, hits: ev.hits, cd: ev.cd, requiresOrbs: ev.requiresOrbs, burstEligible: ev.burstEligible}));
      delete r.timeline;
    } else {
      r.type = "timeline";
      r.timeline = (r.actions || []).map((a, i) => ({t: i*2, ...a}));
      r.loop = true;
      r.period = 20.0;
      delete r.actions;
    }
    saveRotDraft(r);
  });

  $("#btnSaveRot")?.addEventListener("click", () => {
    const name = ($("#rotName").value || "").trim();
    if (!name){ $("#rotMsg").textContent = "Donne un nom à la rotation."; return; }
    const type = $("#rotType").value || "priority";
    const character_id = ($("#rotChar")?.value || "").trim();

    if (selectedRotId){
      const r = currentRot();
      if (!r){ $("#rotMsg").textContent = "Rotation introuvable."; return; }
      r.name = name;
      r.type = type;
      if (character_id) r.character_id = character_id; else delete r.character_id;
      if (type === "priority" && !Array.isArray(r.actions)) r.actions = [];
      if (type === "timeline" && !Array.isArray(r.timeline)) r.timeline = [];
      $("#rotMsg").textContent = "Rotation modifiée.";
    } else {
      const r = {id: uid("r"), name, type, burstPlan:{enabled:true,start:10,duration:7}};
      if (type === "priority") r.actions = [];
      else { r.timeline = []; r.loop = true; r.period = 20.0; }
      state.rotations.unshift(r);
      selectedRotId = r.id;
      $("#rotMsg").textContent = "Rotation créée.";
    }
    saveState();
    refreshAll();
  });

  $("#btnDeleteRot")?.addEventListener("click", () => {
    if (!selectedRotId){ $("#rotMsg").textContent = "Sélectionne une rotation."; return; }
    const r = currentRot();
    if (!r) return;
    openModal("Supprimer ?", `<div class='p'>Supprimer <b>${escapeHtml(r.name)}</b> ?</div>`, [
      {label:"Annuler", kind:"ghost", onClick: closeModal},
      {label:"Supprimer", kind:"danger", onClick: () => {
        state.rotations = state.rotations.filter(x => x.id !== selectedRotId);
        selectedRotId = state.rotations[0]?.id || null;
        saveState();
        refreshAll();
        closeModal();
        $("#rotMsg").textContent = "Rotation supprimée.";
      }}
    ]);
  });

  $("#btnRotWizard")?.addEventListener("click", () => rotationWizard());
}

// ---------- Scenarios CRUD ----------
let selectedScId = null;

function scSummary(s){
  const e = s.enemy || {};
  return `DEF ${fmt(e.def ?? 0)} · BurstRes ${fmtPct((e.burst_resist ?? 0)*100)} · Red ${fmtPct(e.dmg_reduction_pct ?? 0)}`;
}
function refreshScenariosUI(){
  const list = $("#scList"); if (!list) return;
  list.innerHTML = "";
  state.scenarios.forEach(s => {
    const div = document.createElement("div");
    div.className = "item" + (s.id===selectedScId ? " active" : "");
    div.innerHTML = `<div class="item-title">${escapeHtml(s.name)}</div><div class="item-sub">${escapeHtml(scSummary(s))}</div>`;
    div.addEventListener("click", () => { selectedScId = s.id; loadScToForm(s); refreshScenariosUI(); refreshAllSelectors(); });
    list.appendChild(div);
  });
}
function loadScToForm(s){
  const e = s.enemy || {};
  $("#scName").value = s.name || "";
  $("#scDef").value = e.def ?? 0;
  $("#scBurstRes").value = e.burst_resist ?? 0;
  $("#scDmgRed").value = e.dmg_reduction_pct ?? 0;
  $("#scElement").value = e.element ?? "neutral";
  $("#scHp").value = e.hp ?? 0;
}
function readScForm(){
  return {
    name: ($("#scName").value || "").trim(),
    enemy: {
      def: toNum($("#scDef").value, 0),
      burst_resist: toNum($("#scBurstRes").value, 0),
      dmg_reduction_pct: toNum($("#scDmgRed").value, 0),
      element: $("#scElement").value || "neutral",
      hp: toNum($("#scHp").value, 0),
    }
  };
}
function bindScenarios(){
  $("#btnNewSc")?.addEventListener("click", () => {
    selectedScId = null;
    $("#scName").value = "";
    $("#scDef").value = 1200;
    $("#scBurstRes").value = 0.2;
    $("#scDmgRed").value = 0;
    $("#scElement").value = "neutral";
    $("#scHp").value = 0;
    $("#scMsg").textContent = "Nouveau scénario.";
    refreshScenariosUI();
    refreshAllSelectors();
  });

  $("#btnSaveSc")?.addEventListener("click", () => {
    const data = readScForm();
    if (!data.name){ $("#scMsg").textContent = "Donne un nom au scénario."; return; }
    if (selectedScId){
      const s = findById(state.scenarios, selectedScId);
      if (!s){ $("#scMsg").textContent = "Scénario introuvable."; return; }
      s.name = data.name;
      s.enemy = data.enemy;
      $("#scMsg").textContent = "Scénario modifié.";
    } else {
      const s = {id: uid("s"), name: data.name, enemy: data.enemy};
      state.scenarios.unshift(s);
      selectedScId = s.id;
      $("#scMsg").textContent = "Scénario créé.";
    }
    saveState();
    refreshAll();
  });

  $("#btnDeleteSc")?.addEventListener("click", () => {
    if (!selectedScId){ $("#scMsg").textContent = "Sélectionne un scénario."; return; }
    const s = findById(state.scenarios, selectedScId);
    if (!s) return;
    openModal("Supprimer ?", `<div class='p'>Supprimer <b>${escapeHtml(s.name)}</b> ?</div>`, [
      {label:"Annuler", kind:"ghost", onClick: closeModal},
      {label:"Supprimer", kind:"danger", onClick: () => {
        state.scenarios = state.scenarios.filter(x => x.id !== selectedScId);
        selectedScId = state.scenarios[0]?.id || null;
        saveState();
        refreshAll();
        closeModal();
        $("#scMsg").textContent = "Scénario supprimé.";
      }}
    ]);
  });
}

// ---------- Database (DB) ----------
function fillSelect(sel, items, labelFn){
  if (!sel) return;
  sel.innerHTML = "";
  (items||[]).forEach(it => {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = labelFn(it);
    sel.appendChild(opt);
  });
}

function refreshDbSelectors(){
  const db = getActiveDb();
  fillSelect($("#dbChar"), db.characters, c => c.name);
  fillSelect($("#dbWeapon"), db.weapons, w => w.name);
}

function renderDbList(box, arr){
  if (!box) return;
  box.innerHTML = "";
  if (!arr || arr.length === 0){
    const d = document.createElement("div");
    d.className = "hint";
    d.textContent = "Vide. Importe une DB (JSON) ou utilise l’exemple.";
    box.appendChild(d);
    return;
  }
  for (const it of arr){
    const div = document.createElement("div");
    div.className = "item";
    const icon = it.icon ? `<img src="${escapeHtml(it.icon)}" style="width:34px;height:34px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,.10);margin-right:10px"/>` : "";
    const right = it.base_stats ? `ATK ${fmt(it.base_stats.atk||0)} · DEF ${fmt(it.base_stats.def||0)} · HP ${fmt(it.base_stats.hp||0)}` :
                 (it.atk_bonus !== undefined ? `ATK+ ${fmt(it.atk_bonus||0)} · ${escapeHtml(it.element||"")}` : "");
    div.innerHTML = `<div class="row" style="align-items:center;justify-content:space-between">
      <div class="row" style="align-items:center;gap:10px">
        ${icon}
        <div>
          <div class="item-title">${escapeHtml(it.name||"—")}</div>
          <div class="item-sub">${escapeHtml(right)}</div>
        </div>
      </div>
      <span class="pill">${escapeHtml(it.element||it.role||"")}</span>
    </div>`;
    const infoBtn = div.querySelector(".dbInfoBtn");
    if (infoBtn){
      infoBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const kind = it.weapon_type ? "weapon" : "character";
        openDbEntityModal(kind, it.id);
      });
    }

    box.appendChild(div);
  }
}



function openDbEntityModal(kind, id){
  const dbx = getActiveDbX();
  if (!dbx || !dbx.modules) {
    openModal("Détails", `<div class="p">Aucune DB détaillée chargée (dbx).<br/>Active la DB live (GitHub Pages + MAJ auto) ou importe une DB en format “dbx”.</div>`, [{label:"OK", kind:"primary", onClick: closeModal}]);
    return;
  }
  if (kind === "character"){
    const c = (dbx.modules.characters||{})[id];
    if (!c) return;
    const img = c.image_url ? `<img class="dbHeroImg" src="${escapeAttr(c.image_url)}" alt=""/>` : "";
    const weapons = (c.weapon_types||[]).map(w=>`<span class="chip">${escapeHtml(w)}</span>`).join(" ");
    let skillsHtml = "";
    const skillsByW = c.skills_by_weapon || {};
    for (const wt of Object.keys(skillsByW)){
      const list = skillsByW[wt] || [];
      const rows = list.map(s => `
        <div class="skillRow">
          <div class="skillTop">
            <div class="skillName">${escapeHtml(s.name)}</div>
            <div class="skillMeta">${escapeHtml([s.type, s.key ? `Key ${s.key}` : null, (s.cooldown_sec!=null)?`${s.cooldown_sec}s` : null].filter(Boolean).join(" · "))}</div>
          </div>
          <div class="skillDesc">${escapeHtml(s.description || "")}</div>
        </div>
      `).join("");
      skillsHtml += `
        <details class="details" open>
          <summary>${escapeHtml(wt)} — Skills (${list.length})</summary>
          <div class="detailsBody">${rows || '<div class="hint tiny">Aucune donnée skill.</div>'}</div>
        </details>
      `;
    }

    let potHtml = "";
    const potByW = c.potential_by_weapon || {};
    for (const wt of Object.keys(potByW)){
      const tiers = potByW[wt] || [];
      const rows = tiers.map(t => `<div class="tierRow"><b>Tier ${t.tier}</b> — ${escapeHtml(t.text||"")}</div>`).join("");
      potHtml += `
        <details class="details">
          <summary>${escapeHtml(wt)} — Potential</summary>
          <div class="detailsBody">${rows || '<div class="hint tiny">Aucune donnée potential.</div>'}</div>
        </details>
      `;
    }

    const src = (c.sources && c.sources.genshin && c.sources.genshin.source_url) ? c.sources.genshin.source_url : "";
    openModal(
      `${escapeHtml(c.name)} — DB`,
      `
      <div class="dbHeroHeader">
        ${img}
        <div>
          <div class="p">${escapeHtml(c.description || "")}</div>
          <div class="p tiny"><b>Weapons:</b> ${weapons || "—"}</div>
          <div class="p tiny"><b>Source:</b> <span class="mono">${escapeHtml(src)}</span></div>
        </div>
      </div>
      <div class="hr"></div>
      ${skillsHtml || '<div class="hint">Aucune donnée skill.</div>'}
      <div class="hr"></div>
      ${potHtml || ''}
      `,
      [{label:"OK", kind:"primary", onClick: closeModal}]
    );
    return;
  }

  if (kind === "weapon"){
    const w = (dbx.modules.weapons||{})[id];
    if (!w) return;
    const img = w.image_url ? `<img class="dbHeroImg" src="${escapeAttr(w.image_url)}" alt=""/>` : "";
    const src = (w.sources && w.sources.genshin && w.sources.genshin.source_url) ? w.sources.genshin.source_url : "";
    openModal(
      `${escapeHtml(w.name)} — DB`,
      `
      <div class="dbHeroHeader">
        ${img}
        <div>
          <div class="p"><b>Type:</b> ${escapeHtml(w.weapon_type||"—")}</div>
          <div class="p"><b>Equipment ATK:</b> ${escapeHtml(String(w.equipment_attack ?? "—"))}</div>
          <div class="p"><b>Substat:</b> ${escapeHtml((w.substat_name||"—") + (w.substat_value?(" · "+w.substat_value):""))}</div>
          <div class="p"><b>Passive:</b> ${escapeHtml(w.passive_text||"")}</div>
          <div class="p tiny"><b>Source:</b> <span class="mono">${escapeHtml(src)}</span></div>
        </div>
      </div>
      `,
      [{label:"OK", kind:"primary", onClick: closeModal}]
    );
  }
}
function refreshDbUI(){
  const db = getActiveDb();
  refreshDbSelectors();
  renderDbList($("#dbCharList"), db.characters);
  renderDbList($("#dbWeaponList"), db.weapons);

  const st = $("#dbLiveStatus");
  if (st){
    if (LIVE_DB_META){
      const when = LIVE_DB_META.generated_at || LIVE_DB_META.updated || '—';
      const src = (LIVE_DB_META.sources||[]).join(' + ');
      st.textContent = `DB live: ${when} · ${src}`;
    } else {
      st.textContent = `${getActiveDbLabel()} · ${db.characters?.length||0} persos, ${db.weapons?.length||0} armes`;
    }
  }
}


function bindDb(){
  $("#btnDbImport")?.addEventListener("click", () => $("#fileDbImport").click());
  $("#fileDbImport")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try{
      const obj = JSON.parse(await file.text());
      const payload = unpackDbPayload(obj);
      const db = payload.db;
      const dbx = payload.dbx;
      state.settings.db_source = 'imported';
      const prev = state.db;
      const prevX = state.dbx;
      state.db = Object.assign({}, state.db, db);
      state.dbx = dbx || null;
      ensureIds();
      try{
        saveState();
      }catch(e){
        // localStorage peut saturer si la DB est énorme → fallback session-only
        state.db = prev;
        state.dbx = prevX;
        state._sessionDb = db;
        state._sessionDbX = dbx || null;
        state.settings.db_source = 'session';
      }
      refreshDbUI();
      $("#dbMsg").textContent = (state.settings.db_source==="session") ? "DB importée (session). Pour la rendre permanente: génère data/db_live.js via UpdateDB.bat." : "DB importée.";
    }catch(err){
      $("#dbMsg").textContent = "Erreur DB: " + String(err);
    }finally{
      e.target.value = "";
    }
  });

  $("#btnDbExport")?.addEventListener("click", () => {
    const db = getActiveDb();
    const dbx = getActiveDbX();
    downloadJson("7ds_origin_db_export.json", {db, dbx, meta:{exported:new Date().toISOString(), schema: db.schema_version}});
  });

  $("#btnDbSample")?.addEventListener("click", () => {
    openModal("Exemple DB", `
      <div class="p">Tu peux remplacer les valeurs, ajouter des persos/armes, puis exporter.</div>
      <div class="mono">${escapeHtml(JSON.stringify({db: getActiveDb()}, null, 2))}</div>
    `, [{label:"OK", kind:"primary", onClick: closeModal}]);
  });

  $("#btnDbHowUpdate")?.addEventListener("click", () => {
    openModal("Mise à jour DB (auto)", `
      <div class='p'><b>Local (1 clic)</b> : exécute <b>UpdateDB.bat</b> → met à jour <code>data/db_live.js</code>.</div>
      <div class='p'><b>Public 24/7</b> : héberge le site en statique (gratuit) + MAJ planifiée (GitHub Actions).
      Les membres ont juste un lien à ouvrir.</div>
      <div class='hint warn'>Respecte les ToS/robots.txt des sites sources. Si scraping bloqué, utilise un export officiel ou une autre source.</div>
    `, [{label:'OK', kind:'primary', onClick: closeModal}]);
  });

  $("#btnDbSources")?.addEventListener("click", () => {
    openModal("Sources DB", `
      <ul class='list'>
        <li><b>7dsorigin.gg</b> (armes + pages persos quand dispo)</li>
        <li><b>genshin.gg/7dso</b> (skills/potentials/persos/armes)</li>
      </ul>
      <div class='hint'>Configurer dans <code>tools/update_db.py</code>. Chaque entrée garde un <i>source_url</i> pour audit.</div>
    `, [{label:'OK', kind:'primary', onClick: closeModal}]);
  });


  $("#btnDbPreview")?.addEventListener("click", () => {
    const db = getActiveDb();
    const c = findById(db.characters, $("#dbChar").value);
        const w = findById(db.weapons, $("#dbWeapon").value);
    if (!c) return;
    const atk = (c.base_stats?.atk || 0) + (w?.atk_bonus || 0);
    openModal("Aperçu build DB", `
      <div class="p"><b>Perso :</b> ${escapeHtml(c.name)} <button class="btn tiny ghost" id="dbPrevChar">Détails</button></div>
      <div class="p"><b>Arme :</b> ${escapeHtml(w?.name || "Aucune")}</div>
      <div class="p"><b>ATK estimée :</b> ${fmt(atk)}</div>
      <div class="hint">Les autres stats (crit/bonus…) restent à renseigner selon vos données.</div>
    `, [{label:"OK", kind:"primary", onClick: closeModal}]);
  });

  $("#btnDbMakeBuild")?.addEventListener("click", () => {
    const db = getActiveDb();
    const c = findById(db.characters, $("#dbChar").value);
        const w = findById(db.weapons, $("#dbWeapon").value);
    if (!c){ $("#dbMsg").textContent = "Choisis un personnage."; return; }
    const name = `${c.name}${w ? " + " + w.name : ""}`.slice(0, 60);
    const atk = (c.base_stats?.atk || 0) + (w?.atk_bonus || 0);
    const b = {
      id: uid("b"),
      name,
      stats: {
        atk: Math.round(atk || 0),
        def: 0,
        crit_rate_pct: 35,
        crit_dmg_pct: 65,
        dmg_bonus_pct: 0,
        def_pen_pct: 0,
        dmg_taken_pct: 0,
        element: c.element || "neutral"
      },
      source: {character_id: c.id, weapon_id: w?.id || null}
    };
    state.builds.unshift(b);
    selectedBuildId = b.id;
    saveState();
    refreshAll();
    $("#dbMsg").textContent = "Build créé depuis DB.";
    openModal("Build créé", "<div class='p'>Build ajouté dans “Mes builds”. Ajuste crit/bonus si besoin.</div>", [
      {label:"Aller aux builds", kind:"primary", onClick: () => { closeModal(); setView("builds"); }},
      {label:"OK", kind:"ghost", onClick: closeModal}
    ]);
  });
}

// ---------- Selectors ----------
function refreshSimSelectors(){
  fillSelect($("#simBuild"), state.builds, b => b.name);
  fillSelect($("#simRot"), state.rotations, r => r.name);
  fillSelect($("#simSc"), state.scenarios, s => s.name);
}
function refreshCompareSelectors(){
  fillSelect($("#cmpA"), state.builds, b => b.name);
  fillSelect($("#cmpB"), state.builds, b => b.name);
  fillSelect($("#cmpRot"), state.rotations, r => r.name);
  fillSelect($("#cmpSc"), state.scenarios, s => s.name);
}
function refreshWeightsSelectors(){
  fillSelect($("#wBuild"), state.builds, b => b.name);
  fillSelect($("#wRot"), state.rotations, r => r.name);
  fillSelect($("#wSc"), state.scenarios, s => s.name);
}

function refreshCalSkillPickers(){
  // Single calibration
  const b = findById(state.builds, $("#calBuild")?.value);
  const baseChar = b?.character_id || "";
  const calChar = $("#calChar");
  const calSkill = $("#calSkill");
  if (calChar){
    const chars = getKitCharacters();
    calChar.innerHTML = '<option value="">Auto (build)</option>' + chars.map(c => `<option value="${escapeHtml(String(c.id))}">${escapeHtml(c.name)}</option>`).join("");
    if (calChar.value === "") calChar.value = "";
  }
  const chosenChar = (calChar && calChar.value) ? calChar.value : baseChar;
  if (calSkill){
    const skills = getSkillsForCharacter(chosenChar);
    calSkill.innerHTML = '<option value="">— Aucun —</option>' + skills.map((s,i)=>`<option value="${i}">${escapeHtml(s.name || ("Skill "+(i+1)))}</option>`).join("");
  }

  // Multi-case add
  const b2 = findById(state.builds, $("#cal2Build")?.value);
  const baseChar2 = b2?.character_id || "";
  const cal2Char = $("#cal2Char");
  const cal2Skill = $("#cal2Skill");
  if (cal2Char){
    const chars = getKitCharacters();
    cal2Char.innerHTML = '<option value="">Auto (build)</option>' + chars.map(c => `<option value="${escapeHtml(String(c.id))}">${escapeHtml(c.name)}</option>`).join("");
  }
  const chosenChar2 = (cal2Char && cal2Char.value) ? cal2Char.value : baseChar2;
  if (cal2Skill){
    const skills2 = getSkillsForCharacter(chosenChar2);
    cal2Skill.innerHTML = '<option value="">— Aucun —</option>' + skills2.map((s,i)=>`<option value="${i}">${escapeHtml(s.name || ("Skill "+(i+1)))}</option>`).join("");
  }
}
function refreshCalSelectors(){
  fillSelect($("#calBuild"), state.builds, b => b.name);
  fillSelect($("#calSc"), state.scenarios, s => s.name);
  // Calibration Lab (multi-cas)
  fillSelect($("#cal2Build"), state.builds, b => b.name);
  fillSelect($("#cal2Sc"), state.scenarios, s => s.name);
  refreshCal2Table();
  refreshCalSkillPickers();
}
function refreshAllSelectors(){
  refreshBuildCharacterSelect();
  refreshRotationCharacterSelect();
  refreshCalSkillPickers();
  refreshSimSelectors();
  refreshCompareSelectors();
  refreshWeightsSelectors();
  refreshScalingSelectors();
  refreshSandboxSelectors();
  refreshBossSelectors();
  refreshDbSelectors();
  refreshCalSelectors();
}

// ---------- Settings ----------
function refreshSettingsUI(){
  $("#setMitigation").value = state.settings.mitigation_model;
  $("#setK").value = state.settings.mitigation_k;
  $("#setCritCap").value = state.settings.crit_cap;
  $("#setBurstBonus").value = state.settings.burst_bonus_pct;
  $("#setBurstOn").value = state.settings.burst_mode;
  $("#setOrbGain").value = state.settings.orb_gain_per_skill;
  $("#setSeed").value = state.settings.mc_seed;
  $("#setBins").value = state.settings.hist_bins;
  $("#limitsBlock").innerHTML = renderLimitsHtml();
  $("#setCtxEnemyDebuffed") && ($("#setCtxEnemyDebuffed").value = state.settings.context_enemy_debuffed ? "1":"0");
  $("#setCtxHpPct") && ($("#setCtxHpPct").value = state.settings.context_hp_pct);
  $("#setCtxStacks") && ($("#setCtxStacks").value = state.settings.context_stacks);
  $("#setCtxDebuffCount") && ($("#setCtxDebuffCount").value = state.settings.context_debuff_count);
  $("#setCtxAllyCount") && ($("#setCtxAllyCount").value = state.settings.context_ally_count);
}
function bindSettings(){
  // Profiles
  $("#setProfile")?.addEventListener('change', () => {
    state.settings.formula_profile = $("#setProfile").value;
    const p = FORMULA_PROFILES[state.settings.formula_profile];
    const n = $("#setProfileNotes");
    if (n) n.value = p ? (p.notes || '') : '—';
    saveState();
  });

  $("#btnApplyProfile")?.addEventListener('click', () => {
    const key = $("#setProfile")?.value;
    const prof = key ? FORMULA_PROFILES[key] : null;
    if (!prof) return;
    _settingsSnapshotBeforeProfile = JSON.parse(JSON.stringify(state.settings));
    Object.assign(state.settings, prof.settings || {});
    state.settings.formula_profile = key;
    saveState();
    refreshSettingsUI();
    $("#setMsg").textContent = 'Profil appliqué.';
    refreshHeader();
  });

  $("#btnResetProfile")?.addEventListener('click', () => {
    if (!_settingsSnapshotBeforeProfile) return;
    state.settings = JSON.parse(JSON.stringify(_settingsSnapshotBeforeProfile));
    _settingsSnapshotBeforeProfile = null;
    saveState();
    refreshSettingsUI();
    $("#setMsg").textContent = 'Réglages restaurés.';
    refreshHeader();
  });

  $("#btnSaveSettings")?.addEventListener("click", () => {
    state.settings.formula_profile = $("#setProfile")?.value || state.settings.formula_profile;
    state.settings.mitigation_model = $("#setMitigation").value;
    state.settings.mitigation_k = Math.max(1, Math.round(toNum($("#setK").value, 1200)));
    state.settings.crit_cap = clamp(Math.round(toNum($("#setCritCap").value, 100)), 0, 100);
    state.settings.burst_bonus_pct = toNum($("#setBurstBonus").value, 25);
    state.settings.burst_mode = $("#setBurstOn").value;
    state.settings.orb_gain_per_skill = Math.max(0, Math.round(toNum($("#setOrbGain").value, 2)));
    state.settings.mc_seed = Math.round(toNum($("#setSeed").value, 12345));
    state.settings.hist_bins = clamp(Math.round(toNum($("#setBins").value, 24)), 5, 60);

    // Context
    state.settings.context_enemy_debuffed = ($("#setCtxEnemyDebuffed")?.value === "1");
    state.settings.context_hp_pct = clamp(Math.round(toNum($("#setCtxHpPct")?.value, 100)), 0, 100);
    state.settings.context_stacks = Math.max(0, Math.round(toNum($("#setCtxStacks")?.value, 0)));
    state.settings.context_debuff_count = Math.max(0, Math.round(toNum($("#setCtxDebuffCount")?.value, 0)));
    state.settings.context_ally_count = Math.max(0, Math.round(toNum($("#setCtxAllyCount")?.value, 4)));

    saveState();
    $("#setMsg").textContent = "Réglages enregistrés.";
    refreshHeader();
  });

  $("#btnResetSettings")?.addEventListener("click", () => {
    state.settings = deepCopy(defaults.settings);
    if (!state.settings.formula_profile) state.settings.formula_profile = 'cbt_v1';
    saveState();
    refreshSettingsUI();
    $("#setMsg").textContent = "Réglages réinitialisés.";
    refreshHeader();
  });
}

// ---------- Simulation engine ----------
function mitigationFactor(enemyDef, build, settings, overrideK=null){
  const defPen = (build.stats.def_pen_pct || 0) / 100;
  const effDef = Math.max(0, enemyDef * (1 - defPen));
  const kUsed = overrideK !== null ? overrideK : settings.mitigation_k;

  if (settings.mitigation_model === "linear"){
    const cap = 0.80;
    const k = Math.max(1, kUsed);
    const red = clamp(effDef / k, 0, cap);
    return 1 - red;
  }
  const K = Math.max(1, kUsed);
  const red = effDef / (effDef + K);
  return 1 - red;
}

function isBurstActiveAt(t, rot, settings){
  if (settings.burst_mode === "on") return true;
  if (settings.burst_mode === "off") return false;
  const bp = rot.burstPlan;
  if (!bp || !bp.enabled) return false;
  const start = bp.start ?? 10;
  const dur = bp.duration ?? 7;
  return t >= start && t <= (start + dur);
}

// --- Damage engine (flexible, GC-like v1) ---
// Note: 7DSO formules exactes non confirmées. Ce moteur est configurable et calibrable.
// stats build supportées (optionnelles): atk, pierce_pct, res_pen_pct, def_pen_pct,
// crit_rate_pct, crit_dmg_pct, crit_resist_pen_pct, crit_def_pen_pct,
// dmg_bonus_pct, dmg_taken_pct, skill_dmg_pct, ult_dmg_pct, dmg_mult_pct.
// enemy supportés (optionnels): def, resistance_pct, crit_resist_pct, crit_def_pct, element, dmg_reduction_pct.

function elementMultiplier(attEl, defEl, settings){
  const advMap = settings.element_adv_map || {
    fire: "wind",
    wind: "earth",
    earth: "water",
    water: "fire",
    light: "dark",
    dark: "light"
  };
  const adv = (settings.elem_adv_bonus_pct ?? 30) / 100;
  const dis = (settings.elem_disadv_penalty_pct ?? -20) / 100; // negative means penalty
  if (!attEl || !defEl || attEl === "neutral" || defEl === "neutral") return 1;
  if (attEl === defEl) return 1;
  if (advMap[attEl] === defEl) return 1 + adv;
  // if defender has advantage over attacker -> attacker disadvantaged
  if (advMap[defEl] === attEl) return 1 + dis;
  return 1;
}

function aggregateBuffs(build, ctx){
  const buffs = Array.isArray(build.buffs) ? build.buffs : [];
  // Additive % deltas
  const add = {
    atk_pct: 0,
    dmg_pct: 0,
    skill_dmg_pct: 0,
    ult_dmg_pct: 0,
    crit_rate_pct: 0,
    crit_dmg_pct: 0,
    pierce_pct: 0,
    def_pen_pct: 0,
    res_pen_pct: 0
  };
  // Multiplicative multipliers (1 + x)
  let dmgMul = 1;
  let atkMul = 1;

  for (const b of buffs){
    if (!b || typeof b !== "object") continue;
    if (b.enabled === false) continue;
    const scope = b.scope || "all";
    if (scope !== "all"){
      if (ctx?.kind === "skill" && scope !== "skill") continue;
      if (ctx?.kind === "ultimate" && scope !== "ultimate") continue;
    }
    const stat = b.stat;
    const val = toNum(b.value, 0);
    const type = b.type || "add"; // add|mul
    if (type === "mul"){
      if (stat === "dmg") dmgMul *= (1 + val/100);
      else if (stat === "atk") atkMul *= (1 + val/100);
      continue;
    }
    // additive
    if (stat === "atk_pct") add.atk_pct += val;
    else if (stat === "dmg_pct") add.dmg_pct += val;
    else if (stat === "skill_dmg_pct") add.skill_dmg_pct += val;
    else if (stat === "ult_dmg_pct") add.ult_dmg_pct += val;
    else if (stat === "crit_rate_pct") add.crit_rate_pct += val;
    else if (stat === "crit_dmg_pct") add.crit_dmg_pct += val;
    else if (stat === "pierce_pct") add.pierce_pct += val;
    else if (stat === "def_pen_pct") add.def_pen_pct += val;
    else if (stat === "res_pen_pct") add.res_pen_pct += val;
  }

  // Support legacy "dmg_mult_pct" stat as a global multiplicative bucket
  const legacyDmgMult = toNum(build.stats?.dmg_mult_pct, 0);
  if (legacyDmgMult) dmgMul *= (1 + legacyDmgMult/100);

  return { add, dmgMul, atkMul };
}

function computedStatsForContext(build, ctx, settings){
  const s = build.stats || {};
  const { add, dmgMul, atkMul } = aggregateBuffs(build, ctx);

  const out = {
    atk: toNum(s.atk, 0),
    pierce_pct: toNum(s.pierce_pct, 0),
    res_pen_pct: toNum(s.res_pen_pct, 0),
    def_pen_pct: toNum(s.def_pen_pct, 0),
    crit_rate_pct: toNum(s.crit_rate_pct, 0),
    crit_dmg_pct: toNum(s.crit_dmg_pct, 0),
    crit_resist_pen_pct: toNum(s.crit_resist_pen_pct, 0),
    crit_def_pen_pct: toNum(s.crit_def_pen_pct, 0),
    dmg_bonus_pct: toNum(s.dmg_bonus_pct, 0),
    dmg_taken_pct: toNum(s.dmg_taken_pct, 0),
    skill_dmg_pct: toNum(s.skill_dmg_pct, 0),
    ult_dmg_pct: toNum(s.ult_dmg_pct, 0),
    element: (typeof s.element === "string" ? s.element : "neutral"),
    _dmgMul: dmgMul,
    _atkMul: atkMul
  };

  out.atk = out.atk * (1 + add.atk_pct/100) * atkMul;

  out.dmg_bonus_pct += add.dmg_pct;
  out.skill_dmg_pct += add.skill_dmg_pct;
  out.ult_dmg_pct += add.ult_dmg_pct;
  out.crit_rate_pct += add.crit_rate_pct;
  out.crit_dmg_pct += add.crit_dmg_pct;
  out.pierce_pct += add.pierce_pct;
  out.def_pen_pct += add.def_pen_pct;
  out.res_pen_pct += add.res_pen_pct;

  // Caps
  const pierceCap = settings.pierce_cap ?? 300;
  out.pierce_pct = clamp(out.pierce_pct, -100, pierceCap);
  out.def_pen_pct = clamp(out.def_pen_pct, 0, 95);
  out.res_pen_pct = clamp(out.res_pen_pct, 0, 300);
  out.crit_rate_pct = clamp(out.crit_rate_pct, 0, settings.crit_cap ?? 100);
  out.crit_dmg_pct = clamp(out.crit_dmg_pct, 0, 500);
  return out;
}

function mitigationFactorWithDefPen(enemyDef, defPenPct, settings, overrideK=null){
  const defCoef = (settings.hidden_defense_coefficient ?? 1);
  const effDef = Math.max(0, (enemyDef * defCoef) * (1 - (defPenPct/100)));
  const kUsed = overrideK !== null ? overrideK : settings.mitigation_k;

  if (settings.mitigation_model === "linear"){
    const cap = 0.80;
    const k = Math.max(1, kUsed);
    const red = clamp(effDef / k, 0, cap);
    return 1 - red;
  }
  const K = Math.max(1, kUsed);
  const red = effDef / (effDef + K);
  return 1 - red;
}


function applyParsedEffectsToComputedStats(cs, effects, ctx){
  const out = {...cs};
  const eff = Array.isArray(effects) ? effects : [];
  for (const e of eff){
    if (!e || !e.type) continue;
    const v = toNum(e.value, 0);
    switch (e.type){
      case "atk_pct":
        out.atk = (out.atk || 0) * (1 + v/100);
        break;
      case "crit_dmg_bonus":
        out.crit_dmg_pct = (out.crit_dmg_pct || 0) + v;
        break;
      case "crit_rate_pct":
        out.crit_rate_pct = (out.crit_rate_pct || 0) + v;
        break;
      case "ignore_def_pct":
        out.def_pen_pct = (out.def_pen_pct || 0) + v;
        break;
      case "bonus_if_debuffed":
        if (ctx?.enemyDebuffed){
          out.dmg_bonus_pct = (out.dmg_bonus_pct || 0) + v;
        }
        break;
      case "bonus_if_hp_below": {
        const thr = toNum(e.threshold, 0);
        const hp = toNum(ctx?.hpPct, 100);
        if (hp <= thr){
          out.dmg_bonus_pct = (out.dmg_bonus_pct || 0) + v;
        }
        break;
      }
      case "bonus_per_stack": {
        const stacks = Math.max(0, Math.round(toNum(ctx?.stacks, 0)));
        out.dmg_bonus_pct = (out.dmg_bonus_pct || 0) + v * stacks;
        break;
      }
      case "bonus_per_debuff": {
        const n = Math.max(0, Math.round(toNum(ctx?.debuffCount, 0)));
        out.dmg_bonus_pct = (out.dmg_bonus_pct || 0) + v * n;
        break;
      }
      case "bonus_if_ally_count_at_least": {
        const thr = Math.max(0, Math.round(toNum(e.threshold, 0)));
        const n = Math.max(0, Math.round(toNum(ctx?.allyCount, 0)));
        if (n >= thr){
          out.dmg_bonus_pct = (out.dmg_bonus_pct || 0) + v;
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function resolveSkillForAction(build, rot, action){
  const charId = build?.character_id || rot?.character_id || null;
  if (!charId) return null;
  const ch = findKitCharById(charId);
  if (!ch || !Array.isArray(ch.skills)) return null;
  const si = action?.skill_index;
  if (si === undefined || si === null) return null;
  return ch.skills[si] || null;
}

function actionCtxFromAction(build, rot, action, enemy, settings){
  const skill = resolveSkillForAction(build, rot, action);
  let kind = action.kind || "skill";
  let mult = toNum(action.mult, 0);
  let hits = Math.max(1, Math.round(toNum(action.hits, 1)));
  let effects = [];
  if (skill){
    const m = toNum(skill.multiplier, null);
    if (m !== null) mult = m/100;
    hits = Math.max(1, Math.round(toNum(skill.hits, hits)));
    const t = String(skill.type || "").toLowerCase();
    if (t.includes("ult")) kind = "ultimate";
    else if (t.includes("passive")) kind = "passive";
    else kind = "skill";
    effects = Array.isArray(skill.parsed_effects) ? skill.parsed_effects : [];
  }
  return {
    kind, mult, hits,
    effects,
    enemyDebuffed: !!(enemy?.is_debuffed || settings?.enemy_debuffed || settings?.context_enemy_debuffed || false),
    hpPct: toNum(settings?.context_hp_pct, 100),
    stacks: toNum(settings?.context_stacks, 0),
    debuffCount: toNum(settings?.context_debuff_count, 0),
    allyCount: toNum(settings?.context_ally_count, 4),
  };
}

function singleHitDamage(build, enemy, settings, ctx, mode, rng, overrideK=null){
  let cs = computedStatsForContext(build, ctx, settings);
  cs = applyParsedEffectsToComputedStats(cs, ctx?.effects, ctx);

  // Base multipliers
  const enemyRed = 1 - ((enemy.dmg_reduction_pct || 0)/100);
  const takenMul = pctToMul(cs.dmg_taken_pct || 0);

  // Contextual dmg bucket
  let dmgBonusPct = cs.dmg_bonus_pct || 0;
  if (ctx?.kind === "skill") dmgBonusPct += (cs.skill_dmg_pct || 0);
  if (ctx?.kind === "ultimate") dmgBonusPct += (cs.ult_dmg_pct || 0);
  const dmgBonusMul = pctToMul(dmgBonusPct);

  const critOrder = settings.crit_order || "afterDef";
  const pierceMode = settings.pierce_mode || "multiplicative";
  const elementStage = settings.element_stage || "late";

  // Element multiplier (applied early or late depending on config)
  const eleMulRaw = elementMultiplier(cs.element, enemy.element || "neutral", settings);
  const eleEarlyMul = (elementStage === "early") ? eleMulRaw : 1;
  const eleLateMul  = (elementStage === "late")  ? eleMulRaw : 1;

  // Mitigation + pierce-like term (GC-inspired)
  const mit = mitigationFactorWithDefPen(enemy.def || 0, cs.def_pen_pct || 0, settings, overrideK);

  const enemyRes = toNum(enemy.resistance_pct, 0);
  const resistCap = settings.resist_cap ?? 200;
  const effEnemyRes = clamp(enemyRes - (cs.res_pen_pct || 0), -100, resistCap);
  const pierceDelta = ((cs.pierce_pct || 0) - effEnemyRes) / 100;
  const pierceDeltaClamped = clamp(pierceDelta, -0.90, 3.00);

  // Crit terms (with enemy crit resist/def)
  const enemyCritRes = clamp(toNum(enemy.crit_resist_pct, 0), 0, 200);
  const enemyCritDef = clamp(toNum(enemy.crit_def_pct, 0), 0, 300);

  const critChance = clamp((cs.crit_rate_pct || 0) - enemyCritRes + (cs.crit_resist_pen_pct || 0), 0, settings.crit_cap ?? 100) / 100;
  const critDmg = Math.max(0, (cs.crit_dmg_pct || 0) - enemyCritDef + (cs.crit_def_pen_pct || 0)) / 100;

  const critMul = (mode === "expected")
    ? ((1 - critChance) * 1 + critChance * (1 + critDmg))
    : ((rng() < critChance) ? (1 + critDmg) : 1);

  // Core base (pre mitigation)
  let core = (cs.atk || 0) * (ctx?.mult || 0) * eleEarlyMul;

  if (critOrder === "beforeDef"){
    core *= critMul;
  }

  // Apply mitigation + pierce mode
  let afterMit;
  if (pierceMode === "additive"){
    // Pierce contributes as a separate term not reduced by DEF mitigation (heuristic, calibrable)
    afterMit = (core * mit) + (core * pierceDeltaClamped);
  } else {
    // Default: multiplicative pierce
    const pierceMul = 1 + pierceDeltaClamped;
    afterMit = core * mit * pierceMul;
  }

  let base = afterMit * dmgBonusMul * cs._dmgMul * takenMul * enemyRed * eleLateMul;

  // Hidden global multiplier (calibration)
  base *= (settings.hidden_global_multiplier ?? 1);

  if (critOrder === "afterDef"){
    base *= critMul;
  }

  return base;
}


function actionDamage(build, enemy, settings, ctx, mode, rng, overrideK=null){
  const hits = Math.max(1, Math.round(ctx?.hits || 1));
  let total = 0;
  if (mode === "expected"){
    // Expected: per-hit identical expectation
    total = singleHitDamage(build, enemy, settings, ctx, "expected", rng, overrideK) * hits;
  } else {
    for (let i=0;i<hits;i++){
      total += singleHitDamage(build, enemy, settings, ctx, "mc", rng, overrideK);
    }
  }
  return total;
}

function baseHitDamage(build, enemy, settings, overrideK=null){
  // Legacy helper (for older parts of the UI): one hit, mult=1
  const ctx = { kind: "skill", mult: 1, hits: 1 };
  return singleHitDamage(build, enemy, settings, ctx, "expected", makeRng(1), overrideK);
}

function expectedCritMultiplier(build, settings){
  // Legacy helper: expected crit multiplier after enemy-less caps.
  const cr = clamp(build.stats.crit_rate_pct || 0, 0, settings.crit_cap) / 100;
  const cd = (build.stats.crit_dmg_pct || 0) / 100;
  return (1 - cr) * 1 + cr * (1 + cd);
}

function makeRng(seed){
  let s = (seed >>> 0) || 1;
  return function(){
    s = (1664525 * s + 1013904223) >>> 0;
    return (s / 4294967296);
  };
}

function simulateOnce(build, rot, scen, duration, settings, mode, rng){
  const enemy = scen.enemy || {};
  // baseHitDamage (legacy) — actionDamage() used per action
  const burstBonusMul = 1 + (settings.burst_bonus_pct || 0)/100;
  const burstRes = 1 - (enemy.burst_resist || 0);

  let t = 0;
  let dmg = 0;
  let orbs = settings.initial_orbs || 0;
  let trace = [];
  let cds = new Map();

  const addTrace = (line) => { if (settings.verbose_trace) trace.push(line); };

  const runAction = (a, tNow) => {
    const kind = a.kind;
    if (kind === "wait"){
      const dt = Math.max(0.1, a.cd || 1);
      return {dt};
    }
    const key = a.label || kind;
    const readyAt = cds.get(key) ?? 0;
    if (tNow < readyAt) return null;

    const req = a.requiresOrbs || 0;
    if (req > 0 && orbs < req) return null;

    let burstMul = 1;
    if (a.burstEligible && isBurstActiveAt(tNow, rot, settings)){
      burstMul *= burstBonusMul * burstRes;
    }

    const ctx = actionCtxFromAction(build, rot, a, enemy, settings);
    const dealt = actionDamage(build, enemy, settings, ctx, (mode === "expected" ? "expected" : "mc"), rng) * burstMul;
    dmg += dealt;
    addTrace(`${tNow.toFixed(1)}s: ${key} dealt=${Math.round(dealt)}`);


    if (ctx.kind === "skill"){
      orbs = Math.min(7, orbs + (settings.orb_gain_per_skill || 0));
    }
    if (ctx.kind === "ultimate"){
      if (req > 0) orbs = Math.max(0, orbs - req);
    }

    const cdTime = Math.max(0, a.cd || 0);
    cds.set(key, tNow + cdTime);
    return {dt: 0.01};
  };

  if (rot.type === "timeline"){
    const tl = rot.timeline || [];
    const loop = rot.loop ?? true;
    const period = rot.period ?? duration;
    const events = [];
    const maxLoops = loop ? Math.ceil(duration / period) : 1;
    for (let k=0;k<maxLoops;k++){
      for (const ev of tl){
        const tt = (ev.t || 0) + k*period;
        if (tt <= duration + 1e-9) events.push({t: tt, a: ev});
      }
    }
    events.sort((x,y)=>x.t - y.t);
    for (const ev of events){
      if (ev.t > duration) break;
      t = ev.t;
      runAction(ev.a, t);
    }
  } else {
    const actions = rot.actions || [];
    const dtIdle = 0.1;
    while (t <= duration + 1e-9){
      let did = false;
      for (const a of actions){
        const r = runAction(a, t);
        if (r){
          t += r.dt;
          did = true;
          break;
        }
      }
      if (!did) t += dtIdle;
    }
  }

  if (!settings.verbose_trace){
    trace = [
      `Rotation: ${rot.name} (${rot.type})`,
      `Scénario: ${scen.name}`,
      `Durée: ${duration}s · Orbes start=${settings.initial_orbs||0} · +${settings.orb_gain_per_skill||0}/skill`,
      `Burst: ${settings.burst_mode} · bonus=${settings.burst_bonus_pct}% · plan=${rot.burstPlan?.enabled ? (rot.burstPlan.start+"-"+(rot.burstPlan.start+rot.burstPlan.duration)+"s") : "off"}`,
      `Note: active “Verbose trace” dans Réglages (Avancé) pour voir action par action.`
    ];
  }

  return { totalDamage: dmg, dps: dmg / duration, trace };
}

function runSimulation(build, rot, scen, duration, iters, mode){
  const settings = state.settings;
  const rngBase = makeRng(settings.mc_seed || 12345);
  let dpsSamples = [];
  let trace = null;

  if (mode === "expected"){
    const out = simulateOnce(build, rot, scen, duration, settings, "expected", rngBase);
    dpsSamples = [out.dps];
    trace = out.trace;
  } else {
    const n = Math.max(1, iters);
    for (let i=0;i<n;i++){
      // Deterministic per-iteration seed derived from base rng (reproducible).
      const seed = (Math.floor(rngBase()*1e9) ^ (i*2654435761)) >>> 0;
      const rng = makeRng(seed);
      const out = simulateOnce(build, rot, scen, duration, settings, "mc", rng);
      dpsSamples.push(out.dps);
      if (i===0) trace = out.trace;
    }
  }

  const sorted = [...dpsSamples].sort((a,b)=>a-b);
  const mean = sorted.reduce((a,b)=>a+b,0) / sorted.length;

  let std = 0;
  if (sorted.length > 1){
    const v = sorted.reduce((acc,x)=>acc + (x-mean)*(x-mean), 0) / (sorted.length - 1);
    std = Math.sqrt(v);
  }

  const p05 = quantile(sorted, 0.05);
  const p10 = quantile(sorted, 0.10);
  const p50 = quantile(sorted, 0.50);
  const p90 = quantile(sorted, 0.90);
  const p95 = quantile(sorted, 0.95);

  const min = sorted[0];
  const max = sorted[sorted.length-1];

  return { mean, std, min, max, p05, p10, p50, p90, p95, samples: dpsSamples, trace };
}

// ---------- Results render ----------
function renderHistogram(samples, bins){
  if (!samples || samples.length <= 1) return "";
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  if (max <= min + 1e-9) return "";
  const b = clamp(bins || 24, 5, 60);
  const counts = new Array(b).fill(0);
  for (const x of samples){
    const t = (x - min) / (max - min);
    let idx = Math.floor(t * b);
    idx = clamp(idx, 0, b-1);
    counts[idx]++;
  }
  const maxC = Math.max(...counts);
  const w = 600, h = 140, pad = 10;
  const bw = (w - pad*2) / b;
  let rects = "";
  for (let i=0;i<b;i++){
    const barH = (counts[i]/maxC) * (h - pad*2);
    const x = pad + i*bw;
    const y = (h - pad) - barH;
    rects += `<rect class="bar" x="${x}" y="${y}" width="${Math.max(1,bw-1)}" height="${barH}"></rect>`;
  }
  return `
    <div class="hist">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        ${rects}
        <text class="axisText" x="${pad}" y="${h-2}">${fmt(min)}</text>
        <text class="axisText" x="${w-pad-1}" y="${h-2}" text-anchor="end">${fmt(max)}</text>
      </svg>
    </div>`;
}

function renderSimOutput(res, mode){
  const stable = mode === "expected";
  const stability = stable ? `<span class="pill good">Stable (Expected)</span>` : `<span class="pill warn">RNG (Monte‑Carlo)</span>`;
  const hist = renderHistogram(res.samples, state.settings.hist_bins);

  const core = `
    <div class="row" style="justify-content:space-between">
      ${stability}
      <span class="pill">DPS moyen: <b>${fmt(res.mean)}</b></span>
    </div>
    <hr style="border:none;border-top:1px solid var(--border); margin:12px 0;">
    <div class="grid4">
      <div class="pill">P05: <b>${fmt(res.p05)}</b></div>
      <div class="pill">P50: <b>${fmt(res.p50)}</b></div>
      <div class="pill">P95: <b>${fmt(res.p95)}</b></div>
      <div class="pill">Écart‑type: <b>${fmt(res.std)}</b></div>
    </div>
    <div class="grid4" style="margin-top:10px">
      <div class="pill">Min: <b>${fmt(res.min)}</b></div>
      <div class="pill">P10: <b>${fmt(res.p10)}</b></div>
      <div class="pill">P90: <b>${fmt(res.p90)}</b></div>
      <div class="pill">Max: <b>${fmt(res.max)}</b></div>
    </div>
    ${hist}
    <div class="hint">Astuce : pour comparer A vs B, garde le même scénario + rotation + durée.</div>
  `;
  return core;
}

// ---------- Simulate UI ----------
let lastTrace = null;
function runSim(){
  const build0 = findById(state.builds, $("#simBuild").value);
  const rot = findById(state.rotations, $("#simRot").value);
  const scen = findById(state.scenarios, $("#simSc").value);
  const duration = Math.max(1, toNum($("#simDur").value, 30));
  const iters = Math.max(1, Math.round(toNum($("#simIters").value, 2000)));
  const mode = $("#simMode").value;

  if (!build0 || !rot || !scen){
    $("#simMsg").textContent = "Sélectionne un build, une rotation et un scénario.";
    return;
  }
  const build = applyPotentialsToBuild(build0);
  $("#simMsg").textContent = "Simulation...";
  const res = runSimulation(build, rot, scen, duration, iters, mode);

  // Keep a small last-result summary for sharing (Discord)
  try{
    state._lastSimSummary = {
      at: new Date().toISOString(),
      sim: { build_id: build0.id, rot_id: rot.id, scen_id: scen.id, duration, iters, mode, character_id: build0.character_id||null, potentials_enabled: build0.potentials_enabled||[] },
      result: { mean: res.mean, std: res.std, p05: res.p05, p10: res.p10, p50: res.p50, p90: res.p90, p95: res.p95 }
    };
    saveState();
  }catch(e){ console.warn(e); }

  $("#simOut").classList.remove("empty");
  $("#simOut").innerHTML = renderSimOutput(res, mode);
  lastTrace = res.trace;
  $("#traceCard").style.display = "none";
  $("#simMsg").textContent = "Terminé.";
}
function bindSim(){
  $("#btnRun")?.addEventListener("click", runSim);
  $("#btnTrace")?.addEventListener("click", () => {
    if (!lastTrace){
      $("#simMsg").textContent = "Lance une simulation d’abord.";
      return;
    }
    $("#traceOut").textContent = lastTrace.join("\n");
    $("#traceCard").style.display = "block";
  });
}

// ---------- Compare UI ----------
function runCompare(){
  const a0 = findById(state.builds, $("#cmpA").value);
  const b0 = findById(state.builds, $("#cmpB").value);
  const rot = findById(state.rotations, $("#cmpRot").value);
  const scen = findById(state.scenarios, $("#cmpSc").value);
  const duration = Math.max(1, toNum($("#cmpDur").value, 30));
  const iters = Math.max(1, Math.round(toNum($("#cmpIters").value, 4000)));
  const mode = $("#cmpMode").value;

  if (!a0 || !b0 || !rot || !scen){
    $("#cmpMsg").textContent = "Choisis A, B, rotation, scénario.";
    return;
  }
  const a = applyPotentialsToBuild(a0);
  const b = applyPotentialsToBuild(b0);
  $("#cmpMsg").textContent = "Comparaison...";
  const ra = runSimulation(a, rot, scen, duration, iters, mode);
  const rb = runSimulation(b, rot, scen, duration, iters, mode);
  const da = ra.mean, db = rb.mean;
  const diff = db - da;
  const pct = (da !== 0) ? (diff / da) * 100 : NaN;

  const cls = diff >= 0 ? "good" : "bad";
  $("#cmpOut").classList.remove("empty");
  $("#cmpOut").innerHTML = `
    <div class="row" style="justify-content:space-between; align-items:flex-end">
      <div class="pill">A: <b>${escapeHtml(a.name)}</b> — DPS: <b>${fmt(da)}</b></div>
      <div class="pill">B: <b>${escapeHtml(b.name)}</b> — DPS: <b>${fmt(db)}</b></div>
    </div>
    <hr style="border:none;border-top:1px solid var(--border); margin:12px 0;">
    <div class="row">
      <span class="pill ${cls}">Δ DPS: <b>${fmt(diff)}</b></span>
      <span class="pill ${cls}">Δ %: <b>${fmtPct(pct)}</b></span>
    </div>
    <div class="hint">Recommandation : en Monte‑Carlo, garde seed fixe pour des comparaisons reproductibles.</div>
  `;
  $("#cmpMsg").textContent = "Terminé.";
}
function bindCompare(){
  $("#btnCompare")?.addEventListener("click", runCompare);
}

// ---------- Weights UI ----------
function runWeights(){
  const build0 = findById(state.builds, $("#wBuild").value);
  const rot = findById(state.rotations, $("#wRot").value);
  const scen = findById(state.scenarios, $("#wSc").value);
  const duration = Math.max(1, toNum($("#wDur").value, 30));
  const mode = $("#wMode").value;
  const stepPct = Math.max(0.1, toNum($("#wStep").value, 1));

  if (!build0 || !rot || !scen){
    $("#wMsg").textContent = "Choisis build, rotation, scénario.";
    return;
  }
  const build = applyPotentialsToBuild(build0);
  $("#wMsg").textContent = "Calcul...";
  const baseRes = runSimulation(build, rot, scen, duration, mode==="mc"?4000:1, mode);
  const base = baseRes.mean;

  const statsToTest = [
    {key:"atk", label:"+ATK"},
    {key:"crit_rate_pct", label:"+Crit %"},
    {key:"crit_dmg_pct", label:"+Crit DMG %"},
    {key:"dmg_bonus_pct", label:"+Bonus dégâts %"},
  ];

  let rows = [];
  for (const st of statsToTest){
    const b2 = deepCopy(build);
    const v0 = b2.stats[st.key] || 0;
    b2.stats[st.key] = v0 * (1 + stepPct/100) + (st.key==="atk" && v0===0 ? 100 : 0);
    const r2 = runSimulation(b2, rot, scen, duration, mode==="mc"?4000:1, mode);
    const d2 = r2.mean;
    const gain = (base !== 0) ? ((d2 - base)/base)*100 : NaN;
    rows.push({label: st.label, gainPct: gain});
  }
  rows.sort((a,b)=>b.gainPct-a.gainPct);

  $("#wOut").classList.remove("empty");
  $("#wOut").innerHTML = `
    <div class="pill">Base DPS: <b>${fmt(base)}</b> · pas: <b>${fmtPct(stepPct)}</b></div>
    <hr style="border:none;border-top:1px solid var(--border); margin:12px 0;">
    <div class="listbox" style="max-height:none">
      ${rows.map(r => `<div class="item"><div class="item-title">${escapeHtml(r.label)}</div><div class="item-sub">Gain: <b>${fmtPct(r.gainPct)}</b></div></div>`).join("")}
    </div>
    <div class="hint">Interprétation : la 1ère ligne est la stat la plus rentable ici.</div>
  `;
  $("#wMsg").textContent = "Terminé.";
}
function bindWeights(){
  $("#btnWeights")?.addEventListener("click", runWeights);
  $("#btnWeightsExplain")?.addEventListener("click", () => {
    openModal("Comment lire les weights", `
      <div class="p">On augmente chaque stat d’un petit pourcentage (le “pas”), puis on mesure le gain de DPS.</div>
      <div class="p">Exemple : si <b>+Crit %</b> donne +3% et <b>+ATK</b> donne +2%, alors, dans ce contexte, le crit est plus rentable.</div>
      <div class="hint warn">Ce n’est pas global : ça dépend du scénario, de la rotation, et de ton build.</div>
    `, [{label:"OK", kind:"primary", onClick: closeModal}]);
  });
}



// ---------- Meta Snapshot ----------
function refreshMetaSelectors(){
  fillSelect($("#metaBuild"), state.builds, b => b.name, selectedBuildId);
  fillSelect($("#metaRot"), state.rotations, r => r.name, selectedRotId);
  fillSelect($("#metaSc"), state.scenarios, s => s.name, selectedScId);
}

function refreshMetaSnapshot(){
  refreshMetaSelectors();
  const sig = getBhCurrentModelSig();
  $("#metaModelSig") && ($("#metaModelSig").innerHTML = `Modèle: <span class="mono">${escapeHtml(sig)}</span> · Profil: <b>${escapeHtml(state.settings.formula_profile || '—')}</b>`);
  const db = getActiveDb();
  const dbWhen = (LIVE_DB_META && (LIVE_DB_META.generated_at || LIVE_DB_META.updated)) || (db && db.updated) || state.meta?.updated || '—';
  $("#metaDbMeta") && ($("#metaDbMeta").textContent = `DB: ${getActiveDbLabel()} · ${dbWhen} · persos=${db.characters?.length||0} · armes=${db.weapons?.length||0}`);
  const st = computeCal2Stats();
  const casesN = state.calibrationLab?.cases?.length || 0;
  $("#metaCalMeta") && ($("#metaCalMeta").textContent = casesN ? `CalibrationLab: cas=${casesN} · RMSE=${fmtNum(st.rmse,0)} · MAPE=${fmtNum(st.mape*100,2)}%` : "CalibrationLab: aucun cas.");

  // Presets list
  const q = ($("#metaPresetSearch")?.value || '').trim().toLowerCase();
  const scope = $("#metaPresetScope")?.value || 'all';
  const off = (scope === 'local') ? [] : getBhOfficialList();
  const loc = (scope === 'official') ? [] : getBhLocalList();
  const list = [...off.map(p=>({...p,_kind:'official'})), ...loc.map(p=>({...p,_kind:'local'}))].filter(p => {
    if (!q) return true;
    const hay = `${p.name||''} ${p.author||''} ${p.role||''} ${p.context||''}`.toLowerCase();
    return hay.includes(q);
  }).slice(0, 30);

  const box = $("#metaPresetList");
  if (box){
    box.innerHTML = list.length ? list.map(p => {
      const kind = p._kind;
      const btns = `<button class="btn primary" data-meta-apply="${escapeHtml(p.id)}" data-kind="${kind}">Appliquer</button>
                    <button class="btn ghost" data-meta-link="${escapeHtml(p.id)}" data-kind="${kind}">Lien</button>`;
      return `<div class="item">
        <div class="item-title">${escapeHtml(p.name||'Preset')}</div>
        <div class="item-sub">${escapeHtml(kind.toUpperCase())} · ${escapeHtml(p.role||'—')} · ${escapeHtml(p.context||'—')} · ${escapeHtml(p.author||'—')}</div>
        <div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap">${btns}</div>
      </div>`;
    }).join("") : `<div class="hint">Aucun preset.</div>`;
  }
}

function metaRunWeights(){
  const b0 = findById(state.builds, $("#metaBuild")?.value) || state.builds[0];
  const rot = findById(state.rotations, $("#metaRot")?.value) || state.rotations[0];
  const scen = findById(state.scenarios, $("#metaSc")?.value) || state.scenarios[0];
  const duration = Math.max(1, toNum($("#metaDur")?.value, 30));
  const mode = $("#metaMode")?.value || "expected";
  const stepPct = Math.max(0.1, toNum($("#metaStep")?.value, 1));
  if (!b0 || !rot || !scen){
    $("#metaMsg").textContent = "Choisis build/rotation/scénario.";
    return;
  }
  const build = applyPotentialsToBuild(b0);
  $("#metaMsg").textContent = "Calcul...";
  const baseRes = runSimulation(build, rot, scen, duration, mode==="mc"?4000:1, mode);
  const base = baseRes.mean;

  const statsToTest = [
    {key:"atk", label:"+ATK"},
    {key:"crit_rate_pct", label:"+Crit %"},
    {key:"crit_dmg_pct", label:"+Crit DMG %"},
    {key:"dmg_bonus_pct", label:"+Bonus dégâts %"},
  ];

  let rows = [];
  for (const st of statsToTest){
    const b2 = deepCopy(build);
    const v0 = b2.stats[st.key] || 0;
    b2.stats[st.key] = v0 * (1 + stepPct/100) + (st.key==="atk" && v0===0 ? 100 : 0);
    const r2 = runSimulation(b2, rot, scen, duration, mode==="mc"?4000:1, mode);
    const d2 = r2.mean;
    const gain = (base !== 0) ? ((d2 - base)/base)*100 : NaN;
    rows.push({label: st.label, gainPct: gain});
  }
  rows.sort((a,b)=>b.gainPct-a.gainPct);

  $("#metaOut")?.classList.remove("empty");
  $("#metaOut") && ($("#metaOut").innerHTML = `
    <div class="pill">Base DPS: <b>${fmt(base)}</b> · pas: <b>${fmtPct(stepPct)}</b></div>
    <div class="hr"></div>
    <div class="listbox" style="max-height:none">
      ${rows.map(r => `<div class="item"><div class="item-title">${escapeHtml(r.label)}</div><div class="item-sub">Gain: <b>${fmtPct(r.gainPct)}</b></div></div>`).join("")}
    </div>
  `);
  $("#metaMsg").textContent = "Terminé.";
}

function bindMeta(){
  $("#btnMetaRun")?.addEventListener("click", () => { metaRunWeights(); });
  $("#metaPresetSearch")?.addEventListener("input", refreshMetaSnapshot);
  $("#metaPresetScope")?.addEventListener("change", refreshMetaSnapshot);

  $("#btnMetaCopyJson")?.addEventListener("click", () => {
    const payload = {model_sig: getBhCurrentModelSig(), settings: state.settings};
    downloadJson("model_settings.json", payload);
  });

  $("#btnMetaCopyLink")?.addEventListener("click", () => {
    openShareModal({version:1, created_at:new Date().toISOString(), items:{model:{settings:deepCopy(state.settings), model_sig:getBhCurrentModelSig()}}});
  });

  $("#btnMetaCopyReport")?.addEventListener("click", () => {
    const txt = [
      `ModelSig: ${getBhCurrentModelSig()}`,
      `Profile: ${state.settings.formula_profile||'—'}`,
      `Calibration cases: ${(state.calibrationLab?.cases?.length||0)}`,
      `RMSE: ${fmtNum(computeCal2Stats().rmse,0)}`,
    ].join("\n");
    navigator.clipboard?.writeText(txt);
    $("#metaMsg").textContent = "Rapport copié.";
  });

  $("#metaPresetList")?.addEventListener("click", (e) => {
    const a = e.target.closest("[data-meta-apply],[data-meta-link]");
    if (!a) return;
    const kind = a.dataset.kind;
    const id = a.dataset.metaApply || a.dataset.metaLink;
    const list = (kind === "official") ? getBhOfficialList() : getBhLocalList();
    const p = list.find(x => x.id === id);
    if (!p) return;
    if (a.dataset.metaApply){
      bhWarnIfModelMismatch(p, () => bhApplyPreset(p));
      return;
    }
    if (a.dataset.metaLink){
      openShareModal(buildSharePayloadFromPreset(p));
      return;
    }
  });
}

// ---------- Scaling Analyzer ----------
function refreshScalingSelectors(){
  fillSelect($("#scBuild"), state.builds, (x)=>x.name, selectedBuildId);
  fillSelect($("#scRot"), state.rotations, (x)=>x.name, selectedRotId);
  fillSelect($("#scSc"), state.scenarios, (x)=>x.name, selectedScId);
}

function setCanvasSize(canvas){
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(300, Math.floor(rect.width));
  const h = Math.max(180, Math.floor(rect.height));
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return {w, h, ctx};
}

function drawLineChart(canvas, xs, ys, opts={}){
  const dims = setCanvasSize(canvas);
  if (!dims) return;
  const {w,h,ctx} = dims;
  ctx.clearRect(0,0,w,h);

  const padL = 46, padR = 12, padT = 12, padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin0 = Math.min(...ys), yMax0 = Math.max(...ys);
  const yPad = (yMax0 - yMin0) * 0.08;
  const yMin = yMin0 - yPad;
  const yMax = yMax0 + yPad;

  const xToPx = (x)=> padL + (xMax===xMin ? 0.5*plotW : ((x-xMin)/(xMax-xMin))*plotW);
  const yToPx = (y)=> padT + (yMax===yMin ? 0.5*plotH : ((yMax-y)/(yMax-yMin))*plotH);

  // Axes
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // Grid + labels (3 ticks)
  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
  const ticks = 3;
  for (let i=0;i<=ticks;i++){
    const ty = padT + (plotH/ticks)*i;
    const val = yMax - (yMax-yMin)*(i/ticks);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.moveTo(padL, ty);
    ctx.lineTo(padL+plotW, ty);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(fmt(val), 6, ty+4);
  }

  // Line
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i=0;i<xs.length;i++){
    const px = xToPx(xs[i]);
    const py = yToPx(ys[i]);
    if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.stroke();

  // Points
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let i=0;i<xs.length;i++){
    const px = xToPx(xs[i]);
    const py = yToPx(ys[i]);
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI*2);
    ctx.fill();
  }

  // X labels (min/max)
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(String(opts.xLabelMin ?? fmt(xMin)), padL, padT+plotH+18);
  const maxTxt = String(opts.xLabelMax ?? fmt(xMax));
  const tw = ctx.measureText(maxTxt).width;
  ctx.fillText(maxTxt, padL+plotW-tw, padT+plotH+18);

  if (opts.title){
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(opts.title, padL, 12);
  }
}

function exportCanvasPng(canvas, filename){
  if (!canvas) return;
  try{
    const link = document.createElement('a');
    link.download = filename || 'chart.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    link.remove();
  }catch(e){
    console.warn(e);
    alert("Export PNG impossible sur ce navigateur.");
  }
}

function runScaling(){
  const build0 = findById(state.builds, $("#scBuild").value);
  const rot = findById(state.rotations, $("#scRot").value);
  const scen = findById(state.scenarios, $("#scSc").value);
  const duration = Math.max(1, toNum($("#scDur").value, 30));
  const statKey = $("#scStat").value;
  const fromPct = toNum($("#scFrom").value, -10);
  const toPct = toNum($("#scTo").value, 20);
  const steps = clamp(Math.round(toNum($("#scSteps").value, 13)), 5, 41);
  const mode = $("#scMode").value;

  if (!build0 || !rot || !scen){
    $("#scMsg").textContent = "Choisis build, rotation, scénario.";
    return;
  }
  const build = applyPotentialsToBuild(build0);
  $("#scMsg").textContent = "Calcul...";

  const pts = [];
  for (let i=0;i<steps;i++){
    const t = steps===1 ? 0 : i/(steps-1);
    const pct = fromPct + (toPct-fromPct)*t;

    const b2 = deepCopy(build);
    const v0 = b2.stats[statKey] || 0;

    if (statKey === "atk"){
      const baseAtk = (v0===0 ? 100 : v0);
      b2.stats.atk = baseAtk * (1 + pct/100);
    } else {
      b2.stats[statKey] = v0 * (1 + pct/100);
    }

    const iters = (mode === "mc") ? 2000 : 1;
    const res = runSimulation(b2, rot, scen, duration, iters, mode);
    pts.push({pct, dps: res.mean});
  }

  const xs = pts.map(p=>p.pct);
  const ys = pts.map(p=>p.dps);

  let best = pts[0];
  for (const p of pts){ if (p.dps > best.dps) best = p; }

  $("#scOut").classList.remove("empty");
  $("#scOut").innerHTML = `
    <div class="row" style="justify-content:space-between">
      <span class="pill">Stat: <b>${escapeHtml($("#scStat").selectedOptions[0].textContent)}</b></span>
      <span class="pill good">Meilleur: <b>${fmt(best.dps)}</b> à <b>${fmtPct(best.pct)}</b></span>
    </div>
    <div class="chartWrap">
      <canvas id="scCanvas" class="chartCanvas" aria-label="Courbe de scaling"></canvas>
    </div>
    <div class="hint tiny">Lecture: la courbe montre l’impact de ±% sur la stat, toutes choses égales (rotation/scénario identiques).</div>
  `;

  const canvas = $("#scCanvas");
  const statLabel = $("#scStat").selectedOptions[0].textContent;
  drawLineChart(canvas, xs, ys, {title: `DPS vs ${statLabel} (Δ%)`, xLabelMin: `${fromPct}%`, xLabelMax: `${toPct}%`});

  const onResize = () => {
    try{ drawLineChart(canvas, xs, ys, {title: `DPS vs ${statLabel} (Δ%)`, xLabelMin: `${fromPct}%`, xLabelMax: `${toPct}%`}); }catch(e){}
  };
  window.addEventListener("resize", onResize, {once:true});

  $("#scMsg").textContent = "Terminé.";
}

function bindScaling(){
  $("#btnScaling")?.addEventListener("click", runScaling);
  $("#btnScalingExport")?.addEventListener("click", () => {
    const c = $("#scCanvas");
    if (!c){ alert("Trace d’abord une courbe."); return; }
    exportCanvasPng(c, 'scaling.png');
  });
  $("#btnScalingExplain")?.addEventListener("click", () => {
    openModal("Scaling Analyzer", `
      <div class="p">Cet outil trace une courbe : on fait varier une seule stat (ex : +20% Crit DMG) et on calcule le DPS correspondant.</div>
      <div class="p">Usage typique : détecter les <b>soft-caps</b> (pente qui baisse) et voir si une stat te donne encore de la valeur.</div>
      <div class="hint warn">En mode Monte‑Carlo, la courbe peut être bruitée. Utilise Expected pour une lecture stable.</div>
    `, [{label:"OK", kind:"primary", onClick: closeModal}]);
  });
}


// ---------- Combat Sandbox ----------
function refreshSandboxSelectors(){
  fillSelect($("#sbBuild"), state.builds, (x)=>x.name, selectedBuildId);
  fillSelect($("#sbRot"), state.rotations, (x)=>x.name, selectedRotId);
  fillSelect($("#sbScen"), state.scenarios, (x)=>x.name, selectedScId);
}

function chooseActionAtTime(rot, tNow, cds, orbs){
  // Similar to simulateOnce scheduling, but we pick the first valid action.
  const actions = (rot && rot.actions) ? rot.actions : [];
  for (const a of actions){
    const key = a.label || a.kind;
    const readyAt = cds.get(key) ?? 0;
    if (tNow < readyAt) continue;
    const req = a.requiresOrbs || 0;
    if (req > 0 && orbs < req) continue;
    return a;
  }
  return {kind:"wait", label:"wait", cd:1, hits:0, mult:0};
}

function runSandbox(){
  const build0 = findById(state.builds, $("#sbBuild").value);
  const rot = findById(state.rotations, $("#sbRot").value);
  const scen = findById(state.scenarios, $("#sbScen").value);
  const turns = clamp(Math.round(toNum($("#sbTurns").value, 15)), 1, 200);
  const secPerTurn = Math.max(0.1, toNum($("#sbTurnSeconds").value, 1));
  const mode = $("#sbMode").value;
  const iters = clamp(Math.round(toNum($("#sbIters").value, 500)), 1, 5000);

  if (!build0 || !rot || !scen){ $("#sbMsg").textContent = "Choisis un build, une rotation et un scénario."; return; }
  const build = applyPotentialsToBuild(build0);
  $("#sbMsg").textContent = "Simulation...";

  const enemy = scen.enemy || {};
  const base = baseHitDamage(build, enemy, state.settings);
  const burstBonusMul = 1 + (state.settings.burst_bonus_pct || 0)/100;
  const burstRes = 1 - (enemy.burst_resist || 0);

  // Turn-based approximation: each turn we attempt one action.
  const cds = new Map();
  let orbs = state.settings.initial_orbs || 0;
  let cum = 0;
  const rows = [];
  const cumSeries = [];
  const rngBase = makeRng(state.settings.mc_seed || 12345);

  for (let turn=1; turn<=turns; turn++){
    const tNow = (turn-1) * secPerTurn;
    const a = chooseActionAtTime(rot, tNow, cds, orbs);
    const key = a.label || a.kind;
    let burstMul = 1;
    if (a.burstEligible && isBurstActiveAt(tNow, rot, state.settings)){
      burstMul *= burstBonusMul * burstRes;
    }

    let dealt = 0;
    if (key === 'wait' || a.kind === 'wait' || mult === 0){
      dealt = 0;
    } else if (mode === 'expected'){
      dealt = base * mult * hits * burstMul * expectedCritMultiplier(build, state.settings);
    } else {
      // MC: sample a single outcome for the turn using deterministic seed per turn.
      const seed = (Math.floor(rngBase()*1e9) ^ (turn*2654435761)) >>> 0;
      const rng = makeRng(seed);
      const cr = clamp(build.stats.crit_rate_pct || 0, 0, state.settings.crit_cap)/100;
      const cd = (build.stats.crit_dmg_pct || 0)/100;
      for (let i=0;i<hits;i++){
        const isCrit = rng() < cr;
        dealt += base * mult * burstMul * (isCrit ? (1+cd) : 1);
      }
      // Reduce noise by averaging a few internal samples if requested.
      if (iters > 1){
        let sum = dealt;
        const n = Math.min(iters, 50);
        for (let k=1;k<n;k++){
          const r2 = makeRng((seed ^ (k*97))>>>0);
          let d2 = 0;
          for (let i=0;i<hits;i++) d2 += base * mult * burstMul * ((r2()<cr)?(1+cd):1);
          sum += d2;
        }
        dealt = sum / Math.min(iters, 50);
      }
    }

    // Orb model (same as simulateOnce)
    if (a.kind === 'skill') orbs = Math.min(7, orbs + (state.settings.orb_gain_per_skill || 0));
    if (a.kind === 'ultimate'){
      const req = a.requiresOrbs || 0;
      if (req > 0) orbs = Math.max(0, orbs - req);
    }

    const cdTime = Math.max(0, a.cd || 0);
    cds.set(key, tNow + cdTime);

    cum += dealt;
    rows.push({turn, action:key, dealt, cum, orbs});
    cumSeries.push(cum);
  }

  // Render table
  const tbody = $("#sbTable tbody");
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.turn}</td>
      <td>${escapeHtml(r.action)}</td>
      <td>${fmt(r.dealt)}</td>
      <td>${fmt(r.cum)}</td>
      <td>${r.orbs}</td>
    </tr>
  `).join("");

  const totalSeconds = turns * secPerTurn;
  const dps = cum / totalSeconds;
  $("#sbSummary").innerHTML = `
    <div class="results">
      <div class="kpi"><div class="k">Dégâts totaux</div><div class="v">${fmt(cum)}</div></div>
      <div class="kpi"><div class="k">Durée</div><div class="v">${fmt(totalSeconds)} s</div></div>
      <div class="kpi"><div class="k">DPS moyen</div><div class="v">${fmt(dps)}</div></div>
      <div class="hint tiny">Rotation: <b>${escapeHtml(rot.name)}</b> · Scénario: <b>${escapeHtml(scen.name)}</b></div>
    </div>
  `;

  const xs = rows.map(r=>r.turn);
  drawLineChart($("#sbCanvas"), xs, cumSeries, {title:"Cumul dégâts par tour", xLabelMin:"T1", xLabelMax:`T${turns}`});
  $("#sbMsg").textContent = "Terminé.";
}

function bindSandbox(){
  $("#sbRun")?.addEventListener('click', runSandbox);
  $("#sbExport")?.addEventListener('click', () => exportCanvasPng($("#sbCanvas"), 'combat-sandbox.png'));
}


// ---------- Boss scaling infini ----------
function refreshBossSelectors(){
  fillSelect($("#bossBuild"), state.builds, (x)=>x.name, selectedBuildId);
  fillSelect($("#bossRot"), state.rotations, (x)=>x.name, selectedRotId);
  fillSelect($("#bossScen"), state.scenarios, (x)=>x.name, selectedScId);
}

function runBossScaling(){
  const build0 = findById(state.builds, $("#bossBuild").value);
  const rot = findById(state.rotations, $("#bossRot").value);
  const scenBase = findById(state.scenarios, $("#bossScen").value);
  if (!build0 || !rot || !scenBase){ $("#bossMsg").textContent = "Choisis un build, une rotation et un scénario."; return; }
  const build = applyPotentialsToBuild(build0);

  const duration = Math.max(1, toNum($("#bossDuration").value, 30));
  const mode = $("#bossMode").value;
  const iters = clamp(Math.round(toNum($("#bossIters").value, 400)), 1, 5000);
  const metric = $("#bossMetric").value;

  const Lmin = clamp(Math.round(toNum($("#bossLmin").value, 1)), 1, 9999);
  const Lmax = clamp(Math.round(toNum($("#bossLmax").value, 200)), Lmin, 9999);
  const defBase = Math.max(0, toNum($("#bossDefBase").value, 1200));
  const defPer = Math.max(0, toNum($("#bossDefPer").value, 35));
  const hpBase = Math.max(1, toNum($("#bossHpBase").value, 500000));
  const hpPer = Math.max(0, toNum($("#bossHpPer").value, 25000));

  $("#bossMsg").textContent = "Calcul...";

  const rows = [];
  const xs = [];
  const ys = [];

  // Keep burst_resist and dmg_reduction_pct from base scenario enemy if present.
  const baseEnemy = scenBase.enemy || {};

  for (let lvl=Lmin; lvl<=Lmax; lvl++){
    const enemy = Object.assign({}, baseEnemy, {
      def: defBase + (lvl-1)*defPer,
      hp: hpBase + (lvl-1)*hpPer,
    });
    const scen = Object.assign({}, scenBase, {enemy});

    const out = runSimulation(build, rot, scen, duration, iters, mode);
    const dps = out.mean;
    const hp = enemy.hp;
    const ttk = dps > 0 ? (hp / dps) : Infinity;
    rows.push({lvl, def: enemy.def, hp, dps, ttk});
    xs.push(lvl);
    ys.push(metric === 'ttk' ? ttk : dps);
  }

  // Render table (top 40 rows for performance)
  const tbody = $("#bossTable tbody");
  const slice = rows.slice(0, 60);
  tbody.innerHTML = slice.map(r => `
    <tr>
      <td>${r.lvl}</td>
      <td>${fmt(r.def)}</td>
      <td>${fmt(r.hp)}</td>
      <td>${fmt(r.dps)}</td>
      <td>${isFinite(r.ttk)? fmt(r.ttk) : '∞'}</td>
    </tr>
  `).join("");

  // Heuristic: find first lvl where ttk > 300s
  const hard = rows.find(r => r.ttk > 300);
  const hint = hard ? `Palier estimé: ~niveau <b>${hard.lvl-1}</b> (TTK>300s à partir de ${hard.lvl}).` : `Pas de mur TTK>300s jusqu’au niveau ${Lmax}.`;
  $("#bossHint").innerHTML = hint;

  const title = metric === 'ttk' ? 'TTK vs Niveau' : 'DPS vs Niveau';
  drawLineChart($("#bossCanvas"), xs, ys, {title, xLabelMin:`L${Lmin}`, xLabelMax:`L${Lmax}`});
  $("#bossMsg").textContent = "Terminé.";
}

function bindBossScaling(){
  $("#bossRun")?.addEventListener('click', runBossScaling);
  $("#bossExport")?.addEventListener('click', () => exportCanvasPng($("#bossCanvas"), 'boss-scaling.png'));
  $("#bossMetric")?.addEventListener('change', () => {
    // re-run to redraw with different metric using existing inputs
    try{ runBossScaling(); }catch(e){}
  });
}

// ---------- Calibration ----------
function predictSingleHitDamage(build, scen, ctx, burstOn, overrideK){
  const enemy = scen.enemy || {};

  let burstMul = 1;
  if (burstOn){
    const burstBonusMul = 1 + (state.settings.burst_bonus_pct || 0)/100;
    const burstRes = 1 - (enemy.burst_resist || 0);
    burstMul = burstBonusMul * burstRes;
  }

  ctx = ctx || { kind: "skill", mult: 1, hits: 1 };
  const rng = makeRng(1);
  return actionDamage(build, enemy, state.settings, ctx, "expected", rng, overrideK) * burstMul;
}

function runCalibrate(){
  const build0 = findById(state.builds, $("#calBuild").value);
  const scen = findById(state.scenarios, $("#calSc").value);
  // Base ctx from manual fields
  let ctx = { kind: "skill", mult: toNum($("#calMult").value, 2.2), hits: Math.max(1, Math.round(toNum($("#calHits").value, 1))) };

  // Skill picker (optional)
  const charId = ($("#calChar")?.value || build0.character_id || "").trim();
  const skIdxRaw = $("#calSkill")?.value;
  if (skIdxRaw !== "" && skIdxRaw != null){
    const sk = getSkillsForCharacter(charId)[Number(skIdxRaw)];
    if (sk){
      const m = toNum(sk.multiplier, null);
      if (m !== null) ctx.mult = m/100;
      ctx.hits = Math.max(1, Math.round(toNum(sk.hits, ctx.hits)));
      const t = String(sk.type || "").toLowerCase();
      ctx.kind = t.includes("ult") ? "ultimate" : "skill";
      ctx.effects = Array.isArray(sk.parsed_effects) ? sk.parsed_effects : [];
      // Auto-fill UI for clarity
      $("#calMult").value = String(ctx.mult);
      $("#calHits").value = String(ctx.hits);
    }
  }
  const obs = toNum($("#calObserved").value, NaN);
  const burstSel = $("#calBurst").value;

  if (!build0 || !scen){ $("#calMsg").textContent = "Choisis un build et un scénario."; return; }
  const build = applyPotentialsToBuild(build0);
  if (!isFinite(obs) || obs <= 0){ $("#calMsg").textContent = "Entre un dégât observé valide."; return; }

  let burstOn = false;
  if (burstSel === "yes") burstOn = true;
  if (burstSel === "no") burstOn = false;
  if (burstSel === "auto") burstOn = false; // calibration explicite recommandée

  $("#calMsg").textContent = "Recherche du meilleur K...";
  const Kmin = 200, Kmax = 20000;
  const step = 25; // fine enough, fast
  let best = {K: state.settings.mitigation_k, err: Infinity, pred: NaN};

  for (let K=Kmin; K<=Kmax; K+=step){
    const pred = predictSingleHitDamage(build, scen, ctx, burstOn, K);
    const err = Math.abs(pred - obs) / obs;
    if (err < best.err){
      best = {K, err, pred};
    }
  }

  const body = `
    <div class="row">
      <span class="pill good">K recommandé: <b>${fmt(best.K)}</b></span>
      <span class="pill">Erreur: <b>${fmtPct(best.err*100)}</b></span>
    </div>
    <hr style="border:none;border-top:1px solid var(--border); margin:12px 0;">
    <div class="p"><b>Observé :</b> ${fmt(obs)}</div>
    <div class="p"><b>Prévu (avec K) :</b> ${fmt(best.pred)}</div>
    <div class="hint">Tip : fais plusieurs tests (ou moyenne) pour stabiliser. Mets Crit% à 0 si tu veux une calibration “non‑crit”.</div>
    <div class="row" style="margin-top:10px">
      <button class="btn primary" id="btnApplyK">Appliquer K</button>
      <button class="btn" id="btnTryCoarse">Recherche large</button>
    </div>
  `;

  $("#calOut").classList.remove("empty");
  $("#calOut").innerHTML = body;

  $("#btnApplyK").addEventListener("click", () => {
    state.settings.mitigation_k = best.K;
    saveState();
    refreshSettingsUI();
    refreshHeader();
    $("#calMsg").textContent = "K appliqué dans Réglages.";
    openModal("K appliqué", `<div class="p">K=${fmt(best.K)} enregistré.</div>`, [{label:"OK", kind:"primary", onClick: closeModal}]);
  });

  $("#btnTryCoarse").addEventListener("click", () => {
    // very coarse + show curve suggestion
    const ks = [400,800,1200,1600,2200,3000,4500,6500,9000,12000,16000];
    const rows = ks.map(K => {
      const pred = predictSingleHitDamage(build, scen, ctx, burstOn, K);
      const err = Math.abs(pred-obs)/obs*100;
      return `<div class="item"><div class="item-title">K=${fmt(K)}</div><div class="item-sub">Prévu ${fmt(pred)} · err ${fmtPct(err)}</div></div>`;
    }).join("");
    openModal("Recherche large", `<div class="p">Si le meilleur K est instable, compare sur plusieurs points.</div><div class="listbox" style="max-height:420px">${rows}</div>`, [
      {label:"OK", kind:"primary", onClick: closeModal}
    ]);
  });

  $("#calMsg").textContent = "Terminé.";
}

function bindCalibration(){
  $("#btnCalibrate")?.addEventListener("click", runCalibrate);

  $("#calBuild")?.addEventListener("change", () => { refreshCalSkillPickers(); });
  $("#calChar")?.addEventListener("change", () => { refreshCalSkillPickers(); });
  $("#calSkill")?.addEventListener("change", () => {
    const build0 = findById(state.builds, $("#calBuild")?.value);
    const charId = ($("#calChar")?.value || build0?.character_id || "").trim();
    const sk = getSkillsForCharacter(charId)[Number($("#calSkill")?.value)];
    if (sk){
      const m = toNum(sk.multiplier, null);
      if (m !== null) $("#calMult").value = String(m/100);
      const h = Math.max(1, Math.round(toNum(sk.hits, 1)));
      $("#calHits").value = String(h);
    }
  });
  $("#btnCalExplain")?.addEventListener("click", () => openModal("Comment faire un test", `
    <ol class="list">
      <li>Choisis un boss / dummy stable (même DEF).</li>
      <li>Désactive autant que possible les buffs variables.</li>
      <li>Utilise une skill simple (mult connu, hits connus).</li>
      <li>Note : build (ATK/crit/critDMG/bonus), le dégât, et si c’était en Burst.</li>
      <li>Idéal : faire 3–5 essais et rentrer une moyenne.</li>
    </ol>
    <div class="hint warn">Si tu n’es pas sûr du crit : mets Crit% à 0 temporairement pour calibrer K “non‑crit”.</div>
  `, [{label:"OK", kind:"primary", onClick: closeModal}]));
}


// ---------- Calibration Lab (multi-cas) ----------
function ensureCalibrationLabState(){
  state.calibrationLab = state.calibrationLab || { cases: [], best: null };
}

function computePredictedForCase(c){
  const b0 = state.builds[c.buildIndex] || state.builds.find(x => x.id === c.buildId) || state.builds[0];
  const b = b0 ? applyPotentialsToBuild(b0) : null;
  const s = state.scenarios[c.scIndex] || state.scenarios.find(x => x.id === c.scId) || state.scenarios[0];
  if (!b || !s) return 0;

  const enemy = s.enemy || {def:0, resistance_pct:0, crit_resist_pct:0, crit_def_pct:0, dmg_reduction_pct:0, element:"neutral"};
  let ctx = { kind: c.kind || "skill", mult: toNum(c.mult, 1), hits: toNum(c.hits, 1), effects: [] };
  const charId = (c.charId || b0?.character_id || "").trim();
  if (c.skill_index !== undefined && c.skill_index !== null){
    const sk = getSkillsForCharacter(charId)[Number(c.skill_index)];
    if (sk){
      const m = toNum(sk.multiplier, null);
      if (m !== null) ctx.mult = m/100;
      ctx.hits = Math.max(1, Math.round(toNum(sk.hits, ctx.hits)));
      const t = String(sk.type||"").toLowerCase();
      ctx.kind = t.includes("ult") ? "ultimate" : "skill";
      ctx.effects = Array.isArray(sk.parsed_effects) ? sk.parsed_effects : [];
    }
  }
  const rng = mulberry32(1234567);
  // Use expected mode for deterministic calibration
  const dmg = actionDamage(b, enemy, state.settings, ctx, "expected", rng, null);
  return dmg;
}

function computeCal2Stats(){
  ensureCalibrationLabState();
  const cases = state.calibrationLab.cases || [];
  if (!cases.length) return {rmse:0, mape:0};
  const errs = [];
  const ape = [];
  for (const c of cases){
    const pred = computePredictedForCase(c);
    const obs = toNum(c.observed, 0);
    const e = pred - obs;
    errs.push(e*e);
    if (obs > 0) ape.push(Math.abs(e)/obs);
  }
  const rmse = Math.sqrt(errs.reduce((a,b)=>a+b,0)/errs.length);
  const mape = ape.length ? (ape.reduce((a,b)=>a+b,0)/ape.length) : 0;
  return {rmse, mape};
}

function refreshCal2Table(){
  ensureCalibrationLabState();
  const tb = $("#cal2Table tbody");
  const statsEl = $("#cal2Stats");
  if (!tb || !statsEl) return;

  const cases = state.calibrationLab.cases || [];
  tb.innerHTML = "";
  cases.forEach((c, i) => {
    const b = state.builds.find(x => x.id === c.buildId) || state.builds[0];
    const s = state.scenarios.find(x => x.id === c.scId) || state.scenarios[0];
    const pred = computePredictedForCase(c);
    const obs = toNum(c.observed, 0);
    const errPct = obs > 0 ? ((pred-obs)/obs*100) : 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${escapeHtml(b?.name || "—")}</td>
      <td>${escapeHtml(s?.name || "—")}</td>
      <td>${escapeHtml(c.kind || "skill")}</td>
      <td>${fmtNum(toNum(c.mult,0), 2)}</td>
      <td>${fmtNum(toNum(c.hits,0), 0)}</td>
      <td>${fmtNum(obs, 0)}</td>
      <td>${fmtNum(pred, 0)}</td>
      <td class="${Math.abs(errPct) <= 5 ? "good" : (Math.abs(errPct) <= 12 ? "warn" : "bad")}">${fmtNum(errPct, 2)}%</td>
    `;
    tb.appendChild(tr);
  });

  const st = computeCal2Stats();
  statsEl.textContent = cases.length
    ? `Cas: ${cases.length} • RMSE: ${fmtNum(st.rmse, 0)} • Erreur abs. moyenne: ${fmtNum(st.mape*100, 2)}%`
    : "Aucun cas.";
}

function addCal2Case(){
  ensureCalibrationLabState();
  const msg = $("#cal2Msg");
  const buildId = $("#cal2Build")?.value || "";
  const scId = $("#cal2Sc")?.value || "";
  let kind = $("#cal2Kind")?.value || "skill";
  let mult = toNum($("#cal2Mult")?.value, 1);
  let hits = Math.max(1, Math.round(toNum($("#cal2Hits")?.value, 1)));
  const charId = ($("#cal2Char")?.value || findById(state.builds, buildId)?.character_id || "").trim();
  const skillIdxRaw = $("#cal2Skill")?.value;
  let skill_index = null;
  if (skillIdxRaw !== "" && skillIdxRaw != null){
    skill_index = Number(skillIdxRaw);
    const sk = getSkillsForCharacter(charId)[skill_index];
    if (sk){
      const m = toNum(sk.multiplier, null);
      if (m !== null) mult = m/100;
      hits = Math.max(1, Math.round(toNum(sk.hits, hits)));
      const t = String(sk.type||"").toLowerCase();
      kind = t.includes("ult") ? "ultimate" : "skill";
    }
  }
  const observed = toNum($("#cal2Observed")?.value, 0);

  if (!buildId || !scId){
    if (msg) msg.textContent = "Choisis un build et un scénario.";
    return;
  }
  if (!(observed > 0)){
    if (msg) msg.textContent = "Entre un dégât observé (> 0).";
    return;
  }

  state.calibrationLab.cases.push({
    id: uid("case"),
    buildId, scId, kind, mult, hits, observed,
    charId, skill_index
  });

  if (msg) msg.textContent = "Cas ajouté.";
  saveState();
  refreshCal2Table();
  refreshCalSkillPickers();
}

function clearCal2Cases(){
  ensureCalibrationLabState();
  state.calibrationLab.cases = [];
  state.calibrationLab.best = null;
  $("#cal2Best")?.classList.add("empty");
  $("#cal2Best") && ($("#cal2Best").innerHTML = '<div class="emptyState">Ajoute au moins 3 cas pour lancer l’Auto-Fit.</div>');
  $("#btnCal2Apply") && ($("#btnCal2Apply").disabled = true);
  $("#cal2FitMsg") && ($("#cal2FitMsg").textContent = "");
  saveState();
  refreshCal2Table();
  refreshCalSkillPickers();
}

function evaluateRMSEForCases(cases){
  if (!cases.length) return 1e18;
  let sse = 0;
  for (const c of cases){
    const pred = computePredictedForCase(c);
    const obs = toNum(c.observed, 0);
    const e = pred - obs;
    sse += e*e;
  }
  return Math.sqrt(sse / cases.length);
}

function autoFitContinuous(cases, ranges){
  // Grid search coarse then refine; returns {bestG, bestD, rmse}
  const gRange = ranges.g;
  const dRange = ranges.d;
  let best = {g: state.settings.hidden_global_multiplier || 1, d: state.settings.hidden_defense_coefficient || 1, rmse: 1e18};

  const prevG = state.settings.hidden_global_multiplier || 1;
  const prevD = state.settings.hidden_defense_coefficient || 1;

  for (const g of gRange){
    state.settings.hidden_global_multiplier = g;
    for (const d of dRange){
      state.settings.hidden_defense_coefficient = d;
      const rmse = evaluateRMSEForCases(cases);
      if (rmse < best.rmse){
        best = {g, d, rmse};
      }
    }
  }

  // restore baseline (caller may apply best)
  state.settings.hidden_global_multiplier = prevG;
  state.settings.hidden_defense_coefficient = prevD;

  return best;
}

function genRange(center, span, step){
  const a = center - span;
  const b = center + span;
  const out = [];
  for (let x=a; x<=b+1e-12; x+=step) out.push(Math.round(x*100000)/100000);
  return out;
}

function runAutoFitAdvanced(){
  ensureCalibrationLabState();
  const casesAll = state.calibrationLab.cases || [];
  const msg = $("#cal2FitMsg");
  const bestEl = $("#cal2Best");
  const applyBtn = $("#btnCal2Apply");

  if (casesAll.length < 3){
    if (msg) msg.textContent = "Ajoute au moins 3 cas.";
    return;
  }

  // Heuristic B: prefilter with sample subset + early stop
  const speed = $("#cal2Speed")?.value || "fast";
  const earlyStopPct = toNum($("#cal2Stop")?.value, 4) / 100;
  const sampleN = Math.max(3, Math.round(toNum($("#cal2Sample")?.value, 8)));

  const subset = casesAll.slice(0, sampleN);

  const structures = [];
  const critOrders = ["beforeDef","afterDef"];
  const defModels = ["linear","ratio"];
  const pierceModes = ["multiplicative","additive"];
  const elemStages = ["early","late"];

  for (const co of critOrders){
    for (const dm of defModels){
      for (const pm of pierceModes){
        for (const es of elemStages){
          structures.push({crit_order: co, mitigation_model: dm, pierce_mode: pm, element_stage: es});
        }
      }
    }
  }

  const baseline = {
    crit_order: state.settings.crit_order || "afterDef",
    mitigation_model: state.settings.mitigation_model || "ratio",
    pierce_mode: state.settings.pierce_mode || "multiplicative",
    element_stage: state.settings.element_stage || "late",
    g: state.settings.hidden_global_multiplier || 1,
    d: state.settings.hidden_defense_coefficient || 1
  };

  const prev = {...state.settings};
  let best = {rmse: 1e18, structure: null, g: baseline.g, d: baseline.d};

  // coarse ranges depend on speed
  const coarseG = speed === "fast" ? genRange(1.0, 0.25, 0.03) : genRange(1.0, 0.35, 0.02);
  const coarseD = speed === "fast" ? genRange(1.0, 0.60, 0.06) : genRange(1.0, 0.80, 0.05);

  const refineStepG = speed === "fast" ? 0.01 : 0.008;
  const refineStepD = speed === "fast" ? 0.02 : 0.015;

  if (msg) msg.textContent = `Recherche structurelle… (${structures.length} combinaisons)`;

  // Pre-filter: score on subset
  const scored = [];
  for (const st of structures){
    state.settings.crit_order = st.crit_order;
    state.settings.mitigation_model = st.mitigation_model;
    state.settings.pierce_mode = st.pierce_mode;
    state.settings.element_stage = st.element_stage;

    const r = autoFitContinuous(subset, {g: coarseG, d: coarseD});
    scored.push({...st, rmse: r.rmse, g: r.g, d: r.d});

    if (subset.length && (r.rmse / Math.max(1, avgObserved(subset))) <= earlyStopPct){
      // early-stop structure search if already very good on subset
      break;
    }
  }

  scored.sort((a,b)=>a.rmse-b.rmse);
  const topK = speed === "fast" ? scored.slice(0, 4) : scored.slice(0, 6);

  if (msg) msg.textContent = `Refine sur ${topK.length} meilleures structures…`;

  for (const st of topK){
    state.settings.crit_order = st.crit_order;
    state.settings.mitigation_model = st.mitigation_model;
    state.settings.pierce_mode = st.pierce_mode;
    state.settings.element_stage = st.element_stage;

    // refine around the coarse best for that structure
    const refineG = genRange(st.g, 0.06, refineStepG);
    const refineD = genRange(st.d, 0.12, refineStepD);
    const r = autoFitContinuous(casesAll, {g: refineG, d: refineD});
    if (r.rmse < best.rmse){
      best = {rmse: r.rmse, structure: {...st}, g: r.g, d: r.d};
    }

    const rel = r.rmse / Math.max(1, avgObserved(casesAll));
    if (rel <= earlyStopPct) break;
  }

  // restore previous settings
  Object.assign(state.settings, prev);

  state.calibrationLab.best = best.structure ? {
    ...best.structure,
    hidden_global_multiplier: best.g,
    hidden_defense_coefficient: best.d,
    rmse: best.rmse
  } : null;

  const relPct = (best.rmse / Math.max(1, avgObserved(casesAll))) * 100;

  if (bestEl){
    bestEl.classList.remove("empty");
    bestEl.innerHTML = best.structure ? `
      <div class="grid3">
        <div><div class="muted tiny">critOrder</div><div><b>${escapeHtml(best.structure.crit_order)}</b></div></div>
        <div><div class="muted tiny">defenseFormula</div><div><b>${escapeHtml(best.structure.mitigation_model)}</b></div></div>
        <div><div class="muted tiny">pierceMode</div><div><b>${escapeHtml(best.structure.pierce_mode)}</b></div></div>
      </div>
      <div class="grid3" style="margin-top:10px">
        <div><div class="muted tiny">elementStage</div><div><b>${escapeHtml(best.structure.element_stage)}</b></div></div>
        <div><div class="muted tiny">hidden_global_multiplier</div><div><b>${fmtNum(best.g, 4)}</b></div></div>
        <div><div class="muted tiny">hidden_defense_coefficient</div><div><b>${fmtNum(best.d, 4)}</b></div></div>
      </div>
      <div class="hint tiny" style="margin-top:10px">RMSE: <b>${fmtNum(best.rmse, 0)}</b> (≈ ${fmtNum(relPct, 2)}% des dégâts moyens)</div>
    ` : '<div class="emptyState">Auto-Fit impossible (cas invalides ?).</div>';
  }

  if (msg) msg.textContent = best.structure ? "Terminé. Tu peux appliquer le modèle." : "Échec Auto-Fit.";
  if (applyBtn) applyBtn.disabled = !best.structure;

  saveState();
  refreshCal2Table();
  refreshCalSkillPickers();
}

function avgObserved(cases){
  if (!cases.length) return 0;
  const s = cases.reduce((a,c)=>a+toNum(c.observed,0),0);
  return s/cases.length;
}

function applyBestCal2Model(){
  ensureCalibrationLabState();
  const best = state.calibrationLab.best;
  if (!best) return;
  state.settings.crit_order = best.crit_order;
  state.settings.mitigation_model = best.mitigation_model;
  state.settings.pierce_mode = best.pierce_mode;
  state.settings.element_stage = best.element_stage;
  state.settings.hidden_global_multiplier = best.hidden_global_multiplier;
  state.settings.hidden_defense_coefficient = best.hidden_defense_coefficient;
  saveState();
  refreshCal2Table();
  refreshCalSkillPickers();
  toast("Modèle appliqué.");
}

function bindCalibrationLab(){
  ensureCalibrationLabState();

  $("#cal2Build")?.addEventListener("change", () => { refreshCalSkillPickers(); });
  $("#cal2Char")?.addEventListener("change", () => { refreshCalSkillPickers(); });
  $("#cal2Skill")?.addEventListener("change", () => {
    const build0 = findById(state.builds, $("#cal2Build")?.value);
    const charId = ($("#cal2Char")?.value || build0?.character_id || "").trim();
    const sk = getSkillsForCharacter(charId)[Number($("#cal2Skill")?.value)];
    if (sk){
      const m = toNum(sk.multiplier, null);
      if (m !== null) $("#cal2Mult").value = String(m/100);
      const h = Math.max(1, Math.round(toNum(sk.hits, 1)));
      $("#cal2Hits").value = String(h);
      const t = String(sk.type||"").toLowerCase();
      $("#cal2Kind").value = t.includes("ult") ? "ultimate" : "skill";
    }
  });

  $("#btnCal2Add")?.addEventListener("click", addCal2Case);
  $("#btnCal2Clear")?.addEventListener("click", clearCal2Cases);
  $("#btnCal2Fit")?.addEventListener("click", runAutoFitAdvanced);
  $("#btnCal2Apply")?.addEventListener("click", applyBestCal2Model);
}


// ---------- Brave Hearts presets (community, local-first) ----------
const BH_PRESETS_KEY = "7ds_origin_bh_presets_local_v1";

function readEmbeddedOfficialPresets(){
  try{
    const el = document.getElementById("bh-presets-official-json");
    if (!el) return {meta:{version:"—",updated:"—"}, presets:[]};
    const obj = JSON.parse(el.textContent || "{}");
    if (!obj || !Array.isArray(obj.presets)) return {meta:{version:"—",updated:"—"}, presets:[]};
    return obj;
  }catch(e){
    console.warn("bh-presets-official-json parse error", e);
    return {meta:{version:"—",updated:"—"}, presets:[]};
  }
}

function loadLocalBhPresets(){
  try{
    const raw = localStorage.getItem(BH_PRESETS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch(e){
    console.warn(e);
    return [];
  }
}

function saveLocalBhPresets(arr){
  localStorage.setItem(BH_PRESETS_KEY, JSON.stringify(arr || []));
}

function stableStringify(obj){
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k)+':'+stableStringify(obj[k])).join(',') + '}';
}

function modelSignature(settings){
  // Minimal signature for mismatch warnings (not security).
  const pick = {
    formula_profile: settings.formula_profile || 'cbt_v1',
    mitigation_model: settings.mitigation_model || null,
    mitigation_k: settings.mitigation_k || null,
    crit_cap: settings.crit_cap || null,
    crit_order: settings.crit_order || 'afterDef',
    pierce_mode: settings.pierce_mode || 'multiplicative',
    element_stage: settings.element_stage || 'late',
    hidden_global_multiplier: settings.hidden_global_multiplier ?? 1,
    hidden_defense_coefficient: settings.hidden_defense_coefficient ?? 1,
  };
  const s = stableStringify(pick);
  // cheap hash
  let h = 2166136261;
  for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return "m_" + (h>>>0).toString(16);
}

function getBhCurrentModelSig(){
  return modelSignature(state.settings || {});
}

function ensureBhPresetId(p){
  if (!p.id) p.id = uid('bh');
  return p;
}

function renderPresetCard(p, kind){
  const isOfficial = kind === 'official';
  const curSig = getBhCurrentModelSig();
  const sig = p.model_sig || '';
  const mismatch = (sig && sig !== curSig);
  const role = p.role || '—';
  const ctx = p.context || '—';
  const author = p.author || '—';
  const status = isOfficial ? 'OFFICIAL' : (p.status || 'LOCAL');

  const pills = [
    `<span class="pill">${escapeHtml(role)}</span>`,
    `<span class="pill">${escapeHtml(ctx)}</span>`,
    `<span class="pill ${isOfficial? 'good':''}">${escapeHtml(status)}</span>`,
    mismatch ? `<span class="pill warn">Modèle différent</span>` : `<span class="pill good">Modèle OK</span>`,
  ].join('');

  const actions = isOfficial
    ? `
      <button class="btn" data-bh="copy" data-id="${escapeHtml(p.id)}">Copier en local</button>
      <button class="btn" data-bh="link" data-id="${escapeHtml(p.id)}">Lien</button>
      <button class="btn primary" data-bh="apply" data-id="${escapeHtml(p.id)}">Appliquer</button>
    `
    : `
      <button class="btn" data-bh="edit" data-id="${escapeHtml(p.id)}">Éditer</button>
      <button class="btn" data-bh="export" data-id="${escapeHtml(p.id)}">Exporter</button>
      <button class="btn" data-bh="link" data-id="${escapeHtml(p.id)}">Lien</button>
      <button class="btn" data-bh="delete" data-id="${escapeHtml(p.id)}">Supprimer</button>
      <button class="btn primary" data-bh="apply" data-id="${escapeHtml(p.id)}">Appliquer</button>
    `;

  return `
    <div class="preset-card" data-kind="${kind}" data-id="${escapeHtml(p.id)}">
      <div class="preset-head">
        <div>
          <div class="preset-title">${escapeHtml(p.name || 'Preset')}</div>
          <div class="hint tiny">par ${escapeHtml(author)} · <span class="mono">${escapeHtml(sig || '—')}</span></div>
        </div>
        <div class="preset-meta">${pills}</div>
        <div class="preset-actions">${actions}</div>
      </div>
      ${p.notes ? `<div class="preset-notes">${escapeHtml(p.notes)}</div>` : ''}
    </div>
  `;
}

function getBhOfficialList(){
  const pack = readEmbeddedOfficialPresets();
  $("#bhOfficialSource") && ($("#bhOfficialSource").textContent = `${pack.meta?.version || 'repo'}`);
  return pack.presets || [];
}

function getBhLocalList(){
  return loadLocalBhPresets();
}

function filterPresets(list, q, role){
  const qq = (q || '').trim().toLowerCase();
  return list.filter(p => {
    if (role && (p.role||'') !== role) return false;
    if (!qq) return true;
    const hay = `${p.name||''} ${p.role||''} ${p.context||''} ${p.author||''}`.toLowerCase();
    return hay.includes(qq);
  });
}

function refreshBraveHeartsUI(){
  // Tabs
  const isLocal = $("#bhTabLocal")?.classList.contains('active');
  $("#bhOfficial").style.display = isLocal ? 'none' : 'block';
  $("#bhLocal").style.display = isLocal ? 'block' : 'none';

  // Official
  const offQ = $("#bhOfficialSearch")?.value || '';
  const offRole = $("#bhOfficialFilter")?.value || '';
  const official = filterPresets(getBhOfficialList(), offQ, offRole);
  $("#bhOfficialList").innerHTML = official.length
    ? official.map(p => renderPresetCard(p,'official')).join('')
    : `<div class="hint">Aucun preset officiel.</div>`;

  // Local
  const locQ = $("#bhLocalSearch")?.value || '';
  const locals = filterPresets(getBhLocalList(), locQ, '');
  $("#bhLocalList").innerHTML = locals.length
    ? locals.map(p => renderPresetCard(p,'local')).join('')
    : `<div class="hint">Aucun preset local. Clique sur “Créer”.</div>`;
}

function bhWarnIfModelMismatch(preset, onContinue){
  const sig = preset.model_sig || '';
  const cur = getBhCurrentModelSig();
  if (!sig || sig === cur){
    onContinue();
    return;
  }
  openModal(
    "Modèle différent",
    `<div class="hint">Ce preset a été créé avec le modèle <span class="mono">${escapeHtml(sig)}</span> mais ton modèle actif est <span class="mono">${escapeHtml(cur)}</span>. Les résultats peuvent changer.</div>`,
    [
      {label:"Annuler", variant:""},
      {label:"Appliquer quand même", variant:"primary", onClick: onContinue}
    ]
  );
}

function bhApplyPreset(preset){
  const payload = preset.payload || {};
  // Resolve build
  let buildId = payload.buildId || null;
  let rotId = payload.rotationId || null;
  let scId = payload.scenarioId || null;

  // Allow embedded objects (optional)
  if (!buildId && payload.build){
    const b = deepCopy(payload.build);
    b.id = uid('b');
    state.builds.push(b);
    buildId = b.id;
  }
  if (!rotId && payload.rotation){
    const r = deepCopy(payload.rotation);
    r.id = uid('r');
    state.rotations.push(r);
    rotId = r.id;
  }
  if (!scId && payload.scenario){
    const s = deepCopy(payload.scenario);
    s.id = uid('s');
    state.scenarios.push(s);
    scId = s.id;
  }

  // Select
  if (buildId) selectedBuildId = buildId;
  if (rotId) selectedRotId = rotId;
  if (scId) selectedScId = scId;

  saveState();
  refreshAll();
  if (buildId) loadBuildToForm(findById(state.builds, buildId));
  if (rotId) loadRotToForm(findById(state.rotations, rotId));
  if (scId) loadScToForm(findById(state.scenarios, scId));
  setView('simulate');
}

function bhCopyOfficialToLocal(preset){
  const locals = getBhLocalList();
  const copy = deepCopy(preset);
  copy.status = 'LOCAL';
  copy.id = uid('bh');
  // If model_sig is empty, bind it now to current model for clearer warnings
  if (!copy.model_sig) copy.model_sig = getBhCurrentModelSig();
  locals.unshift(copy);
  saveLocalBhPresets(locals);
  refreshBraveHeartsUI();
}

function bhExportPreset(preset){
  const blob = new Blob([JSON.stringify(preset, null, 2)], {type:'application/json'});
  downloadBlob(blob, `preset_${(preset.name||'bravehearts').replace(/\W+/g,'_')}.json`);
}

function bhCreateOrEditPreset(existing=null){
  const curSig = getBhCurrentModelSig();
  const builds = state.builds || [];
  const rots = state.rotations || [];
  const scs = state.scenarios || [];

  const p = existing ? deepCopy(existing) : {
    id: uid('bh'),
    name: '',
    role: 'DPS',
    context: 'Boss',
    author: '',
    status: 'LOCAL',
    notes: '',
    model_sig: curSig,
    payload: {buildId: builds[0]?.id||null, rotationId: rots[0]?.id||null, scenarioId: scs[0]?.id||null}
  };

  const buildOptions = builds.map(b => `<option value="${escapeHtml(b.id)}" ${b.id===p.payload.buildId?'selected':''}>${escapeHtml(b.name||b.id)}</option>`).join('');
  const rotOptions = [`<option value="">(aucune)</option>`].concat(rots.map(r => `<option value="${escapeHtml(r.id)}" ${r.id===p.payload.rotationId?'selected':''}>${escapeHtml(r.name||r.id)}</option>`)).join('');
  const scOptions = [`<option value="">(aucun)</option>`].concat(scs.map(s => `<option value="${escapeHtml(s.id)}" ${s.id===p.payload.scenarioId?'selected':''}>${escapeHtml(s.name||s.id)}</option>`)).join('');

  openModal(
    existing ? 'Éditer preset' : 'Créer un preset',
    `
      <div class="grid2">
        <div>
          <label class="lbl">Nom</label>
          <input id="bhName" class="input" value="${escapeHtml(p.name)}" placeholder="Ex: DPS Boss — Hawk" />
        </div>
        <div>
          <label class="lbl">Auteur</label>
          <input id="bhAuthor" class="input" value="${escapeHtml(p.author)}" placeholder="Pseudo" />
        </div>
        <div>
          <label class="lbl">Rôle</label>
          <select id="bhRole" class="input">
            <option ${p.role==='DPS'?'selected':''}>DPS</option>
            <option ${p.role==='Support'?'selected':''}>Support</option>
            <option ${p.role==='Tank'?'selected':''}>Tank</option>
          </select>
        </div>
        <div>
          <label class="lbl">Contexte</label>
          <input id="bhContext" class="input" value="${escapeHtml(p.context)}" placeholder="Boss / Farm / PvP…" />
        </div>
        <div>
          <label class="lbl">Build</label>
          <select id="bhBuild" class="input">${buildOptions || '<option value="">(crée un build d\'abord)</option>'}</select>
        </div>
        <div>
          <label class="lbl">Rotation</label>
          <select id="bhRot" class="input">${rotOptions}</select>
        </div>
        <div>
          <label class="lbl">Scénario</label>
          <select id="bhSc" class="input">${scOptions}</select>
        </div>
        <div>
          <label class="lbl">Modèle</label>
          <div class="hint"><span class="mono">${escapeHtml(p.model_sig || curSig)}</span></div>
        </div>
      </div>
      <label class="lbl" style="margin-top:10px">Notes</label>
      <textarea id="bhNotes" class="input" rows="4" placeholder="Conseils, conditions, remarques…">${escapeHtml(p.notes||'')}</textarea>
    `,
    [
      {label:'Annuler', variant:''},
      {label:'Enregistrer', variant:'primary', onClick: () => {
        const locals = getBhLocalList();
        p.name = $("#bhName").value.trim() || 'Preset';
        p.author = $("#bhAuthor").value.trim() || '—';
        p.role = $("#bhRole").value;
        p.context = $("#bhContext").value.trim() || '—';
        p.notes = $("#bhNotes").value.trim();
        p.model_sig = curSig; // bind to current model (choice B)
        p.payload = {
          buildId: $("#bhBuild").value || null,
          rotationId: $("#bhRot").value || null,
          scenarioId: $("#bhSc").value || null,
        };
        // Upsert
        const idx = locals.findIndex(x => x.id === p.id);
        if (idx >= 0) locals[idx] = p; else locals.unshift(p);
        saveLocalBhPresets(locals);
        refreshBraveHeartsUI();
      }}
    ]
  );
}

function bhImportPresets(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const txt = await file.text();
    let obj;
    try{ obj = JSON.parse(txt); }catch(e){ alert('JSON invalide'); return; }
    const locals = getBhLocalList();
    const curSig = getBhCurrentModelSig();
    if (Array.isArray(obj)){
      for (const p of obj){
        if (!p || typeof p !== 'object') continue;
        ensureBhPresetId(p);
        p.status = 'LOCAL';
        if (!p.model_sig) p.model_sig = curSig;
        locals.unshift(p);
      }
    } else {
      ensureBhPresetId(obj);
      obj.status = 'LOCAL';
      if (!obj.model_sig) obj.model_sig = curSig;
      locals.unshift(obj);
    }
    saveLocalBhPresets(locals);
    refreshBraveHeartsUI();
  };
  input.click();
}


function bhGenerateOfficialPack(){
  const locals = getBhLocalList().map(p => {
    const q = deepCopy(p);
    // Remove local-only fields if any
    q.status = "OFFICIAL_CANDIDATE";
    return q;
  });
  const pack = {
    meta: {
      version: "repo",
      updated: new Date().toISOString().slice(0,10),
      note: "Generated from local presets (paste into index.html: bh-presets-official-json)"
    },
    presets: locals
  };
  const txt = JSON.stringify(pack, null, 2);
  openModal("Pack officiel (copier/coller)", `
    <div class="hint">Colle ce JSON dans <b>index.html</b>, bloc <span class="mono">bh-presets-official-json</span>, puis push sur GitHub.</div>
    <textarea id="bhOfficialPackTxt" style="width:100%; min-height:320px">${escapeHtml(txt)}</textarea>
    <div class="row" style="margin-top:10px">
      <button class="btn primary" id="bhOfficialPackCopy">Copier</button>
      <button class="btn ghost" id="bhOfficialPackDownload">Télécharger</button>
    </div>
  `, [{label:"Fermer", kind:"ghost", onClick: closeModal}]);
  setTimeout(() => {
    $("#bhOfficialPackCopy")?.addEventListener("click", () => {
      navigator.clipboard?.writeText(txt);
    });
    $("#bhOfficialPackDownload")?.addEventListener("click", () => {
      downloadJson('bravehearts_presets_official.json', pack);
    });
  }, 0);
}

function bhExportAllLocal(){
  const arr = getBhLocalList();
  const blob = new Blob([JSON.stringify(arr, null, 2)], {type:'application/json'});
  downloadBlob(blob, 'bravehearts_presets_local.json');
}

function bindBraveHearts(){
  // Tabs
  $("#bhTabOfficial")?.addEventListener('click', () => {
    $("#bhTabOfficial").classList.add('active');
    $("#bhTabLocal").classList.remove('active');
    refreshBraveHeartsUI();
  });
  $("#bhTabLocal")?.addEventListener('click', () => {
    $("#bhTabLocal").classList.add('active');
    $("#bhTabOfficial").classList.remove('active');
    refreshBraveHeartsUI();
  });

  // Search / filter
  $("#bhOfficialSearch")?.addEventListener('input', refreshBraveHeartsUI);
  $("#bhOfficialFilter")?.addEventListener('change', refreshBraveHeartsUI);
  $("#bhLocalSearch")?.addEventListener('input', refreshBraveHeartsUI);

  // Buttons
  $("#bhCreate")?.addEventListener('click', () => bhCreateOrEditPreset(null));
  $("#bhImport")?.addEventListener('click', bhImportPresets);
  $("#bhExportAll")?.addEventListener('click', bhExportAllLocal);
  $("#bhExportOfficialPack")?.addEventListener('click', bhGenerateOfficialPack);

  // Delegated actions
  $("#view-bravehearts")?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bh]');
    if (!btn) return;
    const act = btn.dataset.bh;
    const id = btn.dataset.id;
    const card = btn.closest('.preset-card');
    const kind = card?.dataset.kind;
    const list = (kind === 'official') ? getBhOfficialList() : getBhLocalList();
    const p = list.find(x => x.id === id);
    if (!p) return;

    if (act === 'apply'){
      bhWarnIfModelMismatch(p, () => bhApplyPreset(p));
      return;
    }
    if (act === 'copy'){
      bhCopyOfficialToLocal(p);
      return;
    }
    if (act === 'export'){
      bhExportPreset(p);
      return;
    }
    if (act === 'link'){
      openShareModal(buildSharePayloadFromPreset(p));
      return;
    }
    if (act === 'delete'){
      openModal('Supprimer', `<div class="hint">Supprimer “${escapeHtml(p.name)}” ?</div>`, [
        {label:'Annuler', variant:''},
        {label:'Supprimer', variant:'primary', onClick: () => {
          const locals = getBhLocalList().filter(x => x.id !== p.id);
          saveLocalBhPresets(locals);
          refreshBraveHeartsUI();
        }}
      ]);
      return;
    }
    if (act === 'edit'){
      bhCreateOrEditPreset(p);
      return;
    }
  });
}



// ---------- Header / status ----------
function refreshHeader(){
  $("#uiVersion").textContent = state.meta?.version || "—";
  const db = getActiveDb();
  const dbWhen = (LIVE_DB_META && (LIVE_DB_META.generated_at || LIVE_DB_META.updated)) || (db && db.updated) || state.meta?.updated || '—';
  const dbCounts = `${db.characters?.length||0}p/${db.weapons?.length||0}a`;
  $("#uiData").textContent = `${getActiveDbLabel()} · ${dbWhen} · ${dbCounts}`;
  const unknownCount = (state.limits?.unknown || []).length;
  $("#uiLimitBadge").textContent = unknownCount ? `Modèle ajustable · ${unknownCount} points inconnus` : "Modèle";
  $("#uiBadge").textContent = location.protocol === "file:" ? "OFFLINE" : "ONLINE";
}

function refreshAll(){
  ensureIds();
  refreshHeader();
  refreshBuildsUI();
  refreshRotationsUI();
  refreshScenariosUI();
  refreshSettingsUI();
  refreshDbUI();
  refreshAllSelectors();

  if (!selectedBuildId) selectedBuildId = state.builds[0]?.id || null;
  if (!selectedRotId) selectedRotId = state.rotations[0]?.id || null;
  if (!selectedScId) selectedScId = state.scenarios[0]?.id || null;

  if (selectedBuildId) loadBuildToForm(findById(state.builds, selectedBuildId));
  if (selectedRotId) loadRotToForm(findById(state.rotations, selectedRotId));
  if (selectedScId) loadScToForm(findById(state.scenarios, selectedScId));
}

// ---------- init ----------
function init(){
  ensureIds();
  bindNav();
  bindUiMode();
  bindMode();
  bindTooltips();
  bindModal();
  bindTopButtons();
  bindShare();
  bindExportImport();
  bindQuickstart();
  bindWizard();
  bindDb();
  bindBuilds();
  bindRotations();
  bindScenarios();
  bindSim();
  bindCompare();
  bindWeights();
  bindScaling();
  bindSandbox();
  bindBossScaling();
  bindCalibration();
  bindCalibrationLab();
  bindBraveHearts();
  bindMeta();
  bindSettings();

  refreshAll();
  setMode(state.settings.mode || "simple");

  // Import share link if present (hash: #share=...)
  try{ maybePromptShareImport(); }catch(e){ console.warn(e); }
}
init();


// ---- V9 hooks (for extensions) ----
try{
  window.BH = window.BH || {};
  window.BH.setView = setView;
  window.BH.refreshAll = refreshAll;
  window.BH.saveState = saveState;
  window.BH.loadState = loadState;
} catch(e){ console.warn(e); }



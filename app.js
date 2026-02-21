// 7DS: Origin — Theorycraft (Guidé v3)
// Offline-first: compatible file:// (no fetch required for defaults).
// Données: localStorage + Import/Export (Discord-friendly).

const STORAGE_KEY = "7ds_origin_theorycraft_guided_v3";

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
  if (view === "database") refreshDbUI();
  if (view === "calibrate") refreshCalSelectors();
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
  $("#statAtk").value = s.atk ?? 0;
  $("#statDef").value = s.def ?? 0;
  $("#statCrit").value = s.crit_rate_pct ?? 0;
  $("#statCritDmg").value = s.crit_dmg_pct ?? 0;
  $("#statDmgBonus").value = s.dmg_bonus_pct ?? 0;
  $("#statDefPen").value = s.def_pen_pct ?? 0;
  $("#statDmgTaken").value = s.dmg_taken_pct ?? 0;
  $("#statElement").value = s.element ?? "neutral";
}

function readBuildForm(){
  return {
    name: ($("#buildName").value || "").trim(),
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

function bindBuilds(){
  $("#btnNewBuild")?.addEventListener("click", () => {
    selectedBuildId = null;
    $("#buildName").value = "";
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
      // keep source if already set
      b.source = b.source || {character_id:null, weapon_id:null};
      $("#buildMsg").textContent = "Build modifié.";
    }else{
      const b = {id: uid("b"), name: data.name, stats: data.stats, source:{character_id:null, weapon_id:null}};
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
  const body = `
    <div class="form">
      <label>Label <input id="eaLabel" value="${escapeHtml(a.label || "")}"/></label>
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
      saveRotDraft(rot);
      closeModal();
    }},
  ]);
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

    if (selectedRotId){
      const r = currentRot();
      if (!r){ $("#rotMsg").textContent = "Rotation introuvable."; return; }
      r.name = name;
      r.type = type;
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
function refreshCalSelectors(){
  fillSelect($("#calBuild"), state.builds, b => b.name);
  fillSelect($("#calSc"), state.scenarios, s => s.name);
}
function refreshAllSelectors(){
  refreshSimSelectors();
  refreshCompareSelectors();
  refreshWeightsSelectors();
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

function baseHitDamage(build, enemy, settings, overrideK=null){
  const atk = build.stats.atk || 0;
  const bonus = pctToMul(build.stats.dmg_bonus_pct || 0);
  const taken = pctToMul(build.stats.dmg_taken_pct || 0);
  const enemyRed = 1 - ((enemy.dmg_reduction_pct || 0)/100);
  const mit = mitigationFactor(enemy.def || 0, build, settings, overrideK);
  return atk * bonus * taken * enemyRed * mit;
}

function expectedCritMultiplier(build, settings){
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
  const base = baseHitDamage(build, enemy, settings);
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

    const hits = Math.max(1, Math.round(a.hits || 1));
    const mult = a.mult || 0;

    let burstMul = 1;
    if (a.burstEligible && isBurstActiveAt(tNow, rot, settings)){
      burstMul *= burstBonusMul * burstRes;
    }

    if (mode === "expected"){
      const critMul = expectedCritMultiplier(build, settings);
      const dealt = base * mult * hits * burstMul * critMul;
      dmg += dealt;
      addTrace(`${tNow.toFixed(1)}s: ${key} dealt=${Math.round(dealt)}`);
    } else {
      const cr = clamp(build.stats.crit_rate_pct || 0, 0, settings.crit_cap)/100;
      const cd = (build.stats.crit_dmg_pct || 0)/100;
      let dealt = 0;
      for (let i=0;i<hits;i++){
        const isCrit = rng() < cr;
        dealt += base * mult * burstMul * (isCrit ? (1+cd) : 1);
      }
      dmg += dealt;
      addTrace(`${tNow.toFixed(1)}s: ${key} dealt=${Math.round(dealt)}`);
    }

    if (kind === "skill"){
      orbs = Math.min(7, orbs + (settings.orb_gain_per_skill || 0));
    }
    if (kind === "ultimate"){
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
      const seed = (Math.floor(rngBase()*1e9) ^ (i*2654435761)) >>> 0;
      const rng = makeRng(seed);
      const out = simulateOnce(build, rot, scen, duration, settings, "mc", rng);
      dpsSamples.push(out.dps);
      if (i===0) trace = out.trace;
    }
  }

  const sorted = [...dpsSamples].sort((a,b)=>a-b);
  const mean = sorted.reduce((a,b)=>a+b,0) / sorted.length;
  const p10 = quantile(sorted, 0.10);
  const p50 = quantile(sorted, 0.50);
  const p90 = quantile(sorted, 0.90);

  return { mean, p10, p50, p90, samples: dpsSamples, trace };
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
  return `
    <div class="row" style="justify-content:space-between">
      ${stability}
      <span class="pill">DPS moyen: <b>${fmt(res.mean)}</b></span>
    </div>
    <hr style="border:none;border-top:1px solid var(--border); margin:12px 0;">
    <div class="grid3">
      <div class="pill">P10: <b>${fmt(res.p10)}</b></div>
      <div class="pill">P50: <b>${fmt(res.p50)}</b></div>
      <div class="pill">P90: <b>${fmt(res.p90)}</b></div>
    </div>
    ${hist}
    <div class="hint">Astuce : pour comparer A vs B, garde le même scénario + rotation + durée.</div>
  `;
}

// ---------- Simulate UI ----------
let lastTrace = null;
function runSim(){
  const build = findById(state.builds, $("#simBuild").value);
  const rot = findById(state.rotations, $("#simRot").value);
  const scen = findById(state.scenarios, $("#simSc").value);
  const duration = Math.max(1, toNum($("#simDur").value, 30));
  const iters = Math.max(1, Math.round(toNum($("#simIters").value, 2000)));
  const mode = $("#simMode").value;

  if (!build || !rot || !scen){
    $("#simMsg").textContent = "Sélectionne un build, une rotation et un scénario.";
    return;
  }
  $("#simMsg").textContent = "Simulation...";
  const res = runSimulation(build, rot, scen, duration, iters, mode);
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
  const a = findById(state.builds, $("#cmpA").value);
  const b = findById(state.builds, $("#cmpB").value);
  const rot = findById(state.rotations, $("#cmpRot").value);
  const scen = findById(state.scenarios, $("#cmpSc").value);
  const duration = Math.max(1, toNum($("#cmpDur").value, 30));
  const iters = Math.max(1, Math.round(toNum($("#cmpIters").value, 4000)));
  const mode = $("#cmpMode").value;

  if (!a || !b || !rot || !scen){
    $("#cmpMsg").textContent = "Choisis A, B, rotation, scénario.";
    return;
  }
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
  const build = findById(state.builds, $("#wBuild").value);
  const rot = findById(state.rotations, $("#wRot").value);
  const scen = findById(state.scenarios, $("#wSc").value);
  const duration = Math.max(1, toNum($("#wDur").value, 30));
  const mode = $("#wMode").value;
  const stepPct = Math.max(0.1, toNum($("#wStep").value, 1));

  if (!build || !rot || !scen){
    $("#wMsg").textContent = "Choisis build, rotation, scénario.";
    return;
  }
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

// ---------- Calibration ----------
function predictSingleHitDamage(build, scen, mult, hits, burstOn, overrideK){
  const enemy = scen.enemy || {};
  const base = baseHitDamage(build, enemy, state.settings, overrideK);
  const critMul = expectedCritMultiplier(build, state.settings);

  let burstMul = 1;
  if (burstOn){
    const burstBonusMul = 1 + (state.settings.burst_bonus_pct || 0)/100;
    const burstRes = 1 - (enemy.burst_resist || 0);
    burstMul = burstBonusMul * burstRes;
  }
  return base * mult * hits * burstMul * critMul;
}

function runCalibrate(){
  const build = findById(state.builds, $("#calBuild").value);
  const scen = findById(state.scenarios, $("#calSc").value);
  const mult = toNum($("#calMult").value, 2.2);
  const hits = Math.max(1, Math.round(toNum($("#calHits").value, 1)));
  const obs = toNum($("#calObserved").value, NaN);
  const burstSel = $("#calBurst").value;

  if (!build || !scen){ $("#calMsg").textContent = "Choisis un build et un scénario."; return; }
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
    const pred = predictSingleHitDamage(build, scen, mult, hits, burstOn, K);
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
      const pred = predictSingleHitDamage(build, scen, mult, hits, burstOn, K);
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
  bindMode();
  bindTooltips();
  bindModal();
  bindTopButtons();
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
  bindCalibration();
  bindSettings();

  refreshAll();
  setMode(state.settings.mode || "simple");
}
init();

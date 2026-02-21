/* V9.1 enhancements (GitHub Pages friendly)
   - Branding loader (banner + stickers) with local overrides
   - Sidebar drawer for small screens
   - Guild access (UX gating, not security)
   - Landing helpers (mirrors status in home)
*/
(function(){
  const BRANDING_URL = "data/branding.json";
  const LS_GUILD = "bh_guild_access_v1";
  const LS_BRAND = "bh_branding_override_v1";

  const $ = (sel, root=document) => root.querySelector(sel);

  function safeJsonParse(s){ try{ return JSON.parse(s); }catch(e){ return null; } }

  function readBrandOverride(){
    const raw = localStorage.getItem(LS_BRAND);
    const obj = safeJsonParse(raw);
    return obj && typeof obj === 'object' ? obj : null;
  }

  function writeBrandOverride(obj){
    localStorage.setItem(LS_BRAND, JSON.stringify(obj || {}));
  }

  function clearBrandOverride(){
    localStorage.removeItem(LS_BRAND);
  }

  function deepMerge(base, extra){
    if(!extra || typeof extra !== 'object') return base;
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for(const k of Object.keys(extra)){
      const bv = base ? base[k] : undefined;
      const ev = extra[k];
      if(ev && typeof ev === 'object' && !Array.isArray(ev)) out[k] = deepMerge(bv || {}, ev);
      else out[k] = ev;
    }
    return out;
  }

  async function loadBranding(){
    // fetch may fail under file:// ; fall back to embedded defaults
    const fallback = {
      banner:{enabled:true,url:"assets/bravehearts_banner.png",alt:"Brave Hearts"},
      stickers:{enabled:true,items:[]},
      guild:{code:"BRAVEHEARTS",expiryDays:7}
    };

    let branding = fallback;
    try{
      const res = await fetch(BRANDING_URL, {cache:"no-store"});
      if(res.ok){
        const j = await res.json();
        branding = deepMerge(fallback, j);
      }
    }catch(e){ /* ignore */ }

    const ov = readBrandOverride();
    if(ov) branding = deepMerge(branding, ov);

    return branding;
  }

  function applyBranding(branding){
    // Clean dark background (reduce gradients)
    document.body.classList.add("theme-option-b");

    // Banner
    const banner = $(".banner");
    if(banner){
      const on = !!branding?.banner?.enabled;
      banner.closest(".hero")?.classList.toggle("bannerOff", !on);
      if(on && branding.banner.url) banner.src = branding.banner.url;
      if(branding.banner.alt) banner.alt = branding.banner.alt;
    }

    // Stickers
    const layer = $("#stickerLayer");
    if(layer){
      layer.innerHTML = "";
      const enabled = !!branding?.stickers?.enabled;
      if(enabled){
        const items = Array.isArray(branding?.stickers?.items) ? branding.stickers.items : [];
        items.forEach((it) => {
          const img = document.createElement("img");
          img.src = it.url || "";
          img.alt = it.alt || "";
          img.className = it.className || "sticker";
          if(typeof it.opacity === "number") img.style.opacity = String(it.opacity);
          layer.appendChild(img);
        });
      }
    }

    // Mirror status to landing, if present
    const hv = $("#homeVersion");
    const hd = $("#homeData");
    const hm = $("#homeMode");
    if(hv) hv.textContent = $("#uiVersion")?.textContent || "—";
    if(hd) hd.textContent = $("#uiData")?.textContent || "—";
    if(hm) hm.textContent = $("#uiMode")?.textContent || "—";
  }

  function initSidebarDrawer(){
    const sidebar = $("#sidebar");
    const overlay = $("#sidebarOverlay");
    const btnMenu = $("#btnMenu");
    if(!sidebar || !overlay || !btnMenu) return;

    function open(){
      document.body.classList.add("sidebarOpen");
      overlay.hidden = false;
    }
    function close(){
      document.body.classList.remove("sidebarOpen");
      overlay.hidden = true;
    }

    btnMenu.addEventListener("click", () => {
      if(document.body.classList.contains("sidebarOpen")) close();
      else open();
    });
    overlay.addEventListener("click", close);

    // Close drawer after navigating (small screens)
    document.addEventListener("click", (e) => {
      const t = e.target;
      if(!(t instanceof Element)) return;
      if(t.classList.contains("nav-item")) close();
    });
  }

  function getGuildAccess(){
    const raw = localStorage.getItem(LS_GUILD);
    const obj = safeJsonParse(raw);
    if(!obj || !obj.exp) return {ok:false};
    if(Date.now() > obj.exp){
      localStorage.removeItem(LS_GUILD);
      return {ok:false};
    }
    return {ok:true, exp:obj.exp};
  }

  function setGuildAccess(days){
    const exp = Date.now() + (days*24*60*60*1000);
    localStorage.setItem(LS_GUILD, JSON.stringify({exp}));
    return exp;
  }

  function clearGuildAccess(){
    localStorage.removeItem(LS_GUILD);
  }

  function refreshGuildUI(branding){
    const status = $("#guildStatus");
    const access = getGuildAccess();
    if(status){
      status.textContent = access.ok
        ? ("Mode guilde actif — expire le " + new Date(access.exp).toLocaleString("fr-FR"))
        : "Mode guilde inactif";
    }
    document.body.classList.toggle("guildMode", access.ok);

    // Optional: show small badge in topbar
    const badge = $("#uiBadge");
    if(badge){
      badge.textContent = access.ok ? "GUILD" : badge.textContent;
      badge.classList.toggle("guild", access.ok);
    }

    // Wire buttons
    const enter = $("#btnGuildEnter");
    const logout = $("#btnGuildLogout");
    const pass = $("#guildPass");

    if(enter && pass){
      enter.onclick = () => {
        const code = (pass.value || "").trim();
        const expected = (branding?.guild?.code || "BRAVEHEARTS").trim();
        if(!code){
          if(status) status.textContent = "Entrez un code.";
          return;
        }
        if(code.toUpperCase() !== expected.toUpperCase()){
          if(status) status.textContent = "Code invalide.";
          return;
        }
        const exp = setGuildAccess(Number(branding?.guild?.expiryDays || 7));
        if(status) status.textContent = "OK — expire le " + new Date(exp).toLocaleString("fr-FR");
        pass.value = "";
        try{ window.BH?.refreshAll?.(); }catch(e){}
      };
    }

    if(logout){
      logout.onclick = () => {
        clearGuildAccess();
        refreshGuildUI(branding);
        try{ window.BH?.refreshAll?.(); }catch(e){}
      };
    }
  }

  function renderStickerList(branding){
    const out = $("#brandStickerList");
    if(!out) return;
    const items = Array.isArray(branding?.stickers?.items) ? branding.stickers.items : [];
    if(!items.length){
      out.innerHTML = "<span class=\"muted\">Aucun sticker</span>";
      return;
    }
    out.innerHTML = items.map((it, idx) => {
      const url = (it.url || "").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      return `<div class="tiny">${idx+1}. <code>${url}</code></div>`;
    }).join("");
  }

  function initBrandingPanel(branding, onApply){
    const hasPanel = $("#btnBrandSave") && $("#brandBannerEnabled");
    if(!hasPanel) return;

    const elBannerEnabled = $("#brandBannerEnabled");
    const elBannerUrl = $("#brandBannerUrl");
    const elStickersEnabled = $("#brandStickersEnabled");
    const elStickerAddUrl = $("#brandStickerAddUrl");
    const elGuildCode = $("#brandGuildCode");
    const elGuildExpiry = $("#brandGuildExpiry");
    const msg = $("#brandMsg");

    // populate
    elBannerEnabled.value = branding?.banner?.enabled ? "on" : "off";
    elBannerUrl.value = branding?.banner?.url || "";
    elStickersEnabled.value = branding?.stickers?.enabled ? "on" : "off";
    elGuildCode.value = branding?.guild?.code || "BRAVEHEARTS";
    elGuildExpiry.value = String(branding?.guild?.expiryDays || 7);

    renderStickerList(branding);

    $("#btnBrandAddSticker")?.addEventListener("click", () => {
      const url = (elStickerAddUrl.value || "").trim();
      if(!url){
        if(msg) msg.textContent = "Entrez une URL.";
        return;
      }
      branding.stickers = branding.stickers || {enabled:true,items:[]};
      branding.stickers.items = Array.isArray(branding.stickers.items) ? branding.stickers.items : [];
      branding.stickers.items.push({url, opacity:0.18, className:"sticker"});
      elStickerAddUrl.value = "";
      renderStickerList(branding);
      if(msg) msg.textContent = "Sticker ajouté (local).";
    });

    $("#btnBrandClearStickers")?.addEventListener("click", () => {
      if(branding.stickers) branding.stickers.items = [];
      renderStickerList(branding);
      if(msg) msg.textContent = "Stickers vidés (local).";
    });

    $("#btnBrandSave")?.addEventListener("click", () => {
      const override = {
        banner:{
          enabled: elBannerEnabled.value === "on",
          url: (elBannerUrl.value || "").trim() || "assets/bravehearts_banner.png"
        },
        stickers:{
          enabled: elStickersEnabled.value === "on",
          items: Array.isArray(branding?.stickers?.items) ? branding.stickers.items : []
        },
        guild:{
          code: (elGuildCode.value || "BRAVEHEARTS").trim() || "BRAVEHEARTS",
          expiryDays: Math.max(1, Number(elGuildExpiry.value || 7))
        }
      };
      writeBrandOverride(override);
      if(msg) msg.textContent = "Enregistré (local).";
      onApply(deepMerge(branding, override));
    });

    $("#btnBrandReset")?.addEventListener("click", () => {
      clearBrandOverride();
      if(msg) msg.textContent = "Reset local OK. Recharge la page pour revenir au branding JSON.";
    });
  }

  async function boot(){
    let branding = await loadBranding();

    const applyAll = (b) => {
      branding = b;
      applyBranding(branding);
      refreshGuildUI(branding);
    };

    applyAll(branding);
    initSidebarDrawer();
    initBrandingPanel(branding, applyAll);

    // CTA buttons routing
    document.querySelectorAll("[data-go]").forEach(btn => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-go");
        if(view && window.BH?.setView) window.BH.setView(view);
      });
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

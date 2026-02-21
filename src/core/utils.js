// Generic utilities (module)
export function uid(prefix="id"){ return prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16); }
export function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
export function pctToMul(p){ return 1 + (p/100); }
export function toNum(x, d=0){ const n = Number(x); return Number.isFinite(n) ? n : d; }
export function deepCopy(x){ return JSON.parse(JSON.stringify(x)); }
export function escapeHtml(s){ return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }

export function fmt(n){
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("fr-FR", {maximumFractionDigits: 0});
  return n.toLocaleString("fr-FR", {maximumFractionDigits: 2});
}
export function fmtPct(n){
  if (!isFinite(n)) return "—";
  return (n).toLocaleString("fr-FR", {maximumFractionDigits: 2}) + "%";
}

export function quantile(sorted, q){
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base+1] === undefined) return sorted[base];
  return sorted[base] + rest*(sorted[base+1]-sorted[base]);
}

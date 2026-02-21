// Read embedded JSON blocks from index.html (module)
export function readEmbeddedDefaults(){
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

export function readEmbeddedJson(id){
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

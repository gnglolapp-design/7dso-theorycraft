#!/usr/bin/env python3
"""
7DS: Origin — DB Updater (community / best-effort)

Primary source:
- genshin.gg/7dso (characters + weapons)

Optional secondary source (DISABLED by default):
- 7dsorigin.gg (enable with --enable-7dsorigin)
  NOTE: automated scraping may be restricted by the site's rules/ToS. Enable only if you have permission.

Outputs:
- data/db.json (normalized, modular)
- data/db_live.js (same DB embedded for the web app)
- data/db_snapshots/<timestamp>.json (snapshot history)
- data/db_diff_latest.json (diff between last two snapshots, if available)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SNAP_DIR = DATA_DIR / "db_snapshots"
DB_JSON = DATA_DIR / "db.json"
DB_LIVE_JS = DATA_DIR / "db_live.js"
DB_DIFF_JSON = DATA_DIR / "db_diff_latest.json"

GENSHIN_BASE = "https://genshin.gg"
GENSHIN_CHAR_LIST = f"{GENSHIN_BASE}/7dso/"
GENSHIN_WEAPONS_LIST = f"{GENSHIN_BASE}/7dso/weapons/"

# Optional (disabled by default)
SDSO_BASE = "https://7dsorigin.gg"

USER_AGENT = "BraveHearts-7DSO-Theorycraft/1.0 (+https://github.com/)"
TIMEOUT = 30

WEAPON_TYPES = {
    "Axe","Book","Cudgel","Gauntlets","Lance","Rapier","Shield","Staff","Wand",
    "Dual Swords","Greatsword","Longsword","Grimoire","Nunchaku",
    "Sword and Shield","Sword","Dagger","Bow"
}

SKILL_TYPE_HINTS = {
    "Normal Attack","Special Attack","Normal Skill","Tag Skill","Ultimate Move","Adventure Skill","Passive",
}

KEY_TOKENS = {"Left Click","Right Click","E","Q"}

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")

def http_get(url: str) -> str:
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
    r.raise_for_status()
    return r.text

def abs_url(url: str) -> str:
    if not url:
        return url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return GENSHIN_BASE + url
    return url

def slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s or "x"

def stable_id(kind: str, *parts: str) -> str:
    raw = "|".join([kind, *parts])
    h = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
    return f"{kind}_{h}"

def clean_lines(text: str) -> List[str]:
    out: List[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        out.append(re.sub(r"\s+", " ", line))
    return out

def extract_h2_section_lines(soup: BeautifulSoup, h2_title_prefix: str) -> List[str]:
    """
    Get lines between an H2 whose text starts with h2_title_prefix and the next H2.
    Works with genshin.gg pages that use markdown-like headings rendered to H2.
    """
    h2 = None
    for cand in soup.find_all(["h2","h3"]):
        t = cand.get_text(" ", strip=True)
        if t.startswith(h2_title_prefix):
            h2 = cand
            break
    if not h2:
        return []
    lines: List[str] = []
    for sib in h2.find_all_next():
        if sib.name in ("h2","h3") and sib is not h2:
            break
        if sib.name in ("p","li","div"):
            t = sib.get_text(" ", strip=True)
            if t:
                lines.extend(clean_lines(t))
    return lines

def find_main_image_url(soup: BeautifulSoup, name: str) -> Optional[str]:
    # Prefer image whose alt matches the character name exactly
    for img in soup.find_all("img"):
        alt = (img.get("alt") or "").strip()
        if alt and alt.lower() == name.lower():
            src = img.get("src") or ""
            return abs_url(src)
    # fallback: first image under main content
    main = soup.find("main") or soup.body
    if main:
        img = main.find("img")
        if img and img.get("src"):
            return abs_url(img.get("src"))
    return None

def parse_character_weapons_from_text(lines: List[str]) -> List[str]:
    # The first weapon icons usually appear as "ImageShield ImageBook ImageWand" in text dumps.
    # We'll just scan the first ~40 lines for weapon type tokens.
    found: List[str] = []
    for ln in lines[:60]:
        if ln in WEAPON_TYPES and ln not in found:
            found.append(ln)
    return found

def parse_costumes_from_section(lines: List[str]) -> List[Dict[str,Any]]:
    costumes: List[Dict[str,Any]] = []
    cur: Optional[Dict[str,Any]] = None
    for ln in lines:
        if ln.startswith("#### "):
            if cur:
                costumes.append(cur)
            cur = {"name": ln.replace("#### ","",1).strip(), "notes": []}
        else:
            if cur:
                # ignore generic "Image:" lines, keep text
                if ln.startswith("Image:"):
                    continue
                cur["notes"].append(ln)
    if cur:
        costumes.append(cur)
    # normalize notes
    for c in costumes:
        c["notes"] = [x for x in c["notes"] if x]
    return costumes

_ORDINAL_MAP = {
    "1st": 1, "2nd": 2, "3rd": 3,
    "4th": 4, "5th": 5, "6th": 6,
    "7th": 7, "8th": 8, "9th": 9,
    "10th": 10
}

def _parse_hit_line(line: str) -> Optional[Dict[str,Any]]:
    # Examples:
    # "1st hit: 21% of Attack"
    # "4th hit: 25% of Attack"
    m = re.match(r"^(\d+(?:st|nd|rd|th)) hit:\s*([0-9]+(?:\.[0-9]+)?)%\s+of\s+Attack", line, re.I)
    if not m:
        return None
    ord_s = m.group(1).lower()
    ord_num = _ORDINAL_MAP.get(ord_s)
    if not ord_num:
        # generic ordinal parsing
        ord_num = int(re.match(r"^(\d+)", ord_s).group(1))
    return {"hit": ord_num, "multiplier_pct": float(m.group(2)), "scaling": "ATK"}

def parse_skills_from_lines(lines: List[str]) -> List[Dict[str,Any]]:
    """
    Best-effort parser for genshin.gg skill blocks.
    Produces structured skills (name, type, key, cooldown, description, multipliers, hits).
    """
    skills: List[Dict[str,Any]] = []
    type_idx = [i for i,ln in enumerate(lines) if ln in SKILL_TYPE_HINTS]
    for idx, j in enumerate(type_idx):
        t = lines[j]
        prev_j = type_idx[idx-1] if idx > 0 else -1
        next_j = type_idx[idx+1] if idx+1 < len(type_idx) else len(lines)

        # key token (between prev and current)
        key = None
        for k in range(prev_j+1, j):
            if lines[k] in KEY_TOKENS:
                key = lines[k]

        # name: nearest previous line not a key token
        name = None
        k = j-1
        while k >= 0:
            if lines[k] in KEY_TOKENS:
                k -= 1
                continue
            if lines[k] in SKILL_TYPE_HINTS:
                break
            name = lines[k]
            break
        if not name or name in KEY_TOKENS:
            name = t  # for normal/special attacks

        # collect body
        body = lines[j+1:next_j]
        cooldown = None
        desc_lines: List[str] = []
        hits: List[Dict[str,Any]] = []
        multipliers: List[Dict[str,Any]] = []

        for ln in body:
            mcd = re.search(r"Cooldown:\s*([0-9]+(?:\.[0-9]+)?)\s*sec", ln, re.I)
            if mcd:
                cooldown = float(mcd.group(1))
                continue
            h = _parse_hit_line(ln)
            if h:
                hits.append(h)
                continue
            # generic multiplier
            mm = re.search(r"([0-9]+(?:\.[0-9]+)?)%\s+of\s+Attack", ln, re.I)
            if mm:
                multipliers.append({"value_pct": float(mm.group(1)), "scaling": "ATK", "context": ln})
            desc_lines.append(ln)

        description = " ".join(desc_lines).strip()

        skills.append({
            "name": name,
            "type": t,
            "key": key,
            "cooldown_sec": cooldown,
            "description": description,
            "hits": sorted(hits, key=lambda x: x["hit"]) if hits else [],
            "multipliers": multipliers[:50],
        })
    # De-dup skills that can appear repeated in text dumps
    uniq = []
    seen = set()
    for s in skills:
        sig = (s["name"], s["type"], s.get("key"), s.get("cooldown_sec"))
        if sig in seen:
            continue
        seen.add(sig)
        uniq.append(s)
    return uniq

def parse_potential_from_lines(lines: List[str]) -> List[Dict[str,Any]]:
    tiers: List[Dict[str,Any]] = []
    i = 0
    while i < len(lines):
        if lines[i] == "Tier" and i + 1 < len(lines):
            i += 1
            continue
        # A lot of pages show:
        # "1 Bonus" <text...>
        m = re.match(r"^(\d+)\s+Bonus$", lines[i])
        if m:
            tier = int(m.group(1))
            desc: List[str] = []
            i += 1
            while i < len(lines) and not re.match(r"^(\d+)\s+Bonus$", lines[i]):
                if lines[i] not in ("Tier","Bonus"):
                    desc.append(lines[i])
                i += 1
            tiers.append({"tier": tier, "text": " ".join(desc).strip()})
            continue
        i += 1
    return tiers

def parse_genshin_character_page(url: str) -> Tuple[Dict[str,Any], Dict[str,Any]]:
    html = http_get(url)
    soup = BeautifulSoup(html, "lxml")

    h1 = soup.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else ""
    # "Daisy Build | Seven Deadly Sins: Origin" -> "Daisy"
    name = title.split(" Build", 1)[0].strip() if " Build" in title else title.strip()
    if not name:
        # fallback: from og:title
        meta = soup.find("meta", attrs={"property":"og:title"})
        if meta and meta.get("content"):
            name = meta["content"].split(" Build",1)[0].strip()

    all_lines = clean_lines(soup.get_text("\n"))
    weapons = parse_character_weapons_from_text(all_lines)

    img_url = find_main_image_url(soup, name) or None

    # Description: best-effort: take first paragraph after H1 until 'Costumes Skills Potential'
    desc = ""
    if h1:
        # gather sibling text nodes
        parts: List[str] = []
        for sib in h1.find_all_next(["p","div"]):
            txt = sib.get_text(" ", strip=True)
            if not txt:
                continue
            if "Costumes" in txt and "Skills" in txt and "Potential" in txt:
                break
            # skip nav blocks
            if txt.strip() in ("Costumes", "Skills", "Potential"):
                continue
            # avoid footer
            if "GENSHIN.GG is not affiliated" in txt:
                break
            parts.append(txt)
            if len(parts) >= 3:
                break
        desc = " ".join(clean_lines("\n".join(parts))).strip()

    # Costumes
    costumes_lines = extract_h2_section_lines(soup, f"{name} Costumes")
    costumes = parse_costumes_from_section(costumes_lines)

    # For each weapon type, parse skills & potential
    skills_by_weapon: Dict[str,List[Dict[str,Any]]] = {}
    potentials_by_weapon: Dict[str,List[Dict[str,Any]]] = {}
    for wt in weapons:
        sk_lines = extract_h2_section_lines(soup, f"{name} {wt} Skills")
        pt_lines = extract_h2_section_lines(soup, f"{name} {wt} Potential")
        if sk_lines:
            skills_by_weapon[wt] = parse_skills_from_lines(sk_lines)
        if pt_lines:
            potentials_by_weapon[wt] = parse_potential_from_lines(pt_lines)

    # Extended record (normalized)
    char_id = stable_id("ch", name)
    charx = {
        "id": char_id,
        "name": name,
        "image_url": img_url,
        "description": desc,
        "weapon_types": weapons,
        "costumes": costumes,
        "skills_by_weapon": skills_by_weapon,
        "potential_by_weapon": potentials_by_weapon,
        "sources": {
            "genshin": {"source_url": url}
        }
    }

    # Legacy flat record for the UI + build maker
    legacy = {
        "id": char_id,
        "name": name,
        "element": None,
        "role": None,
        "icon": img_url,
        "base_stats": {"atk": 0, "crit_rate": 0, "crit_dmg": 0},
        "weapon_types": weapons,
        "source": {"source_url": url, "patch_version": None, "last_seen": utc_now_iso()},
        # quick preview for UI
        "summary": desc[:220] + ("…" if len(desc) > 220 else "")
    }
    return legacy, charx

def parse_genshin_character_list() -> List[Tuple[str,str]]:
    html = http_get(GENSHIN_CHAR_LIST)
    soup = BeautifulSoup(html, "lxml")
    # The "Characters List" page is a React app shell, but contains links in the HTML.
    # We'll collect /7dso/characters/<slug>/ anchors.
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "/7dso/characters/" in href:
            name = a.get_text(" ", strip=True)
            if not name:
                # sometimes image link; try img alt
                img = a.find("img")
                if img and img.get("alt"):
                    name = img["alt"].strip()
            url = abs_url(href)
            if url and (name or url):
                links.append((name or url.rsplit("/",2)[-2], url))
    # de-dup by url
    uniq = []
    seen = set()
    for name,url in links:
        if url in seen:
            continue
        seen.add(url)
        uniq.append((name, url))
    return uniq

def parse_genshin_weapons_list() -> Tuple[List[Dict[str,Any]], Dict[str,Any]]:
    html = http_get(GENSHIN_WEAPONS_LIST)
    soup = BeautifulSoup(html, "lxml")
    text_lines = clean_lines(soup.get_text("\n"))

    weapons_legacy: List[Dict[str,Any]] = []
    weapons_x: Dict[str,Any] = {}

    i = 0
    while i < len(text_lines) - 8:
        name = text_lines[i]
        wtype = text_lines[i+1] if (i+1) < len(text_lines) else ""
        # Heuristic: weapon entry starts when next line is a weapon type and later contains "Equipment Attack"
        if wtype in WEAPON_TYPES:
            # find the next "Equipment Attack" within the next 20 lines
            window = text_lines[i:i+30]
            try:
                ea = window.index("Equipment Attack")
            except ValueError:
                i += 1
                continue

            passive = text_lines[i+2] if (i+2) < len(text_lines) and text_lines[i+2] != "Equipment Attack" else ""
            # parse attack value: line after "Equipment Attack"
            atk_val = 0
            if (i+ea+1) < len(text_lines):
                try:
                    atk_val = int(re.sub(r"[^0-9]", "", text_lines[i+ea+1]) or "0")
                except:
                    atk_val = 0

            # parse substat name/value (usually after atk value)
            sub_name = None
            sub_value = None
            # find the first non-numeric after atk value
            j = i+ea+2
            if j < len(text_lines):
                sub_name = text_lines[j]
                if (j+1) < len(text_lines):
                    sub_value = text_lines[j+1]
            # image: best effort: find img alt == name
            img_url = None
            img = soup.find("img", attrs={"alt": name})
            if img and img.get("src"):
                img_url = abs_url(img.get("src"))

            wid = stable_id("wp", name, wtype)
            w_legacy = {
                "id": wid,
                "name": name,
                "weapon_type": wtype,
                "icon": img_url,
                "atk_bonus": atk_val,
                "substat": {"name": sub_name, "value": sub_value},
                "passive": passive,
                "source": {"source_url": GENSHIN_WEAPONS_LIST, "patch_version": None, "last_seen": utc_now_iso()},
            }
            weapons_legacy.append(w_legacy)
            weapons_x[wid] = {
                "id": wid,
                "name": name,
                "weapon_type": wtype,
                "image_url": img_url,
                "equipment_attack": atk_val,
                "substat_name": sub_name,
                "substat_value": sub_value,
                "passive_text": passive,
                "sources": {"genshin": {"source_url": GENSHIN_WEAPONS_LIST}},
            }
            # advance until after sub_value (avoid O(n^2))
            i = max(i+1, i+ea+4)
            continue
        i += 1
    return weapons_legacy, weapons_x

    
# ----------------------------
# 7dsorigin.gg import (optional)
# ----------------------------

SDSO_WEAPONS_LIST = SDSO_BASE + "/weapons"
SDSO_CHAR_LIST = SDSO_BASE + "/en/characters"

SDSO_LANG_PREFIX = "/en"

def abs_url_sdso(url: str) -> str:
    if not url:
        return url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return SDSO_BASE + url
    return url

def _sdso_norm_path(path: str) -> str:
    if not path:
        return ""
    path = path.split("?",1)[0].split("#",1)[0].rstrip("/")
    if path.startswith(SDSO_LANG_PREFIX + "/"):
        path = path[len(SDSO_LANG_PREFIX):]
    return path

def parse_sdso_list_pages(start_url: str, kind: str) -> List[str]:
    """
    Crawl a paginated list (best effort). 7dsorigin.gg uses multiple pages for weapons.
    We try ?page=N for N>=2 and stop when no new entries are found.
    """
    urls: List[str] = []
    seen: set = set()
    max_pages = 12
    for page in range(1, max_pages + 1):
        url = start_url if page == 1 else f"{start_url}?page={page}"
        try:
            html = http_get(url)
        except Exception:
            if page == 1:
                raise
            break

        before = len(seen)
        soup = BeautifulSoup(html, "lxml")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            full = abs_url_sdso(href) if href.startswith("/") or href.startswith("//") else href
            if not full.startswith(SDSO_BASE):
                continue
            p = _sdso_norm_path(urlparse(full).path)
            seg = [s for s in p.split("/") if s]
            # Accept only /{kind}/{slug}
            if len(seg) == 2 and seg[0] == kind and re.match(r"^[a-z0-9-]+$", seg[1]):
                u = SDSO_BASE + "/" + "/".join(seg)
                if u not in seen:
                    seen.add(u)
                    urls.append(u)

        # If this page didn't add anything new, stop
        if page > 1 and len(seen) == before:
            break

    return urls

def parse_sdso_char_list() -> List[str]:
    html = http_get(SDSO_CHAR_LIST)
    soup = BeautifulSoup(html, "lxml")
    urls: List[str] = []
    seen: set = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        full = abs_url_sdso(href) if href.startswith("/") or href.startswith("//") else href
        if not full.startswith(SDSO_BASE):
            continue
        p = _sdso_norm_path(urlparse(full).path)
        seg = [s for s in p.split("/") if s]
        if len(seg) == 2 and seg[0] == "characters" and re.match(r"^[a-z0-9-]+$", seg[1]):
            u = SDSO_BASE + "/" + "/".join(seg)
            if u not in seen:
                seen.add(u)
                urls.append(u)
    return urls

def _extract_section(lines: List[str], start_title: str, stop_titles: Tuple[str,...]) -> List[str]:
    out: List[str] = []
    start_i = None
    for i, ln in enumerate(lines):
        if ln.strip().lower() == start_title.lower():
            start_i = i + 1
            break
    if start_i is None:
        return out
    for j in range(start_i, len(lines)):
        if lines[j].strip().lower() in {t.lower() for t in stop_titles}:
            break
        out.append(lines[j])
    return out

def _parse_number(s: str) -> Optional[float]:
    if s is None:
        return None
    s2 = re.sub(r"[^0-9.\-]", "", str(s))
    if not s2:
        return None
    try:
        return float(s2)
    except:
        return None

def parse_sdso_weapon_page(url: str) -> Tuple[Dict[str,Any], Dict[str,Any]]:
    html = http_get(url)
    soup = BeautifulSoup(html, "lxml")
    h1 = soup.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else ""
    name = title.strip()

    lines = clean_lines(soup.get_text("\n"))

    # weapon type: first matching weapon type after title
    wtype = None
    for ln in lines:
        if ln in WEAPON_TYPES:
            wtype = ln
            break
    wtype = wtype or "Unknown"

    # main image
    img_url = None
    # try img alt match
    img = soup.find("img", attrs={"alt": re.compile(re.escape(name), re.I)}) if name else None
    if img and img.get("src"):
        img_url = abs_url_sdso(img.get("src"))
    if not img_url:
        # fallback: first image after H1
        if h1:
            for cand in h1.find_all_next("img"):
                if cand.get("src"):
                    img_url = abs_url_sdso(cand.get("src"))
                    break

    # Description section
    desc_lines = _extract_section(lines, "Description", ("Weapon Statistics","Weapon Level","Quick Information","Information","Community","Follow Us"))
    description = " ".join(desc_lines).strip()

    # Weapon statistics
    atk = None
    sub_name = None
    sub_value = None
    try:
        idx = lines.index("Weapon Statistics")
        # expected: <atk> Attack <subval> <subname>
        atk = _parse_number(lines[idx+1]) if idx+1 < len(lines) else None
        # "Attack" label at idx+2
        sub_value = _parse_number(lines[idx+3]) if idx+3 < len(lines) else None
        sub_name = lines[idx+4] if idx+4 < len(lines) else None
    except ValueError:
        pass

    # Quick info: Type, Rarity, Attack (repeated)
    rarity = None
    try:
        qi = lines.index("Quick Information")
        for k in range(qi, min(qi+30, len(lines))):
            if lines[k] == "Rarity" and k+1 < len(lines):
                rarity = int(_parse_number(lines[k+1]) or 0) or None
            if lines[k] == "Type" and k+1 < len(lines) and lines[k+1] in WEAPON_TYPES:
                wtype = lines[k+1]
    except ValueError:
        pass

    wid = stable_id("wp", name, wtype)
    now = utc_now_iso()

    legacy = {
        "id": wid,
        "name": name,
        "weapon_type": wtype,
        "icon": img_url,
        "atk_bonus": int(atk) if atk is not None else 0,
        "substat": {"name": sub_name, "value": sub_value},
        "passive": description,
        "source": {"source_url": url, "patch_version": None, "last_seen": now},
    }
    wx = {
        "id": wid,
        "name": name,
        "weapon_type": wtype,
        "image_url": img_url,
        "equipment_attack": int(atk) if atk is not None else 0,
        "substat_name": sub_name,
        "substat_value": sub_value,
        "passive_text": description,
        "rarity": rarity,
        "sources": {"7dsorigin": {"source_url": url, "last_seen": now}},
    }
    return legacy, wx

def parse_sdso_skills_section(section_lines: List[str]) -> Dict[str,List[Dict[str,Any]]]:
    """
    Parse 'Skills of X' section rendered as plain text.
    Returns dict weapon_type -> list of skill dicts.
    """
    SK_CATS = set(SKILL_TYPE_HINTS)
    skills_by_weapon: Dict[str,List[Dict[str,Any]]] = {}
    cur_wt = None
    i = 0
    while i < len(section_lines)-1:
        ln = section_lines[i]
        nxt = section_lines[i+1]
        if ln in WEAPON_TYPES:
            cur_wt = ln
            skills_by_weapon.setdefault(cur_wt, [])
            i += 1
            continue
        if nxt in SK_CATS:
            name = ln
            stype = nxt
            desc: List[str] = []
            j = i + 2
            while j < len(section_lines):
                if section_lines[j] in WEAPON_TYPES:
                    break
                if (j+1) < len(section_lines) and section_lines[j+1] in SK_CATS:
                    break
                if section_lines[j].startswith("Potentials of"):
                    break
                desc.append(section_lines[j])
                j += 1
            description = " ".join(desc).strip()
            multipliers: List[Dict[str,Any]] = []
            # pull generic scaling numbers (best effort)
            for mm in re.finditer(r"damage equal to\s*([0-9]+(?:\.[0-9]+)?)%\s*of\s*([A-Za-z ]+?)(?:[.,]|$)", description, re.I):
                multipliers.append({"value_pct": float(mm.group(1)), "scaling": mm.group(2).strip().upper(), "context": mm.group(0)})
            sk = {
                "name": name,
                "type": stype,
                "key": None,
                "cooldown_sec": None,
                "description": description,
                "hits": [],
                "multipliers": multipliers[:50],
                "source": "7dsorigin",
            }
            wt = cur_wt or "General"
            skills_by_weapon.setdefault(wt, []).append(sk)
            i = j
            continue
        i += 1
    return skills_by_weapon

def parse_sdso_potential_section(section_lines: List[str]) -> Dict[str,List[Dict[str,Any]]]:
    pot_by_weapon: Dict[str,List[Dict[str,Any]]] = {}
    cur_wt = None
    i = 0
    while i < len(section_lines):
        ln = section_lines[i]
        if ln in WEAPON_TYPES:
            cur_wt = ln
            pot_by_weapon.setdefault(cur_wt, [])
            i += 1
            continue
        m = re.match(r"^Tier\s*(\d+)$", ln, re.I)
        if m:
            tier = int(m.group(1))
            # next few lines describe
            bits: List[str] = []
            j = i + 1
            while j < len(section_lines):
                if section_lines[j] in WEAPON_TYPES:
                    break
                if re.match(r"^Tier\s*(\d+)$", section_lines[j], re.I):
                    break
                bits.append(section_lines[j])
                j += 1
            text = " ".join(bits).strip()
            wt = cur_wt or "General"
            pot_by_weapon.setdefault(wt, []).append({"tier": tier, "text": text})
            i = j
            continue
        i += 1
    return pot_by_weapon

def parse_sdso_character_page(url: str) -> Tuple[Dict[str,Any], Dict[str,Any]]:
    html = http_get(url)
    soup = BeautifulSoup(html, "lxml")
    h1 = soup.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else ""
    # "Escanor Build - Seven Deadly Sins: Origin" -> "Escanor"
    name = title.split(" Build", 1)[0].strip() if " Build" in title else title.strip()

    # main image
    img_url = None
    img = soup.find("img", attrs={"alt": re.compile(re.escape(name), re.I)}) if name else None
    if img and img.get("src"):
        img_url = abs_url_sdso(img.get("src"))

    lines = clean_lines(soup.get_text("\n"))

    # Description section
    desc_lines = _extract_section(lines, "Description", ("Type","Skills","Skills of "+name,"Potentials","Potentials of "+name,"Costumes","Information"))
    description = " ".join(desc_lines).strip()

    # Weapon types (Type section)
    weapons: List[str] = []
    try:
        ti = lines.index("Type")
        for k in range(ti+1, min(ti+20, len(lines))):
            if lines[k] in WEAPON_TYPES:
                weapons.append(lines[k])
            # stop after we collected a few and see heading
            if lines[k].startswith("Skills of"):
                break
    except ValueError:
        pass
    weapons = list(dict.fromkeys(weapons))  # dedup preserve order

    # Skills & potentials sections (best effort)
    skills_by_weapon: Dict[str,List[Dict[str,Any]]] = {}
    pot_by_weapon: Dict[str,List[Dict[str,Any]]] = {}

    # slice between 'Skills of' and 'Potentials of'
    sk_start = None
    sk_end = None
    for i, ln in enumerate(lines):
        if ln.startswith("Skills of "):
            sk_start = i+1
            continue
        if sk_start is not None and ln.startswith("Potentials of "):
            sk_end = i
            break
    if sk_start is not None:
        section = lines[sk_start:sk_end] if sk_end is not None else lines[sk_start:]
        skills_by_weapon = parse_sdso_skills_section(section)

    # potentials slice between 'Potentials of' and maybe 'Costumes'
    pt_start = None
    pt_end = None
    for i, ln in enumerate(lines):
        if ln.startswith("Potentials of "):
            pt_start = i+1
            continue
        if pt_start is not None and ln.strip() == "Costumes":
            pt_end = i
            break
    if pt_start is not None:
        section = lines[pt_start:pt_end] if pt_end is not None else lines[pt_start:]
        pot_by_weapon = parse_sdso_potential_section(section)

    char_id = stable_id("ch", name)
    now = utc_now_iso()

    charx = {
        "id": char_id,
        "name": name,
        "image_url": img_url,
        "description": description,
        "weapon_types": weapons,
        "skills_by_weapon": skills_by_weapon,
        "potential_by_weapon": pot_by_weapon,
        "sources": {"7dsorigin": {"source_url": url, "last_seen": now}},
    }

    legacy = {
        "id": char_id,
        "name": name,
        "element": None,
        "role": None,
        "icon": img_url,
        "base_stats": {"atk": 0, "crit_rate": 0, "crit_dmg": 0},
        "weapon_types": weapons,
        "source": {"source_url": url, "patch_version": None, "last_seen": now},
        "summary": description[:220] + ("…" if len(description) > 220 else ""),
    }
    return legacy, charx

def merge_sources_record(dst: Dict[str,Any], src: Dict[str,Any], source_name: str, conflicts: List[Dict[str,Any]], module: str) -> Dict[str,Any]:
    """
    Merge src record fields into dst.

    - Fill missing fields directly.
    - For skills_by_weapon: merge by (name,type) and *prefer 7dsorigin* when duplicates exist.
      Keep the overwritten version under skill["versions"][<source>].
    - For potential_by_weapon: merge by tier and prefer 7dsorigin on duplicates.
    - Record conflicts on scalar fields when values differ.
    """
    dst.setdefault("sources", {})
    if src.get("sources", {}).get(source_name):
        dst["sources"][source_name] = src["sources"][source_name]

    def record_conflict(field: str, a: Any, b: Any):
        conflicts.append({
            "module": module,
            "id": dst.get("id"),
            "field": field,
            "a": a,
            "b": b,
            "sources": list(dst.get("sources", {}).keys()),
        })

    # Special merges
    if "skills_by_weapon" in src and src.get("skills_by_weapon"):
        dst.setdefault("skills_by_weapon", {})
        for wt, incoming in (src.get("skills_by_weapon") or {}).items():
            dst["skills_by_weapon"].setdefault(wt, [])
            existing = dst["skills_by_weapon"][wt]

            # Ensure sources on existing entries (genshin is default)
            for s in existing:
                s.setdefault("source", "genshin")

            idx = {(s.get("name"), s.get("type")): i for i, s in enumerate(existing)}
            for sk in incoming:
                sk = dict(sk)
                sk.setdefault("source", source_name)
                key = (sk.get("name"), sk.get("type"))
                if key in idx:
                    old = existing[idx[key]]
                    versions = dict(old.get("versions") or {})
                    versions[old.get("source","genshin")] = {
                        "description": old.get("description"),
                        "multipliers": old.get("multipliers"),
                        "hits": old.get("hits"),
                    }
                    versions[source_name] = {
                        "description": sk.get("description"),
                        "multipliers": sk.get("multipliers"),
                        "hits": sk.get("hits"),
                    }
                    # Prefer 7dsorigin if present
                    if source_name == "7dsorigin":
                        merged = dict(old)
                        merged.update(sk)
                        merged["source"] = "7dsorigin"
                        merged["versions"] = versions
                        existing[idx[key]] = merged
                    else:
                        # keep old; just attach versions
                        old["versions"] = versions
                else:
                    existing.append(sk)
                    idx[key] = len(existing) - 1

    if "potential_by_weapon" in src and src.get("potential_by_weapon"):
        dst.setdefault("potential_by_weapon", {})
        for wt, incoming in (src.get("potential_by_weapon") or {}).items():
            dst["potential_by_weapon"].setdefault(wt, [])
            existing = dst["potential_by_weapon"][wt]
            idx = {p.get("tier"): i for i, p in enumerate(existing) if p.get("tier") is not None}
            for p in incoming:
                p = dict(p)
                p.setdefault("source", source_name)
                tier = p.get("tier")
                if tier in idx:
                    if source_name == "7dsorigin":
                        existing[idx[tier]] = p
                else:
                    existing.append(p)
                    if tier is not None:
                        idx[tier] = len(existing)-1

    # Scalar fields
    for field in ("image_url","description","weapon_types","equipment_attack","substat_name","substat_value","passive_text","weapon_type","rarity"):
        if field not in src:
            continue
        sv = src.get(field)
        if sv is None or sv == "" or sv == [] or sv == {}:
            continue
        dv = dst.get(field)
        if dv is None or dv == "" or dv == [] or dv == {}:
            dst[field] = sv
        else:
            if json.dumps(dv, sort_keys=True) != json.dumps(sv, sort_keys=True):
                record_conflict(field, dv, sv)

    return dst



def load_existing_db() -> Dict[str,Any]:
    if DB_JSON.exists():
        try:
            return json.loads(DB_JSON.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}

def compute_diff(old: Dict[str,Any], new: Dict[str,Any]) -> Dict[str,Any]:
    def ids_in(module: str, db: Dict[str,Any]) -> set:
        return set((db.get("modules", {}).get(module, {}) or {}).keys())

    diff = {"added": {}, "removed": {}, "changed": {}}
    for module in ("characters","weapons","skills"):
        a = ids_in(module, old)
        b = ids_in(module, new)
        diff["added"][module] = sorted(list(b - a))
        diff["removed"][module] = sorted(list(a - b))

    # changed: hash compare for chars/weapons
    for module in ("characters","weapons"):
        oldm = old.get("modules", {}).get(module, {}) or {}
        newm = new.get("modules", {}).get(module, {}) or {}
        changed = []
        for k in set(oldm.keys()) & set(newm.keys()):
            if json.dumps(oldm[k], sort_keys=True) != json.dumps(newm[k], sort_keys=True):
                changed.append(k)
        diff["changed"][module] = sorted(changed)

    return diff

def write_snapshot(db: Dict[str,Any]) -> Path:
    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    ts = utc_now_iso().replace(":","").replace("-","")
    path = SNAP_DIR / f"db_{ts}.json"
    path.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
    return path

def keep_last_snapshots(limit: int = 30) -> None:
    if not SNAP_DIR.exists():
        return
    snaps = sorted(SNAP_DIR.glob("db_*.json"))
    if len(snaps) <= limit:
        return
    for p in snaps[:-limit]:
        try:
            p.unlink()
        except:
            pass

def build_db(enable_7dsorigin: bool) -> Tuple[Dict[str,Any], Dict[str,Any], Dict[str,Any]]:
    """
    Returns (legacy_db, normalized_db, meta)
    """
    generated = utc_now_iso()

    # Characters
    char_links = parse_genshin_character_list()
    chars_legacy: List[Dict[str,Any]] = []
    chars_x: Dict[str,Any] = {}
    skills_x: Dict[str,Any] = {}

    for _, url in char_links:
        try:
            legacy, charx = parse_genshin_character_page(url)
            chars_legacy.append(legacy)
            chars_x[charx["id"]] = charx

            # explode skills into module
            for wt, skills in (charx.get("skills_by_weapon") or {}).items():
                for idx, sk in enumerate(skills):
                    sid = stable_id("sk", charx["id"], wt, sk.get("name",""), sk.get("type",""), str(idx))
                    skill_rec = {
                        "id": sid,
                        "character_id": charx["id"],
                        "weapon_type": wt,
                        "slot": idx,
                        **sk,
                        "sources": {"genshin": {"source_url": url}}
                    }
                    skills_x[sid] = skill_rec

        except Exception as e:
            print(f"[WARN] character parse failed: {url} :: {e}", file=sys.stderr)

    # Weapons
    weapons_legacy, weapons_x = parse_genshin_weapons_list()

    # Optional secondary source: 7dsorigin.gg (requires permission)
    sources = ["genshin.gg/7dso"]
    conflicts: List[Dict[str,Any]] = []

    if enable_7dsorigin:
        sources.append("7dsorigin.gg")

        # --- Import weapons from 7dsorigin.gg
        try:
            sdso_weapon_urls = parse_sdso_list_pages(SDSO_WEAPONS_LIST, "weapons")
            for wurl in sdso_weapon_urls:
                try:
                    w_legacy, wx = parse_sdso_weapon_page(wurl)
                    wid = wx["id"]
                    if wid in weapons_x:
                        weapons_x[wid] = merge_sources_record(weapons_x[wid], wx, "7dsorigin", conflicts, "weapons")
                    else:
                        weapons_x[wid] = wx
                    # legacy merge (best effort)
                    existing = next((w for w in weapons_legacy if w.get("id") == wid), None)
                    if existing:
                        # fill missing legacy fields
                        if not existing.get("icon") and w_legacy.get("icon"):
                            existing["icon"] = w_legacy["icon"]
                        if existing.get("atk_bonus", 0) == 0 and w_legacy.get("atk_bonus", 0) > 0:
                            existing["atk_bonus"] = w_legacy["atk_bonus"]
                        existing.setdefault("sources", {})["7dsorigin"] = w_legacy.get("source")
                    else:
                        w_legacy["sources"] = {"7dsorigin": w_legacy.get("source")}
                        weapons_legacy.append(w_legacy)
                except Exception as e:
                    print(f"[WARN] 7dsorigin weapon parse failed: {wurl} :: {e}", file=sys.stderr)
        except Exception as e:
            print(f"[WARN] 7dsorigin weapon list failed: {e}", file=sys.stderr)

        # --- Import characters from 7dsorigin.gg
        try:
            sdso_char_urls = parse_sdso_char_list()
            for curl in sdso_char_urls:
                try:
                    c_legacy, cx = parse_sdso_character_page(curl)
                    cid = cx["id"]
                    if cid in chars_x:
                        chars_x[cid] = merge_sources_record(chars_x[cid], cx, "7dsorigin", conflicts, "characters")
                    else:
                        # new character not present on genshin.gg
                        chars_x[cid] = cx
                        chars_legacy.append(c_legacy)

                    # legacy merge
                    existing = next((c for c in chars_legacy if c.get("id") == cid), None)
                    if existing:
                        if not existing.get("icon") and c_legacy.get("icon"):
                            existing["icon"] = c_legacy["icon"]
                        if not existing.get("summary") and c_legacy.get("summary"):
                            existing["summary"] = c_legacy["summary"]
                        existing.setdefault("sources", {})["7dsorigin"] = c_legacy.get("source")

                    # explode *sdso* skills into module with unique IDs (avoid collisions)
                    for wt, skills in (cx.get("skills_by_weapon") or {}).items():
                        for idx, sk in enumerate(skills):
                            sid = stable_id("sk", "7dsorigin", cid, wt, sk.get("name",""), sk.get("type",""), str(idx))
                            skill_rec = {
                                "id": sid,
                                "character_id": cid,
                                "weapon_type": wt,
                                "slot": idx,
                                **sk,
                                "sources": {"7dsorigin": {"source_url": curl}}
                            }
                            skills_x[sid] = skill_rec

                except Exception as e:
                    print(f"[WARN] 7dsorigin character parse failed: {curl} :: {e}", file=sys.stderr)
        except Exception as e:
            print(f"[WARN] 7dsorigin character list failed: {e}", file=sys.stderr)

    # Build normalized db
    dbx: Dict[str,Any] = {
        "schema_version": "1.0",
        "generated_at": generated,
        "modules": {
            "characters": chars_x,
            "weapons": weapons_x,
            "skills": skills_x,
            "passives": {},
            "sets": {},
            "buffs": {},
            "scenarios": {}
        },
        "indexes": {
            "characters": [c["id"] for c in sorted(chars_legacy, key=lambda x: x["name"])],
            "weapons": [w["id"] for w in sorted(weapons_legacy, key=lambda x: x["name"])],
        },
        "source_priority": ["genshin"],
        "notes": [
            "DB générée automatiquement (best-effort).",
            "Certaines données peuvent être incomplètes / changer au release."
        ]
    }

    legacy_db: Dict[str,Any] = {
        "schema_version": "0.3",
        "characters": sorted(chars_legacy, key=lambda x: x["name"]),
        "weapons": sorted(weapons_legacy, key=lambda x: x["name"]),
    }

    meta = {
        "generated_at": generated,
        "sources": sources,
        "counts": {
            "characters": len(legacy_db["characters"]),
            "weapons": len(legacy_db["weapons"]),
            "skills": len(skills_x),
            "conflicts": len(conflicts),
        },
        "conflicts": conflicts,
    }

    return legacy_db, dbx, meta

def write_outputs(legacy_db: Dict[str,Any], dbx: Dict[str,Any], meta: Dict[str,Any], do_snapshot: bool):
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # db.json (normalized)
    DB_JSON.write_text(json.dumps(dbx, ensure_ascii=False, indent=2), encoding="utf-8")

    # db_live.js (legacy + extended)
    payload = {"meta": meta, "db": legacy_db, "dbx": dbx}
    js = "// Auto-generated. Do not edit.\n\nwindow.__DB_LIVE__ = " + json.dumps(payload, ensure_ascii=False) + ";\n"
    DB_LIVE_JS.write_text(js, encoding="utf-8")

    # Snapshot + diff
    if do_snapshot:
        snap = write_snapshot(dbx)
        keep_last_snapshots(30)

        # compute diff latest two
        snaps = sorted(SNAP_DIR.glob("db_*.json"))
        if len(snaps) >= 2:
            old = json.loads(snaps[-2].read_text(encoding="utf-8"))
            new = json.loads(snaps[-1].read_text(encoding="utf-8"))
            diff = compute_diff(old, new)
            DB_DIFF_JSON.write_text(json.dumps(diff, ensure_ascii=False, indent=2), encoding="utf-8")
        else:
            DB_DIFF_JSON.write_text(json.dumps({"added":{}, "removed":{}, "changed":{}}, ensure_ascii=False, indent=2), encoding="utf-8")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--enable-7dsorigin", action="store_true", help="Enable optional secondary source 7dsorigin.gg (check permissions first).")
    ap.add_argument("--no-snapshot", action="store_true", help="Do not write snapshot history/diff.")
    args = ap.parse_args()

    legacy_db, dbx, meta = build_db(enable_7dsorigin=args.enable_7dsorigin)
    write_outputs(legacy_db, dbx, meta, do_snapshot=not args.no_snapshot)

    print("[OK] Updated DB:")
    print(f" - {DB_JSON.relative_to(ROOT)} (normalized)")
    print(f" - {DB_LIVE_JS.relative_to(ROOT)} (embedded)")
    if not args.no_snapshot:
        print(f" - {SNAP_DIR.relative_to(ROOT)}/ (snapshots)")
        print(f" - {DB_DIFF_JSON.relative_to(ROOT)} (diff latest)")

if __name__ == "__main__":
    main()


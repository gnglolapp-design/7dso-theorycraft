#!/usr/bin/env python3
"""
Brave Hearts — Kit Parser Engine (best-effort, ambitious)
Parses skill/potential descriptions into structured effects for downstream tools.

Design goals:
- Never crash the DB updater
- Preserve raw text always
- Extract as much as possible with confidence scoring
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


def _to_float(x: str) -> Optional[float]:
    try:
        return float(x)
    except Exception:
        return None


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


@dataclass
class ParseResult:
    multiplier_pct: Optional[float] = None
    hits: Optional[int] = None
    scaling: Optional[str] = None  # "ATK" / "HP" / "MIXED" / None
    parsed_effects: List[Dict[str, Any]] = None
    confidence_score: float = 0.0
    description_raw: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "parsed_multiplier_pct": self.multiplier_pct,
            "parsed_hits": self.hits,
            "parsed_scaling": self.scaling,
            "parsed_effects": self.parsed_effects or [],
            "confidence_score": self.confidence_score,
            "description_raw": self.description_raw,
        }


class SkillParser:
    """
    Extracts:
    - base multiplier (%)
    - hits
    - scaling (ATK/HP)
    - parsed effects
    """
    _MULT_PATTERNS = [
        re.compile(r"([0-9]+(?:\.[0-9]+)?)%\s*(?:of\s*)?(ATK|Attack)\b", re.I),
        re.compile(r"([0-9]+(?:\.[0-9]+)?)%\s*(?:of\s*)?HP\b", re.I),
        re.compile(r"damage\s+equal\s+to\s*([0-9]+(?:\.[0-9]+)?)%\s*(?:of\s*)?(ATK|Attack|HP)\b", re.I),
    ]
    _HITS_PATTERNS = [
        re.compile(r"(\d+)\s*(?:hits|hit|times)\b", re.I),
    ]

    def parse(self, text: str) -> Dict[str, Any]:
        t = (text or "").strip()
        res = ParseResult(parsed_effects=[], description_raw=t)

        # multiplier + scaling
        mult, scaling = self._extract_multiplier_and_scaling(t)
        res.multiplier_pct = mult
        res.scaling = scaling

        # hits
        res.hits = self._extract_hits(t)

        # effects
        res.parsed_effects = self._extract_effects(t)

        # confidence
        res.confidence_score = self._compute_confidence(res)
        return res.to_dict()

    def _extract_multiplier_and_scaling(self, text: str) -> Tuple[Optional[float], Optional[str]]:
        best = None
        best_scale = None
        for pat in self._MULT_PATTERNS:
            m = pat.search(text)
            if not m:
                continue
            val = _to_float(m.group(1))
            if val is None:
                continue
            scale = None
            if len(m.groups()) >= 2:
                s = (m.group(2) or "").upper()
                if "HP" in s:
                    scale = "HP"
                elif "ATK" in s or "ATTACK" in s:
                    scale = "ATK"
            # prefer first strong match
            best = val
            best_scale = scale
            break

        # fallback if mentions HP but no explicit "x% HP"
        if best is None:
            if re.search(r"\bHP\b", text, re.I):
                best_scale = "HP"
            elif re.search(r"\bATK\b|\bAttack\b", text, re.I):
                best_scale = "ATK"
        return best, best_scale

    def _extract_hits(self, text: str) -> Optional[int]:
        for pat in self._HITS_PATTERNS:
            m = pat.search(text)
            if m:
                try:
                    return int(m.group(1))
                except Exception:
                    return None
        return None

    def _extract_effects(self, text: str) -> List[Dict[str, Any]]:
        effects: List[Dict[str, Any]] = []

        # Damage bonus patterns
        for m in re.finditer(r"increase(?:s)?\s+damage(?:\s+dealt)?\s+by\s+([0-9]+(?:\.[0-9]+)?)%\b", text, re.I):
            effects.append({"type": "dmg_bonus_pct", "value": float(m.group(1))})

        # Conditional on debuff
        if re.search(r"\bif\b.*\b(debuffed|debuff)\b", text, re.I):
            m = re.search(r"increase(?:s)?\s+damage(?:\s+dealt)?\s+by\s+([0-9]+(?:\.[0-9]+)?)%.*\b(debuffed|debuff)\b", text, re.I)
            if m:
                effects.append({"type": "bonus_if_debuffed", "value": float(m.group(1))})
            else:
                effects.append({"type": "cond_if_debuffed", "value": True})

        # Ignore DEF
        m = re.search(r"ignore(?:s)?\s+([0-9]+(?:\.[0-9]+)?)%\s*DEF\b", text, re.I)
        if m:
            effects.append({"type": "ignore_def_pct", "value": float(m.group(1))})
        elif re.search(r"\bignore(?:s)?\s+defense\b", text, re.I):
            effects.append({"type": "ignore_def_pct", "value": 100.0})

        # Penetrate resistance
        m = re.search(r"(?:penetrate|ignore)(?:s)?\s+([0-9]+(?:\.[0-9]+)?)%\s*(?:resistance|res)\b", text, re.I)
        if m:
            effects.append({"type": "res_pen_pct", "value": float(m.group(1))})

        # True damage
        if re.search(r"\btrue damage\b", text, re.I):
            effects.append({"type": "true_damage", "value": True})

        # Crit modifiers
        m = re.search(r"increase(?:s)?\s+crit(?:ical)?\s+damage\s+by\s+([0-9]+(?:\.[0-9]+)?)%\b", text, re.I)
        if m:
            effects.append({"type": "crit_dmg_bonus_pct", "value": float(m.group(1))})

        m = re.search(r"increase(?:s)?\s+crit(?:ical)?\s+(?:rate|chance)\s+by\s+([0-9]+(?:\.[0-9]+)?)%\b", text, re.I)
        if m:
            effects.append({"type": "crit_rate_bonus_pct", "value": float(m.group(1))})

        m = re.search(r"reduce(?:s)?\s+enemy\s+crit(?:ical)?\s+resist(?:ance)?\s+by\s+([0-9]+(?:\.[0-9]+)?)%\b", text, re.I)
        if m:
            effects.append({"type": "enemy_crit_resist_down_pct", "value": float(m.group(1))})

        # HP threshold condition
        m = re.search(r"HP\s+is\s+below\s+([0-9]+(?:\.[0-9]+)?)%\b", text, re.I)
        if m:
            effects.append({"type": "cond_hp_below_pct", "value": float(m.group(1))})

        # Stacks
        m = re.search(r"per\s+stack\b.*?([0-9]+(?:\.[0-9]+)?)%\b", text, re.I)
        if m:
            effects.append({"type": "per_stack_bonus_pct", "value": float(m.group(1))})
        m = re.search(r"max(?:imum)?\s+([0-9]+)\s+stacks\b", text, re.I)
        if m:
            effects.append({"type": "max_stacks", "value": int(m.group(1))})

        # Clean duplicates
        uniq = []
        seen = set()
        for e in effects:
            sig = (e.get("type"), e.get("value"))
            if sig in seen:
                continue
            seen.add(sig)
            uniq.append(e)
        return uniq

    def _compute_confidence(self, res: ParseResult) -> float:
        score = 0.0
        if res.multiplier_pct is not None:
            score += 0.45
        if res.hits is not None:
            score += 0.15
        if res.scaling is not None:
            score += 0.10
        if res.parsed_effects:
            # scale with number of effects but cap
            score += min(0.30, 0.12 * len(res.parsed_effects))
        return _clamp(score, 0.0, 1.0)


class PotentialParser:
    """
    Potentials are usually short bonuses; we parse common stat mods and conditions.
    """
    def parse(self, text: str) -> Dict[str, Any]:
        t = (text or "").strip()
        effects: List[Dict[str, Any]] = []

        # ATK/DEF/HP bonuses
        for stat in ("ATK", "DEF", "HP"):
            m = re.search(rf"increase(?:s)?\s+{stat}\s+by\s+([0-9]+(?:\.[0-9]+)?)%\b", t, re.I)
            if m:
                effects.append({"type": f"{stat.lower()}_pct", "value": float(m.group(1))})

        # Damage dealt
        m = re.search(r"increase(?:s)?\s+damage(?:\s+dealt)?\s+by\s+([0-9]+(?:\.[0-9]+)?)%\b", t, re.I)
        if m:
            effects.append({"type": "dmg_bonus_pct", "value": float(m.group(1))})

        # Crit stats
        m = re.search(r"increase(?:s)?\s+crit(?:ical)?\s+(?:rate|chance)\s+by\s+([0-9]+(?:\.[0-9]+)?)%\b", t, re.I)
        if m:
            effects.append({"type": "crit_rate_pct", "value": float(m.group(1))})

        m = re.search(r"increase(?:s)?\s+crit(?:ical)?\s+damage\s+by\s+([0-9]+(?:\.[0-9]+)?)%\b", t, re.I)
        if m:
            effects.append({"type": "crit_dmg_pct", "value": float(m.group(1))})

        # Simple conditions
        if re.search(r"\bif\b.*\b(debuffed|debuff)\b", t, re.I):
            effects.append({"type": "cond_if_debuffed", "value": True})

        m = re.search(r"HP\s+is\s+below\s+([0-9]+(?:\.[0-9]+)?)%\b", t, re.I)
        if m:
            effects.append({"type": "cond_hp_below_pct", "value": float(m.group(1))})

        # confidence
        conf = 0.25
        if effects:
            conf = min(1.0, 0.35 + 0.15 * len(effects))
        return {
            "parsed_effects": effects,
            "confidence_score": conf,
            "description_raw": t,
        }

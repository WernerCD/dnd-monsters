"""Build site/data/monsters.json from the raw SRD exports in source/.

Inputs (all in the repo, refreshed by tools/fetch_source.py; all SRD content, CC BY 4.0):
  source/open5e-srd-2014.json     every SRD 5.1 creature (Open5e API v2): the stat blocks
  source/open5e-srd-2024.json     every SRD 5.2 creature (Open5e API v2): the stat blocks
  source/open5e-v1-srd-2014.json  2014 subtypes ("any race", "devil") and legendary action intros
  source/5e-bits-srd-2024.json    2024 sizes and lair XP (Open5e lists 2024 Tiny creatures,
                                  and "Medium or Small" humanoids, as Small)

Output: {"generated", "xpByCr", "editions": {"2014": [...], "2024": [...]}}.
XP by CR stays in the data so an encounter builder can use it later.

Run:  python tools/build_data.py
"""
import datetime
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source"
OUT = ROOT / "site" / "data" / "monsters.json"

XP_BY_CR = {0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300,
            7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000,
            16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000,
            24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000}

SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"]
SPEED_KEYS = ["walk", "burrow", "climb", "fly", "swim"]
ABIL = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]
LAWS = {"lawful": "L", "neutral": "N", "chaotic": "C"}
MORALS = {"good": "G", "neutral": "N", "evil": "E"}
ALL_ALIGN = [l + m for l in "LNC" for m in "GNE"]


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "")).strip("-")


def cr_str(cr):
    return {0.125: "1/8", 0.25: "1/4", 0.5: "1/2"}.get(cr, str(int(cr)))


def pb_for(cr):
    return 2 if cr < 5 else 3 if cr < 9 else 4 if cr < 13 else 5 if cr < 17 else 6 if cr < 21 else 7 if cr < 25 else 8 if cr < 29 else 9


def norm_text(s):
    return (s or "").replace("’", "'").replace("\r", "").strip()


def align_tags(a):
    """Alignment text -> the nine alignments it allows, or 'U' (unaligned)."""
    a = a.lower().strip()
    if a == "unaligned":
        return ["U"]
    if a.startswith("any"):
        tags = list(ALL_ALIGN)
        for word, axis in (("good", 1), ("evil", 1), ("lawful", 0), ("chaotic", 0)):
            code = (MORALS if axis else LAWS)[word]
            if f"non-{word}" in a:
                tags = [t for t in tags if t[axis] != code]
            elif re.search(rf"any {word}", a):
                tags = [t for t in tags if t[axis] == code]
        return tags
    tags = []
    for part in re.split(r"\s+or\s+", re.sub(r"\(\d+%\)", "", a)):
        part = part.strip()
        if part == "neutral":
            tags.append("NN")
            continue
        w = part.split()
        if len(w) == 2 and w[0] in LAWS and w[1] in MORALS:
            tags.append(LAWS[w[0]] + MORALS[w[1]])
    return tags or list(ALL_ALIGN)


def usage_suffix(u):
    if not u:
        return ""
    t, p = u.get("type"), u.get("param")
    if t in ("RECHARGE_ON_ROLL", "RECHARGE"):
        return f" (Recharge {p}–6)" if p and p < 6 else " (Recharge 6)"
    if t == "PER_DAY":
        return f" ({p}/Day)"
    return ""


def act_name(a, legendary=False):
    n = norm_text(a["name"])
    if "(" not in n:
        n += usage_suffix(a.get("usage_limits"))
        cost = a.get("legendary_action_cost") or 1
        if legendary and cost > 1:
            n += f" (Costs {cost} Actions)"
    return n


def keys(lst):
    return sorted({(x["key"] if isinstance(x, dict) else str(x)).lower() for x in (lst or [])})


def noun_for(c):
    """The word the stat block uses for itself ('the dragon'), for the legendary action intro."""
    words = [w.lower() for w in re.findall(r"[A-Za-z]+", c["name"])]
    text = " ".join(t["desc"] for t in (c.get("traits") or []) + (c.get("actions") or []))
    hits = Counter(m.lower() for m in re.findall(r"\b[Tt]he ([a-z]+)\b", text) if m.lower() in words)
    return hits.most_common(1)[0][0] if hits else (words[-1] if words else "creature")


def build(c, ed, extra):
    ri = c.get("resistances_and_immunities") or {}
    sp = c.get("speed") or {}
    speed = {k: int(sp[k]) for k in SPEED_KEYS if sp.get(k)}
    if "walk" not in speed:
        speed["walk"] = int(sp.get("walk") or 0)
    hover = bool(sp.get("hover") or (c.get("speed_all") or {}).get("hover"))
    senses = []
    for key, label in (("blindsight_range", "Blindsight"), ("darkvision_range", "Darkvision"),
                       ("tremorsense_range", "Tremorsense"), ("truesight_range", "Truesight")):
        if c.get(key):
            senses.append(f"{label} {int(c[key])} ft.")
    acts = sorted(c.get("actions") or [], key=lambda a: (a["name"] != "Multiattack", a.get("order_in_statblock") or 0))

    def of(kind):
        return [{"name": act_name(a, kind == "LEGENDARY_ACTION"), "desc": norm_text(a["desc"])}
                for a in acts if (a.get("action_type") or "ACTION") == kind]

    traits = [{"name": norm_text(t["name"]), "desc": norm_text(t["desc"])} for t in (c.get("traits") or [])]
    legendary = of("LEGENDARY_ACTION")
    all_text = json.dumps(traits + legendary + of("ACTION"))
    lair = bool(extra.get("xp_in_lair")) or bool(re.search(r"\bin (?:its |a )?lair\b", all_text, re.I))
    cr = float(c["challenge_rating"])
    cr = int(cr) if cr >= 1 or cr == 0 else cr
    size = extra.get("size") or c["size"]["name"]
    size = " or ".join(s.strip().capitalize() for s in size.split(" or "))
    sizes = [s for s in SIZES if s in size.split(" or ")]
    typ = c["type"]["name"]
    sub = extra.get("subtype", "")
    swarm = c["name"].startswith("Swarm of") or sub.lower() == "swarm"
    if sub.lower() == "swarm":
        sub = ""
    ab = c["ability_scores"]
    saves = c.get("saving_throws") or {}
    m = {
        "id": slug(c["name"]),
        "name": norm_text(c["name"]),
        "size": size,
        "sizes": sizes,
        "type": typ,
        "sub": sub,
        "swarm": swarm,
        "align": c.get("alignment") or "",
        "alignTags": align_tags(c.get("alignment") or ""),
        "ac": c["armor_class"],
        "acNote": norm_text(c.get("armor_detail")),
        "hp": c["hit_points"],
        "hd": (c.get("hit_dice") or "").replace(" ", ""),
        "speed": speed,
        "hover": hover,
        "ab": [ab[k] for k in ABIL],
        "saves": {k[:3]: v for k, v in saves.items()} if ed == "2014" else {k[:3]: saves[k] for k in ABIL if k in saves},
        "skills": c.get("skill_bonuses") or {},
        "senses": senses,
        "pp": c.get("passive_perception"),
        "lang": norm_text((c.get("languages") or {}).get("as_string")),
        "cr": cr,
        "crText": cr_str(cr),
        "xp": c.get("experience_points") or XP_BY_CR.get(cr, 0),
        "xpLair": extra.get("xp_in_lair"),
        "pb": pb_for(cr),
        "init": c.get("initiative_bonus") if ed == "2024" else None,
        "vuln": norm_text(ri.get("damage_vulnerabilities_display")),
        "resist": norm_text(ri.get("damage_resistances_display")),
        "immune": norm_text(ri.get("damage_immunities_display")),
        "condImmune": norm_text(ri.get("condition_immunities_display")),
        "dv": keys(ri.get("damage_vulnerabilities")),
        "dr": keys(ri.get("damage_resistances")),
        "di": keys(ri.get("damage_immunities")),
        "ci": keys(ri.get("condition_immunities")),
        "traits": traits,
        "actions": of("ACTION"),
        "bonus": of("BONUS_ACTION"),
        "reactions": of("REACTION"),
        "legendary": legendary,
        "isLegendary": bool(legendary) or any(t["name"].startswith("Legendary Resistance") for t in traits),
        "lair": lair,
    }
    if legendary:
        if ed == "2014":
            m["legIntro"] = norm_text(extra.get("legendary_desc")) or (
                f"The {noun_for(c)} can take 3 legendary actions, choosing from the options below. Only one legendary "
                "action option can be used at a time and only at the end of another creature's turn. The "
                f"{noun_for(c)} regains spent legendary actions at the start of its turn.")
        else:
            n = noun_for(c)
            m["legIntro"] = (f"Legendary Action Uses: 3{' (4 in Lair)' if lair else ''}. Immediately after another "
                             f"creature's turn, the {n} can expend a use to take one of the following actions. "
                             f"The {n} regains all expended uses at the start of each of its turns.")
    return {k: v for k, v in m.items() if v not in ("", None, [], {}) or k in ("hp", "ac", "cr", "speed", "xp")}


def main():
    s14 = load(SRC / "open5e-srd-2014.json")
    s24 = load(SRC / "open5e-srd-2024.json")
    v1 = {m["name"]: m for m in load(SRC / "open5e-v1-srd-2014.json")}
    bits = {m["name"]: m for m in load(SRC / "5e-bits-srd-2024.json")}

    def bits_for(name):
        if name in bits:
            return bits[name]
        forms = [b for n, b in bits.items() if n.startswith(name + ", ")]
        main_form = [b for b in forms if re.search(r"(Human|Vampire) Form$", b["name"])]
        return (main_form or forms or [{}])[0]

    out, warn = {}, []
    for ed, src in (("2014", s14), ("2024", s24)):
        rows = []
        for c in src:
            extra = {}
            if ed == "2014":
                v = v1.get(c["name"]) or {}
                extra = {"subtype": v.get("subtype", ""), "legendary_desc": v.get("legendary_desc", "")}
            else:
                b = bits_for(c["name"])
                if b:
                    extra = {"size": b.get("size"), "xp_in_lair": b.get("xp_in_lair")}
                    if b.get("type") and b["type"].lower() != c["type"]["name"].lower():
                        warn.append(f"2024 {c['name']}: type {c['type']['name']} vs 5e-bits {b['type']}")
            rows.append(build(c, ed, extra))
        ids = Counter(r["id"] for r in rows)
        assert not [i for i, n in ids.items() if n > 1], "duplicate ids"
        out[ed] = sorted(rows, key=lambda r: r["name"])

    data = {"generated": datetime.date.today().isoformat(),
            "xpByCr": {cr_str(k): v for k, v in XP_BY_CR.items()},
            "editions": out}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    for ed, rows in out.items():
        print(f"{ed}: {len(rows)} creatures, {sum(r['isLegendary'] for r in rows)} legendary, "
              f"{sum(r['lair'] for r in rows)} lair, sizes {dict(Counter(r['size'] for r in rows))}")
    for w in warn:
        print("  warn:", w)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()

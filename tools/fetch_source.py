"""Refresh the raw SRD creature exports in source/ (run by hand, not in CI).

  source/open5e-srd-2014.json   Open5e v2, document srd-2014 (SRD 5.1), every creature
  source/open5e-srd-2024.json   Open5e v2, document srd-2024 (SRD 5.2), every creature
  source/open5e-v1-srd-2014.json  Open5e v1 wotc-srd: only name, subtype, group, legendary_desc
                                  (v2 drops the 2014 subtype and the legendary action intro)
  source/5e-bits-srd-2024.json  5e-bits/5e-database 2024 monsters: only name, size, xp_in_lair
                                  (Open5e lists every 2024 Tiny creature and every
                                  "Medium or Small" humanoid as Small)

All of it is SRD content, CC BY 4.0.
Run:  python tools/fetch_source.py
"""
import json
import urllib.request
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "source"
UA = {"Accept": "application/json", "User-Agent": "dnd-monsters-build"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    return json.load(urllib.request.urlopen(req, timeout=60))


def pages(url):
    out = []
    while url:
        d = get(url)
        out += d["results"]
        url = d.get("next")
    return out


def save(name, data):
    with open(SRC / name, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(name, len(data))


def main():
    SRC.mkdir(exist_ok=True)
    for key, ed in (("srd-2014", "2014"), ("srd-2024", "2024")):
        res = pages(f"https://api.open5e.com/v2/creatures/?document__key={key}&limit=100&format=json")
        res.sort(key=lambda c: c["name"])
        save(f"open5e-srd-{ed}.json", res)

    v1 = pages("https://api.open5e.com/v1/monsters/?document__slug=wotc-srd&limit=100&format=json")
    save("open5e-v1-srd-2014.json", sorted(
        [{"name": m["name"], "subtype": m.get("subtype") or "", "group": m.get("group") or "",
          "legendary_desc": m.get("legendary_desc") or ""} for m in v1], key=lambda m: m["name"]))

    bits = get("https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en/5e-SRD-Monsters.json")
    save("5e-bits-srd-2024.json", sorted(
        [{"name": m["name"].replace("’", "'"), "size": m["size"], "type": m.get("type", ""),
          "xp": m.get("xp"), "xp_in_lair": m.get("xp_in_lair")} for m in bits], key=lambda m: m["name"]))


if __name__ == "__main__":
    main()

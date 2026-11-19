# Monster Lookup

Every creature in the free System Reference Documents, with full stat blocks, for 2014 and 2024 D&D 5e rules.

**Live:** https://wernercd.github.io/dnd-monsters/ · part of the [D&D Toolbox](https://wernercd.github.io/dnd/) · [Changes](https://wernercd.github.io/dnd-monsters/changes.html)

## Features
- The whole SRD bestiary: 325 creatures from SRD 5.1 (2014) and 331 from SRD 5.2 (2024), with an edition switch. Creatures in both editions show a tab for each in their stat block.
- Search by name. Filter by challenge rating range, type, size, alignment, damage resistances, immunities and vulnerabilities, condition immunities, legendary or lair, and fly, hover, swim, burrow or climb speeds. Every filter option shows how many creatures it would leave.
- Sort by name, CR or hit points.
- Full stat blocks in each edition's layout: 2014 saving throws and Challenge line, 2024 initiative, Mod/Save table and lair XP; legendary actions with their intro.
- Star creatures (saved in this browser) and show only the starred ones.
- The link keeps every filter, and an open stat block has its own link (`?m=<id>`).
- A creatures-by-CR bar chart for the current filter (shared `DndPlot`).
- Encounter builder (`#encounter`): add creatures from the list or a stat block, with counts; the party comes from the hub's Party page (`dnd.party`) or is set by hand. Shows total XP, 2014 adjusted XP, the budget or threshold bars and a difficulty line, using the 2024 DMG XP budgets per character or the 2014 DMG thresholds and encounter multipliers. Saved in `dnd.encounter`, shareable (`#encounter&c=<id>:<n>,...&p=<n>x<level>`), printable with every stat block.
- Dice and links (shared `dice.js`/`links.js`): stat block numbers roll; spell lists are put in italics by the data build so they link to the Spell Planner; conditions link to the Rules Reference; the encounter builder rolls initiative.
- Works offline after one visit (shared `sw.js`/`offline.js`, `site/offline.json`), with app icons and a link preview.
- `site/search.json` (built by `tools/build_data.py`) feeds the hub's "Search every tool" box; each entry opens its stat block.

## Data and copyright
- Stat blocks come only from the System Reference Documents 5.1 and 5.2 (CC BY 4.0), retrieved through the [Open5e](https://open5e.com) API (`source/open5e-srd-2014.json`, `source/open5e-srd-2024.json`).
- Open5e's v2 data drops the 2014 subtypes and legendary action intros, so those come from its v1 API (`source/open5e-v1-srd-2014.json`). It also lists every 2024 Tiny creature and every "Medium or Small" humanoid as Small, so 2024 sizes and lair XP come from the [5e-bits database](https://github.com/5e-bits/5e-database) (`source/5e-bits-srd-2024.json`). Both are SRD content too.
- 2024 legendary action uses are 3, or "3 (4 in Lair)" for creatures with a lair, as in SRD 5.2.
- Creatures from other books (the Monster Manuals and adventures) are not in the SRD and are left out.
- Stars and the encounter are stored only in your browser (`localStorage`); nothing is sent anywhere.

## Layout
| Path | What |
|---|---|
| `site/` | The static site (HTML/CSS/JS, no build step): `index.html`, `changes.html`, `404.html` |
| `site/data/monsters.json`, `site/search.json` | Generated data and the hub search list, rebuilt by CI on every push |
| `site/encounter.js` | The encounter builder |
| `site/statblock.js`, `sw.js`, `offline.js` | Shared D&D Toolbox files: stat block, offline cache |
| `tools/build_data.py` | Builds the data from `source/` |
| `tools/fetch_source.py` | Refreshes `source/` from Open5e and 5e-bits (run by hand) |
| `source/` | Raw SRD exports |
| `tools/check_site.py` | Smoke check of the pages and data (shared D&D Toolbox file) |
| `tools/smoke_test.py` | Browser test suite in Playwright (shared D&D Toolbox file) |
| `tests/site_test.py` | This site's own browser checks: counts, filters, stat block links, 2024 sizes, chart, stars |

## Run locally
```bash
python tools/build_data.py
python -m http.server 8765 --directory site
```
Checks (CI runs the same before every deploy): `python tools/check_site.py` and `python tools/smoke_test.py` (needs `pip install playwright` and `python -m playwright install chromium`). Every push to `main` builds the data, runs both and deploys to GitHub Pages via `.github/workflows/pages.yml`.

## Credits and license
- Code: MIT, see [LICENSE](LICENSE).
- This work includes material from the System Reference Document 5.1 and 5.2 by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document, licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode).
- Unofficial fan content. Not affiliated with or endorsed by Wizards of the Coast.

"""Monster Lookup checks, run by tools/smoke_test.py after the shared tests.

run(page, base, check): page is a fresh Playwright page (desktop size), base the site URL,
check(cond, message) records a pass or a failure.
"""


def count_text(page):
    return page.locator("#count").inner_text()


def load(page, url):
    page.goto(url, wait_until="load")
    page.wait_for_selector("#list .card", timeout=10000)
    page.wait_for_timeout(200)


def run(page, base, check):
    # both editions load in full
    load(page, base + "?ed=2014")
    check(count_text(page) == "325 creatures", f"2014 shows 325 creatures (got {count_text(page)!r})")
    check(page.locator("#list .card").count() == 325, "2014 list renders 325 cards")
    load(page, base + "?ed=2024")
    check(count_text(page) == "331 creatures", f"2024 shows 331 creatures (got {count_text(page)!r})")

    # the CR chart renders bars for the edition
    bars = page.locator("#crChart svg .plot-bar").count()
    check(bars >= 20, f"creatures-by-CR chart draws its bars (found {bars} bars)")

    # a CR filter narrows the list, every card is in range, and the link keeps it
    page.select_option("#crMin", "5")
    page.wait_for_timeout(200)
    crs = page.locator("#list .card .cr").all_inner_texts()
    nums = [eval(c.replace("CR ", "")) for c in crs]
    check(0 < len(nums) < 331, f"CR 5+ narrows the 2024 list ({len(nums)} creatures)")
    check(all(n >= 5 for n in nums), "every card shown with CR 5+ is CR 5 or higher")
    check("crmin=5" in page.url, f"the link keeps the CR filter ({page.url})")

    # filters from a link: 2024 fiends, the type picker shows it as filtered
    load(page, base + "?ed=2024&t=Fiend")
    check(count_text(page).startswith("29 of 331"), f"?t=Fiend gives the 29 fiends of 2024 (got {count_text(page)!r})")
    check(page.locator('details[data-facet="type"].filtered').count() == 1, "the Type picker shows it is filtered")

    # 2024 Tiny sizes come through (Open5e says Small; 5e-bits fixes it)
    load(page, base + "?ed=2024&q=cat")
    meta = page.locator('#list .card[data-id="cat"] .meta').inner_text()
    check(meta.startswith("Tiny Beast"), f"2024 Cat is Tiny ({meta!r})")
    load(page, base + "?ed=2024&q=bandit")
    meta = page.locator('#list .card[data-id="bandit"] .meta').inner_text()
    check(meta.startswith("Medium or Small Humanoid"), f"2024 Bandit is Medium or Small ({meta!r})")

    # a stat block opens from its link, in the right edition, with its legendary actions
    load(page, base + "?ed=2014&m=adult-red-dragon")
    page.wait_for_selector("#detail[open]", timeout=5000)
    check(page.locator("#dTitle").inner_text() == "Adult Red Dragon", "?m=adult-red-dragon opens its stat block")
    body = page.locator("#dBody").inner_text()
    check("Challenge 17 (18,000 XP)" in body, "2014 stat block shows Challenge 17 (18,000 XP)")
    check("can take 3 legendary actions" in body, "2014 stat block has the legendary action intro")
    page.locator('[data-ed-tab="2024"]').click()
    body = page.locator("#dBody").inner_text()
    check("or 20,000 in lair" in body and "3 (4 in Lair)" in body, "2024 tab shows lair XP and legendary uses")

    # closing the stat block clears it from the link
    page.locator("#closeDlg").click()
    page.wait_for_timeout(200)
    check(not page.locator("#detail").evaluate("d => d.open"), "the close button closes the stat block")
    check("m=" not in page.url, f"closing removes ?m= from the link ({page.url})")

    # stars are saved and "Starred only" shows just them
    page.locator('#list [data-fav="adult-red-dragon"]').click()
    page.wait_for_timeout(100)
    check(page.evaluate("JSON.parse(localStorage.getItem('mon.favs')||'{}')['adult-red-dragon'] === true"), "a star is saved in localStorage")
    page.locator("#favOnly").check()
    page.wait_for_timeout(200)
    check(page.locator("#list .card").count() == 1, "Starred only shows the one starred creature")
    page.evaluate("localStorage.removeItem('mon.favs')")

    # XP by CR stays in the data for an encounter builder
    xp = page.evaluate("fetch('data/monsters.json').then(r => r.json()).then(d => d.xpByCr)")
    check(isinstance(xp, dict) and xp.get("1/4") == 50 and xp.get("30") == 155000, "data keeps XP by CR")

    # encounter builder: add two creatures, set the party, check the XP and the difficulty in both editions
    page.evaluate("localStorage.removeItem('dnd.encounter'); localStorage.removeItem('dnd.party')")
    load(page, base + "?ed=2024")
    page.locator('#list [data-add="troll"]').click()
    page.locator('#list [data-add="ogre"]').click()
    page.wait_for_timeout(100)
    check(page.locator("#encounter").evaluate("d => d.open"), "adding a creature opens the encounter builder")
    check(page.locator("#encList li").count() == 2, "the encounter lists the two creatures")
    page.locator('[data-enc-g="n"]').fill("4"); page.locator('[data-enc-g="n"]').dispatch_event("change")
    page.locator('[data-enc-g="lvl"]').fill("5"); page.locator('[data-enc-g="lvl"]').dispatch_event("change")
    page.wait_for_timeout(100)
    check(page.locator("#encTotal").inner_text() == "2,250", f"Troll + Ogre is 2,250 XP (got {page.locator('#encTotal').inner_text()!r})")
    verdict = page.locator("#encVerdict").inner_text()
    check(verdict.startswith("Moderate for 4 level-5 characters"), f"2024: Moderate for 4 level-5 characters ({verdict!r})")
    page.locator('[data-ed="2014"]').click()
    page.wait_for_timeout(150)
    verdict = page.locator("#encVerdict").inner_text()
    check(page.locator("#encAdj").inner_text() == "3,375" and verdict.startswith("Hard for 4 level-5"),
          f"2014: x1.5 for two creatures gives 3,375 adjusted XP, Hard ({verdict!r})")
    page.locator('[data-enc="inc"][data-id="ogre"]').click()
    page.wait_for_timeout(100)
    check(page.locator("#encTotal").inner_text() == "2,700", "the + button adds a second ogre")
    saved = page.evaluate("JSON.parse(localStorage.getItem('dnd.encounter')).list")
    check(saved == [{"id": "troll", "n": 1}, {"id": "ogre", "n": 2}], f"the encounter is saved in dnd.encounter ({saved})")
    link = page.evaluate("MonEncounter.link()")
    check("#encounter&c=troll:1,ogre:2&p=4x5" in link, f"the encounter link carries creatures and party ({link})")

    # the link opens it in a fresh browser; the stat block adds to it too
    page.evaluate("localStorage.removeItem('dnd.encounter')")
    load(page, link)
    page.wait_for_timeout(200)
    check(page.locator("#encList li").count() == 2 and page.locator("#encTotal").inner_text() == "2,700", "an encounter link loads the encounter")
    check(not page.locator("#encNote").inner_text().strip(), "an empty encounter takes the link without asking")
    page.locator('#list .card[data-id="goblin"] .card-open').click()
    page.wait_for_selector("#detail[open]", timeout=5000)
    check(page.locator("#dBody .dsb").count() == 1, "the stat block is drawn by the shared statblock.js")
    page.locator("#dBody [data-add]").click()
    page.locator("#closeDlg").click()
    page.wait_for_timeout(100)
    check(page.locator("#encList li").count() == 3, "Add to encounter in the stat block adds the creature")
    page.locator("#encClear").click()
    check(page.locator("#encList li").count() == 0, "Clear empties the encounter")
    page.locator('[data-enc="undo"]').click()
    check(page.locator("#encList li").count() == 3, "Undo brings it back")
    page.evaluate("localStorage.removeItem('dnd.encounter')")

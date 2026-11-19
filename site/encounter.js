/* Monster Lookup: encounter builder (#encounter). Vanilla JS, no build step.
 * Reads creatures through window.MonLookup (app.js) and draws stat blocks with the shared DndStatblock.
 * Saved in localStorage 'dnd.encounter' = { v: 1, list: [{ id, n }], party: { mode: 'party'|'manual', groups: [{ n, lvl }] }, lair: bool }.
 * The party defaults to the hub's Party page ('dnd.party' = { v: 1, ids: [...] }, levels as the hub's party.js levelOf).
 * Share link: ?ed=<ed>#encounter&c=<id>:<n>,...&p=<n>x<lvl>+...&l=1
 *
 * Difficulty numbers are facts from the Dungeon Master's Guides (no rules text copied):
 *   2024 DMG, "XP Budget per Character" (Low / Moderate / High)
 *   2014 DMG chapter 3, "XP Thresholds by Character Level" (Easy / Medium / Hard / Deadly) and "Encounter Multipliers"
 */
(function () {
  'use strict';
  var M = window.MonLookup; if (!M) return;
  var KEY = 'dnd.encounter', PARTY = 'dnd.party', PLANNER = 'dnd-multiclass-planner';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function (n) { return Number(n).toLocaleString('en-US'); };
  var int = function (v, lo, hi) { v = Math.round(Number(v)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null; };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };

  // per character, levels 1-20
  var B2024 = [[50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100], [600, 1000, 1400], [750, 1300, 1700],
    [1000, 1700, 2100], [1300, 2000, 2600], [1600, 2300, 3100], [1900, 2900, 4100], [2200, 3700, 4700], [2600, 4200, 5400], [2900, 4900, 6200],
    [3300, 5400, 7800], [3800, 6100, 9800], [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000]];
  var T2014 = [[25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100], [300, 600, 900, 1400],
    [350, 750, 1100, 1700], [450, 900, 1400, 2100], [550, 1100, 1600, 2400], [600, 1200, 1900, 2800], [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500],
    [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400], [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800],
    [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700]];
  var NAMES = { '2024': ['Low', 'Moderate', 'High'], '2014': ['Easy', 'Medium', 'Hard', 'Deadly'] };
  var MULTS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
  function multIndex(monsters, chars) {   // 2014 DMG: 1, 2, 3-6, 7-10, 11-14, 15+; one step up for 1-2 characters, down for 6+
    var i = monsters <= 1 ? 1 : monsters === 2 ? 2 : monsters <= 6 ? 3 : monsters <= 10 ? 4 : monsters <= 14 ? 5 : 6;
    if (chars > 0 && chars < 3) i++; else if (chars >= 6) i--;
    return Math.max(0, Math.min(MULTS.length - 1, i));
  }

  /* ---------- state ---------- */
  function clean(e) {
    e = e && typeof e === 'object' ? e : {};
    var list = (Array.isArray(e.list) ? e.list : []).filter(function (x) { return x && typeof x.id === 'string'; })
      .map(function (x) { return { id: x.id.slice(0, 80), n: int(x.n, 1, 99) || 1 }; });
    var p = e.party && typeof e.party === 'object' ? e.party : {};
    var groups = (Array.isArray(p.groups) ? p.groups : []).map(function (g) { return { n: int(g && g.n, 1, 12) || 1, lvl: int(g && g.lvl, 1, 20) || 1 }; }).slice(0, 8);
    if (!groups.length) groups = [{ n: 4, lvl: 3 }];
    return { v: 1, list: list, party: { mode: p.mode === 'manual' ? 'manual' : 'party', groups: groups }, lair: !!e.lair };
  }
  var enc = clean(store.get(KEY, null)), undo = null, incoming = null;
  function save() { store.set(KEY, enc); var io = document.getElementById('encInitOut'); if (io) io.innerHTML = ''; }

  /* ---------- the hub's party ---------- */
  function hubParty() {
    var C = window.DndChar, d = store.get(PARTY, null);
    if (!C || !d || !Array.isArray(d.ids)) return [];
    return d.ids.map(function (id) { return typeof id === 'string' ? C.get(id) : null; }).filter(Boolean);
  }
  function levelOf(ch) {   // as the hub's party.js: the planner's current level, else the shared record, else the planned build
    var P = ch.sheet && ch.sheet[PLANNER], now = P && P.now && typeof P.now === 'object' ? int(P.now.lvl, 1, 20) : null;
    return now || (window.DndChar && DndChar.level(ch)) || (P && int(P.lvl, 1, 20)) || 1;
  }
  function partyLevels() {   // -> { levels: [..], from: 'party'|'manual', chars: [...] }
    var chars = hubParty();
    if (enc.party.mode === 'party' && chars.length) return { levels: chars.map(levelOf), from: 'party', chars: chars };
    var L = []; enc.party.groups.forEach(function (g) { for (var i = 0; i < g.n; i++) L.push(g.lvl); });
    return { levels: L, from: 'manual', chars: chars };
  }
  function partyText(levels) {
    var cnt = {}; levels.forEach(function (l) { cnt[l] = (cnt[l] || 0) + 1; });
    var ks = Object.keys(cnt).map(Number).sort(function (a, b) { return b - a; });
    if (ks.length === 1) return levels.length + ' level-' + ks[0] + ' character' + (levels.length === 1 ? '' : 's');
    return levels.length + ' characters (' + ks.map(function (k) { return cnt[k] + ' at level ' + k; }).join(', ') + ')';
  }

  /* ---------- maths ---------- */
  function rows() {
    var ed = M.ed();
    return enc.list.map(function (x) {
      var m = M.get(x.id, ed) || M.any(x.id);
      return m ? { id: x.id, n: x.n, m: m, ed: M.get(x.id, ed) ? ed : (ed === '2014' ? '2024' : '2014') } : null;
    }).filter(Boolean);
  }
  function compute() {
    var ed = M.ed(), R = rows(), P = partyLevels(), lairOn = ed === '2024' && enc.lair;
    var total = 0, count = 0;
    R.forEach(function (r) { var xp = lairOn && r.m.xpLair ? r.m.xpLair : (r.m.xp || 0); r.xpEach = xp; total += xp * r.n; count += r.n; });
    var table = ed === '2024' ? B2024 : T2014, th = NAMES[ed].map(function (_, i) { return P.levels.reduce(function (s, l) { return s + table[l - 1][i]; }, 0); });
    var mult = ed === '2014' && count ? MULTS[multIndex(count, P.levels.length)] : 1;
    var eff = Math.round(total * mult), label = '';
    if (count && P.levels.length) {
      if (ed === '2024') label = eff <= th[0] ? 'Low' : eff <= th[1] ? 'Moderate' : eff <= th[2] ? 'High' : 'Above High';
      else label = eff < th[0] ? 'Trivial' : eff < th[1] ? 'Easy' : eff < th[2] ? 'Medium' : eff < th[3] ? 'Hard' : 'Deadly';
    }
    return { ed: ed, rows: R, party: P, total: total, count: count, mult: mult, eff: eff, th: th, label: label, lairOn: lairOn,
      anyLair: ed === '2024' && R.some(function (r) { return r.m.xpLair; }) };
  }
  function sentence(c) {
    if (!c.count) return 'Add creatures with the + on a card, or "Add to encounter" in a stat block.';
    if (!c.party.levels.length) return 'Set the party to see the difficulty.';
    var who = partyText(c.party.levels);
    return 'for ' + who + '.' + (c.label === 'Above High' ? ' That is more XP than the High budget.' : c.label === 'Trivial' ? ' That is under the Easy threshold.' : '');
  }

  /* ---------- link ---------- */
  function shareLink(c) {
    var u = new URL(location.href);
    ['q', 'crmin', 'crmax', 't', 'sz', 'al', 'def', 'mv', 'lg', 'fav', 'sort', 'm'].forEach(function (k) { u.searchParams.delete(k); });
    u.searchParams.set('ed', c.ed);
    var cnt = {}; c.party.levels.forEach(function (l) { cnt[l] = (cnt[l] || 0) + 1; });
    var p = Object.keys(cnt).map(function (l) { return cnt[l] + 'x' + l; }).join('+');
    u.hash = 'encounter&c=' + enc.list.map(function (x) { return x.id + ':' + x.n; }).join(',') + (p ? '&p=' + p : '') + (c.lairOn ? '&l=1' : '');
    return u.href;
  }
  function parseHash() {
    var h = location.hash.replace(/^#/, '').split('&');
    if (h[0] !== 'encounter') return null;
    var o = {}; h.slice(1).forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    if (!o.c) return { open: true };
    var list = o.c.split(',').map(function (s) { var a = s.split(':'); return { id: a[0], n: a[1] }; });
    var groups = (o.p || '').split('+').map(function (s) { var a = s.split('x'); return { n: a[0], lvl: a[1] }; }).filter(function (g) { return g.n && g.lvl; });
    return { open: true, enc: clean({ list: list, party: { mode: groups.length ? 'manual' : enc.party.mode, groups: groups.length ? groups : enc.party.groups }, lair: o.l === '1' }) };
  }
  function sameList(a, b) { return JSON.stringify(a.list) === JSON.stringify(b.list); }

  /* ---------- render ---------- */
  function meter(name, xp, limit, reached) {
    var pct = limit ? Math.min(100, Math.round(xp / limit * 100)) : 0;
    return '<div class="enc-meter' + (reached ? ' reached' : '') + '"><span class="enc-mname">' + name + '</span>' +
      '<span class="enc-track" role="img" aria-label="' + name + ': ' + num(xp) + ' of ' + num(limit) + ' XP"><span style="width:' + pct + '%"></span></span>' +
      '<span class="enc-mval">' + num(limit) + ' XP' + (reached ? ' <b>passed</b>' : '') + '</span></div>';
  }
  function render() {
    var box = $('#encounter'); if (!box || !M.ready()) return;
    var c = compute(), ed = c.ed;
    $('#encSum').textContent = c.count ? c.count + ' creature' + (c.count === 1 ? '' : 's') + ' · ' + (c.label || num(c.total) + ' XP') : '';
    // notice (link or undo)
    var nt = '';
    if (incoming) nt = '<div class="enc-note" role="status">This link has an encounter: ' + esc(incoming.list.map(function (x) { var m = M.any(x.id); return (m ? m.name : x.id) + (x.n > 1 ? ' ×' + x.n : ''); }).join(', ')) +
      '. <button type="button" class="btn" data-enc="take">Load it</button> <button type="button" class="btn" data-enc="keep">Keep mine</button></div>';
    else if (undo) nt = '<div class="enc-note" role="status">Encounter cleared. <button type="button" class="btn" data-enc="undo">Undo</button></div>';
    $('#encNote').innerHTML = nt;
    // creatures
    $('#encList').innerHTML = c.rows.map(function (r) {
      return '<li data-row="' + esc(r.id) + '"><button type="button" class="enc-name" data-enc-open="' + esc(r.id) + '">' + esc(r.m.name) + '</button>' +
        '<span class="enc-meta">CR ' + esc(r.m.crText) + ' · ' + num(r.xpEach) + ' XP' + (r.ed !== ed ? ' · ' + r.ed + ' only' : '') + '</span>' +
        '<span class="enc-n"><button type="button" class="btn" data-enc="dec" data-id="' + esc(r.id) + '" aria-label="One fewer ' + esc(r.m.name) + '">−</button>' +
        '<input type="number" min="1" max="99" value="' + r.n + '" data-enc-n="' + esc(r.id) + '" aria-label="How many ' + esc(r.m.name) + '">' +
        '<button type="button" class="btn" data-enc="inc" data-id="' + esc(r.id) + '" aria-label="One more ' + esc(r.m.name) + '">+</button></span>' +
        '<span class="enc-sub">' + num(r.xpEach * r.n) + ' XP</span>' +
        '<button type="button" class="icon-btn enc-x" data-enc="del" data-id="' + esc(r.id) + '" aria-label="Remove ' + esc(r.m.name) + '">×</button></li>';
    }).join('');
    $('#encEmpty').hidden = c.rows.length > 0;
    // party
    var P = c.party, hp = P.chars, h = '';
    if (hp.length) {
      h += '<div class="seg enc-pmode" role="radiogroup" aria-label="Party"><button type="button" role="radio" data-enc="pparty" aria-checked="' + (P.from === 'party') + '">Party page</button>' +
        '<button type="button" role="radio" data-enc="pmanual" aria-checked="' + (P.from === 'manual') + '">Set by hand</button></div>';
    }
    if (P.from === 'party') {
      h += '<ul class="enc-chars">' + hp.map(function (ch) { return '<li>' + esc(ch.name || 'Unnamed') + ' <span class="muted">level ' + levelOf(ch) + '</span></li>'; }).join('') + '</ul>' +
        '<p class="small muted">From the toolbox\'s <a href="https://wernercd.github.io/dnd/party.html">Party page</a>.</p>';
    } else {
      h += enc.party.groups.map(function (g, i) {
        return '<div class="enc-group"><input type="number" min="1" max="12" value="' + g.n + '" data-enc-g="n" data-i="' + i + '" aria-label="Characters in group ' + (i + 1) + '">' +
          '<span>character' + (g.n === 1 ? '' : 's') + ' at level</span><input type="number" min="1" max="20" value="' + g.lvl + '" data-enc-g="lvl" data-i="' + i + '" aria-label="Level of group ' + (i + 1) + '">' +
          (enc.party.groups.length > 1 ? '<button type="button" class="icon-btn enc-x" data-enc="gdel" data-i="' + i + '" aria-label="Remove group ' + (i + 1) + '">×</button>' : '') + '</div>';
      }).join('') + '<button type="button" class="chip" data-enc="gadd">+ Characters at another level</button>' +
        (hp.length ? '' : '<p class="small muted">Or add characters on the toolbox\'s <a href="https://wernercd.github.io/dnd/party.html">Party page</a> to fill this in.</p>');
    }
    $('#encParty').innerHTML = h;
    // result
    var r = '<p class="enc-verdict" id="encVerdict">' + (c.label ? '<b class="enc-label" data-level="' + esc(c.label) + '">' + esc(c.label) + '</b> ' : '') + esc(sentence(c)) + '</p>';
    if (c.count) {
      r += '<dl class="enc-nums"><div><dt>Total XP</dt><dd id="encTotal">' + num(c.total) + '</dd></div>' +
        (ed === '2014' ? '<div><dt>Multiplier</dt><dd>×' + c.mult + ' <span class="small muted">(' + c.count + ' creature' + (c.count === 1 ? '' : 's') + ', ' + P.levels.length + ' character' + (P.levels.length === 1 ? '' : 's') + ')</span></dd></div>' +
          '<div><dt>Adjusted XP</dt><dd id="encAdj">' + num(c.eff) + '</dd></div>' : '') +
        (P.levels.length ? '<div><dt>XP per character</dt><dd>' + num(Math.round(c.total / P.levels.length)) + '</dd></div>' : '') + '</dl>';
    }
    if (P.levels.length) {
      r += '<div class="enc-meters" aria-label="' + (ed === '2024' ? 'XP budgets' : 'XP thresholds') + '">' + NAMES[ed].map(function (n, i) {
        return meter(n, c.eff, c.th[i], ed === '2024' ? c.eff > c.th[i] : c.eff >= c.th[i]);
      }).join('') + '</div>';
      r += '<p class="small muted">' + (ed === '2024'
        ? 'Budgets for the party from the 2024 Dungeon Master\'s Guide (XP Budget per Character). An encounter is Low, Moderate or High while its XP stays within that budget.'
        : 'Thresholds for the party from the 2014 Dungeon Master\'s Guide, chapter 3 (XP Thresholds by Character Level and Encounter Multipliers). The multiplier counts every creature in the encounter.') + '</p>';
    }
    $('#encResult').innerHTML = r;
    $('#encLairWrap').hidden = !c.anyLair;
    $('#encLair').checked = enc.lair;
    ['encCopy', 'encPrint', 'encClear', 'encInit'].forEach(function (id) { $('#' + id).disabled = !c.count; });
  }

  /* ---------- actions ---------- */
  function add(id) {
    var x = enc.list.filter(function (e) { return e.id === id; })[0];
    if (x) x.n = Math.min(99, x.n + 1); else enc.list.push({ id: id, n: 1 });
    undo = null; save(); render();
    var m = M.any(id), box = $('#encounter');
    if (!box.open) box.open = true;
    toast((m ? m.name : 'Creature') + ' added to the encounter');
  }
  var tTimer = null;
  function toast(text) {
    var t = $('#encToast'); t.textContent = text; t.hidden = false;
    if (window.DndUI) DndUI.pop(t);
    clearTimeout(tTimer); tTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }
  function setN(id, n) {
    enc.list.forEach(function (x) { if (x.id === id) x.n = Math.max(1, Math.min(99, n)); });
    save(); render();
  }
  function initMod(m) { return m.init != null ? m.init : (m.ab ? Math.floor((m.ab[1] - 10) / 2) : 0); }
  function rollInit() {   // one roll per creature group, highest first (DndDice shows each roll and logs it)
    if (!window.DndDice) return;
    var out = rows().map(function (r) {
      var k = initMod(r.m), expr = '1d20' + (k ? (k > 0 ? '+' : '') + k : ''), res = DndDice.roll(expr, r.m.name + (r.n > 1 ? ' ×' + r.n : '') + ' initiative');
      return { name: r.m.name, n: r.n, total: res ? res.total : null, expr: expr };
    }).sort(function (a, b) { return b.total - a.total; });
    $('#encInitOut').innerHTML = out.length ? '<h3>Initiative</h3><ol class="enc-init" id="encInitList">' + out.map(function (x) {
      return '<li><b>' + x.total + '</b> ' + esc(x.name) + (x.n > 1 ? ' ×' + x.n : '') + ' <span class="small muted">(' + esc(x.expr) + ')</span></li>';
    }).join('') + '</ol><p class="small muted">One roll per kind of creature, highest first. Add the characters\' rolls at the table.</p>' : '';
  }
  function printIt() {
    var c = compute(), out = '<h2>Encounter: ' + esc(c.label ? c.label + ' for ' + partyText(c.party.levels) : num(c.total) + ' XP') + '</h2>' +
      '<p>' + c.rows.map(function (r) { return esc(r.m.name) + ' ×' + r.n; }).join(', ') + ' · total ' + num(c.total) + ' XP' + (c.ed === '2014' ? ', adjusted ' + num(c.eff) + ' XP' : '') + '</p>';
    c.rows.forEach(function (r) { out += '<div class="enc-psb">' + (r.n > 1 ? '<p class="small">×' + r.n + '</p>' : '') + M.statblock(r.m, r.ed, true) + '</div>'; });
    var p = $('#encPrintOut'); p.innerHTML = out; p.hidden = false;
    document.body.classList.add('print-enc');
    var done = function () { document.body.classList.remove('print-enc'); p.hidden = true; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1000);
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.add) {
      ev.stopPropagation(); add(t.dataset.add);
      if (t.closest('dialog')) { var n = enc.list.filter(function (x) { return x.id === t.dataset.add; })[0]; t.textContent = 'Added (' + (n ? n.n : 1) + ' in the encounter)'; if (window.DndUI) DndUI.pop(t); }
      return;
    }
    if (t.dataset.encOpen) return M.open(t.dataset.encOpen);
    var a = t.dataset.enc; if (!a) {
      if (t.id === 'encCopy') return copy(t);
      if (t.id === 'encPrint') return printIt();
      if (t.id === 'encInit') return rollInit();
      if (t.id === 'encClear') { undo = JSON.parse(JSON.stringify(enc.list)); enc.list = []; save(); return render(); }
      return;
    }
    var id = t.dataset.id, i = +t.dataset.i;
    var cur = enc.list.filter(function (x) { return x.id === id; })[0];
    if (a === 'inc' && cur) setN(id, cur.n + 1);
    else if (a === 'dec' && cur) { if (cur.n > 1) setN(id, cur.n - 1); else { enc.list = enc.list.filter(function (x) { return x.id !== id; }); save(); render(); } }
    else if (a === 'del') { enc.list = enc.list.filter(function (x) { return x.id !== id; }); save(); render(); var f = $('#encList button'); if (f) f.focus(); }
    else if (a === 'undo') { enc.list = undo || []; undo = null; save(); render(); }
    else if (a === 'take') { enc = incoming; incoming = null; save(); history.replaceState(null, '', location.pathname + location.search + '#encounter'); render(); }
    else if (a === 'keep') { incoming = null; history.replaceState(null, '', location.pathname + location.search + '#encounter'); render(); }
    else if (a === 'pparty') { enc.party.mode = 'party'; save(); render(); }
    else if (a === 'pmanual') { enc.party.mode = 'manual'; save(); render(); }
    else if (a === 'gadd') { enc.party.groups.push({ n: 1, lvl: enc.party.groups[enc.party.groups.length - 1].lvl }); save(); render(); }
    else if (a === 'gdel') { enc.party.groups.splice(i, 1); save(); render(); }
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.dataset.encN) return setN(t.dataset.encN, int(t.value, 1, 99) || 1);
    if (t.dataset.encG) {
      var g = enc.party.groups[+t.dataset.i]; if (!g) return;
      g[t.dataset.encG] = t.dataset.encG === 'n' ? int(t.value, 1, 12) || 1 : int(t.value, 1, 20) || 1;
      save(); render();
      var el = document.querySelector('[data-enc-g="' + t.dataset.encG + '"][data-i="' + t.dataset.i + '"]'); if (el) el.focus();
    }
    if (t.id === 'encLair') { enc.lair = t.checked; save(); render(); }
  });
  function copy(btn) {
    var link = shareLink(compute()), label = btn.textContent;
    var done = function () { btn.textContent = 'Link copied'; if (window.DndUI) DndUI.pop(btn); setTimeout(function () { btn.textContent = label; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { prompt('Copy this link:', link); });
    else prompt('Copy this link:', link);
  }
  window.addEventListener('storage', function (ev) {
    if (ev.key === KEY) { enc = clean(store.get(KEY, null)); render(); }
    else if (ev.key === PARTY || ev.key === 'dnd.characters') render();
  });
  if (window.DndChar && DndChar.onChange) DndChar.onChange(function () { render(); });

  function fromHash() {
    var h = parseHash(); if (!h) return;
    if (h.enc) {
      if (!enc.list.length || sameList(enc, h.enc)) { enc = h.enc; save(); history.replaceState(null, '', location.pathname + location.search + '#encounter'); }
      else incoming = h.enc;
    }
    var box = $('#encounter'); box.open = true;
    setTimeout(function () { box.scrollIntoView({ block: 'start' }); }, 0);
  }
  var started = false;
  document.addEventListener('mon:render', function () {
    if (!started) { started = true; fromHash(); }
    render();
  });
  window.addEventListener('hashchange', function () { fromHash(); render(); });
  if (enc.list.length) $('#encounter').open = true;
  window.MonEncounter = { add: add, compute: compute, link: function () { return shareLink(compute()); } };
})();

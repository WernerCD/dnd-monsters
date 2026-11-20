/* Monster Lookup: initiative tracker for the encounter builder. Vanilla JS, no build step.
 * Runs a fight from the encounter (window.MonEncounter) plus the shared characters (DndChar.all()).
 * Saved in localStorage 'dnd.encounter.fight' = { v: 1, round, cur: key, seq, list: [
 *   { k, kind: 'mon'|'pc', ref, ed, name, init, seq, hp, max, ac, conds: [..], dead } ] }
 * Character names stay in this browser: nothing here is sent anywhere.
 */
(function () {
  'use strict';
  var E = window.MonEncounter; if (!E) return;
  var KEY = 'dnd.encounter.fight', PARTY = 'dnd.party', PLANNER = 'dnd-multiclass-planner';
  var CONDS = ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
  var RULES = 'https://wernercd.github.io/dnd-rules/#';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var int = function (v, lo, hi) { if (v === '' || v == null) return null; v = Math.round(Number(v)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null; };
  var sg = function (n) { return (n >= 0 ? '+' : '−') + Math.abs(n); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };

  function clean(f) {
    if (!f || typeof f !== 'object' || !Array.isArray(f.list)) return null;
    var list = f.list.filter(function (x) { return x && typeof x.k === 'string' && typeof x.name === 'string'; }).map(function (x) {
      return { k: x.k, kind: x.kind === 'pc' ? 'pc' : 'mon', ref: String(x.ref || ''), ed: x.ed === '2014' ? '2014' : '2024', name: x.name.slice(0, 80),
        init: int(x.init, -20, 60), seq: int(x.seq, 0, 1e6) || 0, hp: int(x.hp, 0, 99999), max: int(x.max, 1, 99999), ac: int(x.ac, 0, 50),
        conds: (Array.isArray(x.conds) ? x.conds : []).filter(function (c) { return CONDS.indexOf(c) >= 0; }), dead: !!x.dead };
    });
    return { v: 1, round: int(f.round, 1, 9999) || 1, cur: typeof f.cur === 'string' ? f.cur : null, seq: int(f.seq, 0, 1e6) || list.length, list: list };
  }
  var fight = clean(store.get(KEY, null)), partyOpen = false;
  function save() { store.set(KEY, fight); }

  /* ---------- turn order ---------- */
  function order() {
    return fight.list.slice().sort(function (a, b) {
      var ai = a.init == null ? -999 : a.init, bi = b.init == null ? -999 : b.init;
      return bi - ai || a.seq - b.seq;   // ties keep the order they were added in
    });
  }
  function alive(x) { return !x.dead; }
  function step(dir) {
    var ord = order(); if (!ord.some(alive)) return;
    var i = ord.findIndex(function (x) { return x.k === fight.cur; });
    if (i < 0) { fight.cur = ord.filter(alive)[0].k; return save(); }
    for (var n = 0; n < ord.length; n++) {
      i += dir;
      if (i >= ord.length) { i = 0; fight.round++; }
      if (i < 0) { i = ord.length - 1; fight.round = Math.max(1, fight.round - 1); }
      if (alive(ord[i])) { fight.cur = ord[i].k; break; }
    }
    save();
  }
  function rollInit(mod, label) {
    var expr = '1d20' + (mod ? (mod > 0 ? '+' : '') + mod : '');
    if (window.DndDice) { var r = DndDice.roll(expr, label); if (r) return r.total; }
    return Math.floor(Math.random() * 20) + 1 + (mod || 0);
  }
  function initMod(m) { return m.init != null ? m.init : (Array.isArray(m.ab) ? Math.floor((m.ab[1] - 10) / 2) : 0); }

  /* ---------- adding combatants ---------- */
  function counts() { var c = {}; (fight ? fight.list : []).forEach(function (x) { if (x.kind === 'mon') c[x.ref] = (c[x.ref] || 0) + 1; }); return c; }
  function addMonsters() {   // every copy in the encounter that isn't in the fight yet; one initiative roll per kind
    if (!fight) fight = { v: 1, round: 1, cur: null, seq: 0, list: [] };
    var have = counts(), added = 0;
    E.rows().forEach(function (r) {
      var need = r.n - (have[r.id] || 0); if (need <= 0) return;
      var init = rollInit(initMod(r.m), r.m.name + (r.n > 1 ? ' ×' + r.n : '') + ' initiative');
      for (var i = (have[r.id] || 0) + 1; i <= r.n; i++) {
        fight.list.push({ k: 'f' + (++fight.seq), kind: 'mon', ref: r.id, ed: r.ed, name: r.m.name + (r.n > 1 ? ' ' + i : ''), init: init, seq: fight.seq,
          hp: r.m.hp != null ? r.m.hp : null, max: r.m.hp != null ? r.m.hp : null, ac: r.m.ac != null ? r.m.ac : null, conds: [], dead: false });
        added++;
      }
    });
    if (!fight.cur && fight.list.length) fight.cur = order().filter(alive)[0].k;
    save();
    return added;
  }
  function chars() { return window.DndChar && DndChar.all ? DndChar.all() : []; }
  function partyIds() { var d = store.get(PARTY, null); return d && Array.isArray(d.ids) ? d.ids : []; }
  function sheet(ch, repo) { var s = ch && ch.sheet && ch.sheet[repo]; return s && typeof s === 'object' ? s : null; }
  function charDex(ch) { var P = sheet(ch, PLANNER), ab = P && Array.isArray(P.ab) && P.ab.length === 6 ? P.ab : ch.ab; return Math.floor(((int(ab && ab[1], 1, 30) || 10) - 10) / 2); }
  function charHp(ch) {   // the sheet's maximum if a tool has published one, else unknown
    var P = sheet(ch, PLANNER), N = P && P.now && typeof P.now === 'object' ? P.now : null, IM = sheet(ch, 'import');
    return int(N && N.hp, 1, 999) || int(IM && IM.hp, 1, 999) || int(P && P.hp, 1, 999) || null;
  }
  function charAc(ch) { var s = ch.sheet || {}; for (var r in s) { var v = s[r] && int(s[r].ac, 1, 40); if (v) return v; } return null; }
  function addParty() {
    if (!fight) fight = { v: 1, round: 1, cur: null, seq: 0, list: [] };
    var inFight = fight.list.filter(function (x) { return x.kind === 'pc'; }).map(function (x) { return x.ref; });
    document.querySelectorAll('#fxPartyList [data-pc]').forEach(function (row) {
      var id = row.dataset.pc, ch = DndChar.get(id); if (!ch || inFight.indexOf(id) >= 0 || !row.querySelector('input[type=checkbox]').checked) return;
      var typed = int(row.querySelector('[data-pc-init]').value, -20, 60);
      var hp = charHp(ch);
      fight.list.push({ k: 'f' + (++fight.seq), kind: 'pc', ref: id, ed: '2024', name: ch.name || 'Character', init: typed != null ? typed : rollInit(charDex(ch), (ch.name || 'Character') + ' initiative'),
        seq: fight.seq, hp: hp, max: hp, ac: charAc(ch), conds: [], dead: false });
    });
    if (!fight.cur && fight.list.length) fight.cur = order().filter(alive)[0].k;
    partyOpen = false; save(); render();
  }

  /* ---------- render ---------- */
  function focusKey() {
    var a = document.activeElement; if (!a || !a.closest || !a.closest('#fight')) return null;
    var attrs = ['data-fx-init', 'data-fx-hp', 'data-fx-amt', 'data-fx-cond', 'data-fx-dead'];
    for (var i = 0; i < attrs.length; i++) if (a.hasAttribute(attrs[i])) return '[' + attrs[i] + '="' + a.getAttribute(attrs[i]) + '"]';
    if (a.dataset.fx) return '[data-fx="' + a.dataset.fx + '"]' + (a.dataset.k ? '[data-k="' + a.dataset.k + '"]' : '');
    return null;
  }
  function row(x) {
    var cur = x.k === fight.cur, k = esc(x.k);
    return '<li class="fx' + (cur ? ' cur' : '') + (x.dead ? ' dead' : '') + (x.kind === 'pc' ? ' pc' : '') + '" data-fx-row="' + k + '"' + (cur ? ' aria-current="true"' : '') + '>' +
      '<div class="fx-top">' +
        '<input type="number" class="fx-init" value="' + (x.init == null ? '' : x.init) + '" data-fx-init="' + k + '" aria-label="Initiative for ' + esc(x.name) + '">' +
        '<span class="fx-name">' + (cur ? '<b class="fx-now">Turn</b> ' : '') + (x.kind === 'mon' && !/^cu-/.test(x.ref) ? '<button type="button" class="fx-open" data-fx="open" data-k="' + k + '">' + esc(x.name) + '</button>' : esc(x.name)) +
          (x.kind === 'pc' ? ' <span class="small muted">character</span>' : '') + (x.dead ? ' <span class="fx-tag">Defeated</span>' : '') + '</span>' +
        (x.ac != null ? '<span class="fx-ac">AC ' + x.ac + '</span>' : '') +
        '<button type="button" class="icon-btn enc-x" data-fx="del" data-k="' + k + '" aria-label="Take ' + esc(x.name) + ' out of the fight">×</button>' +
      '</div>' +
      '<div class="fx-mid">' +
        '<label class="fx-hp">HP <input type="number" min="0" value="' + (x.hp == null ? '' : x.hp) + '" data-fx-hp="' + k + '" aria-label="Current hit points of ' + esc(x.name) + '">' + (x.max != null ? '<span class="muted">/ ' + x.max + '</span>' : '') + '</label>' +
        '<span class="fx-dmg"><input type="number" min="0" placeholder="0" data-fx-amt="' + k + '" aria-label="Damage or healing for ' + esc(x.name) + '">' +
        '<button type="button" class="btn" data-fx="dmg" data-k="' + k + '">Damage</button><button type="button" class="btn" data-fx="heal" data-k="' + k + '">Heal</button></span>' +
        '<label class="fx-deadlbl"><input type="checkbox" data-fx-dead="' + k + '"' + (x.dead ? ' checked' : '') + '> Defeated</label>' +
      '</div>' +
      '<div class="fx-conds">' + x.conds.map(function (c) {
        return '<span class="fx-chip"><a href="' + RULES + c + '" target="_blank" rel="noopener" title="' + esc(c) + ' in the Rules Reference">' + c.charAt(0).toUpperCase() + c.slice(1) + '</a>' +
          '<button type="button" data-fx="uncond" data-k="' + k + '" data-c="' + c + '" aria-label="Remove ' + c + ' from ' + esc(x.name) + '">×</button></span>';
      }).join('') +
        '<select data-fx-cond="' + k + '" aria-label="Add a condition to ' + esc(x.name) + '"><option value="">+ Condition</option>' +
        CONDS.filter(function (c) { return x.conds.indexOf(c) < 0; }).map(function (c) { return '<option value="' + c + '">' + c.charAt(0).toUpperCase() + c.slice(1) + '</option>'; }).join('') + '</select>' +
      '</div></li>';
  }
  function partyPanel() {
    var cs = chars(), inFight = fight ? fight.list.filter(function (x) { return x.kind === 'pc'; }).map(function (x) { return x.ref; }) : [];
    if (!cs.length) return '<div class="fx-party"><p class="small">No characters in this browser yet. Make them in any toolbox tool (the Character picker at the top), or on the <a href="https://wernercd.github.io/dnd/party.html">Party page</a>.</p><button type="button" class="btn" data-fx="pclose">Close</button></div>';
    var pids = partyIds(), pre = function (ch) { return pids.length ? pids.indexOf(ch.id) >= 0 : true; };
    return '<div class="fx-party"><p class="small">Tick who is in the fight. Type each initiative, or leave it blank to roll it (d20 + Dex).</p><ul id="fxPartyList">' + cs.map(function (ch) {
      var d = charDex(ch), there = inFight.indexOf(ch.id) >= 0;
      return '<li data-pc="' + esc(ch.id) + '"><label><input type="checkbox"' + (pre(ch) && !there ? ' checked' : '') + (there ? ' disabled' : '') + '> ' + esc(ch.name || 'Character') + '</label>' +
        (there ? ' <span class="small muted">already in the fight</span>' : ' <input type="number" placeholder="' + sg(d) + '" data-pc-init aria-label="Initiative for ' + esc(ch.name || 'character') + '"> <span class="small muted">HP ' + (charHp(ch) || '?') + '</span>') + '</li>';
    }).join('') + '</ul><button type="button" class="btn" data-fx="padd">Add to the fight</button> <button type="button" class="btn" data-fx="pclose">Cancel</button></div>';
  }
  function render() {
    var box = $('#fight'); if (!box) return;
    var foc = focusKey(), c = E.compute(), html;
    if (!fight || !fight.list.length) {
      html = '<h3>Initiative tracker</h3><p class="small muted">Start a fight to roll initiative for every creature in the encounter (each copy gets its own hit points), then add the party and run the turns. The fight is saved in this browser.</p>' +
        '<div class="enc-actions"><button type="button" class="chip" id="fxStart" data-fx="start"' + (c.count ? '' : ' disabled') + '>Start fight</button></div>';
    } else {
      var ord = order(), cur = fight.list.filter(function (x) { return x.k === fight.cur; })[0], have = counts(), more = c.rows.some(function (r) { return r.n > (have[r.id] || 0); });
      html = '<h3>Initiative tracker</h3>' +
        '<p class="fx-round" id="fxRound" aria-live="polite"><b>Round ' + fight.round + '</b>' + (cur ? ' · ' + esc(cur.name) + '\'s turn' : '') + '</p>' +
        '<div class="enc-actions"><button type="button" class="chip" data-fx="prev">Previous</button><button type="button" class="chip fx-next" data-fx="next">Next turn</button>' +
        '<button type="button" class="chip" data-fx="party">Add the party</button>' + (more ? '<button type="button" class="chip" data-fx="more">Add new creatures</button>' : '') +
        '<button type="button" class="chip" data-fx="end">End fight</button></div>' +
        (partyOpen ? partyPanel() : '') +
        '<ol class="fx-list" id="fxList">' + ord.map(row).join('') + '</ol>';
    }
    box.innerHTML = html;
    if (foc) { var el = box.querySelector(foc); if (el) el.focus(); }
  }

  /* ---------- actions ---------- */
  function get(k) { return fight && fight.list.filter(function (x) { return x.k === k; })[0]; }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('#fight button'); if (!t) return;
    var a = t.dataset.fx, x = get(t.dataset.k);
    if (a === 'start' || a === 'more') { addMonsters(); }
    else if (a === 'next') step(1);
    else if (a === 'prev') step(-1);
    else if (a === 'party') partyOpen = !partyOpen;
    else if (a === 'pclose') partyOpen = false;
    else if (a === 'padd') return addParty();
    else if (a === 'end') { if (!confirm('End this fight? The turn order, hit points and conditions are cleared (the encounter stays).')) return; fight = null; partyOpen = false; save(); }
    else if (a === 'open' && x) { if (window.MonLookup) MonLookup.open(x.ref); return; }
    else if (a === 'del' && x) {
      if (fight.cur === x.k) step(1);
      fight.list = fight.list.filter(function (y) { return y.k !== x.k; });
      if (fight.cur === x.k) fight.cur = fight.list.length ? order().filter(alive).concat(order())[0].k : null;
      save();
    }
    else if ((a === 'dmg' || a === 'heal') && x) {
      var amt = int(document.querySelector('[data-fx-amt="' + x.k + '"]').value, 0, 99999); if (!amt) return;
      if (x.hp == null) x.hp = x.max;
      if (x.hp == null) return;
      if (a === 'dmg') { x.hp = Math.max(0, x.hp - amt); if (x.hp === 0 && x.kind !== 'pc') { x.dead = true; if (fight.cur === x.k) step(1); } }
      else { x.hp = x.max != null ? Math.min(x.max, x.hp + amt) : x.hp + amt; if (x.hp > 0 && x.kind !== 'pc') x.dead = false; }
      save();
    }
    else if (a === 'uncond' && x) { x.conds = x.conds.filter(function (c) { return c !== t.dataset.c; }); save(); }
    else return;
    render();
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target; if (!t.closest || !t.closest('#fight')) return;
    var k = t.dataset.fxInit || t.dataset.fxHp || t.dataset.fxCond || t.dataset.fxDead, x = get(k); if (!x) return;
    if (t.dataset.fxInit) x.init = int(t.value, -20, 60);
    else if (t.dataset.fxHp) { x.hp = int(t.value, 0, 99999); if (x.kind !== 'pc' && x.hp != null) x.dead = x.hp === 0; }
    else if (t.dataset.fxCond) { if (t.value && x.conds.indexOf(t.value) < 0) x.conds.push(t.value); }
    else if (t.dataset.fxDead) { x.dead = t.checked; if (x.dead && fight.cur === x.k) step(1); }
    save(); render();
  });
  document.addEventListener('keydown', function (ev) {   // Enter in the damage box deals the damage
    var t = ev.target; if (ev.key !== 'Enter' || !t.dataset || !t.dataset.fxAmt) return;
    ev.preventDefault(); var b = document.querySelector('[data-fx="dmg"][data-k="' + t.dataset.fxAmt + '"]'); if (b) b.click();
  });
  window.addEventListener('storage', function (ev) { if (ev.key === KEY) { fight = clean(store.get(KEY, null)); render(); } });
  document.addEventListener('enc:render', render);
  window.MonFight = { state: function () { return fight; }, order: order };
})();

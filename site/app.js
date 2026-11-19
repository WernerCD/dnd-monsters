/* Monster Lookup -- vanilla JS, no build step. */
(function () {
  'use strict';

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function (n) { return Number(n).toLocaleString('en-US'); };
  var crText = function (cr) { return cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr); };
  var cap = function (s) { return String(s).replace(/^./, function (c) { return c.toUpperCase(); }); };

  var SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
  var ALIGNS = [['U', 'Unaligned'], ['LG', 'Lawful good'], ['NG', 'Neutral good'], ['CG', 'Chaotic good'], ['LN', 'Lawful neutral'],
    ['NN', 'Neutral'], ['CN', 'Chaotic neutral'], ['LE', 'Lawful evil'], ['NE', 'Neutral evil'], ['CE', 'Chaotic evil']];
  var DAMAGE = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
  var CONDS = ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
  var MOVES = [['fly', 'Fly'], ['hover', 'Hover'], ['swim', 'Swim'], ['burrow', 'Burrow'], ['climb', 'Climb']];
  var LEGS = [['legendary', 'Legendary'], ['lair', 'Lair (2024)']];
  var DEF_GROUPS = [['dr', 'Resistant to'], ['di', 'Immune to'], ['dv', 'Vulnerable to'], ['ci', 'Condition immunity']];

  /* ---------- state (the link carries every filter) ---------- */
  var params = new URLSearchParams(location.search);
  var list = function (k) { var v = params.get(k); return v ? v.split(',').filter(Boolean) : []; };
  var state = {
    ed: params.get('ed') || store.get('mon.ed', '2024'),
    q: params.get('q') || '',
    crMin: params.get('crmin'), crMax: params.get('crmax'),
    type: list('t'), size: list('sz'), align: list('al'), def: list('def'), move: list('mv'), leg: list('lg'),
    favOnly: params.get('fav') === '1',
    sort: params.get('sort') || store.get('mon.sort', 'name'),
    open: params.get('m') || ''
  };
  if (['2014', '2024'].indexOf(state.ed) < 0) state.ed = '2024';
  if (['name', 'cr-asc', 'cr-desc', 'hp-desc', 'hp-asc'].indexOf(state.sort) < 0) state.sort = 'name';
  var favs = store.get('mon.favs', {});
  if (!favs || typeof favs !== 'object') favs = {};

  var DATA = null, BY_ID = {}, CRS = [];

  /* ---------- facets: each one tests a creature; counts come from all the other facets ---------- */
  function inter(a, b) { for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) >= 0) return true; return false; }
  function defOK(m, d) { var p = d.split(':'); return (m[p[0]] || []).indexOf(p[1]) >= 0; }
  function moveOK(m, k) { return k === 'hover' ? !!m.hover : !!m.speed[k]; }
  function legOK(m, k) { return k === 'lair' ? !!m.lair : !!m.isLegendary; }
  var FACETS = {
    type: function (m, sel) { return !sel.length || sel.indexOf(m.type) >= 0; },
    size: function (m, sel) { return !sel.length || inter(m.sizes || [], sel); },
    align: function (m, sel) { return !sel.length || inter(m.alignTags || [], sel); },
    def: function (m, sel) { return sel.every(function (d) { return defOK(m, d); }); },
    move: function (m, sel) { return sel.every(function (k) { return moveOK(m, k); }); },
    leg: function (m, sel) { return sel.every(function (k) { return legOK(m, k); }); }
  };
  function baseOK(m) {
    var q = state.q.trim().toLowerCase();
    if (q && m.name.toLowerCase().indexOf(q) < 0) return false;
    if (state.favOnly && !favs[m.id]) return false;
    var lo = crNum(state.crMin, -1), hi = crNum(state.crMax, 99);
    return m.cr >= lo && m.cr <= hi;
  }
  function passes(m, skip) {
    for (var f in FACETS) if (f !== skip && !FACETS[f](m, state[f])) return false;
    return true;
  }
  function crNum(v, d) { if (v == null || v === '') return d; if (/\//.test(v)) { var p = v.split('/'); return p[0] / p[1]; } var n = +v; return isNaN(n) ? d : n; }

  /* ---------- URL ---------- */
  function writeURL() {
    var u = new URL(location.href), sp = u.searchParams;
    function opt(k, val) { if (val) sp.set(k, val); else sp.delete(k); }
    sp.set('ed', state.ed);
    opt('q', state.q.trim());
    opt('crmin', state.crMin && crNum(state.crMin, 0) > CRS[0] ? state.crMin : '');
    opt('crmax', state.crMax && crNum(state.crMax, 99) < CRS[CRS.length - 1] ? state.crMax : '');
    opt('t', state.type.join(',')); opt('sz', state.size.join(',')); opt('al', state.align.join(','));
    opt('def', state.def.join(',')); opt('mv', state.move.join(',')); opt('lg', state.leg.join(','));
    opt('fav', state.favOnly ? '1' : '');
    opt('sort', state.sort === 'name' ? '' : state.sort);
    opt('m', state.open);
    if (u.href !== location.href) history.replaceState(null, '', u);
  }

  /* ---------- list ---------- */
  function mons() { return DATA ? DATA.editions[state.ed] : []; }
  function speedText(m) {
    return ['walk', 'burrow', 'climb', 'fly', 'swim'].filter(function (k) { return m.speed[k] || (k === 'walk' && !m.speed.fly && !m.speed.swim); }).map(function (k) {
      return (k === 'walk' ? '' : k + ' ') + (m.speed[k] || 0) + ' ft.' + (k === 'fly' && m.hover ? ' (hover)' : '');
    }).join(', ');
  }
  function movesHTML(m) {
    return ['fly', 'swim', 'burrow', 'climb'].filter(function (k) { return m.speed[k]; }).map(function (k) {
      return '<span class="mv ' + k + '">' + cap(k) + ' ' + m.speed[k] + (k === 'fly' && m.hover ? ' (hover)' : '') + '</span>';
    }).join('');
  }
  function typeLine(m) {
    return m.size + ' ' + m.type + (m.sub ? ' (' + m.sub + ')' : '') + (m.swarm ? ', swarm' : '') + (m.align ? ', ' + m.align : '');
  }
  function star(m) {
    var on = !!favs[m.id];
    return '<button type="button" class="fav" data-fav="' + m.id + '" aria-pressed="' + on + '" aria-label="Star ' + esc(m.name) + '" title="' + (on ? 'Starred' : 'Star this creature') + '">' +
      '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg></button>';
  }
  function card(m) {
    return '<article class="card" data-id="' + m.id + '">' + star(m) +
      '<button type="button" class="add" data-add="' + m.id + '" aria-label="Add ' + esc(m.name) + ' to the encounter" title="Add to encounter">+</button>' +
      '<div class="card-top"><h3><button type="button" class="card-open" data-open="' + m.id + '" aria-label="' + esc(m.name) + ': stat block">' + esc(m.name) + '</button></h3><span class="cr">CR ' + m.crText + '</span></div>' +
      '<div class="meta">' + esc(typeLine(m)) + '</div>' +
      '<div class="nums"><div><span>AC</span><b>' + m.ac + '</b></div><div><span>HP</span><b>' + m.hp + '</b></div><div><span>XP</span><b>' + num(m.xp) + '</b></div></div>' +
      '<div class="moves">' + movesHTML(m) + (m.isLegendary ? '<span class="tag leg">Legendary</span>' : '') + (m.lair ? '<span class="tag lair">Lair</span>' : '') + '</div>' +
      '</article>';
  }
  function sortRows(rows) {
    var q = state.q.trim().toLowerCase();
    var s = state.sort;
    rows.sort(function (a, b) {
      if (q) { var pa = a.name.toLowerCase().indexOf(q) === 0 ? 0 : 1, pb = b.name.toLowerCase().indexOf(q) === 0 ? 0 : 1; if (pa !== pb) return pa - pb; }
      var d = s === 'cr-asc' ? a.cr - b.cr : s === 'cr-desc' ? b.cr - a.cr : s === 'hp-desc' ? b.hp - a.hp : s === 'hp-asc' ? a.hp - b.hp : 0;
      return d || a.name.localeCompare(b.name);
    });
    return rows;
  }

  function pickRows(facet, items, base) {
    var host = document.querySelector('details[data-facet="' + facet + '"]');
    var sel = state[facet];
    var html = items.map(function (it) {
      if (it.head) return '<div class="grp">' + esc(it.head) + '</div>';
      var on = sel.indexOf(it.key) >= 0;
      var n = 0;
      for (var i = 0; i < base.length; i++) {
        var m = base[i];
        if (!passes(m, facet)) continue;
        var trial = on ? sel : sel.concat([it.key]);
        if (FACETS[facet](m, facet === 'type' || facet === 'size' || facet === 'align' ? [it.key] : trial)) n++;
      }
      if (!n && !on && it.hideZero) return '';
      return '<label class="srcrow' + (n ? '' : ' zero') + '"><input type="checkbox" data-pick="' + facet + '" value="' + esc(it.key) + '"' + (on ? ' checked' : '') + '>' +
        '<span>' + esc(it.label) + '</span><span class="n">' + n + '</span></label>';
    }).join('');
    host.querySelector('.srclist').innerHTML = html;
    var sum = host.querySelector('summary'), label = host.dataset.label || (host.dataset.label = sum.textContent);
    sum.textContent = sel.length ? label + ' (' + sel.length + ')' : label;
    host.classList.toggle('filtered', sel.length > 0);
  }
  function renderPickers(base) {
    var types = {};
    base.forEach(function (m) { types[m.type] = 1; });
    pickRows('type', Object.keys(types).sort().map(function (t) { return { key: t, label: t }; }), base);
    pickRows('size', SIZES.map(function (z) { return { key: z, label: z }; }), base);
    pickRows('align', ALIGNS.map(function (a) { return { key: a[0], label: a[1] }; }), base);
    var defs = [];
    DEF_GROUPS.forEach(function (g) {
      defs.push({ head: g[1] });
      (g[0] === 'ci' ? CONDS : DAMAGE).forEach(function (k) { defs.push({ key: g[0] + ':' + k, label: cap(k), hideZero: true }); });
    });
    pickRows('def', defs, base);
    pickRows('move', MOVES.map(function (m) { return { key: m[0], label: m[1] }; }), base);
    pickRows('leg', LEGS.map(function (l) { return { key: l[0], label: l[1] }; }), base);
  }

  function focusKey() {
    var a = document.activeElement;
    if (!a || a === document.body) return null;
    if (a.dataset && a.dataset.pick) return '[data-pick="' + a.dataset.pick + '"][value="' + a.value + '"]';
    if (a.dataset && a.dataset.fav && a.closest('#list')) return '#list [data-fav="' + a.dataset.fav + '"]';
    return null;
  }
  function render() {
    if (!DATA) return;
    var foc = focusKey();
    var base = mons().filter(baseOK);
    var rows = sortRows(base.filter(function (m) { return passes(m); }));
    renderPickers(base);
    var total = mons().length;
    $('#count').textContent = rows.length === total ? total + ' creatures' : rows.length + ' of ' + total + ' creature' + (total === 1 ? '' : 's');
    $('#list').innerHTML = rows.map(card).join('');
    $('#empty').hidden = rows.length > 0;
    renderChart(rows);
    syncControls();
    writeURL();
    if (foc) { var el = document.querySelector(foc); if (el) el.focus(); }
    document.dispatchEvent(new CustomEvent('mon:render'));
  }

  /* bar chart: creatures by CR for the current filter (shared DndPlot) */
  var crPlot = null;
  function renderChart(rows) {
    var sec = $('#crSec');
    if (!window.DndPlot) { sec.hidden = true; return; }
    if (!sec.open) return;
    var lo = crNum(state.crMin, -1), hi = crNum(state.crMax, 99);
    var steps = CRS.filter(function (c) { return c >= lo && c <= hi; });
    var vals = steps.map(function (c) { return rows.filter(function (m) { return m.cr === c; }).length; });
    $('#crNote').textContent = rows.length + ' creature' + (rows.length === 1 ? '' : 's') + ' in the ' + state.ed + ' SRD' +
      (rows.length !== mons().length ? ' matching your filters' : '') + (rows.length ? ', CR ' + crText(rows.reduce(function (a, m) { return Math.min(a, m.cr); }, 99)) + ' to ' + crText(rows.reduce(function (a, m) { return Math.max(a, m.cr); }, 0)) : '') + '.';
    var opts = { labels: steps.map(crText), values: vals, name: 'Creatures', xLabel: 'Challenge rating', yLabel: 'Creatures', title: 'Creatures at each challenge rating' };
    if (crPlot) crPlot.update(opts); else crPlot = DndPlot.bars($('#crChart'), opts);
  }

  /* ---------- stat block (shared statblock.js, STYLE 6i) ---------- */
  function srdCredit(ed) { return 'From the System Reference Document ' + (ed === '2014' ? '5.1' : '5.2') + ' by Wizards of the Coast LLC, CC BY 4.0.'; }
  function sbBody(m, ed) {
    var tl = esc(DndStatblock.typeLine(m)), ty = esc(m.type);
    if (m.type) tl = tl.replace(ty, '<button type="button" class="sb-tfilter" data-tfilter="' + ty + '" title="Show every ' + ty + ' in the list">' + ty + '</button>');
    return '<p class="dsb-type sb-type">' + tl + '</p>' + DndStatblock.html(m, { ed: ed, source: srdCredit(ed) });
  }
  var dlgEd = null, closeDetail = null;
  function openDetail(id, ed) {
    var cur = BY_ID[state.ed][id] ? state.ed : (BY_ID['2024'][id] ? '2024' : '2014');
    ed = ed || cur;
    var m = BY_ID[ed][id];
    if (!m) return;
    dlgEd = ed;
    state.open = id; writeURL();
    var other = ed === '2014' ? '2024' : '2014', hasOther = !!BY_ID[other][id];
    var on = !!favs[id];
    var h = '<div class="sb-head"><h2 id="dTitle">' + esc(m.name) + '</h2></div>';
    h += '<div class="ed-tabs" role="tablist" aria-label="Rules edition">' + ['2014', '2024'].filter(function (x) { return BY_ID[x][id]; }).map(function (x) {
      return '<button type="button" role="tab" data-ed-tab="' + x + '" aria-selected="' + (x === ed) + '">' + x + ' rules (SRD ' + (x === '2014' ? '5.1' : '5.2') + ')</button>';
    }).join('') + (hasOther ? '' : '<span class="small muted">Only in the ' + ed + ' SRD.</span>') + '</div>';
    h += sbBody(m, ed);
    h += '<div class="mn-actions"><button type="button" class="btn" data-fav="' + id + '" aria-pressed="' + on + '">' + (on ? '&#9733; Starred' : '&#9734; Star') + '</button>' +
      '<button type="button" class="btn" data-add="' + id + '">+ Add to encounter</button>' +
      '<button type="button" class="btn" id="copyMon">Copy link to this creature</button></div>';
    $('#dBody').innerHTML = h;
    var d = $('#detail');
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); if (window.DndUI) DndUI.enter(d.querySelector('.dlg')); }
    d.querySelector('.dlg').scrollTop = 0;
  }

  /* ---------- controls ---------- */
  function syncControls() {
    document.querySelectorAll('[data-ed]').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.ed === state.ed)); });
    if ($('#search').value !== state.q) $('#search').value = state.q;
    $('#sort').value = state.sort;
    $('#favOnly').checked = state.favOnly;
    var lo = $('#crMin'), hi = $('#crMax');
    if (lo.options.length !== CRS.length) {
      var opts = CRS.map(function (c) { return '<option value="' + crText(c) + '">' + crText(c) + '</option>'; }).join('');
      lo.innerHTML = opts; hi.innerHTML = opts;
    }
    if (CRS.length) {
      lo.value = state.crMin && CRS.some(function (c) { return crText(c) === state.crMin; }) ? state.crMin : crText(CRS[0]);
      hi.value = state.crMax && CRS.some(function (c) { return crText(c) === state.crMax; }) ? state.crMax : crText(CRS[CRS.length - 1]);
    }
  }
  function update(patch) {
    for (var k in patch) state[k] = patch[k];
    store.set('mon.ed', state.ed); store.set('mon.sort', state.sort);
    render();
  }
  function copyText(text, btn, label) {
    var done = function () { btn.textContent = 'Link copied'; if (window.DndUI) DndUI.pop(btn); setTimeout(function () { btn.textContent = label; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { prompt('Copy this link:', text); });
    else prompt('Copy this link:', text);
  }
  function toggleFav(id) {
    favs = store.get('mon.favs', {}) || {};   /* re-read, so another tab's stars are kept */
    if (favs[id]) delete favs[id]; else favs[id] = true;
    store.set('mon.favs', favs);
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button');
    if (!t) {
      var c = ev.target.closest('.card');
      if (c && !ev.target.closest('a, input, label')) openDetail(c.dataset.id);
      return;
    }
    if (t.dataset.ed) { if (t.dataset.ed !== state.ed) update({ ed: t.dataset.ed }); return; }
    if (t.dataset.fav) {
      ev.stopPropagation();
      toggleFav(t.dataset.fav);
      render();
      if ($('#detail').open) openDetail(t.dataset.fav, dlgEd);
      return;
    }
    if (t.dataset.open) return openDetail(t.dataset.open);
    if (t.dataset.edTab) return openDetail(state.open, t.dataset.edTab);
    if (t.dataset.clear) { var p = {}; p[t.dataset.clear] = []; return update(p); }
    if (t.dataset.tfilter) { closeDetail(); update({ type: [t.dataset.tfilter] }); var l = $('#count'); if (l) l.scrollIntoView({ block: 'start' }); return; }
    if (t.id === 'diceBtn') { if (window.DndDice) DndDice.open(); return; }
    if (t.id === 'closeDlg') return closeDetail();
    if (t.id === 'copyMon') return copyText(location.href, t, 'Copy link to this creature');
    if (t.id === 'copyLink') return copyText(location.href, t, 'Copy link');
    if (t.id === 'resetBtn') return update({ q: '', crMin: null, crMax: null, type: [], size: [], align: [], def: [], move: [], leg: [], favOnly: false, sort: 'name' });
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.dataset.pick) {
      var f = t.dataset.pick, sel = state[f].slice(), i = sel.indexOf(t.value);
      if (t.checked && i < 0) sel.push(t.value); else if (!t.checked && i >= 0) sel.splice(i, 1);
      var p = {}; p[f] = sel; return update(p);
    }
    if (t.id === 'sort') return update({ sort: t.value });
    if (t.id === 'favOnly') return update({ favOnly: t.checked });
    if (t.id === 'crMin' || t.id === 'crMax') {
      var lo = crNum($('#crMin').value, 0), hi = crNum($('#crMax').value, 30);
      if (lo > hi) { if (t.id === 'crMin') $('#crMax').value = $('#crMin').value; else $('#crMin').value = $('#crMax').value; }
      return update({ crMin: $('#crMin').value, crMax: $('#crMax').value });
    }
  });
  var qTimer = null;
  $('#search').addEventListener('input', function () {
    var v = this.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { update({ q: v }); }, 120);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if ($('#detail').open) { setTimeout(function () { if (!$('#detail').open) closed(); }, 0); return; }
    var open = document.querySelector('details.srcpick[open]');
    if (open) { ev.preventDefault(); open.open = false; open.querySelector('summary').focus(); }
  });
  /* one filter menu open at a time; nudge it left so it stays on screen; close on an outside click */
  document.querySelectorAll('details.srcpick').forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open) return;
      document.querySelectorAll('details.srcpick').forEach(function (o) { if (o !== d) o.open = false; });
      var pop = d.querySelector('.srcpop'); pop.style.left = '0px';
      var r = pop.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 16);
      if (over > 0) pop.style.left = -Math.min(over, r.left - 16) + 'px';
    });
  });
  document.addEventListener('click', function (ev) {
    document.querySelectorAll('details.srcpick[open]').forEach(function (d) { if (!d.contains(ev.target)) d.open = false; });
  });
  var dlg = $('#detail');
  function closed() {
    /* called directly and from the 'close' event (Escape), so it must be safe to run twice */
    if (!state.open) return;
    var id = state.open;
    state.open = ''; writeURL();
    var c = document.querySelector('#list [data-open="' + id + '"]'); if (c) c.focus();
  }
  closeDetail = function () { if (dlg.open) dlg.close(); closed(); };
  dlg.addEventListener('click', function (ev) { if (ev.target === this) closeDetail(); });
  dlg.addEventListener('close', closed);
  dlg.addEventListener('cancel', function () { setTimeout(closed, 0); });
  (function () {
    var sec = $('#crSec');
    if (store.get('mon.crchart', 'open') === 'closed') sec.open = false;
    sec.addEventListener('toggle', function () { store.set('mon.crchart', sec.open ? 'open' : 'closed'); if (sec.open) render(); });
  })();
  /* stars made in another tab */
  window.addEventListener('storage', function (ev) {
    if (ev.key !== 'mon.favs') return;
    favs = store.get('mon.favs', {}) || {};
    render();
  });

  fetch('data/monsters.json?v=dev').then(function (r) { return r.json(); }).then(function (d) {
    DATA = d;
    ['2014', '2024'].forEach(function (ed) { BY_ID[ed] = {}; d.editions[ed].forEach(function (m) { BY_ID[ed][m.id] = m; }); });
    var seen = {};
    d.editions['2014'].concat(d.editions['2024']).forEach(function (m) { seen[m.cr] = 1; });
    CRS = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
    $('#generated').textContent = 'Data built ' + d.generated + ' · ' + d.editions['2014'].length + ' creatures in the 2014 SRD, ' + d.editions['2024'].length + ' in the 2024 SRD.';
    render();
    if (state.open) {
      if (BY_ID[state.ed][state.open] || BY_ID[state.ed === '2014' ? '2024' : '2014'][state.open]) openDetail(state.open);
      else { state.open = ''; writeURL(); }
    }
  }).catch(function (err) {
    $('#list').innerHTML = '<p class="empty">Could not load the creature data (' + esc(err.message) + ').</p>';
  });
  syncControls();

  /* for encounter.js: the data, the edition and the stat block */
  window.MonLookup = {
    ready: function () { return !!DATA; },
    ed: function () { return state.ed; },
    get: function (id, ed) { return DATA ? BY_ID[ed || state.ed][id] || null : null; },
    any: function (id) { return DATA ? BY_ID[state.ed][id] || BY_ID[state.ed === '2014' ? '2024' : '2014'][id] || null : null; },
    xpByCr: function () { return DATA ? DATA.xpByCr : {}; },
    statblock: function (m, ed, head) { return DndStatblock.html(m, { ed: ed, head: !!head, source: srdCredit(ed) }); },
    open: function (id) { openDetail(id); }
  };
})();

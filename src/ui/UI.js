// DOM-based interface: menus, HUD, dialogue, scanner cards, inventory, map, build menu, results.
import { MISSIONS } from '../gameplay/missions.js';
import { NPCS, MODULES, MATERIAL_NAMES, SAMPLE_TYPES, SITES } from '../data/catalog.js';
import { equipmentById, canAfford, missingFor, INVENTORY_CAPACITY } from '../gameplay/economy.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

export function tag(kind, title) {
  const label = kind === 'nasa' ? 'NASA DATA' : kind === 'approx' ? 'GAME APPROX' : 'FICTION';
  return h('span', { class: `tag ${kind}`, title: title || '' }, label);
}

const fmtTime = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class UI {
  constructor(root, game) {
    this.root = root; this.game = game; this.audio = game.audio;
    this.layer = h('div', { class: 'layer' }); root.append(this.layer);
    this.modal = null; this.modalStack = [];
    this.fadeEl = h('div', { class: 'fade' }); root.append(this.fadeEl);
    this.toastsEl = h('div', { class: 'toasts' }); root.append(this.toastsEl);
    this.hudEl = null; this.radioEl = null; this.radioQueue = []; this.radioBusy = false;
  }

  // ---------- modal helpers ----------
  get isModal() { return !!this.modal; }
  open(el, { keepInput = false } = {}) {
    if (this.modal) this.modal.remove();
    this.modal = el; this.root.append(el);
    if (!keepInput) { this.game.input.enabled = false; this.game.input.unlock(); }
    return el;
  }
  close() {
    if (this.modal) { this.modal.remove(); this.modal = null; }
    this.game.input.enabled = true;
  }
  btn(label, onClick, cls = '') {
    return h('button', { class: `btn ${cls}`, onclick: e => { this.audio.click(); onClick(e); }, onmouseenter: () => this.audio.hover() }, label);
  }
  fade(on) { this.fadeEl.classList.toggle('on', on); return new Promise(r => setTimeout(r, 650)); }

  loading(text, fact) {
    const bar = h('div'); bar.style.width = '0%';
    const el = h('div', { class: 'loading' },
      h('div', { class: 'logo-ring' }), h('div', { class: 'hdr' }, text || 'Loading'),
      h('div', { class: 'ld-bar' }, bar), fact ? h('div', { class: 'fact' }, fact) : null);
    this.root.append(el);
    return { set: p => { bar.style.width = `${Math.round(p * 100)}%`; }, done: () => el.remove() };
  }

  toast(text, kind = 'info', ms = 3200) {
    const t = h('div', { class: `toast panel ${kind}` }, text);
    this.toastsEl.append(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove();
    setTimeout(() => t.remove(), ms);
  }

  // ---------- radio subtitles ----------
  radio(npcId, text, ms) {
    this.radioQueue.push([npcId, text, ms || Math.min(9000, 2500 + text.length * 45)]);
    if (!this.radioBusy) this._nextRadio();
  }
  _nextRadio() {
    const next = this.radioQueue.shift();
    if (!next) { this.radioBusy = false; return; }
    this.radioBusy = true;
    const [id, text, ms] = next;
    const npc = NPCS[id] || { name: id };
    this.audio.radioOpen();
    if (this.radioEl) this.radioEl.remove();
    this.radioEl = h('div', { class: 'radio panel' }, h('div', { class: 'who' }, npc.name.toUpperCase()), h('div', { class: 'txt' }, text));
    this.root.append(this.radioEl);
    setTimeout(() => { this.audio.radioClose(); if (this.radioEl) this.radioEl.remove(); this.radioEl = null; setTimeout(() => this._nextRadio(), 250); }, ms);
  }
  clearRadio() { this.radioQueue = []; if (this.radioEl) this.radioEl.remove(); this.radioEl = null; this.radioBusy = false; }

  // ---------- MAIN MENU ----------
  mainMenu({ hasSave, onNew, onContinue, onMissions, onSettings, onCredits, onExit, apod }) {
    const apodBox = h('div', { class: 'menu-right panel' });
    const fillApod = a => {
      apodBox.innerHTML = '';
      apodBox.append(h('div', { class: 'hdr' }, a && !a.live ? 'NASA image (offline)' : 'NASA Astronomy Picture of the Day', tag('nasa', a && !a.live ? (a.source || 'NASA') : 'api.nasa.gov/planetary/apod')));
      if (!a) { apodBox.append(h('div', { class: 'muted', style: { marginTop: '12px' } }, 'Offline.')); return; }
      if (a.img) apodBox.append(h('img', { class: 'apod-img', src: a.img, alt: a.title || 'APOD', style: { marginTop: '10px' } }));
      apodBox.append(h('div', { class: 'mono', style: { marginTop: '10px', fontSize: '15px' } }, a.title || ''));
      apodBox.append(h('div', { class: 'muted', style: { fontSize: '12.5px', marginTop: '6px', lineHeight: '1.45', maxHeight: '120px', overflow: 'hidden' } }, (a.explanation || '').slice(0, 420) + ((a.explanation || '').length > 420 ? '…' : '')));
      apodBox.append(h('div', { class: 'ticker' }, `${a.date || ''} · ${a.live ? 'live from api.nasa.gov' : 'APOD unavailable: showing a cached NASA photo'}${a.copyright ? ' · © ' + a.copyright : ''}`));
    };
    fillApod(apod);
    const el = h('div', { class: 'screen' },
      h('div', { class: 'menu-wrap' },
        h('div', { class: 'menu-left panel' },
          h('div', { class: 'logo-ring' }),
          h('h1', { class: 'title-xl' }, 'VEERAPPAN'),
          h('div', { class: 'subtitle' }, 'SPACE EXPLORER'),
          h('div', { style: { height: '22px' } }),
          this.btn('New Game', onNew, 'primary'),
          (() => { const b = this.btn('Continue', () => { if (hasSave) onContinue(); }); b.disabled = !hasSave; return b; })(),
          this.btn('Mission Select', onMissions),
          this.btn('Settings', onSettings),
          this.btn('Credits & NASA Data', onCredits),
          this.btn('Exit', onExit),
          h('div', { class: 'ticker' }, 'NASA Space Apps Challenge · built on real data from NASA Trek, PDS, api.nasa.gov, data.nasa.gov and NASA 3D Resources'),
        ),
        apodBox));
    this.open(el);
    return { setApod: fillApod };
  }

  // ---------- MISSION SELECT ----------
  missionSelect(state, { onStart, onExplore, onBack }) {
    let sel = state.missions.unlocked[state.missions.unlocked.length - 1] || 'm1';
    const detail = h('div', { class: 'ms-detail scroll' });
    const list = h('div', { class: 'ms-list scroll' });
    const render = () => {
      list.innerHTML = '';
      list.append(h('div', { class: 'hdr', style: { marginBottom: '10px' } }, 'Missions'));
      MISSIONS.forEach((m, i) => {
        const unlocked = state.missions.unlocked.includes(m.id), done = state.missions.completed[m.id];
        list.append(h('div', { class: `mcard ${unlocked ? '' : 'locked'} ${sel === m.id ? 'sel' : ''}`, onclick: () => { if (unlocked) { sel = m.id; this.audio.click(); render(); } } },
          h('div', { class: 'num' }, `MISSION ${i + 1}`), h('div', { class: 'nm' }, m.name),
          h('div', { class: 'st' }, !unlocked ? 'LOCKED' : done ? `COMPLETE · best ${fmtTime(done.best)}` : 'AVAILABLE')));
      });
      list.append(h('div', { class: 'hdr', style: { margin: '16px 0 8px' } }, 'Free exploration'));
      for (const s of ['moon', 'mars']) {
        const ok = state.locations.unlocked.includes(s);
        const b = this.btn(`Explore ${SITES[s].name}`, () => onExplore(s), 'small'); b.disabled = !ok; list.append(b);
      }
      list.append(h('div', { style: { height: '12px' } }), this.btn('Back', onBack, 'small'));
      const m = MISSIONS.find(x => x.id === sel);
      const done = state.missions.completed[m.id];
      detail.innerHTML = '';
      const canSkip = m.start === 'earth' && state.flags.flownTo && state.flags.flownTo[m.site];
      const skip = h('input', { type: 'checkbox', id: 'skipflight' });
      detail.append(
        h('div', { class: 'hdr' }, `Mission briefing · ${SITES[m.site].name}`),
        h('h2', { class: 'mono', style: { fontSize: '28px', letterSpacing: '.15em', margin: '6px 0 10px' } }, m.name),
        h('div', { style: { fontSize: '15px', lineHeight: '1.5' } }, m.summary),
        h('div', { class: 'hdr', style: { marginTop: '18px' } }, 'Environmental conditions'),
        ...m.environment.map(e => h('div', { class: 'envrow' }, h('div', { class: 'muted' }, e.label), h('div', {}, e.value, tag(e.data, e.source)))),
        h('div', { class: 'hdr', style: { marginTop: '16px' } }, 'Required equipment'),
        h('div', { style: { fontSize: '13px', marginTop: '6px' } }, m.equipment.join(' · ')),
        h('div', { class: 'hdr', style: { marginTop: '14px' } }, 'Available resources'),
        h('div', { style: { fontSize: '13px', marginTop: '6px' } }, m.resources, tag('approx', 'Gameplay values')),
        m.timeLimit ? h('div', { class: 'mono', style: { color: 'var(--amber)', marginTop: '10px' } }, `⏱ Time limit: ${fmtTime(m.timeLimit)}`) : null,
        h('div', { class: 'hdr', style: { marginTop: '14px' } }, 'Objectives'),
        h('ol', { class: 'objlist' }, ...m.objectives.map(o => h('li', { class: o.optional ? 'opt' : '' }, o.text))),
        h('div', { class: 'hdr', style: { marginTop: '14px' } }, 'Rewards'),
        h('div', { style: { fontSize: '13px', marginTop: '6px' } }, `${m.rewards.research} research points` + (m.rewards.unlock?.length ? ` · unlocks ${m.rewards.unlock.map(u => MISSIONS.find(x => x.id === u).name).join(', ')}` : '') + (m.rewards.spacecraft?.length ? ' · new spacecraft: VX-Heavy' : '')),
        h('div', { class: 'stats', style: { marginTop: '14px' } }, h('span', {}, 'Status: ', h('b', {}, done ? 'Completed' : 'Not completed')), h('span', {}, 'Research: ', h('b', {}, state.research))),
        h('div', { style: { marginTop: '16px' } },
          canSkip ? h('label', { class: 'mono', style: { fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' } }, skip, 'Skip launch & cruise (start at the landing)') : null,
          this.btn('▶ Start mission', () => onStart(m.id, { skipFlight: canSkip && skip.checked }), 'primary')),
      );
    };
    render();
    this.open(h('div', { class: 'screen' }, h('div', { class: 'ms panel' }, list, detail)));
  }

  // ---------- HUD ----------
  buildHud() {
    if (this.hudEl) this.hudEl.remove();
    const bar = (lbl) => { const f = h('div', { class: 'fill' }); const v = h('span'); const el = h('div', { class: 'bar' }, h('div', { class: 'lbl' }, h('span', {}, lbl), v), h('div', { class: 'trk' }, f)); return { el, f, v }; };
    this.hb = { o2: bar('O2'), power: bar('POWER'), suit: bar('SUIT'), };
    this.compassStrip = h('div', { class: 'strip' });
    this.objEl = h('div', { class: 'objectives panel' });
    this.promptEl = h('div', { class: 'prompt panel', style: { display: 'none' } });
    this.statusEl = h('div', { class: 'status-tr panel' });
    this.fpsEl = h('div', { class: 'fps' });
    this.crossEl = h('div', { class: 'crosshair', style: { display: 'none' } });
    this.lockHint = h('div', { class: 'lockhint panel', style: { display: 'none' } }, 'Click to capture the mouse');
    this.scanEl = h('div', { class: 'scanbar panel', style: { display: 'none' } });
    this.vehEl = h('div', { class: 'vehicle-hud panel', style: { display: 'none' } });
    this.barsEl = h('div', { class: 'bars panel' }, this.hb.o2.el, this.hb.power.el, this.hb.suit.el);
    this.hudEl = h('div', { class: 'hud' },
      h('div', { class: 'compass panel' }, this.compassStrip, h('div', { class: 'center' })),
      this.barsEl, this.objEl, this.promptEl, this.statusEl, this.fpsEl, this.crossEl, this.lockHint, this.scanEl, this.vehEl);
    this.root.prepend(this.hudEl);
  }
  removeHud() { if (this.hudEl) this.hudEl.remove(); this.hudEl = null; }
  setBar(b, v) {
    b.f.style.width = `${Math.max(0, Math.min(100, v))}%`; b.v.textContent = `${Math.round(v)}%`;
    b.el.classList.toggle('warn', v < 35 && v >= 15); b.el.classList.toggle('crit', v < 15);
  }
  hud({ suit, prompt, status, fps, crosshair, lockHint, scan, vehicle, showBars = true }) {
    if (!this.hudEl) return;
    if (suit) { this.setBar(this.hb.o2, suit.o2); this.setBar(this.hb.power, suit.power); this.setBar(this.hb.suit, suit.integrity); }
    this.barsEl.style.display = showBars && !vehicle ? '' : 'none';
    this.promptEl.style.display = prompt ? '' : 'none';
    if (prompt) this.promptEl.innerHTML = prompt;
    this.statusEl.innerHTML = status || ''; this.statusEl.style.display = status ? '' : 'none';
    this.fpsEl.textContent = fps ? `${fps} FPS` : '';
    this.crossEl.style.display = crosshair ? '' : 'none';
    this.lockHint.style.display = lockHint ? '' : 'none';
    if (scan) { this.scanEl.style.display = ''; this.scanEl.innerHTML = `${scan.label}<div class="trk"><div class="fill" style="width:${Math.round(scan.p * 100)}%"></div></div>`; }
    else this.scanEl.style.display = 'none';
    if (vehicle) { this.vehEl.style.display = ''; this.vehEl.innerHTML = vehicle; } else this.vehEl.style.display = 'none';
  }
  compass(yaw, markers) {
    if (!this.compassStrip) return;
    // yaw: camera yaw (0 = north, positive = turning left / west)
    const heading = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
    const W = this.compassStrip.clientWidth || 500, span = 150;
    let html = '';
    for (let d = 0; d < 360; d += 15) {
      let rel = ((d - heading + 540) % 360) - 180;
      if (Math.abs(rel) > span / 2) continue;
      const x = W / 2 + rel / span * W;
      const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W', 45: 'NE', 135: 'SE', 225: 'SW', 315: 'NW' }[d];
      html += `<div class="tick ${lab && lab.length === 1 ? 'cardinal' : ''}" style="left:${x}px">${lab || '·'}</div>`;
    }
    for (const m of markers) {
      let rel = ((m.bearing - heading + 540) % 360) - 180;
      const clamped = Math.max(-span / 2, Math.min(span / 2, rel));
      const x = W / 2 + clamped / span * W;
      html += `<div class="mk" title="${m.label || ''}" style="left:${x}px;background:${m.color};${Math.abs(rel) > span / 2 ? 'opacity:.5' : ''}"></div>`;
    }
    this.compassStrip.innerHTML = html;
  }
  objectives(run, distances = {}) {
    if (!this.objEl) return;
    if (!run) { this.objEl.style.display = 'none'; return; }
    this.objEl.style.display = '';
    const d = run.def;
    const shown = d.objectives.filter(o => run.done.has(o.id) || run.isActive(o)).slice(-7);
    const tl = run.timeLeft();
    this.objEl.innerHTML = `<div class="mname">${d.name}</div>` +
      shown.map(o => {
        const cnt = o.count ? ` (${Math.min(o.count, run.progress[o.id] || 0)}/${o.count})` : '';
        const dist = distances[o.id] !== undefined && !run.done.has(o.id) ? `<span class="dist">${distances[o.id] > 1000 ? (distances[o.id] / 1000).toFixed(1) + ' km' : Math.round(distances[o.id]) + ' m'}</span>` : '';
        return `<div class="obj ${run.done.has(o.id) ? 'done' : ''} ${o.optional ? 'optional' : ''}">${o.text}${cnt}${dist}</div>`;
      }).join('') +
      (tl !== null ? `<div class="timer ${tl < 120 ? 'crit' : ''}">⏱ ${fmtTime(tl)}</div>` : '');
  }

  // ---------- DIALOGUE ----------
  dialogue(tree, onEffects) {
    return new Promise(resolve => {
      const box = h('div', { class: 'dlg panel interactive' });
      const show = id => {
        if (!id) { this.close(); resolve(); return; }
        const n = tree.nodes[id];
        const npc = NPCS[n.speaker] || { name: n.speaker, role: '' };
        if (npc.radio) this.audio.radioOpen(); else this.audio.beep();
        box.innerHTML = '';
        box.append(h('div', {}, h('span', { class: 'who' }, npc.name.toUpperCase()), h('span', { class: 'role' }, npc.role + (npc.radio ? ' · radio' : ''))));
        const txt = h('div', { class: 'txt' }); box.append(txt);
        // typewriter
        let i = 0; const full = n.text;
        const tick = () => { i = Math.min(full.length, i + 3); txt.textContent = full.slice(0, i); if (i < full.length) this._tw = setTimeout(tick, 12); };
        clearTimeout(this._tw); tick();
        n.choices.forEach((c, k) => box.append(h('button', {
          class: 'choice', onclick: () => {
            this.audio.click();
            if (i < full.length) { i = full.length; txt.textContent = full; }
            if (c.effects) onEffects(c.effects);
            show(c.next);
          },
        }, h('span', { class: 'n' }, `${k + 1}.`), c.text)));
        this._dlgKeys = n.choices;
      };
      const keyH = e => {
        if (!this.modal || this.modal !== box) { removeEventListener('keydown', keyH); return; }
        const k = parseInt(e.key, 10);
        if (k >= 1 && k <= 9) { const b = box.querySelectorAll('.choice')[k - 1]; if (b) b.click(); }
      };
      addEventListener('keydown', keyH);
      this.open(box);
      show(tree.start);
    });
  }

  // ---------- SCAN CARD ----------
  scanCard(item) {
    return new Promise(resolve => {
      const body = h('div', { class: 'card panel scroll' });
      const done = () => { this.close(); resolve(); };
      body.append(...[
        h('div', { class: 'hdr' }, item.kicker || 'Scanner report'),
        h('h2', {}, item.title, item.tagKind ? tag(item.tagKind, item.tagTitle) : null),
        item.subtitle ? h('div', { class: 'muted', style: { fontSize: '13px' } }, item.subtitle) : null,
        h('div', { class: 'kv' }, ...item.rows.flatMap(r => [h('div', { class: 'k' }, r[0]), h('div', {}, r[1], r[2] ? tag(r[2], r[3]) : null)])),
        item.quote ? h('div', { class: 'quote' }, `"${item.quote.text}"`, h('span', { class: 'src' }, 'Source: ' + item.quote.source)) : null,
        item.footer ? h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '12px' } }, item.footer) : null,
        h('div', { style: { marginTop: '14px' } }, ...(item.actions || []).map(a => this.btn(a.label, () => { this.close(); resolve(a.id); }, 'small primary')), this.btn('Close [Esc]', done, 'small')),
      ].filter(Boolean));
      const wrap = h('div', { class: 'screen clear' }, body);
      const esc = e => { if (e.code === 'Escape' || e.code === 'KeyQ') { removeEventListener('keydown', esc); if (this.modal === wrap) done(); } };
      setTimeout(() => addEventListener('keydown', esc), 80);
      this.open(wrap);
    });
  }

  // ---------- INVENTORY ----------
  inventory(state, site) {
    const left = h('div', { class: 'scroll' }), right = h('div', { class: 'scroll' });
    const inv = state.inventory;
    left.append(h('div', { class: 'hdr' }, `Carried ${inv.items.length + inv.samples.length}/${INVENTORY_CAPACITY}`));
    if (!inv.items.length && !inv.samples.length) left.append(h('div', { class: 'muted', style: { marginTop: '10px' } }, 'Nothing carried. Scan debris with Q, then press E to collect it.'));
    for (const id of inv.items) { const e = equipmentById(id); left.append(h('div', { class: 'slot' }, h('b', {}, e.name), h('div', { class: 'muted' }, 'Recyclable: ' + Object.entries(e.yields || {}).map(([k, v]) => `${v} ${MATERIAL_NAMES[k]}`).join(', ')))); }
    for (const s of inv.samples) { const t = SAMPLE_TYPES[s.type]; left.append(h('div', { class: 'slot' }, h('b', {}, '🪨 ' + t.name), h('div', { class: 'muted' }, `Collected at ${s.where}. Comparable: ${t.reference.id}`))); }
    right.append(h('div', { class: 'hdr' }, 'Materials (at base storage)'));
    for (const [k, v] of Object.entries(inv.materials)) right.append(h('div', { class: 'mat' }, h('span', {}, MATERIAL_NAMES[k]), h('b', {}, v)));
    right.append(h('div', { class: 'hdr', style: { marginTop: '16px' } }, 'Research'), h('div', { class: 'mono', style: { fontSize: '24px', marginTop: '4px' } }, state.research + ' RP'));
    right.append(h('div', { class: 'hdr', style: { marginTop: '16px' } }, `Discoveries (${state.discoveries.length})`));
    for (const id of state.discoveries) { const e = equipmentById(id); if (e) right.append(h('div', { style: { fontSize: '12.5px', padding: '3px 0' } }, (e.heritage ? '★ ' : '• ') + e.name)); }
    const st = state.station[site] || [];
    right.append(h('div', { class: 'hdr', style: { marginTop: '16px' } }, 'Station modules here'), h('div', { style: { fontSize: '13px', marginTop: '4px' } }, st.length ? st.map(m => MODULES[m].name).join(', ') : 'None yet'));
    const el = h('div', { class: 'screen' }, h('div', { class: 'inv panel' }, h('div', { class: 'col', style: { minHeight: 0 } }, h('div', { class: 'hdr', style: { fontSize: '14px', marginBottom: '10px' } }, 'Inventory  [Tab]'), left), h('div', { class: 'col', style: { minHeight: 0 } }, right, this.btn('Close', () => this.close(), 'small'))));
    this.open(el);
    const k = e => { if (['Tab', 'Escape'].includes(e.code)) { e.preventDefault(); removeEventListener('keydown', k); if (this.modal === el) this.close(); } };
    setTimeout(() => addEventListener('keydown', k), 50);
  }

  // ---------- MAP ----------
  map({ image, site, player, markers, paths, title, subtitle, credit }) {
    const cv = h('canvas', { width: 900, height: 900 });
    const legend = h('div', { class: 'legend scroll' });
    const el = h('div', { class: 'screen' }, h('div', { class: 'mapwrap panel' }, cv, h('div', { class: 'col' }, h('div', { class: 'hdr' }, 'Planetary map  [M]'), h('div', { class: 'mono', style: { margin: '6px 0' } }, title), h('div', { class: 'muted', style: { fontSize: '12px' } }, subtitle), legend, h('div', { class: 'muted', style: { fontSize: '11px', marginTop: 'auto' } }, credit), this.btn('Close', () => this.close(), 'small'))));
    this.open(el);
    const g = cv.getContext('2d');
    const core = site.core;
    const toPx = (x, z) => [(x - core.x0) / core.widthM * cv.width, (z - core.z0) / core.heightM * cv.height];
    const draw = () => {
      g.drawImage(image, 0, 0, cv.width, cv.height);
      g.fillStyle = 'rgba(0,10,20,.15)'; g.fillRect(0, 0, cv.width, cv.height);
      for (const p of paths) {
        g.strokeStyle = p.color; g.lineWidth = 2; g.setLineDash(p.dash || []); g.beginPath();
        p.points.forEach(([x, z], i) => { const [px, py] = toPx(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); g.setLineDash([]);
      }
      g.font = '13px Consolas, monospace';
      for (const m of markers) {
        const [px, py] = toPx(m.x, m.z);
        if (px < -10 || py < -10 || px > cv.width + 10 || py > cv.height + 10) continue;
        g.fillStyle = m.color; g.strokeStyle = '#000'; g.lineWidth = 2;
        g.beginPath(); g.arc(px, py, m.r || 5, 0, Math.PI * 2); g.fill(); g.stroke();
        if (m.label) { g.fillStyle = '#fff'; g.strokeText(m.label, px + 8, py + 4); g.fillText(m.label, px + 8, py + 4); }
      }
      const [px, py] = toPx(player.x, player.z);
      g.save(); g.translate(px, py); g.rotate(-player.yaw); g.fillStyle = '#4fd1ff'; g.strokeStyle = '#000';
      g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke(); g.restore();
      // scale bar 500 m
      const s = 500 / core.widthM * cv.width; g.fillStyle = '#fff'; g.fillRect(20, cv.height - 30, s, 3); g.fillText('500 m', 20, cv.height - 38);
      g.fillText('N ↑', cv.width - 40, 26);
    };
    if (image.complete) draw(); else image.onload = draw;
    const seen = new Set();
    for (const m of markers) { if (seen.has(m.kind)) continue; seen.add(m.kind); legend.append(h('div', {}, h('i', { style: { background: m.color } }), m.kindLabel || m.kind)); }
    for (const lbl of [...new Set(paths.map(p => p.label))]) { const p = paths.find(q => q.label === lbl); legend.append(h('div', {}, h('i', { style: { background: p.color, borderRadius: '0', height: '3px' } }), p.label)); }
    const k = e => { if (['KeyM', 'Escape'].includes(e.code)) { removeEventListener('keydown', k); if (this.modal === el) this.close(); } };
    setTimeout(() => addEventListener('keydown', k), 50);
  }

  // ---------- BUILD MENU ----------
  buildMenu(state, site, onBuild) {
    const wrap = h('div', { class: 'build panel scroll' });
    const render = () => {
      wrap.innerHTML = '';
      wrap.append(h('div', { class: 'hdr' }, `Construction · ${SITES[site].base.name}`), h('div', { class: 'muted', style: { fontSize: '12px', margin: '4px 0 8px' } }, 'Module designs and costs are game models.', tag('approx')),
        h('div', { class: 'stats' }, ...Object.entries(state.inventory.materials).map(([k, v]) => h('span', {}, MATERIAL_NAMES[k] + ': ', h('b', {}, v))), h('span', {}, 'Research: ', h('b', {}, state.research))));
      for (const [id, m] of Object.entries(MODULES)) {
        const built = state.station[site].includes(id);
        const afford = canAfford(state, id);
        const costEl = h('div', { class: 'cost' }, Object.entries(m.cost).map(([k, v]) => `${v} ${MATERIAL_NAMES[k]}`).join(' · ') + (m.research ? ` · needs ${m.research} RP` : ''));
        if (!afford && !built) costEl.append(h('div', { class: 'bad' }, 'Missing: ' + missingFor(state, id).join(', ')));
        const b = this.btn(built ? 'Built' : 'Build', () => { const r = onBuild(id); if (r && !r.ok) this.toast(r.reason, 'bad'); render(); }, 'small primary');
        b.disabled = built || !afford;
        wrap.append(h('div', { class: `mod ${built ? 'built' : ''}` }, h('div', {}, h('div', { class: 'nm' }, m.name), h('div', { style: { fontSize: '12.5px', margin: '3px 0' } }, m.benefit), costEl), b));
      }
      wrap.append(this.btn('Close [Esc]', () => this.close(), 'small'));
    };
    render();
    const el = h('div', { class: 'screen' }, wrap);
    this.open(el);
    const k = e => { if (['Escape', 'KeyB'].includes(e.code)) { removeEventListener('keydown', k); if (this.modal === el) this.close(); } };
    setTimeout(() => addEventListener('keydown', k), 50);
  }

  // ---------- PAUSE ----------
  pause({ onResume, onSave, onSettings, onControls, onRestart, onQuit }) {
    const el = h('div', { class: 'screen' }, h('div', { class: 'panel', style: { width: '340px', padding: '22px' } },
      h('div', { class: 'hdr' }, 'Paused'), h('div', { style: { height: '10px' } }),
      this.btn('Resume', onResume, 'primary'), this.btn('Save game', onSave), this.btn('Controls', onControls), this.btn('Settings', onSettings),
      onRestart ? this.btn('Restart mission', onRestart) : null, this.btn('Quit to main menu', onQuit, 'danger')));
    this.open(el);
  }

  controls(onBack) {
    const rows = [
      ['W A S D', 'Move'], ['Mouse', 'Look (right-drag in free third-person camera)'], ['Shift', 'Sprint'], ['Space', 'Jump / brake (rover) / fire engine (lander)'],
      ['Left Ctrl', 'Toggle SHIFT LOCK (third person: camera-locked aiming, character faces where you look)'], ['V', 'Switch first / third person'], ['Mouse wheel', 'Zoom camera / lander throttle'],
      ['E', 'Interact · talk · collect · enter/exit vehicle'], ['Q (hold)', 'Scanner'], ['F', 'Flashlight'], ['R', 'Radio Mission Control'], ['B', 'Build menu (at a build pad)'],
      ['Tab', 'Inventory'], ['M', 'Planetary map'], ['J', 'Mission log'], ['Esc', 'Pause'], ['F11', 'Fullscreen'],
      ['Rocket', 'A/D pitch · Shift/Ctrl throttle · Space stage/burn · G autopilot · , . time warp'], ['Lander', 'Space fire · wheel or Shift/Ctrl throttle · WASD translate (RCS)'], ['Cruise', 'Mouse/WASD to point · Space burn · , . time warp'],
    ];
    const el = h('div', { class: 'screen' }, h('div', { class: 'settings panel scroll' }, h('div', { class: 'hdr' }, 'Controls'), h('div', { style: { height: '10px' } }),
      h('div', { class: 'controls-grid' }, ...rows.flatMap(([k, v]) => [h('div', {}, ...k.split(' · ').map(x => h('kbd', { style: { marginRight: '4px' } }, x))), h('div', {}, v)])),
      h('div', { style: { height: '12px' } }), this.btn('Back', onBack, 'small')));
    this.open(el);
  }

  // ---------- SETTINGS ----------
  settings(s, { onChange, onBack, apiInfo, onApiKey }) {
    const row = (label, ctrl) => h('div', { class: 'set-row' }, h('div', {}, label), ctrl);
    const sel = (key, opts) => { const e = h('select', { onchange: () => { s[key] = e.value; onChange(s, key); } }, ...opts.map(([v, l]) => h('option', { value: v, ...(s[key] === v ? { selected: 'selected' } : {}) }, l))); return e; };
    const rng = (key, min, max, step) => { const e = h('input', { type: 'range', min, max, step, value: s[key], oninput: () => { s[key] = parseFloat(e.value); onChange(s, key); } }); return e; };
    const chk = (key) => { const e = h('input', { type: 'checkbox', onchange: () => { s[key] = e.checked; onChange(s, key); } }); e.checked = !!s[key]; return e; };
    const keyIn = h('input', { type: 'password', placeholder: apiInfo.hasApiKey ? '•••••••• (saved)' : 'Paste your api.nasa.gov key' });
    const keyMsg = h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } });
    const el = h('div', { class: 'screen' }, h('div', { class: 'settings panel scroll' },
      h('div', { class: 'hdr' }, 'Settings'),
      row('Graphics quality', sel('quality', [['low', 'Low (weak laptops)'], ['medium', 'Medium'], ['high', 'High']])),
      row('Auto-adjust quality', chk('autoQuality')),
      row('Field of view', rng('fov', 55, 95, 1)),
      row('Mouse sensitivity', rng('mouseSensitivity', 0.2, 3, 0.05)),
      row('Invert mouse Y', chk('invertY')),
      row('Default camera', sel('cameraMode', [['third', 'Third person'], ['first', 'First person']])),
      row('Master volume', rng('masterVolume', 0, 1, 0.05)),
      row('Effects volume', rng('sfxVolume', 0, 1, 0.05)),
      row('Ambience volume', rng('ambienceVolume', 0, 1, 0.05)),
      row('Show FPS', chk('showFps')),
      h('div', { class: 'hdr', style: { marginTop: '18px' } }, 'NASA API key (optional)'),
      h('div', { style: { fontSize: '13px', lineHeight: '1.5', marginTop: '6px' } },
        'The game works offline with cached NASA data. Live extras (Astronomy Picture of the Day, InSight weather refresh) use api.nasa.gov. Without a key they use NASA\'s shared DEMO_KEY, which is rate-limited. To get your own free key, open ',
        h('b', {}, 'https://api.nasa.gov'), ', fill in your name and email under "Generate API Key", and the key is shown immediately and emailed to you. Your key is stored only on this PC (in your user profile), never in the game files.'),
      h('div', { class: 'row', style: { marginTop: '8px' } }, keyIn, this.btn('Save key', async () => { const r = await onApiKey(keyIn.value); keyMsg.textContent = r.ok ? 'Saved. Live NASA data will use your key.' : r.error; keyIn.value = ''; }, 'small'), this.btn('Remove', async () => { await onApiKey(''); keyMsg.textContent = 'Key removed: using DEMO_KEY.'; }, 'small')),
      keyMsg,
      h('div', { style: { height: '12px' } }), this.btn('Back', onBack, 'small')));
    this.open(el);
  }

  credits(prov, onBack) {
    const items = (prov?.items || []).map(p => h('div', { class: 'it' }, h('b', {}, p.title || p.id), ' · ', p.kind, h('div', { class: 'src' }, p.source + (p.page ? ' · ' + p.page : '')), p.notes ? h('div', { class: 'muted' }, p.notes) : null));
    const el = h('div', { class: 'screen' }, h('div', { class: 'credits panel col' },
      h('div', { class: 'hdr' }, 'Credits & data attribution'),
      h('div', { style: { fontSize: '13.5px', lineHeight: '1.55', margin: '10px 0' } },
        h('b', {}, 'VEERAPPAN: Space Explorer'), ' was built for the NASA Space Apps Challenge. Terrain, imagery, landmark coordinates, mission text, sample facts, spacecraft models and weather data come from NASA sources listed below. ',
        'NASA content is generally not subject to copyright in the United States; credit NASA and the missions. Use of NASA data does not imply endorsement by NASA. ',
        'Tags in the game: ', tag('nasa'), ' real NASA data · ', tag('approx'), ' simplified for gameplay · ', tag('fiction'), ' invented for the story. ',
        'Characters, the Pathfinder-H scout, the VX-1 lander, VX-Heavy rocket, bases and station modules are fictional. All sound is synthesized in-game.'),
      h('div', { class: 'hdr' }, `NASA data products used (${items.length})`),
      h('div', { class: 'scroll', style: { flex: 1, marginTop: '6px' } }, ...items),
      this.btn('Back', onBack, 'small')));
    this.open(el);
  }

  // ---------- RESULTS ----------
  results({ success, title, reason, rows, onContinue, onRetry, onMenu }) {
    const el = h('div', { class: 'screen' }, h('div', { class: 'results panel' },
      h('div', { class: 'hdr' }, title), h('div', { class: `big ${success ? 'good' : 'bad'}` }, success ? 'MISSION COMPLETE' : 'MISSION FAILED'),
      reason ? h('div', { style: { marginBottom: '12px' } }, reason) : null,
      h('div', { class: 'kv' }, ...rows.flatMap(r => [h('div', { class: 'k' }, r[0]), h('div', {}, r[1])])),
      h('div', { style: { marginTop: '18px' } }, onContinue ? this.btn('Continue', onContinue, 'primary') : null, onRetry ? this.btn('Retry', onRetry) : null, this.btn('Main menu', onMenu))));
    this.open(el);
    if (success) this.audio.success(); else this.audio.fail();
  }

  // ---------- FLIGHT HUD ----------
  flightHud() {
    if (this.fhud) this.fhud.remove();
    this.fLeft = h('div', { class: 'left panel' }); this.fRight = h('div', { class: 'right panel' });
    this.fMsg = h('div', { class: 'center-msg' }); this.fBottom = h('div', { class: 'bottom panel' });
    this.fLadder = h('canvas', { class: 'ladder', width: 220, height: 220 });
    this.fhud = h('div', { class: 'fhud' }, this.fLeft, this.fRight, this.fMsg, this.fBottom, this.fLadder);
    this.root.prepend(this.fhud);
  }
  removeFlightHud() { if (this.fhud) this.fhud.remove(); this.fhud = null; }
  flight({ left, right, msg, bottom, ladder }) {
    if (!this.fhud) return;
    if (left !== undefined) this.fLeft.innerHTML = left;
    if (right !== undefined) this.fRight.innerHTML = right;
    if (msg !== undefined) this.fMsg.innerHTML = msg;
    if (bottom !== undefined) this.fBottom.innerHTML = bottom;
    this.fRight.style.display = right ? '' : 'none';
    const g = this.fLadder.getContext('2d');
    g.clearRect(0, 0, 220, 220);
    this.fLadder.style.display = ladder ? '' : 'none';
    if (ladder) ladder(g);
  }
  checklist(items, cur) {
    if (this.chkEl) this.chkEl.remove();
    if (!items) return;
    this.chkEl = h('div', { class: 'checklist panel' }, h('div', { class: 'hdr' }, 'Pre-launch checklist'),
      ...items.map((it, i) => h('div', { class: `it ${i < cur ? 'done' : i === cur ? 'cur' : 'todo'}` }, i < cur ? '✔' : i === cur ? '▶' : '○', it)),
      h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '8px' } }, 'Click the glowing switch (or press E).'));
    this.root.append(this.chkEl);
  }
}

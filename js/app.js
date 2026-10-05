/* app.js: UI, state, persistence, exports, packs, AI wiring. Vanilla JS, no build step. */
(function () {
  'use strict';
  const BZ = window.BZ, AI = window.BZAI;
  const VERSION = 'v1.3.3';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Storage is full or blocked; could not save.'); return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  const K = { settings: 'bizzle.settings.v1', current: 'bizzle.current.v1', packs: 'bizzle.packs.v1', characters: 'bizzle.characters.v1', key: p => 'bizzle.key.' + p };

  const THEMES = [
    { id: 'orange-black', name: 'Orange Border on Black', bg: '#000', fg: '#fff', bd: '#ff7a00' },
    { id: 'neon-alien', name: 'Neon Alien Green', bg: '#020a03', fg: '#eaffea', bd: '#39ff14' },
    { id: 'telegram-blue', name: 'Telegram Blue', bg: '#17212b', fg: '#f1f6fb', bd: '#2aabee' },
    { id: 'vaporwave', name: 'Vaporwave', bg: '#25104a', fg: '#fff0fb', bd: '#ff71ce' },
    { id: 'psychedelic-420', name: 'Psychedelic 420', bg: '#170827', fg: '#fbf6ff', bd: '#7CFF3A' },
    { id: 'retro-sunset', name: 'Retro Sunset', bg: '#2a1528', fg: '#fff4e6', bd: '#ff6b35' },
    { id: 'light-clean', name: 'Light Clean', bg: '#ffffff', fg: '#14171a', bd: '#c2410c' },
    { id: 'jinxy-orange', name: 'Jinxy Orange Cat', bg: '#26160c', fg: '#fff8f0', bd: '#ff8a1f' },
    { id: 'matrix', name: 'Alien Terminal', bg: '#020c02', fg: '#c8ffc8', bd: '#00ff41' }
  ];

  const DEFAULTS = {
    count: 50, categories: null, holiday: '', subthemes: [], keywords: '', preset: '', style: 'mix', target: 'both', aspect: '3:4',
    palette: 'mix', text: 'mix', mascots: 'off', avoid: true, source: 'all', adult: false, lang: 'English', spec: true,
    provider: 'gemini', models: {}, exportFmt: 'md', theme: 'orange-black', seed: '', format: 'varied',
    charactersOn: false, charactersOnExplicit: false, characterIds: null
  };
  const SHARE_KEYS = ['format', 'count', 'categories', 'holiday', 'subthemes', 'keywords', 'preset', 'style', 'target', 'aspect', 'palette', 'text', 'avoid', 'lang', 'spec', 'theme', 'seed', 'source', 'charactersOn', 'characterIds'];

  const _charLoad = BZ.loadCharacters(LS.get(K.characters, null));
  const state = { settings: Object.assign({}, DEFAULTS, LS.get(K.settings, {})), data: null, items: LS.get(K.current, []) || [], packs: LS.get(K.packs, []) || [], characters: _charLoad.characters, charVersion: _charLoad.version, image: null, busy: false, charPopover: false };
  if (!state.settings.seed) state.settings.seed = BZ.randomSeed();
  if (!Array.isArray(state.items)) state.items = [];
  if (!Array.isArray(state.packs)) state.packs = [];
  // Mascots dropdown superseded by Characters — never inject cartoon mascots into subjects.
  state.settings.mascots = 'off';
  if (!Array.isArray(state.settings.characterIds)) {
    state.settings.characterIds = state.characters.map(c => c.id);
  } else {
    const valid = new Set(state.characters.map(c => c.id));
    state.settings.characterIds = state.settings.characterIds.filter(id => valid.has(id));
    // If migration replaced the cast and left no valid ids, default to all
    if (!state.settings.characterIds.length) state.settings.characterIds = state.characters.map(c => c.id);
  }
  if (typeof state.settings.charactersOnExplicit !== 'boolean') state.settings.charactersOnExplicit = false;
  // Default OFF for new visitors and anyone who never explicitly toggled Characters.
  // Explicit ON (charactersOnExplicit + charactersOn) is preserved.
  if (!state.settings.charactersOnExplicit) state.settings.charactersOn = false;
  else if (typeof state.settings.charactersOn !== 'boolean') state.settings.charactersOn = false;
  // Persist migrated defaults so the new text sticks for unedited users
  if (_charLoad.migrated) LS.set(K.characters, { version: state.charVersion, characters: state.characters });
  window.__bizzle = state; // handy for debugging/tests

  // ---------------- Toast ----------------
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

  // ---------------- Data loading ----------------
  async function loadData() {
    let raw = null, from = 'fetch';
    try {
      const r = await fetch('data/trends.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      raw = await r.json();
    } catch (e) { raw = window.FALLBACK_TRENDS || {}; from = 'embedded'; }
    state.data = BZ.normalize(raw);
    state.dataFrom = from;
    BZ.setHouseTemplate(state.data.houseTemplate);
  }

  function renderBanner() {
    const d = state.data, b = $('#dataBanner');
    const counts = { sourced: 0, inferred: 0, unverified: 0, example: 0 };
    [...d.categories, ...d.holidays].forEach(x => counts[x.type]++);
    const ex = d.placeholder || d.allExample;
    b.className = 'banner' + (ex ? ' example' : '');
    b.innerHTML = `<details${ex ? ' open' : ''}><summary>` + (ex ? '⚠️ <strong>Placeholder data</strong>' : '📊 <strong>Trend research data</strong>') +
      (d.generated ? ` <span class="muted">(generated ${esc(d.generated)}${state.dataFrom === 'embedded' ? ', embedded copy' : ''})</span>` : '') +
      ` · <span class="badge sourced">${counts.sourced} sourced</span> <span class="badge inferred">${counts.inferred} inferred</span>${counts.unverified ? ` <span class="badge unverified">${counts.unverified} unverified</span>` : ''} <span class="badge example">${counts.example} example</span> <span class="small muted">(tap for disclaimer)</span></summary><p class="small">${esc(d.disclaimer || '')}</p></details>`;
  }

  // ---------------- Filters ----------------
  function passesSource(x) { const s = state.settings.source; if (s === 'sourced') return x.type === 'sourced'; if (s === 'inferred') return x.type === 'sourced' || x.type === 'inferred'; return true; }
  function visibleCats() { return state.data.categories.filter(c => (state.settings.adult || !c.adult) && passesSource(c)); }
  function visibleHols() { return state.data.holidays.filter(h => (state.settings.adult || !h.adult) && passesSource(h)); }
  function selectedCats() { const ids = state.settings.categories || []; return visibleCats().filter(c => ids.includes(c.id)); }
  function badge(type) { const label = { sourced: 'Sourced', inferred: 'Inferred', unverified: 'Unverified', example: 'Example/template' }[type] || 'Example/template'; return `<span class="badge ${type in { sourced: 1, inferred: 1, unverified: 1 } ? type : 'example'}">${label}</span>`; }

  function defaultCategories() {
    const cats = state.data.categories.filter(c => !c.adult);
    const want = [/alien|space|ufo/i, /\bcat|jinxy/i, /funny|humou?r|sarcas/i];
    const pick = [];
    want.forEach(re => { const c = cats.find(x => re.test(x.id + ' ' + x.name) && !pick.includes(x.id)); if (c) pick.push(c.id); });
    for (const c of cats) { if (pick.length >= 3) break; if (!pick.includes(c.id)) pick.push(c.id); }
    return pick;
  }

  // ---------------- Pickers ----------------
  function renderPickers() {
    const s = state.settings;
    const vis = visibleCats();
    $$('.cat-chips').forEach(box => {
      box.innerHTML = vis.length ? vis.map(c => `<button type="button" class="chip" data-cat="${esc(c.id)}" aria-pressed="${(s.categories || []).includes(c.id)}" title="${esc(c.name)}">${c.adult ? '🔞 ' : ''}${esc(c.name)} ${badge(c.type)}</button>`).join('')
        : '<p class="hint">No categories match the current trend-source filter. Change it in Settings → Content.</p>';
    });
    const hiddenAdult = state.data.categories.filter(c => c.adult).length;
    $('#adultHint').textContent = !s.adult && hiddenAdult ? `${hiddenAdult} adult (18+) categor${hiddenAdult === 1 ? 'y is' : 'ies are'} hidden. Enable in Settings → Content.` : '';
    // holidays
    const hols = visibleHols();
    const today = startOfToday();
    const holOpts = '<option value="">None</option>' + hols.map(h => { const nx = nextDate(h, today); return `<option value="${esc(h.id)}">${esc(h.name)}${nx ? ' · ' + nx.days + 'd' : ''}</option>`; }).join('');
    $$('.holiday-select').forEach(sel => { sel.innerHTML = holOpts; sel.value = hols.some(h => h.id === s.holiday) ? s.holiday : ''; });
    // styles
    const styleOpts = '<option value="mix">Mix (varied)</option>' + state.data.styles.filter(passesSourceSoft).map(st => `<option value="${esc(st.name)}">${esc(st.name)}</option>`).join('');
    $$('.style-select').forEach(sel => { sel.innerHTML = styleOpts; sel.value = s.style; if (sel.value !== s.style) sel.value = 'mix'; });
    // palettes
    $('#set-palette').innerHTML = '<option value="mix">Mix (varied)</option>' + state.data.palettes.filter(passesSourceSoft).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    $('#set-palette').value = s.palette; if ($('#set-palette').value !== s.palette) $('#set-palette').value = 'mix';
    // presets
    $('#presetSelect').innerHTML = '<option value="">None</option>' + state.data.themes.filter(passesSourceSoft).map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    $('#presetSelect').value = s.preset || '';
    renderSubthemes();
  }
  function passesSourceSoft(x) { return (state.settings.adult || !x.adult) && (passesSource(x) || state.settings.source === 'all' || !x.evidence.length); }
  function renderSubthemes() {
    const subs = [...new Set(selectedCats().flatMap(c => c.subthemes))];
    const sel = state.settings.subthemes || [];
    $('#subChips').innerHTML = subs.length ? subs.map(x => `<button type="button" class="chip" data-sub="${esc(x)}" aria-pressed="${sel.includes(x)}">${esc(x)}</button>`).join('') : '<p class="hint">Select categories to see subthemes.</p>';
  }

  // ---------------- Generic bindings ----------------
  function setControl(el, v) { if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v; }
  function syncBound(key) { $$(`[data-bind="${key}"]`).forEach(el => { if (document.activeElement !== el || el.type === 'checkbox' || el.tagName === 'SELECT') setControl(el, state.settings[key]); }); }
  function bindAll() {
    $$('[data-bind]').forEach(el => {
      const key = el.dataset.bind;
      setControl(el, state.settings[key]);
      const ev = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
      el.addEventListener(ev, () => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (key === 'count') { v = parseInt(v, 10); if (isNaN(v)) return; v = Math.max(1, Math.min(100, v)); }
        state.settings[key] = v;
        onSetting(key, el);
      });
      if (key === 'count') el.addEventListener('change', () => { el.value = state.settings.count; syncBound('count'); });
    });
  }
  function onSetting(key, srcEl) {
    $$(`[data-bind="${key}"]`).forEach(el => { if (el !== srcEl) setControl(el, state.settings[key]); });
    if (key === 'theme') applyTheme();
    if (key === 'adult' || key === 'source') { pruneHidden(); renderPickers(); renderTrends(); }
    if (key === 'spec') { renderSpec(); renderResults(); }
    if (key === 'provider') renderProvider();
    if (key === 'keywords') checkTrademarks();
    if (key === 'seed') $('#seedLabel').textContent = state.settings.seed;
    saveSettings();
  }
  function pruneHidden() {
    const vis = visibleCats().map(c => c.id);
    state.settings.categories = (state.settings.categories || []).filter(id => vis.includes(id));
    if (state.settings.holiday && !visibleHols().some(h => h.id === state.settings.holiday)) state.settings.holiday = '';
    if (state.settings.style !== 'mix' && !state.data.styles.filter(passesSourceSoft).some(x => x.name === state.settings.style)) state.settings.style = 'mix';
    if (state.settings.preset && !state.data.themes.filter(passesSourceSoft).some(x => x.id === state.settings.preset)) state.settings.preset = '';
  }
  function saveSettings() { LS.set(K.settings, state.settings); }

  // ---------------- Theme ----------------
  function applyTheme() {
    const t = THEMES.find(x => x.id === state.settings.theme) ? state.settings.theme : 'orange-black';
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]'); const th = THEMES.find(x => x.id === t); if (meta) meta.content = th.bg;
    $$('.theme-btn').forEach(b => b.setAttribute('aria-checked', String(b.dataset.theme === t)));
  }
  function renderThemes() {
    $('#themeQuick').innerHTML = THEMES.map(t => `<option value="${t.id}">🎨 ${esc(t.name)}</option>`).join('');
    $('#themeQuick').value = state.settings.theme;
    $('#themeGrid').innerHTML = THEMES.map(t => `<button type="button" role="radio" class="theme-btn" data-theme="${t.id}" aria-checked="false" style="background:${t.bg};color:${t.fg};border-color:${t.bd}">${esc(t.name)}</button>`).join('');
    applyTheme();
  }

  // ---------------- Spec + Characters ----------------
  function renderSpec() { $('#specPre').textContent = BZ.SPEC_BLOCK; }
  function checkedCharacterIds() {
    const valid = new Set(state.characters.map(c => c.id));
    const ids = Array.isArray(state.settings.characterIds) ? state.settings.characterIds.filter(id => valid.has(id)) : state.characters.map(c => c.id);
    return ids;
  }
  function characterBlock() {
    if (!state.settings.charactersOn) return '';
    return BZ.buildCharacterBlock(state.characters, checkedCharacterIds());
  }
  /** Assemble final prompt: body → Character details (if on) → spec block (last). De-dupe AI echoes. */
  function activeCharNames() {
    if (!state.settings.charactersOn) return [];
    return checkedCharacterIds().map(id => { const c = state.characters.find(x => x.id === id); return c ? c.name : ''; }).filter(Boolean);
  }
  function fullText(item, v) {
    let body = BZ.stripCharacterSection(AI.stripSpec((item.variants[v] || '').trim()));
    body = BZ.rewriteNoTextClauses(body, activeCharNames());
    const parts = [];
    if (body) parts.push(body);
    const chars = characterBlock();
    if (chars) parts.push(chars);
    if (state.settings.spec) parts.push(BZ.SPEC_BLOCK);
    return parts.join('\n\n');
  }
  function saveCharacters() { LS.set(K.characters, { version: state.charVersion || BZ.CHAR_DEFAULTS_VERSION, characters: state.characters }); }
  function setCharactersOn(on, opts) {
    state.settings.charactersOn = !!on;
    state.settings.charactersOnExplicit = true;
    saveSettings();
    syncCharUI();
    if (!(opts && opts.skipRender)) renderResults();
  }
  function setCharacterChecked(id, checked) {
    const set = new Set(checkedCharacterIds());
    if (checked) set.add(id); else set.delete(id);
    // Keep cast order
    state.settings.characterIds = state.characters.map(c => c.id).filter(cid => set.has(cid));
    saveSettings();
    syncCharUI();
    renderResults();
  }
  function charCardHTML(c, checked) {
    const av = c.avatar
      ? `<img class="char-avatar" src="${esc(c.avatar)}" alt="" width="40" height="40">`
      : `<span class="char-avatar emoji" aria-hidden="true">${esc(c.emoji || '✨')}</span>`;
    return `<article class="char-card" data-char-id="${esc(c.id)}">
      <label class="char-check"><input type="checkbox" data-char-check="${esc(c.id)}" ${checked ? 'checked' : ''} aria-label="Include ${esc(c.name)}"><span class="sr-only">Include ${esc(c.name)}</span></label>
      ${av}
      <div class="char-body">
        <div class="char-name">${esc(c.name)}</div>
        <details class="char-details"><summary>Details</summary><pre class="char-text">${esc(c.text)}</pre></details>
        <pre class="char-text char-text-desktop">${esc(c.text)}</pre>
        <div class="char-edit-row" hidden>
          <label class="field">Name <input type="text" data-char-name maxlength="60" value="${esc(c.name)}"></label>
          <label class="field">Details <textarea data-char-text rows="3" maxlength="800">${esc(c.text)}</textarea></label>
          <div class="actions">
            <button type="button" class="btn tiny primary" data-char-act="save" data-char-id="${esc(c.id)}">Save</button>
            <button type="button" class="btn tiny" data-char-act="cancel" data-char-id="${esc(c.id)}">Cancel</button>
          </div>
        </div>
        <div class="actions char-card-acts">
          <button type="button" class="btn tiny" data-char-act="edit" data-char-id="${esc(c.id)}">✏️ Edit</button>
          <button type="button" class="btn tiny danger" data-char-act="delete" data-char-id="${esc(c.id)}">🗑 Delete</button>
        </div>
      </div>
    </article>`;
  }
  function renderCharCards() {
    const checked = new Set(checkedCharacterIds());
    const html = state.characters.map(c => charCardHTML(c, checked.has(c.id))).join('') || '<p class="hint">No characters yet. Add one or reset to defaults.</p>';
    const gen = $('#charCardsGen'); if (gen) gen.innerHTML = html;
    const set = $('#charCardsSet'); if (set) set.innerHTML = html;
    // Compact bar list
    const bar = $('#charBarList');
    if (bar) {
      bar.innerHTML = state.characters.map(c => {
        const av = c.avatar ? `<img src="${esc(c.avatar)}" alt="" width="22" height="22">` : `<span class="emoji">${esc(c.emoji || '✨')}</span>`;
        return `<label class="char-bar-item"><input type="checkbox" data-char-check="${esc(c.id)}" ${checked.has(c.id) ? 'checked' : ''}>${av}<span>${esc(c.name)}</span></label>`;
      }).join('') || '<p class="hint small">No characters</p>';
    }
  }
  function syncCharUI() {
    const on = !!state.settings.charactersOn;
    $$('[data-char-master]').forEach(el => { el.checked = on; });
    const btn = $('#charBarToggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('on', on);
      $('#charBarState').textContent = on ? 'ON' : 'OFF';
    }
    renderCharCards();
  }
  function openCharPopover(open) {
    state.charPopover = !!open;
    const pop = $('#charBarPopover'); const btn = $('#charBarMenu');
    if (!pop) return;
    pop.hidden = !state.charPopover;
    if (btn) btn.setAttribute('aria-expanded', String(state.charPopover));
  }
  const VLABEL = { gemini: 'Gemini', grok: 'Grok Imagine' };

  // ---------------- Generate ----------------
  function buildOpts(extra) {
    const s = state.settings;
    let cats = selectedCats();
    const hol = visibleHols().find(h => h.id === s.holiday) || null;
    if (!cats.length && !hol) { cats = visibleCats().filter(c => !c.adult).slice(0, 3); if (cats.length) toast('No category picked: using ' + cats.map(c => c.name).join(', ')); }
    return Object.assign({
      count: s.count, seed: s.seed, categories: cats, holiday: hol, subthemes: s.subthemes || [],
      keywords: (s.keywords || '').split(',').map(x => x.trim()).filter(Boolean), preset: state.data.themes.filter(passesSourceSoft).find(t => t.id === s.preset) || null,
      styles: state.data.styles.filter(passesSourceSoft), style: s.style, palettes: state.data.palettes.filter(passesSourceSoft), palette: s.palette, text: s.text, mascots: 'off',
      target: s.target, aspect: s.aspect, lang: s.lang, avoid: !!s.avoid, format: s.format,
      charNames: s.charactersOn ? activeCharNames() : []
    }, extra || {});
  }
  function generate() {
    const items = BZ.generate(buildOpts());
    state.items = items; saveCurrent(); renderResults();
    toast(`Generated ${items.length} unique prompts`);
    return items;
  }
  function reroll() { state.settings.seed = BZ.randomSeed(); syncBound('seed'); $('#seedLabel').textContent = state.settings.seed; saveSettings(); return generate(); }
  function saveCurrent() { LS.set(K.current, state.items); }

  // ---------------- Results ----------------
  function renderResults() {
    const box = $('#results');
    const onlyFav = $('#onlyFav').checked;
    const list = state.items.filter(i => !onlyFav || i.fav);
    $('#outCount').textContent = state.items.length + (onlyFav ? ` (${list.length} ★)` : '');
    if (!list.length) { box.innerHTML = `<p class="empty">${state.items.length ? 'No starred prompts yet.' : 'Pick some categories and hit <strong>Generate</strong>. Works fully offline with no API key.'}</p>`; return; }
    box.innerHTML = list.map(cardHTML).join('');
  }
  function cardHTML(it) {
    const vs = Object.keys(it.variants).filter(k => it.variants[k]);
    const tm = BZ.trademarkHits(vs.map(v => it.variants[v]).join(' ') + ' ' + (it.phrase || ''));
    const meta = [it.catName, it.style, it.palette, it.holiday, it.phrase ? 'text' : 'no text', it.aspect, it.source === 'template' ? 'template' : it.source === 'image' ? 'AI · from image' : 'AI', it.refined ? 'refined ×' + it.refined : '']
      .filter(Boolean).map(m => `<span class="tag">${esc(m)}</span>`).join('');
    return `<article class="card${it.fav ? ' fav' : ''}" data-id="${esc(it.id)}">
      <div class="card-head">
        <h3 class="card-title"><span class="num">#${it.n}</span>${esc(it.title)}</h3>
        <button type="button" class="star" data-action="fav" aria-pressed="${!!it.fav}" aria-label="${it.fav ? 'Unstar' : 'Star'} prompt ${it.n}">${it.fav ? '★' : '☆'}</button>
      </div>
      <div class="meta">${meta}${tm.length ? `<span class="tm-flag" title="Possible trademark/likeness terms">⚠ check: ${esc(tm.join(', '))}</span>` : ''}</div>
      ${vs.map(v => `<div class="prompt-block"><div class="prompt-label"><span>${VLABEL[v]}</span><button type="button" class="btn tiny" data-action="copy" data-v="${v}" aria-label="Copy ${VLABEL[v]} prompt ${it.n}">📋 Copy</button></div><pre class="prompt-text" data-v="${v}">${esc(fullText(it, v))}</pre></div>`).join('')}
      <div class="card-actions">
        <button type="button" class="btn tiny" data-action="brief">📝 Design brief</button>
        <details class="refine"><summary class="btn tiny" role="button">🪄 Refine</summary>
          <div class="refine-menu">
            <button type="button" class="btn tiny" data-action="refine" data-kind="detail">More detail</button>
            <button type="button" class="btn tiny" data-action="refine" data-kind="style">Change style</button>
            <button type="button" class="btn tiny" data-action="refine" data-kind="text">Add text</button>
            <button type="button" class="btn tiny" data-action="refine" data-kind="funny">Make funnier</button>
          </div></details>
        <button type="button" class="btn tiny danger" data-action="remove" aria-label="Remove prompt ${it.n}">✕</button>
      </div></article>`;
  }
  function renumber() { state.items.forEach((it, i) => { it.n = i + 1; }); }

  async function onResultsClick(e) {
    const btn = e.target.closest('[data-action]'); if (!btn) return;
    const card = btn.closest('.card'); const it = state.items.find(x => x.id === card.dataset.id); if (!it) return;
    const a = btn.dataset.action;
    if (a === 'copy') { await copyText(fullText(it, btn.dataset.v)); toast(`Copied prompt #${it.n} (${VLABEL[btn.dataset.v]})`); }
    if (a === 'fav') { it.fav = !it.fav; saveCurrent(); renderResults(); }
    if (a === 'remove') { state.items = state.items.filter(x => x !== it); renumber(); saveCurrent(); renderResults(); toast('Removed'); }
    if (a === 'brief') openBrief(it);
    if (a === 'refine') await refine(it, btn.dataset.kind);
  }

  // ---------------- Refine ----------------
  const REFINE_TEXT = { detail: 'add much more vivid visual detail (textures, lighting, linework) while keeping it printable', style: 'switch to a clearly different, trendy art style', text: 'add a short, punchy, original slogan as legible lettering (spelled exactly)', funny: 'make it noticeably funnier with a clever visual joke or pun' };
  async function refine(it, kind) {
    const idx = state.items.indexOf(it);
    const key = getKey();
    if (key) {
      setAiStatus(`AI refining #${it.n}…`);
      try {
        const vs = Object.keys(it.variants).filter(v => it.variants[v]);
        const prompt = `Rewrite this design-only t-shirt image prompt to ${REFINE_TEXT[kind]}. Keep it an isolated graphic for a t-shirt (not a mockup), original (no trademarks, copyrighted characters, or celebrity likeness), aspect ratio ${it.aspect}. Do NOT include any file/print specs or a Character details section.${state.settings.charactersOn ? ' Keep the house characters present in the design.' : ''}\n\n` +
          vs.map(v => `${VLABEL[v]} prompt:\n${it.variants[v]}`).join('\n\n') +
          `\n\nReturn JSON: {"title": "short title", ${vs.map(v => `"prompt_${v}": "..."`).join(', ')}}`;
        const out = AI.parseJSON(await AI.call(aiArgs({ prompt, system: SYSTEM, json: true })));
        const n = JSON.parse(JSON.stringify(it));
        vs.forEach(v => { if (out['prompt_' + v]) n.variants[v] = AI.stripSpec(out['prompt_' + v]); });
        if (out.title) n.title = String(out.title).slice(0, 90);
        n.refined = (n.refined || 0) + 1; n.source = n.source === 'template' ? 'ai' : n.source;
        state.items[idx] = n; saveCurrent(); renderResults(); setAiStatus(`Refined #${it.n} with AI ✓`, 'ok');
        return;
      } catch (err) { setAiStatus(err.friendly || 'AI refine failed. Used offline refine instead.', 'error'); }
    }
    const n = BZ.refineOffline(it, kind, state.data.styles);
    state.items[idx] = n; saveCurrent(); renderResults();
    toast(`Refined #${n.n}: ${{ detail: 'more detail', style: 'new style', text: 'text added', funny: 'funnier' }[kind]}`);
  }

  // ---------------- Copy / export ----------------
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove(); return ok;
    }
  }
  function exportList() { const onlyFav = $('#onlyFav').checked; return state.items.filter(i => !onlyFav || i.fav); }
  function asTxt(list) {
    return list.map(it => Object.keys(it.variants).filter(v => it.variants[v]).map(v => `#${it.n} ${it.title} [${VLABEL[v]}]\n${fullText(it, v)}`).join('\n\n')).join('\n\n----------------------------------------\n\n');
  }
  function asMd(list) {
    const s = state.settings;
    let md = `# Bizzle's Ultimate AI Tshirt Designer: ${list.length} prompts\n\n- Generated: ${new Date().toISOString()}\n- Target: ${s.target} · Aspect: ${s.aspect} · Seed: \`${s.seed}\`\n- Shop: https://www.tshirthut.shop\n\n`;
    list.forEach(it => {
      md += `## ${it.n}. ${it.title}${it.fav ? ' ⭐' : ''}\n\n*${[it.catName, it.style, it.palette, it.holiday].filter(Boolean).join(' · ')}*\n\n`;
      Object.keys(it.variants).filter(v => it.variants[v]).forEach(v => { md += `**${VLABEL[v]}**\n\n\`\`\`text\n${fullText(it, v)}\n\`\`\`\n\n`; });
    });
    return md;
  }
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function asCsv(list) {
    const head = ['number', 'title', 'category', 'style', 'palette', 'holiday', 'text_on_design', 'source', 'favorite', 'gemini_prompt', 'grok_imagine_prompt', 'etsy_tags'];
    const rows = list.map(it => [it.n, it.title, it.catName, it.style, it.palette, it.holiday, it.phrase || '', it.source, it.fav ? 'yes' : '', it.variants.gemini ? fullText(it, 'gemini') : '', it.variants.grok ? fullText(it, 'grok') : '', BZ.brief(it).tags.join(', ')]);
    return '\ufeff' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function exportAs(fmt) {
    const list = exportList(); if (!list.length) { toast('Nothing to export yet. Generate first.'); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `bizzle-prompts-${stamp}`;
    if (fmt === 'md') download(base + '.md', asMd(list), 'text/markdown');
    if (fmt === 'csv') download(base + '.csv', asCsv(list), 'text/csv');
    if (fmt === 'txt') download(base + '.txt', asTxt(list), 'text/plain');
    toast(`Exported ${list.length} prompts as .${fmt}`);
  }

  // ---------------- Brief ----------------
  let briefText = '';
  function openBrief(it) {
    const b = BZ.brief(it);
    $('#briefTitle').textContent = 'Design brief: #' + it.n;
    $('#briefBody').innerHTML = `
      <div class="brief-sec"><h3>Title</h3><p>${esc(b.title)}</p></div>
      <div class="brief-sec"><h3>Fourthwall product title</h3><p>${esc(b.productTitle)}</p></div>
      <div class="brief-sec"><h3>Product description (Fourthwall)</h3><p>${esc(b.description)}</p></div>
      <div class="brief-sec"><h3>13 Etsy-style tags (≤20 chars each)</h3><div class="chips static">${b.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div></div>
      <div class="brief-sec"><h3>Details</h3><p class="small">Category: ${esc(it.catName || '-')} · Style: ${esc(it.style || '-')} · Palette: ${esc(it.palette || '-')} · Holiday: ${esc(it.holiday || '-')} · Aspect: ${esc(it.aspect)}</p></div>
      <div class="brief-sec"><h3>Avoid</h3><p class="small">${esc(BZ.AVOID.join('; '))}</p></div>`;
    const charSec = characterBlock();
    if (charSec) {
      $('#briefBody').insertAdjacentHTML('beforeend', `<div class="brief-sec"><h3>Character details</h3><pre class="spec">${esc(charSec)}</pre></div>`);
    }
    briefText = `TITLE: ${b.title}\nPRODUCT TITLE: ${b.productTitle}\nDESCRIPTION: ${b.description}\nTAGS (${b.tags.length}): ${b.tags.join(', ')}` + (charSec ? '\n\n' + charSec : '');
    $('#briefDialog').showModal();
  }

  // ---------------- Packs ----------------
  function savePack(name) {
    if (!state.items.length) { toast('Generate some prompts first'); return null; }
    name = (name || '').trim() || `Pack ${new Date().toLocaleString()}`;
    const p = { id: 'pk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, created: new Date().toISOString(), updated: new Date().toISOString(), settings: shareable(), items: JSON.parse(JSON.stringify(state.items)) };
    state.packs.unshift(p); LS.set(K.packs, state.packs); renderPacks(); toast(`Saved pack "${name}" (${p.items.length} prompts)`);
    return p;
  }
  function renderPacks() {
    const ul = $('#packList');
    ul.innerHTML = state.packs.length ? state.packs.map(p => `<li data-pack="${esc(p.id)}">
      <div><div class="pname">${esc(p.name)}</div><div class="small muted">${p.items.length} prompts · ${esc(new Date(p.updated || p.created).toLocaleString())}</div></div>
      <div class="actions">
        <button type="button" class="btn tiny" data-pact="load">📂 Load</button>
        <button type="button" class="btn tiny" data-pact="rename">✏️ Rename</button>
        <button type="button" class="btn tiny danger" data-pact="delete">🗑 Delete</button>
      </div></li>`).join('') : '<li class="muted">No saved packs yet.</li>';
  }
  function onPackClick(e) {
    const b = e.target.closest('[data-pact]'); if (!b) return;
    const li = b.closest('li'); const p = state.packs.find(x => x.id === li.dataset.pack); if (!p) return;
    const act = b.dataset.pact;
    if (act === 'load') {
      state.items = JSON.parse(JSON.stringify(p.items)); renumber(); saveCurrent();
      // Restore character toggle / selection saved with the pack so prompts still include the section.
      if (p.settings && typeof p.settings === 'object') {
        if (typeof p.settings.charactersOn === 'boolean') {
          state.settings.charactersOn = p.settings.charactersOn;
          state.settings.charactersOnExplicit = true;
        }
        if (Array.isArray(p.settings.characterIds)) {
          const valid = new Set(state.characters.map(c => c.id));
          state.settings.characterIds = p.settings.characterIds.filter(id => valid.has(id));
        }
        saveSettings(); syncCharUI();
      }
      renderResults(); showView('generate'); toast(`Loaded "${p.name}"`);
    }
    if (act === 'rename') {
      const row = li.querySelector('div');
      row.innerHTML = `<label class="field"><span class="sr-only">New name</span><input type="text" class="rename-input" value="${esc(p.name)}" maxlength="80"></label><button type="button" class="btn tiny primary" data-pact="rename-ok">Save name</button>`;
      row.querySelector('input').focus();
    }
    if (act === 'rename-ok') {
      const v = li.querySelector('.rename-input').value.trim(); if (v) { p.name = v; p.updated = new Date().toISOString(); LS.set(K.packs, state.packs); toast('Renamed'); }
      renderPacks();
    }
    if (act === 'delete') {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirm delete?'; setTimeout(() => { if (b.isConnected) { b.dataset.confirm = ''; b.textContent = '🗑 Delete'; } }, 4000); return; }
      state.packs = state.packs.filter(x => x !== p); LS.set(K.packs, state.packs); renderPacks(); toast('Pack deleted');
    }
  }
  function exportPacks() {
    download(`bizzle-packs-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'bizzles-tshirt-designer', version: 1, exported: new Date().toISOString(), packs: state.packs }, null, 2), 'application/json');
    toast(`Exported ${state.packs.length} packs`);
  }
  async function importPacks(file) {
    try {
      const j = JSON.parse(await file.text());
      const packs = Array.isArray(j) ? j : j.packs;
      if (!Array.isArray(packs)) throw new Error('no packs');
      let added = 0;
      packs.forEach(p => {
        if (!p || !Array.isArray(p.items)) return;
        const items = p.items.filter(it => it && it.variants && typeof it.variants === 'object').map((it, i) => Object.assign({ id: 'imp' + i + Math.random().toString(36).slice(2, 7), title: 'Imported prompt', n: i + 1, fav: false, source: 'template', aspect: '3:4', style: '', catName: '' }, it));
        const np = { id: p.id && !state.packs.some(x => x.id === p.id) ? String(p.id) : 'pk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: String(p.name || 'Imported pack').slice(0, 80), created: p.created || new Date().toISOString(), updated: new Date().toISOString(), settings: p.settings || {}, items };
        state.packs.push(np); added++;
      });
      LS.set(K.packs, state.packs); renderPacks(); toast(`Imported ${added} pack${added === 1 ? '' : 's'}`);
    } catch (e) { toast('That file is not a valid packs export (.json).'); }
  }

  // ---------------- Share link ----------------
  function shareable() { const o = {}; SHARE_KEYS.forEach(k => { o[k] = state.settings[k]; }); return o; }
  function b64urlEncode(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64urlDecode(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function shareUrl() { return location.href.split('#')[0] + '#s=' + b64urlEncode(JSON.stringify(shareable())); }
  function applyHash() {
    const m = location.hash.match(/[#&]s=([A-Za-z0-9_-]+)/); if (!m) return false;
    try {
      const o = JSON.parse(b64urlDecode(m[1]));
      SHARE_KEYS.forEach(k => { if (o[k] !== undefined) state.settings[k] = o[k]; });
      state.settings.count = Math.max(1, Math.min(100, parseInt(state.settings.count, 10) || 50));
      if (o.charactersOn !== undefined) {
        state.settings.charactersOn = !!state.settings.charactersOn;
        state.settings.charactersOnExplicit = true;
      } else if (!state.settings.charactersOnExplicit) {
        state.settings.charactersOn = false;
      }
      if (Array.isArray(state.settings.characterIds)) {
        const valid = new Set(state.characters.map(c => c.id));
        state.settings.characterIds = state.settings.characterIds.filter(id => valid.has(id));
      }
      return true;
    } catch (e) { console.warn('Bad share hash', e); return false; }
  }

  // ---------------- Trend research view ----------------
  function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function parseDate(s) { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(s || '')); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1); if (!m[3]) d.approx = true; return d; }
  function nextDate(h, today) {
    const ds = [h.date_2026, h.date_2027].map(parseDate).filter(Boolean).sort((a, b) => a - b);
    const d = ds.find(x => x >= today); if (!d) return null;
    return { date: d, days: Math.round((d - today) / 86400000), approx: !!d.approx };
  }
  function sellWindowDays(sw) {
    if (!sw) return null;
    if (typeof sw === 'object') { const a = sw.start_days_before || sw.open_days_before || sw.start || (sw.weeks_before && sw.weeks_before * 7); const b = sw.end_days_before || sw.close_days_before || sw.end || 0; return a ? { open: +a, close: +b || 0 } : null; }
    const m = String(sw).match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*(week|day)/i) || String(sw).match(/(\d+)\s*(week|day)/i);
    if (!m) return null;
    const unit = /week/i.test(m[3] || m[2]) ? 7 : 1;
    const hi = m[3] ? Math.max(+m[1], +m[2]) : +m[1];
    return { open: hi * unit, close: 7 };
  }
  function swText(sw) { if (!sw) return ''; if (typeof sw === 'object') return sw.text || sw.note || JSON.stringify(sw); return String(sw); }
  function renderUpcoming() {
    const today = startOfToday();
    $('#todayLabel').textContent = today.toDateString();
    const list = visibleHols().map(h => ({ h, nx: nextDate(h, today) })).filter(x => x.nx).sort((a, b) => a.nx.days - b.nx.days).slice(0, 12);
    $('#upcoming').innerHTML = list.length ? list.map(({ h, nx }) => {
      const w = sellWindowDays(h.sell_window);
      let st = '', cls = 'later';
      if (w) {
        if (nx.days <= w.close) { st = 'Too late for POD shipping'; cls = 'late'; }
        else if (nx.days <= w.open) { st = 'Sell window OPEN'; cls = 'now'; }
        else if (nx.days - w.open <= 21) { st = `Window opens in ${nx.days - w.open}d`; cls = 'soon'; }
        else { st = `Window opens in ${nx.days - w.open}d`; }
      }
      return `<div class="hol-chip" data-hol="${esc(h.id)}"><div class="days">${nx.approx ? '≈' : ''}${nx.days}<small> days</small></div><strong>${esc(h.name)}</strong> ${badge(h.type)}
        <div class="small muted">${nx.approx ? '≈ ' + nx.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + ' (season)' : nx.date.toDateString()}</div><div class="small">${esc(swText(h.sell_window))}</div>${st ? `<span class="status ${cls}">${esc(st)}</span>` : ''}
        <div><button type="button" class="btn tiny" data-usehol="${esc(h.id)}">Use in generator</button></div></div>`;
    }).join('') : '<p class="hint">No upcoming holidays match the current filters.</p>';
  }
  function evHTML(ev) {
    if (!ev.length) return '<div class="evidence muted">No evidence listed.</div>';
    return `<ul class="evidence">${ev.map(e => `<li>${badge(e.type)} ${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener nofollow">${esc(e.source)}</a>` : esc(e.source) + ' <span class="muted">(no link)</span>'}${e.checked ? ` <span class="muted">· checked ${esc(e.checked)}</span>` : ''}${e.note ? `<br><span class="muted">${esc(e.note)}</span>` : ''}</li>`).join('')}</ul>`;
  }
  const li = a => a.length ? `<ul>${a.slice(0, 12).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="small muted">None</p>';
  function renderTrends() {
    const q = ($('#trendSearch').value || '').toLowerCase().trim();
    const match = o => !q || JSON.stringify(o).toLowerCase().includes(q);
    const cats = visibleCats().filter(match);
    $('#trendCats').innerHTML = cats.length ? cats.map(c => `<article class="card tcard"><h4>${c.adult ? '🔞 ' : ''}${esc(c.name)} ${badge(c.type)}</h4>${c.description ? `<p class="small">${esc(c.description)}</p>` : ''}
      <div class="label">Subthemes</div>${li(c.subthemes)}<div class="label">Motifs</div>${li(c.motifs)}<div class="label">Styles</div>${li(c.styles)}<div class="label">Example phrases</div>${li(c.example_phrases)}
      <div class="label">Evidence</div>${evHTML(c.evidence)}<button type="button" class="btn tiny" data-usecat="${esc(c.id)}">+ Add to picker</button></article>`).join('') : '<p class="hint">No categories match.</p>';
    const today = startOfToday();
    const hols = visibleHols().filter(match).map(h => ({ h, nx: nextDate(h, today) })).sort((a, b) => (a.nx ? a.nx.days : 9e9) - (b.nx ? b.nx.days : 9e9));
    $('#trendHols').innerHTML = hols.length ? hols.map(({ h, nx }) => `<article class="card tcard"><h4>${esc(h.name)} ${badge(h.type)}</h4>
      <p class="small">2026: <strong>${esc(h.date_2026 || '-')}</strong> · 2027: <strong>${esc(h.date_2027 || '-')}</strong>${nx ? ` · <strong>${nx.days}</strong> days away` : ''}</p>
      <p class="small">Sell window: ${esc(swText(h.sell_window) || '-')}</p><div class="label">Motifs</div>${li(h.motifs)}<div class="label">Evidence</div>${evHTML(h.evidence)}</article>`).join('') : '<p class="hint">No holidays match.</p>';
    $('#trendStyles').innerHTML = state.data.styles.filter(passesSourceSoft).filter(match).map(s => (s.prompt || s.do.length || s.evidence.length)
      ? `<article class="card tcard"><h4>${esc(s.name)} ${badge(s.type)}</h4>${s.prompt ? `<p class="small">${esc(s.prompt)}</p>` : ''}${s.palette.length ? `<div class="swatches">${s.palette.map(c => `<span style="background:${esc(c)}" title="${esc(c)}"></span>`).join('')}</div>` : ''}${s.do.length ? `<div class="label">Do</div>${li(s.do)}` : ''}${s.dont.length ? `<div class="label">Don't</div>${li(s.dont)}` : ''}${s.evidence.length ? `<div class="label">Evidence</div>${evHTML(s.evidence)}` : ''}</article>`
      : `<span class="chip">${esc(s.name)} ${badge(s.type)}</span>`).join('') || '<p class="hint">None</p>';
    $('#trendPalettes').innerHTML = state.data.palettes.filter(passesSourceSoft).filter(match).map(p => `<div class="card"><strong>${esc(p.name)}</strong> ${badge(p.type)}<div class="swatches">${p.colors.map(c => `<span style="background:${esc(c)}" title="${esc(c)}"></span>`).join('')}</div><div class="small muted">${esc(p.colors.join(' '))}</div>${p.note ? `<div class="small">${esc(p.note)}</div>` : ''}${p.evidence.length ? evHTML(p.evidence) : ''}</div>`).join('') || '<p class="hint">None</p>';
    $('#trendThemes').innerHTML = state.data.themes.filter(passesSourceSoft).filter(match).map(t => `<article class="card tcard"><h4>${esc(t.name)} ${badge(t.type)}</h4><p class="small">${esc(t.description)}</p>${li(t.motifs)}</article>`).join('') || '<p class="hint">None</p>';
    renderUpcoming();
    renderExtras();
  }

  // ---------------- Research extras (generator limits, Fourthwall specs, post-processing, blocked sources) ----------------
  const EXTRA_TITLES = { generator_limits: '🖼️ Generator output limits', fourthwall_specs: '👕 Fourthwall file specs & policy', post_processing: '🧰 Post-processing workflow', blocked_sources: '🚧 Sources that could not be read' };
  const human = k => String(k).replace(/_/g, ' ').replace(/\b(px|dpi)\b/gi, m => m.toUpperCase()).replace(/^./, c => c.toUpperCase());
  function valHTML(v, depth) {
    if (v == null || v === '') return '<span class="muted">-</span>';
    if (typeof v === 'boolean') return v ? '✅ yes' : '❌ no';
    if (typeof v !== 'object') return esc(v);
    if (Array.isArray(v)) {
      if (v.every(x => typeof x !== 'object')) return v.length === 2 && v.every(x => typeof x === 'number') ? `${v[0]} × ${v[1]}` : esc(v.join(', '));
      return `<ul>${v.map(x => `<li>${valHTML(x, depth + 1)}</li>`).join('')}</ul>`;
    }
    const isEvType = typeof v.type === 'string' && /^(sourced|inferred|unverified|example|template)$/i.test(v.type);
    const keys = Object.keys(v).filter(k => k !== 'evidence' && !(k === 'type' && isEvType));
    let h = isEvType ? badge(BZ.normEvidence([{ type: v.type }])[0].type) + ' ' : '';
    if (v.name || v.source) h += `<strong>${esc(v.name || v.source)}</strong> `;
    h += `<dl class="kv">${keys.filter(k => !(k === 'name' || k === 'source')).map(k => `<dt>${esc(human(k))}</dt><dd>${k === 'url' && /^https?:/.test(v[k]) ? `<a href="${esc(v[k])}" target="_blank" rel="noopener nofollow">${esc(v[k])}</a>` : valHTML(v[k], depth + 1)}</dd>`).join('')}</dl>`;
    if (v.evidence) h += evHTML(BZ.normEvidence(v.evidence));
    return h;
  }
  function renderExtras() {
    const ex = state.data.extras || {};
    const keys = Object.keys(ex);
    $('#extrasPanel').hidden = !keys.length;
    $('#trendExtras').innerHTML = keys.map(k => `<article class="card tcard extra"><h4>${esc(EXTRA_TITLES[k] || human(k))}</h4>${valHTML(ex[k], 0)}</article>`).join('');
    const tpl = state.data.houseTemplate;
    $('#houseTplBox').hidden = !tpl; $('#houseTpl').textContent = tpl || '';
    $('#formatHouseOpt').disabled = !tpl;
  }

  // ---------------- Trademark check ----------------
  function checkTrademarks() {
    const hits = BZ.trademarkHits(state.settings.keywords);
    const w = $('#tmWarn');
    if (hits.length) { w.hidden = false; w.innerHTML = `⚠️ <strong>Trademark / likeness risk:</strong> "${esc(hits.join('", "'))}" may be a protected brand, character, or real person. Fourthwall and other platforms remove infringing designs. Use original concepts instead.`; }
    else { w.hidden = true; w.innerHTML = ''; }
    return hits;
  }

  // ---------------- AI ----------------
  const SYSTEM = 'You are an expert print-on-demand t-shirt designer and prompt engineer for AI image generators (Google Gemini image generation and xAI Grok Imagine). You write prompts for DESIGN-ONLY artwork: one isolated graphic to be printed on a black t-shirt, never a mockup, never a garment, never a person wearing a shirt. Original art only: no trademarks, brand names, logos, copyrighted characters, or real-person/celebrity likeness. Never include file-format or print-spec lines; those are appended automatically.';
  function getKey() { return LS.get(K.key(state.settings.provider), ''); }
  function currentModel() { const p = state.settings.provider; return (state.settings.models && state.settings.models[p]) || AI.PROVIDERS[p].defaultModel; }
  function aiArgs(o) { return Object.assign({ provider: state.settings.provider, model: currentModel(), key: getKey() }, o); }
  function setAiStatus(msg, kind) { const el = $('#aiStatus'); el.textContent = msg; el.className = 'ai-status' + (kind ? ' ' + kind : ''); const box = $('#aiBox'); if (msg && kind === 'error') box.open = true; }
  function renderProvider() {
    const p = state.settings.provider, P = AI.PROVIDERS[p];
    $('#set-model').value = currentModel();
    $('#modelList').innerHTML = P.models.map(m => `<option value="${esc(m)}">`).join('');
    $('#set-key').value = getKey();
    $('#providerHelp').innerHTML = P.help;
    const has = !!getKey();
    const pill = $('#aiPill'); pill.textContent = has ? P.label + ' key set' : 'no key'; pill.classList.toggle('on', has);
  }
  function variantSpec(target) { return target === 'both' ? '"prompt_gemini": "natural-language descriptive prompt tuned for Gemini", "prompt_grok": "concise comma-separated descriptor prompt tuned for Grok Imagine"' : target === 'gemini' ? '"prompt_gemini": "natural-language descriptive prompt tuned for Gemini"' : '"prompt_grok": "concise comma-separated descriptor prompt tuned for Grok Imagine"'; }
  function aiItem(o, i, source) {
    const s = state.settings; const v = {};
    const pg = AI.stripSpec(o.prompt_gemini || o.gemini || ''), pk = AI.stripSpec(o.prompt_grok || o.grok || ''), pp = AI.stripSpec(o.prompt || '');
    if (s.target === 'gemini' || s.target === 'both') v.gemini = pg || pp || pk;
    if (s.target === 'grok' || s.target === 'both') v.grok = pk || pp || pg;
    if (!Object.values(v).some(Boolean)) return null;
    return { id: 'ai' + Date.now().toString(36) + i + Math.random().toString(36).slice(2, 5), title: String(o.title || 'AI design ' + (i + 1)).slice(0, 90), catName: String(o.category || ''), style: String(o.style || (s.style !== 'mix' ? s.style : 'AI-chosen')), palette: String(o.palette || ''), motif: String(o.title || 'original design'), holiday: '', phrase: o.text || o.phrase || '', aspect: s.aspect, lang: s.lang, source, fav: false, variants: v, mods: [] };
  }
  function contextForAI() {
    const o = buildOpts(); const s = state.settings;
    return {
      categories: o.categories.map(c => ({ name: c.name, subthemes: c.subthemes.slice(0, 8), motifs: c.motifs.slice(0, 10), styles: c.styles.slice(0, 6), example_phrases: c.example_phrases.slice(0, 6) })),
      holiday: o.holiday ? { name: o.holiday.name, motifs: o.holiday.motifs } : null,
      selected_subthemes: o.subthemes, keywords: o.keywords, theme_preset: o.preset ? { name: o.preset.name, description: o.preset.description, motifs: o.preset.motifs } : null,
      style: s.style === 'mix' ? 'vary across trendy styles' : s.style, palette: s.palette === 'mix' ? 'vary; bright, high contrast for black shirts' : (state.data.palettes.find(p => p.id === s.palette) || {}).name,
      text_on_design: { mix: 'about half with a short original slogan, half graphic-only', text: 'every design includes a short original slogan, spelled exactly', none: 'no text at all' }[s.text],
      characters_enabled: !!s.charactersOn,
      characters: s.charactersOn ? state.characters.filter(c => checkedCharacterIds().includes(c.id)).map(c => ({ name: c.name, details: c.text })) : [],
      character_instruction: s.charactersOn ? 'Every design MUST include the checked characters appearing in the artwork. The app will append a Character details block for you — do NOT write Character details or print-spec lines yourself.' : 'Do not force specific named characters unless the trend context calls for original mascot-like figures.',
      aspect_ratio: s.aspect, language: s.lang, avoid: s.avoid ? BZ.AVOID : []
    };
  }
  async function aiWrite(upgrade) {
    if (state.busy) return; const key = getKey();
    if (!key) { setAiStatus('Add your own API key in Settings → AI first. Template mode (Generate) works without a key.', 'error'); return; }
    const s = state.settings; const total = upgrade ? state.items.length : s.count;
    if (upgrade && !total) { setAiStatus('Generate template prompts first, then upgrade them with AI.', 'error'); return; }
    state.busy = true; const batch = 20; const out = [];
    try {
      for (let start = 0; start < total; start += batch) {
        const n = Math.min(batch, total - start);
        setAiStatus(`${AI.PROVIDERS[s.provider].label}: ${upgrade ? 'upgrading' : 'writing'} prompts ${start + 1}–${start + n} of ${total}…`);
        let prompt;
        if (upgrade) {
          const chunk = state.items.slice(start, start + n);
          prompt = `Upgrade these ${n} t-shirt design prompts: make each more vivid, specific and trend-aware while keeping the same core idea, design-only (isolated graphic, not a mockup), aspect ratio ${s.aspect}, prompts written in ${s.lang}. Keep the same order and count.\n\n` +
            chunk.map((it, i) => `${i + 1}. ${it.title}\n${Object.keys(it.variants).filter(v => it.variants[v]).map(v => VLABEL[v] + ': ' + it.variants[v]).join('\n')}`).join('\n\n') +
            `\n\nReturn JSON: {"prompts":[{"title":"...", ${variantSpec(s.target)}, "category":"...", "style":"...", "text":"slogan or empty"}]} with exactly ${n} items.`;
        } else {
          const charRule = s.charactersOn ? ' The checked house characters MUST appear in each design (use their names). Do NOT paste a "Character details" section or any print-spec lines — the app appends those.' : '';
          prompt = `Write ${n} varied, non-duplicate, design-only t-shirt image prompts based on this trend context (JSON):\n${JSON.stringify(contextForAI())}\n\nRules: each prompt describes ONE isolated graphic for a t-shirt (not a mockup, no shirt, no model), bold and high-contrast so it prints well on a black tee, ${s.aspect} aspect ratio, original (no trademarks/copyrighted characters/celebrities). Vary subject, style, composition and palette. Write prompts in ${s.lang}.${charRule}${out.length ? ' Avoid repeating these titles: ' + out.map(x => x.title).join('; ') : ''}\n\nReturn JSON: {"prompts":[{"title":"...", ${variantSpec(s.target)}, "category":"...", "style":"...", "text":"slogan or empty"}]} with exactly ${n} items.`;
        }
        const j = AI.parseJSON(await AI.call(aiArgs({ system: SYSTEM, prompt, json: true })));
        const arr = Array.isArray(j) ? j : (j.prompts || j.designs || []);
        arr.slice(0, n).forEach((o, i) => { const it = aiItem(o, start + i, 'ai'); if (it) { if (upgrade && state.items[start + i]) { const base = state.items[start + i]; it.catName = it.catName || base.catName; it.holiday = base.holiday; it.palette = it.palette || base.palette; it.fav = base.fav; } out.push(it); } });
      }
      const seen = new Set(); const uniq = out.filter(it => { const k = JSON.stringify(it.variants); if (seen.has(k)) return false; seen.add(k); return true; });
      if (!uniq.length) throw new AI.AIError('The AI returned no usable prompts. Try again.', 'empty');
      state.items = uniq; renumber(); saveCurrent(); renderResults();
      setAiStatus(`✓ ${uniq.length} AI prompts ready (spec block appended by the app).`, 'ok');
    } catch (err) {
      console.warn(err);
      setAiStatus((err && err.friendly) || 'Something went wrong talking to the AI. Template mode still works.', 'error');
      if (out.length) { state.items = out; renumber(); saveCurrent(); renderResults(); }
    } finally { state.busy = false; }
  }
  function readImage(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('no file'));
      if (!/^image\//.test(file.type)) return reject(new AI.AIError('Please choose an image file (PNG, JPG, WEBP, GIF).', 'file'));
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        const max = 1536; let { width: w, height: h } = img; const sc = Math.min(1, max / Math.max(w, h)); w = Math.round(w * sc); h = Math.round(h * sc);
        const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL('image/jpeg', 0.88); URL.revokeObjectURL(url);
        resolve({ mimeType: 'image/jpeg', base64: dataUrl.split(',')[1], dataUrl });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new AI.AIError('Could not read that image. Try a PNG or JPG.', 'file')); };
      img.src = url;
    });
  }
  async function analyzeImage() {
    if (state.busy) return;
    if (!state.image) { setAiStatus('Choose a screenshot or image first.', 'error'); return; }
    if (!getKey()) { setAiStatus('Add your own API key in Settings → AI first to analyze images.', 'error'); return; }
    const s = state.settings; const n = Math.max(1, Math.min(20, parseInt($('#imgCount').value, 10) || 6));
    state.busy = true; setAiStatus(`Analyzing image with ${AI.PROVIDERS[s.provider].label}…`);
    try {
      const prompt = `Analyze this image (it may be a screenshot of trending shirts, a meme, a photo, or a sketch). 1) Briefly describe what's in it, the visual style, colors, and why it might appeal to t-shirt buyers. 2) Suggest ${n} ORIGINAL design-only t-shirt image prompts inspired by it (do not copy logos, characters, text, or real people from the image). Each is an isolated graphic for a black t-shirt, not a mockup, ${s.aspect} aspect ratio, written in ${s.lang}.${s.charactersOn ? ' Each design MUST feature the house characters from the trend context (they must appear in the artwork). Do NOT write a Character details or print-spec section.' : ''}\n\nReturn JSON: {"analysis":"...", "trademark_concerns":"any brands/characters/people you noticed, or empty", "prompts":[{"title":"...", ${variantSpec(s.target)}, "style":"...", "text":"slogan or empty"}]}`;
      const j = AI.parseJSON(await AI.call(aiArgs({ system: SYSTEM, prompt, image: state.image, json: true })));
      const box = $('#imgAnalysis'); box.hidden = false;
      box.textContent = (j.analysis || '') + (j.trademark_concerns ? '\n\n⚠ Trademark notes: ' + j.trademark_concerns : '');
      const items = (j.prompts || j.designs || []).map((o, i) => aiItem(o, i, 'image')).filter(Boolean);
      if (items.length) { state.items = items.concat(state.items); renumber(); saveCurrent(); renderResults(); }
      setAiStatus(`✓ Image analyzed: ${items.length} design ideas added to the top of your list.`, 'ok');
    } catch (err) { setAiStatus((err && err.friendly) || 'Image analysis failed.', 'error'); }
    finally { state.busy = false; }
  }

  // ---------------- Views / tabs ----------------
  const VIEWS = ['generate', 'trends', 'packs', 'settings', 'help'];
  function showView(v) {
    VIEWS.forEach(x => { $('#view-' + x).hidden = x !== v; $('#tab-' + x).setAttribute('aria-selected', String(x === v)); $('#tab-' + x).tabIndex = x === v ? 0 : -1; });
    if (v === 'trends') renderTrends();
  }

  // ---------------- Keyboard ----------------
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) { if (e.key === 'Escape') t.blur(); return; }
    if ($('dialog[open]')) return;
    const k = e.key;
    if (k === 'g' || k === 'G') { e.preventDefault(); showView('generate'); generate(); }
    else if (k === 'r' || k === 'R') { e.preventDefault(); showView('generate'); reroll(); }
    else if (k === 'c' || k === 'C') { e.preventDefault(); copyAll(); }
    else if (k === 's' || k === 'S') { e.preventDefault(); savePack($('#packName').value); }
    else if (k === 'e' || k === 'E') { e.preventDefault(); exportAs(state.settings.exportFmt); }
    else if (k === 't' || k === 'T') { e.preventDefault(); const i = THEMES.findIndex(x => x.id === state.settings.theme); state.settings.theme = THEMES[(i + 1) % THEMES.length].id; onSetting('theme'); toast('Theme: ' + THEMES[(i + 1) % THEMES.length].name); }
    else if (k === '/') { e.preventDefault(); showView('generate'); $('#keywords').focus(); }
    else if (k === '?') { e.preventDefault(); showView('help'); }
    else if (/^[1-5]$/.test(k)) { e.preventDefault(); showView(VIEWS[+k - 1]); }
  }
  async function copyAll() {
    const list = exportList(); if (!list.length) { toast('Nothing to copy yet'); return; }
    await copyText(asTxt(list)); toast(`Copied ${list.length} prompts`);
  }

  // ---------------- Events ----------------
  function wire() {
    $$('.tabs [role=tab]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
    $('.tabs').addEventListener('keydown', e => {
      if (!/^(ArrowLeft|ArrowRight)$/.test(e.key)) return; const i = VIEWS.findIndex(v => $('#tab-' + v).getAttribute('aria-selected') === 'true');
      const n = (i + (e.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length; showView(VIEWS[n]); $('#tab-' + VIEWS[n]).focus();
    });
    document.addEventListener('click', e => {
      const chip = e.target.closest('[data-cat]');
      if (chip) { const id = chip.dataset.cat; const set = new Set(state.settings.categories || []); set.has(id) ? set.delete(id) : set.add(id); state.settings.categories = [...set]; saveSettings(); renderPickers(); return; }
      const sub = e.target.closest('[data-sub]');
      if (sub) { const x = sub.dataset.sub; const set = new Set(state.settings.subthemes || []); set.has(x) ? set.delete(x) : set.add(x); state.settings.subthemes = [...set]; saveSettings(); renderSubthemes(); return; }
      const th = e.target.closest('.theme-btn');
      if (th) { state.settings.theme = th.dataset.theme; onSetting('theme'); return; }
      const uh = e.target.closest('[data-usehol]');
      if (uh) { state.settings.holiday = uh.dataset.usehol; saveSettings(); renderPickers(); showView('generate'); toast('Holiday set'); return; }
      const uc = e.target.closest('[data-usecat]');
      if (uc) { const set = new Set(state.settings.categories || []); set.add(uc.dataset.usecat); state.settings.categories = [...set]; saveSettings(); renderPickers(); toast('Added to picker'); }
    });
    $('#btnGenerate').addEventListener('click', generate);
    $('#btnReroll').addEventListener('click', reroll);
    $('#results').addEventListener('click', onResultsClick);
    $('#onlyFav').addEventListener('change', renderResults);
    $('#btnCopyAll').addEventListener('click', copyAll);
    $('#btnExportMd').addEventListener('click', () => exportAs('md'));
    $('#btnExportCsv').addEventListener('click', () => exportAs('csv'));
    $('#btnExportTxt').addEventListener('click', () => exportAs('txt'));
    $('#btnSavePack').addEventListener('click', () => savePack($('#packName').value));
    $('#btnSavePack2').addEventListener('click', () => { if (savePack($('#packName').value)) $('#packName').value = ''; });
    $('#packList').addEventListener('click', onPackClick);
    $('#packList').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('rename-input')) { e.preventDefault(); e.target.closest('li').querySelector('[data-pact="rename-ok"]').click(); } });
    $('#btnExportPacks').addEventListener('click', exportPacks);
    $('#importPacks').addEventListener('change', e => { const f = e.target.files[0]; if (f) importPacks(f); e.target.value = ''; });
    $('#btnShare').addEventListener('click', () => { const u = shareUrl(); $('#shareUrl').value = u; $('#shareDialog').showModal(); $('#shareUrl').select(); });
    $('#btnCopyShare').addEventListener('click', async () => { await copyText($('#shareUrl').value); toast('Share link copied'); });
    $('#btnCopyBrief').addEventListener('click', async () => { await copyText(briefText); toast('Brief copied'); });
    $('#trendSearch').addEventListener('input', renderTrends);
    // AI settings
    $('#set-model').addEventListener('change', e => { state.settings.models = Object.assign({}, state.settings.models, { [state.settings.provider]: e.target.value.trim() || AI.PROVIDERS[state.settings.provider].defaultModel }); saveSettings(); renderProvider(); toast('Model saved'); });
    $('#btnSaveKey').addEventListener('click', () => {
      const v = $('#set-key').value.trim(); if (!v) { toast('Paste a key first'); return; }
      if (/\s/.test(v)) { toast('That key contains spaces; check it.'); return; }
      LS.set(K.key(state.settings.provider), v); renderProvider(); toast('Key saved in this browser only');
    });
    $('#btnForgetKey').addEventListener('click', () => { LS.del(K.key(state.settings.provider)); $('#set-key').value = ''; renderProvider(); toast('Key forgotten (removed from this browser)'); });
    $('#btnShowKey').addEventListener('click', e => { const i = $('#set-key'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; e.target.textContent = show ? 'Hide' : 'Show'; e.target.setAttribute('aria-pressed', String(show)); });
    $('#btnAiWrite').addEventListener('click', () => aiWrite(false));
    $('#btnAiUpgrade').addEventListener('click', () => aiWrite(true));
    $('#btnAnalyze').addEventListener('click', analyzeImage);
    $('#imgInput').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try { state.image = await readImage(f); const p = $('#imgPreview'); p.src = state.image.dataUrl; p.hidden = false; setAiStatus('Image ready. Click "Analyze image".'); }
      catch (err) { state.image = null; setAiStatus(err.friendly || 'Could not read that image.', 'error'); }
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', () => { if (applyHash()) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } $$('[data-bind]').forEach(el => setControl(el, state.settings[el.dataset.bind])); applyTheme(); pruneHidden(); renderPickers(); syncCharUI(); $('#seedLabel').textContent = state.settings.seed; saveSettings(); generate(); } });

    // ---- Characters (panels + sticky bar) ----
    document.addEventListener('change', e => {
      const master = e.target.closest('[data-char-master]');
      if (master) { setCharactersOn(master.checked); return; }
      const chk = e.target.closest('[data-char-check]');
      if (chk) { setCharacterChecked(chk.dataset.charCheck || chk.getAttribute('data-char-check'), chk.checked); }
    });
    document.addEventListener('click', e => {
      if (e.target.id === 'charBarToggle' || e.target.closest('#charBarToggle')) {
        setCharactersOn(!state.settings.charactersOn);
        return;
      }
      if (e.target.id === 'charBarMenu' || e.target.closest('#charBarMenu')) {
        openCharPopover(!state.charPopover);
        return;
      }
      if (e.target.id === 'charBarClose' || e.target.closest('#charBarClose')) { openCharPopover(false); return; }
      if (e.target.id === 'charBarEdit' || e.target.closest('#charBarEdit')) {
        openCharPopover(false); showView('generate');
        const panel = $('#charactersPanel'); if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      // Click outside closes popover
      if (state.charPopover && !e.target.closest('#charBar')) openCharPopover(false);

      const actBtn = e.target.closest('[data-char-act]');
      if (!actBtn) return;
      const act = actBtn.dataset.charAct;
      if (act === 'add') {
        const id = 'custom_' + Date.now().toString(36);
        state.characters.push({ id, name: 'New character', text: 'New character - describe looks, outfit, and voice.', avatar: '', emoji: '✨' });
        state.settings.characterIds = checkedCharacterIds().concat([id]);
        saveCharacters(); saveSettings(); syncCharUI(); toast('Character added'); return;
      }
      if (act === 'reset') {
        state.characters = BZ.cloneDefaultCharacters();
        state.charVersion = BZ.CHAR_DEFAULTS_VERSION;
        state.settings.characterIds = state.characters.map(c => c.id);
        saveCharacters(); saveSettings(); syncCharUI(); renderResults(); toast('Characters reset to defaults'); return;
      }
      const id = actBtn.dataset.charId;
      const card = actBtn.closest('.char-card');
      if (act === 'edit' && card) {
        card.querySelector('.char-edit-row').hidden = false;
        card.querySelector('.char-card-acts').hidden = true;
        card.querySelector('.char-text-desktop') && (card.querySelector('.char-text-desktop').style.display = 'none');
        card.querySelector('.char-details') && (card.querySelector('.char-details').style.display = 'none');
        return;
      }
      if (act === 'cancel' && card) { syncCharUI(); return; }
      if (act === 'save' && card) {
        const c = state.characters.find(x => x.id === id); if (!c) return;
        const name = (card.querySelector('[data-char-name]') || {}).value || c.name;
        const txt = (card.querySelector('[data-char-text]') || {}).value || c.text;
        c.name = String(name).trim().slice(0, 60) || c.name;
        c.text = String(txt).trim().slice(0, 800) || c.text;
        saveCharacters(); syncCharUI(); renderResults(); toast('Saved ' + c.name); return;
      }
      if (act === 'delete') {
        if (state.characters.length <= 1) { toast('Keep at least one character (or reset to defaults).'); return; }
        if (actBtn.dataset.confirm !== '1') { actBtn.dataset.confirm = '1'; actBtn.textContent = 'Confirm?'; setTimeout(() => { if (actBtn.isConnected) { actBtn.dataset.confirm = ''; actBtn.textContent = '🗑 Delete'; } }, 4000); return; }
        state.characters = state.characters.filter(c => c.id !== id);
        state.settings.characterIds = checkedCharacterIds().filter(x => x !== id);
        saveCharacters(); saveSettings(); syncCharUI(); renderResults(); toast('Character deleted');
      }
    });
  }

  // ---------------- Init ----------------
  async function init() {
    $('#versionLabel').textContent = VERSION;
    const fromHash = applyHash();
    if (fromHash) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    await loadData();
    if (!Array.isArray(state.settings.categories)) state.settings.categories = defaultCategories();
    pruneHidden();
    $('#set-lang').innerHTML = BZ.LANGS.map(l => `<option>${esc(l)}</option>`).join('');
    renderThemes(); renderBanner(); renderPickers(); bindAll(); renderSpec(); renderProvider(); renderPacks(); renderTrends(); checkTrademarks();
    syncCharUI();
    $('#avoidList').textContent = BZ.AVOID.join(' · ');
    $('#seedLabel').textContent = state.settings.seed;
    wire();
    saveSettings();
    if (fromHash || !state.items.length) generate(); else renderResults();
    document.documentElement.dataset.ready = '1';
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { /* offline install optional */ });
  }
  init();
})();

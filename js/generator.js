/* generator.js: data normalization, seeded RNG, offline prompt templates, briefs, trademark checks */
(function () {
  'use strict';

  // EXACT spec block, appended by code to every prompt (never trusted to the AI).
  const SPEC_BLOCK = [
    '• File format: PNG with transparent background (BEST)',
    '• Resolution: 600 DPI for sharpest print (300 DPI minimum)',
    '• Print size: 12" x 16" at 300 DPI = 3600 x 4800 pixels',
    '• Color mode: sRGB',
    '• Max file size: 200 MB',
    '• No blurry edges — use PNG',
    '• No JPG backgrounds',
    'Add a awesome background with cool orange boarder to go on a blank black tshirt design for fourthwall.com'
  ].join('\n');

  const AVOID = ['t-shirt mockups', 'shirts, models, mannequins or hangers', 'trademarked logos, brands or characters',
    'celebrity or real-person likeness', 'watermarks or signatures', 'misspelled or garbled text',
    'photo backgrounds', 'cropped or cut-off edges', 'tiny unprintable details'];

  // Common brands/characters/franchises. Keyword matches trigger a warning (not legal advice).
  const BRANDS = ['nike','adidas','puma','reebok','under armour','supreme','gucci','louis vuitton','chanel','prada','versace','balenciaga','off-white','stussy','converse','air jordan','yeezy',
    'disney','pixar','marvel','dc comics','star wars','jedi','yoda','grogu','baby yoda','mandalorian','darth vader','harry potter','hogwarts','pokemon','pokémon','pikachu','nintendo','mario','luigi','zelda','sega','playstation','xbox','minecraft','fortnite','roblox','among us','call of duty',
    'mickey','minnie','donald duck','winnie the pooh','elsa','barbie','hot wheels','lego','hello kitty','sanrio','kuromi','garfield','snoopy','looney tunes','bugs bunny','scooby','simpsons','spongebob','rick and morty','family guy','south park','bluey','paw patrol','peppa',
    'batman','superman','spider-man','spiderman','iron man','hulk','avengers','wonder woman','deadpool','x-men','transformers','godzilla','ghostbusters','jurassic park','stranger things','game of thrones',
    'coca-cola','pepsi','starbucks','mcdonald','burger king','taco bell','red bull','monster energy','budweiser','jack daniels','heineken','harley-davidson','harley davidson','chevy','jeep','tesla','google','microsoft','amazon','netflix','youtube','tiktok','instagram','facebook','twitter','spotify',
    'nfl','nba','mlb','nhl','mls','ufc','wwe','fifa','olympic','olympics','super bowl','march madness','world series','ncaa',
    'grateful dead','rolling stones','nirvana','metallica','ac/dc','acdc','led zeppelin','pink floyd','beatles','kiss band','taylor swift','beyonce','drake','eminem','bad bunny','elvis','marilyn monroe','michael jackson','tupac',
    'care bears','my little pony','teenage mutant','tmnt','power rangers','he-man','smurfs','sesame street','muppets','alien xenomorph','et the extra','toy story','shrek','minions','despicable me','how to train your dragon','one piece','naruto','dragon ball','goku','demon slayer','jujutsu','attack on titan','studio ghibli','totoro','sailor moon','chainsaw man'];
  const CELEB_HINT = /\b(trump|biden|obama|elon|musk|kardashian|swift|kanye|oprah|keanu|snoop dogg|rihanna)\b/i;

  function trademarkHits(text) {
    if (!text) return [];
    let t = ' ' + String(text).toLowerCase() + ' ';
    AVOID.forEach(a => { t = t.split(a.toLowerCase()).join(' '); });
    const hits = BRANDS.filter(b => {
      const esc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('(^|[^a-z0-9])' + esc + '($|[^a-z0-9])', 'i').test(t);
    });
    const m = t.match(CELEB_HINT);
    if (m) hits.push(m[1] + ' (real person / likeness)');
    return [...new Set(hits)];
  }

  // ---------- Seeded RNG (mulberry32 seeded by an FNV-1a string hash) ----------
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function makeRng(seed) {
    let a = hashStr(String(seed)) || 1;
    const next = function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    next.pick = arr => arr[Math.floor(next() * arr.length)];
    next.chance = p => next() < p;
    next.shuffle = arr => { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
    next.sample = (arr, k) => next.shuffle(arr).slice(0, k);
    return next;
  }
  function randomSeed() { const w = ['alien','jinxy','ufo','cosmic','neon','orange','tee','zap','retro','purr','saucer','glow']; return w[Math.floor(Math.random() * w.length)] + '-' + Math.random().toString(36).slice(2, 7); }

  // ---------- Data normalization (accepts strings or objects; tolerant of schema drift) ----------
  const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60) || 'item';
  const arr = v => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
  const str = v => (v == null ? '' : typeof v === 'string' ? v : (v.name || v.label || v.text || v.title || v.phrase || v.motif || v.id || JSON.stringify(v)));
  function normType(t) {
    t = String(t || '').toLowerCase();
    if (/^sourc|cited|verified|primary/.test(t)) return 'sourced';
    if (/^unverif|unconfirm|unknown|blocked/.test(t)) return 'unverified';
    if (/^infer|derived|estimat|analysis|partial/.test(t)) return 'inferred';
    return 'example';
  }
  function normEvidence(ev) {
    return arr(ev).map(e => typeof e === 'string' ? { source: e, url: /^https?:/.test(e) ? e : '', note: '', checked: '', type: 'example' }
      : { source: str(e.source || e.title || e.publisher || e.url || 'Source'), url: e.url || e.link || '', note: e.note || e.summary || e.quote || '', checked: e.checked || e.date || e.accessed || '', type: normType(e.type), rawType: String(e.type || 'example') });
  }
  function deriveType(item) {
    if (item.type) return normType(item.type);
    const ts = item.evidence.map(e => e.type);
    if (ts.includes('sourced')) return 'sourced';
    if (ts.includes('inferred')) return 'inferred';
    if (ts.includes('unverified')) return 'unverified';
    return 'example';
  }
  function stripSpecBlock(t) { const i = t.indexOf(SPEC_BLOCK.split('\n')[0]); return (i >= 0 ? t.slice(0, i) : t).trim(); }
  let HOUSE_TEMPLATE = '';
  function setHouseTemplate(t) { HOUSE_TEMPLATE = t || ''; }
  const BACKGROUNDS = ['starfield', 'nebula swirl texture', 'halftone dot pattern', 'grunge texture', 'geometric pattern', 'night sky with tiny stars', 'retro sunburst rays', 'topographic line pattern', 'paint-splatter texture'];
  const BRAND_PRESETS = [
    { id: 'bizzle-invades', name: 'Bizzle Invades ___', description: 'Bizzle the green alien crashes a trend or holiday scene', motifs: ['Bizzle the friendly green alien', 'Bizzle piloting a tiny flying saucer'] },
    { id: 'jinxy-chaos', name: 'Jinxy Chaos Mode', description: 'Jinxy the orange-and-white cat causing cute chaos', motifs: ['Jinxy the orange and white cat', 'Jinxy knocking things over'] },
    { id: 'duo-adventure', name: 'Bizzle & Jinxy Adventure', description: 'The alien and the cat on an adventure together', motifs: ['Bizzle the green alien and Jinxy the orange and white cat together'] },
    { id: 'orange-border-tee', name: 'Orange Border Black Tee', description: 'Graphic framed by a thick cool orange border for a black tee', motifs: ['a bold graphic framed inside a thick glowing orange border panel'] }
  ];
  const ADULT_RE = /\b(420|4\/20|cannabis|weed|marijuana|stoner|thc|18\+|21\+|nsfw|adult)\b/i;
  function normalize(raw) {
    raw = raw || {};
    const out = { generated: raw.generated || raw.updated || '', disclaimer: raw.disclaimer || '', placeholder: !!raw.placeholder };
    out.categories = arr(raw.categories).map((c, i) => {
      if (typeof c === 'string') c = { name: c };
      const o = { id: c.id || slug(c.name) || 'cat' + i, name: c.name || c.title || c.id || 'Category ' + (i + 1),
        adult: !!(c.adult || c.nsfw || c.age_restricted) || ADULT_RE.test((c.id || '') + ' ' + (c.name || '')),
        subthemes: arr(c.subthemes || c.subcategories || c.niches).map(str).filter(Boolean),
        motifs: arr(c.motifs || c.elements || c.subjects).map(str).filter(Boolean),
        styles: arr(c.styles).map(str).filter(Boolean),
        example_phrases: arr(c.example_phrases || c.phrases || c.slogans).map(str).filter(Boolean),
        description: c.description || c.summary || '', evidence: normEvidence(c.evidence || c.sources), type: c.type };
      if (!o.motifs.length) o.motifs = o.subthemes.length ? o.subthemes.slice() : [o.name + ' themed illustration'];
      o.type = deriveType(o); return o;
    });
    out.holidays = arr(raw.holidays).map((h, i) => {
      if (typeof h === 'string') h = { name: h };
      const o = { id: h.id || slug(h.name) || 'hol' + i, name: h.name || h.id || 'Holiday ' + (i + 1),
        date_2026: h.date_2026 || (h.dates && h.dates['2026']) || '', date_2027: h.date_2027 || (h.dates && h.dates['2027']) || '',
        sell_window: h.sell_window || h.sellWindow || '', motifs: arr(h.motifs || h.elements).map(str).filter(Boolean),
        phrases: arr(h.example_phrases || h.phrases).map(str).filter(Boolean),
        adult: !!h.adult || ADULT_RE.test((h.id || '') + ' ' + (h.name || '')),
        evidence: normEvidence(h.evidence || h.sources), type: h.type };
      if (!o.motifs.length) o.motifs = [o.name + ' celebration'];
      o.type = deriveType(o); return o;
    });
    out.styles = arr(raw.styles).map((s, i) => {
      if (typeof s === 'string') s = { name: s };
      const o = { id: s.id || slug(s.name) || 'style' + i, name: s.name || s.label || s.id, prompt: s.style_string || s.prompt || s.prompt_fragment || s.description || '',
        do: arr(s.do).map(str), dont: arr(s.dont).map(str), palette: arr(s.palette).map(str), note: s.note || '',
        evidence: normEvidence(s.evidence || s.sources), type: s.type };
      o.adult = !!s.adult || ADULT_RE.test(o.id + ' ' + o.name); o.type = deriveType(o); return o;
    }).filter(s => s.name);
    out.palettes = arr(raw.palettes).map((p, i) => {
      if (typeof p === 'string') p = { name: p };
      const colors = arr(p.colors || p.hex || p.swatches).map(c => typeof c === 'string' ? c : (c.hex || c.value || '')).filter(Boolean);
      const o = { id: p.id || slug(p.name) || 'pal' + i, name: p.name || p.id, colors, note: p.note || '', evidence: normEvidence(p.evidence || p.sources), type: p.type };
      o.type = deriveType(o); return o;
    }).filter(p => p.name);
    const stylesTmp = arr(raw.styles).filter(x => x && typeof x === 'object');
    out.themes = arr(raw.themes || raw.ai_themes || raw.theme_presets || raw.ai_theme_presets || raw.presets).map((t, i) => {
      if (typeof t === 'string') {
        const st = stylesTmp.find(x => x.id === t || slug(x.id) === slug(t));
        t = st ? { id: 'preset-' + st.id, name: st.name || t, description: st.style_string || st.description || '', style: st.name || t, motifs: [], type: st.type, evidence: st.evidence } : { name: t.replace(/_/g, ' ') };
      }
      const o = { id: t.id || slug(t.name) || 'theme' + i, name: t.name || t.id, description: t.description || t.prompt || '', style: t.style || '',
        motifs: arr(t.motifs || t.elements || t.prompt_fragments).map(str).filter(Boolean), evidence: normEvidence(t.evidence || t.sources), type: t.type };
      if (!o.motifs.length && o.description && !o.style) o.motifs = [o.description];
      o.adult = !!t.adult || ADULT_RE.test(o.id + ' ' + o.name); o.type = deriveType(o); return o;
    }).filter(t => t.name);
    const styleById = {}; out.styles.forEach(st => { styleById[st.id] = st.name; styleById[slug(st.id)] = st.name; });
    out.categories.forEach(c => { c.styles = c.styles.map(x => styleById[x] || styleById[slug(x)] || String(x).replace(/_/g, ' ')); });
    out.themes = out.themes.concat(BRAND_PRESETS.filter(b => !out.themes.some(t => t.id === b.id)).map(t => Object.assign({}, t, { evidence: [{ source: 'Built-in brand preset (Bizzle & Jinxy)', url: '', note: 'Brand theme preset, not trend research', checked: '', type: 'example', rawType: 'example' }], type: 'example' })));
    out.extras = {}; ['generator_limits', 'fourthwall_specs', 'post_processing', 'blocked_sources'].forEach(k => { if (raw[k]) out.extras[k] = raw[k]; });
    out.houseTemplate = raw.prompt_template ? stripSpecBlock(String(raw.prompt_template)) : '';
    out.specFromData = raw.required_spec_block || '';
    out.allExample = [...out.categories, ...out.holidays].every(x => x.type === 'example');
    return out;
  }

  // ---------- Template vocab ----------
  const DEFAULT_STYLES = ['bold cartoon vector illustration','retro 70s sunset stripes','vintage distressed screen print','kawaii chibi','synthwave neon glow','Y2K chrome','psychedelic trippy','hand-drawn tattoo flash','minimal line art','pixel art 8-bit','woodcut linocut print','comic pop-art halftone','graffiti street art','celestial tarot card art','vintage badge emblem','grunge horror ink','watercolor splash'];
  const COMPOSITIONS = ['centered emblem composition with a strong silhouette','circular badge layout with the subject inside a bold ring','vertical stacked layout with the illustration as the hero','arched layout with the subject framed by a curved banner','shield crest layout','retro sunset circle behind the subject','oversized full-front graphic filling the 12x16 print area','die-cut sticker style with a thick contrasting outline','symmetrical tarot-card frame','dynamic diagonal action pose breaking out of a frame','vintage ticket/label layout','small centered icon with generous negative space','triangle mountain-badge layout','scattered pattern of small icons around a central hero'];
  const MODIFIERS = ['thick clean outlines','halftone shading','subtle grain texture','glowing rim light','bold drop shadow','sparkle and star accents','motion lines','hand-inked linework','flat colors limited to 4-6 inks for screen printing','high-detail cel shading','playful exaggerated proportions','smooth gradients','distressed worn print texture','geometric shapes in the background','paint splatter accents','neon outline glow','crosshatch shading','sticker-like glossy highlights'];
  const FONTS = ['chunky retro serif','bold brush script','distressed varsity block letters','bubbly cartoon letters','neon tube script','gothic blackletter','clean bold sans-serif','groovy 70s bubble font','hand-lettered marker style'];
  const HUMOR = ['with a ridiculous over-the-top facial expression','in an absurd comedic situation','with deadpan meme-style humor','as a silly visual pun','caught red-handed doing something mischievous'];
  const DETAIL = ['intricate linework','rich textures','layered depth','dramatic lighting','fine ornamental details','carefully balanced shapes'];
  const MASCOTS = {
    bizzle: 'Bizzle, a friendly cartoon green alien with big glossy black almond eyes and a mischievous smile',
    jinxy: 'Jinxy, a cute orange-and-white cartoon cat with big expressive eyes',
    both: 'Bizzle the friendly green cartoon alien (big black almond eyes) together with Jinxy the orange-and-white cartoon cat'
  };
  const DEFAULT_PALETTES = [{ name: 'Orange on Black', colors: ['#ff7a00', '#ffb347', '#ffffff'] }, { name: 'Neon Alien Green', colors: ['#39ff14', '#00e5ff', '#b026ff'] }, { name: 'Retro Sunset', colors: ['#ff6b35', '#efa00b', '#d62246'] }];
  const LANGS = ['English','Spanish','French','German','Portuguese','Italian','Dutch','Japanese','Korean','Chinese (Simplified)','Hindi','Arabic','Tagalog','Vietnamese','Polish','Turkish'];

  const cap = s => String(s || '').replace(/(^|\s|-)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const lc1 = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;

  /**
   * Build N unique design-only prompts.
   * opts: {count, seed, categories:[cat], holiday, subthemes:[str], keywords:[str], preset, styles:[{name,prompt}], style:'mix'|name,
   *        palettes:[{name,colors}], palette:'mix'|id, text:'mix'|'text'|'none', mascots, target, aspect, lang, avoid}
   */
  function generate(opts) {
    const rng = makeRng(opts.seed + '|' + (opts.salt || ''));
    const count = Math.max(1, Math.min(100, opts.count | 0 || 50));
    let cats = opts.categories.slice();
    const hol = opts.holiday || null;
    const styleNames = (opts.style && opts.style !== 'mix') ? [opts.style] : (opts.preset && opts.preset.style ? [opts.preset.style] : null);
    const globalStyles = (opts.styles && opts.styles.length ? opts.styles.map(s => s.name) : DEFAULT_STYLES);
    const pals = (opts.palettes && opts.palettes.length ? opts.palettes : DEFAULT_PALETTES);
    const fixedPal = (opts.palette && opts.palette !== 'mix') ? pals.find(p => p.id === opts.palette) : null;
    if (!cats.length && hol) cats = [{ id: 'holiday-' + hol.id, name: hol.name, motifs: hol.motifs, subthemes: [], styles: [], example_phrases: hol.phrases || [], _holidayOnly: true }];
    if (!cats.length) cats = [{ id: 'general', name: 'General', motifs: ['a striking original illustration'], subthemes: [], styles: [], example_phrases: [] }];
    const order = rng.shuffle(cats);
    const items = []; const seenKeys = new Set(); const seenText = new Set();
    let attempts = 0; const maxAttempts = count * 80;
    while (items.length < count && attempts < maxAttempts) {
      attempts++;
      const cat = order[items.length % order.length];
      const strict = attempts < count * 40; // after many collisions allow extra modifiers
      const item = buildOne(rng, cat, { ...opts, hol, styleNames, globalStyles, pals, fixedPal, extraMods: strict ? 1 : 3 });
      const key = [item.category, item.motif, item.style, item.composition, item.palette, item.phrase, item.mascot, item.holidayMotif, item.keyword, item.mods.join('+')].join('|');
      const txt = (item.variants.gemini || '') + (item.variants.grok || '');
      if (seenKeys.has(key) || seenText.has(txt)) continue;
      seenKeys.add(key); seenText.add(txt);
      item.n = items.length + 1; items.push(item);
    }
    return items;
  }

  function buildOne(rng, cat, o) {
    const sel = (o.subthemes || []).filter(s => (cat.subthemes || []).includes(s));
    const motif = rng.pick(cat.motifs);
    const sub = sel.length ? rng.pick(sel) : (cat.subthemes && cat.subthemes.length && rng.chance(0.35) ? rng.pick(cat.subthemes) : '');
    const catStyles = (cat.styles || []);
    const style = o.styleNames ? o.styleNames[0] : (catStyles.length && rng.chance(0.45) ? rng.pick(catStyles) : rng.pick(o.globalStyles));
    const stylePrompt = ((o.styles || []).find(s => s.name === style) || {}).prompt || '';
    const pal = o.fixedPal || rng.pick(o.pals);
    const composition = rng.pick(COMPOSITIONS);
    const nm = 1 + Math.floor(rng() * 2) + (o.extraMods > 1 ? 1 : 0);
    const mods = rng.sample(MODIFIERS, nm).sort();
    let holidayMotif = '';
    if (o.hol && !cat._holidayOnly && rng.chance(0.75)) holidayMotif = rng.pick(o.hol.motifs);
    const kws = o.keywords || [];
    const keyword = kws.length && rng.chance(0.6) ? rng.pick(kws) : '';
    let mascot = '';
    if (o.mascots === 'always' || (o.mascots === 'some' && rng.chance(0.35))) mascot = rng.pick(['bizzle', 'jinxy', 'both']);
    let presetMotif = '';
    if (o.preset && o.preset.motifs.length && rng.chance(0.65)) presetMotif = rng.pick(o.preset.motifs.length ? o.preset.motifs : [o.preset.name]);
    const wantText = o.text === 'text' || (o.text === 'mix' && rng.chance(0.5));
    let phrase = '';
    if (wantText) {
      const pool = [...(cat.example_phrases || [])];
      if (o.hol) pool.push(...(o.hol.phrases || []), o.hol.name.replace(/\s*\(.*?\)\s*/g, '') + ' Vibes', 'Official ' + o.hol.name.replace(/\s*\(.*?\)\s*/g, '') + ' Shirt');
      if (keyword) pool.push(cap(keyword) + ' Club', 'Powered By ' + cap(keyword));
      if (mascot === 'bizzle' || mascot === 'both') pool.push('Bizzle Approved', 'Abducted By Good Vibes');
      if (mascot === 'jinxy' || mascot === 'both') pool.push('Jinxy Did It', 'Blame The Cat');
      phrase = pool.length ? rng.pick(pool) : cap(motif.split(' ').slice(0, 3).join(' '));
    }
    const font = rng.pick(FONTS);
    const it = { id: 'p' + Math.floor(rng() * 1e9).toString(36), category: cat.id, catName: cat.name, motif, subtheme: sub, style, palette: pal.name,
      paletteColors: pal.colors || [], composition, mods, holiday: o.hol ? o.hol.name : '', holidayMotif, keyword, mascot, preset: presetMotif,
      phrase, font, humor: '', detail: '', background: rng.pick(BACKGROUNDS), format: o.format || 'varied', source: 'template', fav: false, aspect: o.aspect, lang: o.lang, target: o.target, avoid: o.avoid, stylePrompt,
      charNames: Array.isArray(o.charNames) ? o.charNames.slice() : [] };
    it.variants = renderVariants(it, rng);
    it.title = makeTitle(it);
    return it;
  }

  function subjectOf(it) {
    let s = it.motif;
    if (it.mascot) s = MASCOTS[it.mascot] + ', in a scene with ' + lc1(it.motif);
    if (it.preset && !it.mascot) s = it.preset + ' with ' + lc1(it.motif);
    if (it.subtheme) s += ' (' + it.subtheme + ' theme)';
    if (it.holidayMotif) s += ', with ' + it.holidayMotif + ' for ' + it.holiday;
    if (it.keyword) s += ', incorporating ' + it.keyword;
    if (it.humor) s += ', ' + it.humor;
    return s;
  }
  function housePrompt(it) {
    const subj = subjectOf(it);
    const style = it.stylePrompt || it.style;
    let t = HOUSE_TEMPLATE;
    if (it.phrase) t = t.replace('{text}', it.phrase).replace('{font_style}', it.font);
    else t = t.replace(/^.*\{text\}.*$/m, noTextHouse(it));
    t = t.replace('{subject}', subj).replace('{style_string}', style + (it.mods.length ? ', ' + it.mods.join(', ') : '') + (it.detail ? ', ' + it.detail : ''))
      .replace('{palette}', colors(it)).replace('{background}', it.background || 'starfield').replace(/3:4 portrait/g, (it.aspect || '3:4') + ' portrait');
    if (it.lang && it.lang !== 'English') t += `\nAll lettering in ${it.lang}.`;
    return t.replace(/\{[a-z_]+\}/g, '').trim();
  }
  function houseGrok(it) {
    const text = it.phrase ? `bold "${it.phrase}" text in ${it.font}, spelled exactly` : noTextGrok(it);
    return `Flat 2D print-ready t-shirt graphic, ${subjectOf(it)}, ${it.stylePrompt || it.style}, ${it.mods.join(', ')}${it.detail ? ', ' + it.detail : ''}, ${colors(it)}, ${text}, centered inside a thick continuous rounded orange (#FF6A00) border panel with a dark cool ${it.background || 'starfield'} interior, flat pure white background outside the border, ${it.aspect || '3:4'} portrait, clean bold outlines, solid fills, crisp edges, no glow, no blur, no mockup, no shirt, no real brands, logos, characters or celebrities${it.lang && it.lang !== 'English' ? ', lettering in ' + it.lang : ''}`;
  }
  function renderVariants(it, rng) {
    const v = {};
    if (it.format === 'house' && HOUSE_TEMPLATE) {
      if (rng) rng();
      const t0 = it.target || 'both'; const hp = housePrompt(it);
      if (t0 === 'gemini' || t0 === 'both') v.gemini = hp;
      if (t0 === 'grok' || t0 === 'both') v.grok = t0 === 'both' ? houseGrok(it) : hp;
      return v;
    }
    const t = it.target || 'both';
    const tpl = rng ? Math.floor(rng() * 3) : (it.tpl || 0);
    it.tpl = tpl;
    if (t === 'gemini' || t === 'both') v.gemini = geminiPrompt(it, tpl);
    if (t === 'grok' || t === 'both') v.grok = grokPrompt(it, tpl);
    return v;
  }
  function langClause(it) { return it.lang && it.lang !== 'English' ? ` All lettering must be written in ${it.lang} (translate the slogan naturally).` : ''; }
  function colors(it) { return it.paletteColors && it.paletteColors.length ? `${it.palette} palette (${it.paletteColors.join(', ')})` : `${it.palette} palette`; }
  function charNameList(it) {
    const n = (it && it.charNames) || [];
    return Array.isArray(n) ? n.filter(Boolean) : [];
  }
  /** No-slogan clause; when house characters are on, allow their necklace/collar name lettering. */
  function noTextGemini(it) {
    const names = charNameList(it);
    if (names.length) return `No slogans or other text, except the character name lettering on their necklaces and collars (${names.join(', ')}).`;
    return 'No text, letters, numbers or words anywhere in the design.';
  }
  function noTextGrok(it) {
    const names = charNameList(it);
    if (names.length) return `no slogans or other text except the character name lettering on their necklaces and collars (${names.join(', ')})`;
    return 'no text, no letters';
  }
  function noTextHouse(it) {
    const names = charNameList(it);
    if (names.length) return `Text: none. No slogans or other text, except the character name lettering on their necklaces and collars (${names.join(', ')}).`;
    return 'Text: none. No letters, numbers or words anywhere.';
  }
  function geminiPrompt(it, tpl) {
    const subj = subjectOf(it);
    const style = it.style + (it.stylePrompt ? ' (' + it.stylePrompt + ')' : '');
    const mods = it.mods.join(', ') + (it.detail ? ', ' + it.detail : '');
    const text = it.phrase ? `Include the text "${it.phrase}" in ${it.font} lettering, large, highly legible and spelled exactly as written.` : noTextGemini(it);
    const avoid = it.avoid ? ' Avoid: ' + AVOID.join(', ') + '.' : '';
    const intro = ['Create a design-only t-shirt graphic (a standalone isolated artwork for printing, NOT a mockup).',
      'Generate an original print-ready t-shirt design: just the artwork itself, isolated, with no shirt or mockup.',
      'Illustrate a standalone graphic tee design (artwork only, no garment, no model, no mockup).'][tpl % 3];
    return `${intro} Subject: ${subj}. Art style: ${style}, with ${mods}. Composition: ${it.composition}, ${it.aspect} vertical canvas with clean margins. Colors: ${colors(it)}, bright and high-contrast so it pops on a black shirt. ${text} Crisp edges, solid shapes, plain removable background.${avoid}${langClause(it)}`;
  }
  function grokPrompt(it, tpl) {
    const subj = subjectOf(it);
    const text = it.phrase ? `bold "${it.phrase}" text in ${it.font}, correctly spelled` : noTextGrok(it);
    const avoid = it.avoid ? ', no ' + AVOID.slice(0, 6).join(', no ') : '';
    const lead = ['t-shirt graphic design', 'isolated tee print artwork', 'standalone t-shirt design'][tpl % 3];
    return `${lead}, ${subj}, ${it.style}, ${it.mods.join(', ')}${it.detail ? ', ' + it.detail : ''}, ${it.composition}, ${colors(it)}, ${text}, design only, isolated on plain background, crisp vector-like edges, high contrast for black fabric, aspect ratio ${it.aspect}${avoid}${it.lang && it.lang !== 'English' ? ', lettering in ' + it.lang : ''}`;
  }
  function makeTitle(it) {
    if (it.phrase) return it.phrase;
    const m = it.motif.replace(/^(a|an|the)\s+/i, '').split(/\s+/).slice(0, 5).join(' ');
    return cap(m) + (it.holiday ? ' · ' + it.holiday : '');
  }

  // ---------- Offline refine ----------
  function refineOffline(it, kind, styles, seedSalt) {
    const rng = makeRng(it.id + kind + (seedSalt || Date.now()));
    const n = JSON.parse(JSON.stringify(it));
    if (n.source && n.source !== 'template') { // AI-written text: append a refinement clause instead of rebuilding
      const pool = (styles && styles.length ? styles.map(s => s.name) : DEFAULT_STYLES).filter(s => s !== n.style);
      const add = {
        detail: ['Add much more visual detail: ' + rng.sample(DETAIL, 2).join(', ') + '.', 'more detail, ' + rng.sample(DETAIL, 2).join(', ')],
        style: (st => { n.style = st; return ['Render it in ' + st + ' style instead.', 'restyled as ' + st]; })(rng.pick(pool)),
        text: (ph => { n.phrase = n.phrase || ph; const f = rng.pick(FONTS); return [`Include the text "${n.phrase}" in ${f} lettering, spelled exactly as written.`, `bold "${n.phrase}" text in ${f}`]; })(rng.pick(['Out Of This World', 'Stay Weird', 'Good Vibes Only', 'Not From Around Here'])),
        funny: (h => ['Make it funnier: ' + h + '.', 'funnier, ' + h])(rng.pick(HUMOR))
      }[kind];
      if (n.variants.gemini) n.variants.gemini = n.variants.gemini.replace(/\s+$/, '') + ' ' + add[0];
      if (n.variants.grok) n.variants.grok = n.variants.grok.replace(/[\s.]+$/, '') + ', ' + add[1];
      n.refined = (n.refined || 0) + 1;
      return n;
    }
    if (kind === 'detail') { n.detail = rng.sample(DETAIL, 2).join(', '); n.mods = [...new Set([...n.mods, rng.pick(MODIFIERS)])].sort(); }
    if (kind === 'style') { const pool = (styles && styles.length ? styles.map(s => s.name) : DEFAULT_STYLES).filter(s => s !== n.style); n.style = rng.pick(pool); n.stylePrompt = ((styles || []).find(s => s.name === n.style) || {}).prompt || ''; }
    if (kind === 'text') { if (!n.phrase) n.phrase = rng.pick(['Out Of This World', 'Stay Weird', 'Good Vibes Only', 'Not From Around Here', cap(n.motif.split(' ').slice(0, 3).join(' '))]); n.font = rng.pick(FONTS); }
    if (kind === 'funny') { n.humor = rng.pick(HUMOR); }
    n.variants = renderVariants(n, null);
    n.title = makeTitle(n);
    n.refined = (n.refined || 0) + 1;
    return n;
  }

  // ---------- Design brief ----------
  function brief(it) {
    const title = it.title || makeTitle(it);
    const words = [it.catName, it.style, it.motif, it.holiday, it.keyword, it.subtheme, it.mascot === 'bizzle' || it.mascot === 'both' ? 'alien' : '', it.mascot === 'jinxy' || it.mascot === 'both' ? 'cat' : '']
      .filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !/^(the|and|with|for|from|into|over|its|his|her|a|an|of|on|in|style|art|tiny|big|riding|holding|lovers|wearing|like|out|off|its)$/.test(w));
    const phraseTags = [];
    if (it.catName) phraseTags.push(it.catName.replace(/\(.*?\)/g, '').replace(/[&,/]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase() + ' shirt');
    if (it.holiday) phraseTags.push(it.holiday.replace(/\(.*?\)/g, '').trim().toLowerCase() + ' tee');
    if (it.phrase) phraseTags.push(it.phrase.toLowerCase());
    const generic = ['graphic tee', 'funny t-shirt', 'gift for him', 'gift for her', 'unisex shirt', 'black t-shirt', 'trendy shirt', 'novelty tee', 'cool shirt design', 'birthday gift', 'streetwear tee', 'original art tee', 'cute shirt'];
    const tags = [];
    for (const t of [...phraseTags, ...words.map(w => w + ' shirt'), ...words, ...generic]) {
      const tt = t.replace(/\s+/g, ' ').trim();
      if (tt && tt.length <= 20 && !tags.includes(tt) && tags.length < 13) tags.push(tt);
    }
    const desc = `${title}: an original ${it.style} design${it.holiday ? ' made for ' + it.holiday : ''}, featuring ${lc1(it.motif)}${it.mascot ? ' with ' + (it.mascot === 'both' ? 'Bizzle the alien and Jinxy the cat' : it.mascot === 'bizzle' ? 'Bizzle the alien' : 'Jinxy the cat') : ''}. Bold, high-contrast artwork printed on a soft black tee. Perfect gift for ${it.catName ? it.catName.toLowerCase().replace(/\(.*?\)/g, '').trim() + ' fans' : 'anyone who loves standout graphics'}. Designed by Bizzle's Tshirt Hut.`;
    return { title, productTitle: `${title} | ${cap(it.style.split(' ').slice(0, 3).join(' '))} Graphic Tee`, tags, description: desc,
      fourthwallTags: tags.slice(0, 5) };
  }


  // ---------- Characters (photorealistic cast; appended by code before the spec block) ----------
  const CHAR_HEADER = [
    'Character details,',
    'HD ultra-realistic photorealistic,',
    'Hd 8k ultra realistic'
  ].join('\n');
  const CHAR_DEFAULTS_VERSION = 2;
  const DEFAULT_CHARACTERS = [
    { id: 'bizzle', name: 'Bizzle', text: 'Bizzle - Green annunaki Male alien. Wearing a awesome hiphop white gold diamond necklace that says,  \"Bizzle \". Cat dad tshirt, baggy custom hiphop jeans, custom neon green weed sneakers,\nAdd clothes that are funny and related to each prompt.', avatar: 'img/bizzle.jpg', emoji: '👽' },
    { id: 'jinxy', name: 'Jinxy', text: 'Jinxy - fluffy orange and white boy cat with bright blue eyes. Wearing a huge white gold diamond hiphop necklace that says, \"Jinxy\".', avatar: 'img/jinxy.jpg', emoji: '🐱' },
    { id: 'blaze', name: 'Blaze', text: 'Blaze - a cute white and brown pittbull. With a spike collar that says \"Blaze\" to look mean. With boy puppy voice.', avatar: '', emoji: '🐶' },
    { id: 'bean', name: 'Bean', text: 'Bean - a grey diluted calico girl cat with a cat collar that says \"Bean\" girl cat voice.', avatar: '', emoji: '🐱' }
  ];
  const PREV_DEFAULT_CHARACTERS_V1 = [
    { id: 'bizzle', name: 'Bizzle', text: 'Bizzle - Green annunaki Male alien. Wearing a awesome hiphop white gold diamond necklace that says,  \"Bizzle \". Kawasaki tshirt, green alien head Jnco jeans, custom neon green led hiphop sneakers,' },
    { id: 'jinxy', name: 'Jinxy', text: 'Jinxy - fluffy orange and white boy cat with bright blue eyes. Wearing a huge white gold diamond hiphop necklace that says, \"Jinxy\".' },
    { id: 'blaze', name: 'Blaze', text: 'Blaze - a cute white and brown pittbull. With a spike collar that says \"Blaze\" to look mean. With boy puppy voice.' },
    { id: 'bean', name: 'Bean', text: 'Bean - a grey diluted calico girl cat with a cat collar that says \"Bean\" cat voice.' }
  ];

  function cloneDefaultCharacters() {
    return DEFAULT_CHARACTERS.map(c => ({ id: c.id, name: c.name, text: c.text, avatar: c.avatar || '', emoji: c.emoji || '✨' }));
  }
  function charFingerprint(list) {
    return (list || []).map(c => String(c.id) + '\0' + String(c.name) + '\0' + String(c.text)).join('\n');
  }
  function matchesPrevDefaultsV1(list) {
    if (!Array.isArray(list) || list.length !== PREV_DEFAULT_CHARACTERS_V1.length) return false;
    return charFingerprint(list.map(c => ({ id: c.id, name: c.name, text: c.text }))) === charFingerprint(PREV_DEFAULT_CHARACTERS_V1);
  }
  function loadCharacters(stored) {
    let version = 0, list = null;
    if (Array.isArray(stored)) { version = 1; list = stored; }
    else if (stored && typeof stored === 'object') { version = stored.version | 0; list = stored.characters; }
    if (!Array.isArray(list) || !list.length) return { version: CHAR_DEFAULTS_VERSION, characters: cloneDefaultCharacters(), migrated: true };
    if (version < CHAR_DEFAULTS_VERSION && matchesPrevDefaultsV1(list)) {
      return { version: CHAR_DEFAULTS_VERSION, characters: cloneDefaultCharacters(), migrated: true };
    }
    return { version: Math.max(version, CHAR_DEFAULTS_VERSION), characters: normalizeCharacters(list), migrated: version < CHAR_DEFAULTS_VERSION };
  }
  function normalizeCharacters(list) {
    if (!Array.isArray(list) || !list.length) return cloneDefaultCharacters();
    return list.map((c, i) => {
      const o = c && typeof c === 'object' ? c : {};
      const id = String(o.id || ('char' + i)).slice(0, 40);
      const name = String(o.name || ('Character ' + (i + 1))).slice(0, 60);
      const text = String(o.text != null ? o.text : (name + ' -')).slice(0, 800);
      const def = DEFAULT_CHARACTERS.find(d => d.id === id);
      return { id, name, text, avatar: o.avatar != null ? String(o.avatar) : (def ? def.avatar : ''), emoji: o.emoji || (def && def.emoji) || '✨' };
    });
  }
  /** Build the Character details section for the currently checked characters (renumbered 1..n). */
  function buildCharacterBlock(characters, checkedIds) {
    const all = normalizeCharacters(characters);
    const want = Array.isArray(checkedIds) ? checkedIds : all.map(c => c.id);
    const picked = all.filter(c => want.includes(c.id));
    if (!picked.length) return '';
    const lines = picked.map((c, i) => (i + 1) + '. ' + c.text);
    return CHAR_HEADER + '\n' + lines.join('\n');
  }
  /** Strip a Character details section the AI (or a prior pass) may have embedded. */
  function stripCharacterSection(t) {
    t = String(t || '');
    // Match from "Character details," through lines before a blank-line+bullet spec or end
    const re = /\n*Character details,\s*\nHD ultra-realistic photorealistic,\s*\nHd 8k ultra realistic\n(?:\d+\.\s.*(?:\n|$))*/i;
    return t.replace(re, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  
  /** Rewrite no-text clauses in an already-built prompt body for current character names (or restore classic when off). */
  function rewriteNoTextClauses(body, charNames) {
    let s = String(body || '');
    const names = Array.isArray(charNames) ? charNames.filter(Boolean) : [];
    const geminiChar = /No slogans or other text, except the character name lettering on their necklaces and collars \([^)]*\)\./g;
    const geminiOld = /No text, letters, numbers or words anywhere in the design\./g;
    const grokChar = /\bno slogans or other text except the character name lettering on their necklaces and collars \([^)]*\)/g;
    const grokOld = /\bno text, no letters\b/g;
    const houseChar = /Text: none\. No slogans or other text, except the character name lettering on their necklaces and collars \([^)]*\)\./g;
    const houseOld = /Text: none\. No letters, numbers or words anywhere\./g;
    if (names.length) {
      const g = `No slogans or other text, except the character name lettering on their necklaces and collars (${names.join(', ')}).`;
      const k = `no slogans or other text except the character name lettering on their necklaces and collars (${names.join(', ')})`;
      const h = `Text: none. No slogans or other text, except the character name lettering on their necklaces and collars (${names.join(', ')}).`;
      return s.replace(geminiChar, g).replace(geminiOld, g).replace(grokChar, k).replace(grokOld, k).replace(houseChar, h).replace(houseOld, h);
    }
    return s.replace(geminiChar, 'No text, letters, numbers or words anywhere in the design.')
      .replace(grokChar, 'no text, no letters')
      .replace(houseChar, 'Text: none. No letters, numbers or words anywhere.');
  }

window.BZ = { setHouseTemplate, normEvidence, SPEC_BLOCK, AVOID, BRANDS, LANGS, MASCOTS, CHAR_HEADER, CHAR_DEFAULTS_VERSION, DEFAULT_CHARACTERS, cloneDefaultCharacters, normalizeCharacters, loadCharacters, matchesPrevDefaultsV1, buildCharacterBlock, stripCharacterSection, rewriteNoTextClauses, noTextGemini, noTextGrok, trademarkHits, makeRng, randomSeed, normalize, generate, refineOffline, brief, renderVariants, makeTitle, slug };
})();

# Bizzle's Ultimate AI Tshirt Designer 👽🐱

**Live site:** <https://leehizzbt.github.io/bizzles-tshirt-designer/>

A free static website that generates **design-only t-shirt image prompts** (default 50, adjustable 1–100) for **Google Gemini's image generator** and **Grok Imagine**, built from labeled trend research. Made for [Bizzle's Tshirt Hut](https://www.tshirthut.shop) (Fourthwall). Brand mascots: **Bizzle** the green alien and **Jinxy** the orange-and-white cat.

- Plain HTML/CSS/vanilla JS. **No build step, no server, no trackers.** All paths are relative.
- Works **offline** with template prompts (no API key). Installable as a PWA.
- Optional **live AI mode**: each visitor pastes **their own** Gemini (free via Google AI Studio), OpenRouter, or Groq key. It is stored only in that visitor's browser (localStorage) and sent only to the provider's API.
- Every prompt ends with the exact print spec block, **appended by code** (Settings → "Append spec block", on by default).

## Files

```
index.html               app shell (tabs: Generate, Trend Research, Packs, Settings, Print Tips & Help)
css/styles.css           9 site themes via CSS variables (default: Orange Border on Black)
js/generator.js          data normalizer, seeded RNG, offline templates, briefs, trademark check, SPEC_BLOCK
js/ai.js                 BYO-key calls: Gemini v1beta generateContent, OpenRouter, Groq + friendly errors
js/app.js                UI, settings, exports, packs, share links, keyboard shortcuts
js/fallback-data.js      embedded copy of data/trends.json (used if fetch fails, e.g. opened via file://)
data/trends.json         trend research data (categories, holidays, styles, palettes + evidence)
manifest.webmanifest     PWA manifest     sw.js   offline service worker
icons/                   app icons (SVG + PNG 192/512 + maskable)
_headers                 security headers (Cloudflare Pages / Netlify)
.nojekyll                lets GitHub Pages serve files as-is
```

## Updating trend data

Replace `data/trends.json`, then regenerate the embedded fallback copy:

```bash
python3 tools/build_fallback.py   # from the project folder that contains site/ and tools/
```

(If you only have the `site/` folder, the app still works: it fetches `data/trends.json` first and only uses the embedded copy when that fails.)

Each item shows a badge: **Sourced** (backed by a cited source), **Inferred** (reasoned from sources), **Unverified** (source couldn't be confirmed), or **Example/template** (placeholder, not research). Extra research sections (generator limits, Fourthwall specs, post-processing workflow, blocked sources, house prompt template) appear in Trend Research. Evidence links and "checked" dates are shown in Trend Research. Settings → Trend sources can hide non-sourced items.

## Run locally

```bash
cd site
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (all free)

### Option A: GitHub Pages
1. Create a public repo (e.g. `bizzles-tshirt-designer`) and put the **contents of `site/`** at the repo root.
2. Push to the `main` branch.
3. In the repo, open **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `/ (root)`**, then save.
   With the GitHub CLI: `gh api repos/OWNER/bizzles-tshirt-designer/pages -X POST -f 'source[branch]=main' -f 'source[path]=/'`
4. After about a minute the site is live at `https://OWNER.github.io/bizzles-tshirt-designer/`.

### Option B: Cloudflare Pages
1. Go to dash.cloudflare.com → **Workers & Pages → Create → Pages**.
2. Either **Connect to Git** (pick the repo; build command: *none*; output directory: `/`) or choose **Upload assets** and drag in the `site/` folder (or the zip).
3. Or use the CLI: `npx wrangler pages deploy site --project-name bizzles-tshirt-designer`.

### Option C: Netlify Drop (fastest, no Git)
1. Open <https://app.netlify.com/drop>.
2. Drag the `site/` folder (or unzip `bizzles-tshirt-designer-site.zip` and drag the folder) onto the page.
3. Netlify gives you a URL right away; claim it with a free account to keep it.

## Using it
1. **Generate**: pick categories (adult 420 categories are hidden until Settings → 18+ is on), a holiday, subthemes, and keywords, then press **Generate** (or `G`). **Reroll** (`R`) picks a new seed. The same seed and settings always give the same prompts.
2. **Copy** each prompt, **Copy all** (`C`), or export **.md / .csv / .txt**. Star your favorites, then use "★ only" to copy or export just those.
3. **Refine** a card: more detail, change style, add text, make funnier (offline templates, or AI when a key is set).
4. **Design brief**: title, Fourthwall product title and description, and 13 Etsy-style tags.
5. **Packs**: save, load, rename, and delete packs; export or import every pack as JSON.
6. **Share link** encodes your settings and seed in the URL hash. It never includes your API key or the 18+ toggle.

### Free Gemini key (optional)
Get one at <https://aistudio.google.com/apikey>. Default model is `gemini-3.5-flash-lite` (free tier, accepts images), and you can edit the model name in Settings. Requests go to
`https://generativelanguage.googleapis.com/v1beta/models/MODEL:generateContent` with the `x-goog-api-key` header. On the free tier, Google may use prompts to improve its products.

## Print prep (important)
Neither Gemini nor Grok Imagine outputs real transparency natively (the Grok app at grok.com/imagine has a background-removal tool). Gemini maxes out at **3584×4800 at 4K, 3:4**, and every Gemini image carries a SynthID watermark. Grok Imagine outputs 1k or 2k. Before you upload to Fourthwall:
- Remove the background: [rembg](https://github.com/danielgatis/rembg). **Its default model (bria-rmbg / RMBG-2.0) needs a paid commercial license**, so use a permissive model such as `rembg i -m birefnet-general in.png out.png` (or `isnet-general-use` / `u2net`) and check that model's weights license. Photopea or GIMP also work.
- Upscale 2–4× with [Upscayl](https://upscayl.org) (nearest-neighbor for pixel art), then fit to **3600×4800 px at 300 DPI** (12″×16″), sRGB PNG.

## Keyboard shortcuts
`G` generate · `R` reroll · `C` copy all · `S` save pack · `E` export · `T` next theme · `/` keywords · `1–5` tabs · `?` help

## Disclaimer
Trend data is labeled by evidence type. Trends change, and nothing here guarantees sales. AI mode uses your own key at your own risk and under the provider's terms. Not affiliated with Fourthwall, Google, xAI, OpenRouter, or Groq. Make sure your designs don't infringe trademarks, copyrights, or likeness rights. The built-in trademark warning is a convenience, not legal advice.

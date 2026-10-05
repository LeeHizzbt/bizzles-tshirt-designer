/* ai.js: optional bring-your-own-key AI calls, made directly from the browser to the provider.
   No key is ever embedded here. Keys are read from localStorage by app.js and passed in per call. */
(function () {
  'use strict';
  const PROVIDERS = {
    gemini: {
      label: 'Google Gemini', defaultModel: 'gemini-3.5-flash-lite',
      models: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash'],
      keyUrl: 'https://aistudio.google.com/apikey',
      help: 'Free key: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio → Get API key</a>. Default model <code>gemini-3.5-flash-lite</code> (free tier, accepts images). Calls go directly to <code>generativelanguage.googleapis.com/v1beta/models/MODEL:generateContent</code>.'
    },
    openrouter: {
      label: 'OpenRouter', defaultModel: 'openrouter/free',
      models: ['openrouter/free', 'openrouter/auto'],
      keyUrl: 'https://openrouter.ai/keys',
      help: 'Key: <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>. <code>openrouter/free</code> routes to a free model (low daily limits). Calls go directly to <code>openrouter.ai/api/v1/chat/completions</code>.'
    },
    groq: {
      label: 'Groq', defaultModel: 'openai/gpt-oss-120b', visionModel: 'qwen/qwen3.8-27b',
      models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
      keyUrl: 'https://console.groq.com/keys',
      help: 'Key: <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a>. Image analysis uses the vision model <code>qwen/qwen3.8-27b</code>. Calls go directly to <code>api.groq.com/openai/v1/chat/completions</code>.'
    }
  };

  class AIError extends Error { constructor(msg, code) { super(msg); this.friendly = msg; this.code = code; } }

  function friendly(provider, status, body, model) {
    const name = PROVIDERS[provider] ? PROVIDERS[provider].label : provider;
    const raw = typeof body === 'string' ? body : JSON.stringify(body || {});
    if (status === 400 && /API[_ ]?KEY[_ ]?INVALID|API key not valid|invalid api key/i.test(raw))
      return new AIError(`${name} rejected that API key. Double-check you copied the whole key${provider === 'gemini' ? ' from Google AI Studio (Gemini keys usually start with "AIza")' : ''}, then save it again in Settings → AI.`, 'bad_key');
    if (status === 401 || status === 403)
      return new AIError(`${name} says this key isn't authorized (${status}). Check the key is correct and the API is enabled for it, or create a new key.`, 'bad_key');
    if (status === 404)
      return new AIError(`Model "${model}" wasn't found on ${name} (404). Pick a current model in Settings → AI (e.g. ${PROVIDERS[provider].defaultModel}).`, 'model');
    if (status === 429)
      return new AIError(`${name} quota / rate limit reached (429). Free tiers have per-minute and daily limits. Wait a minute and retry, try a lighter model, or use template mode (works offline, no key).`, 'quota');
    if (status === 400)
      return new AIError(`${name} couldn't process the request (400). ${shortMsg(body)} Try a smaller image, fewer prompts, or another model.`, 'bad_request');
    if (status >= 500)
      return new AIError(`${name} is busy or having trouble (${status}). Try again in a moment.`, 'server');
    return new AIError(`${name} returned an error (${status}). ${shortMsg(body)}`, 'other');
  }
  function shortMsg(body) {
    try { const m = (body && (body.error && (body.error.message || body.error))) || ''; return String(m).slice(0, 160); } catch (e) { return ''; }
  }

  async function doFetch(url, init, provider, timeoutMs) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs || 120000);
    let res;
    try { res = await fetch(url, { ...init, signal: ctrl.signal, referrerPolicy: 'no-referrer' }); }
    catch (e) {
      clearTimeout(t);
      if (e.name === 'AbortError') throw new AIError('The AI request timed out. Try fewer prompts or try again.', 'timeout');
      throw new AIError(`Couldn't reach ${PROVIDERS[provider].label}. Check your internet connection; a VPN, ad-blocker or privacy extension may also be blocking the request.`, 'network');
    }
    clearTimeout(t);
    let body; const text = await res.text();
    try { body = JSON.parse(text); } catch (e) { body = text; }
    return { res, body };
  }

  /** call({provider, model, key, system, prompt, image:{mimeType,base64}, json}) -> string */
  async function call(o) {
    const p = PROVIDERS[o.provider];
    if (!p) throw new AIError('Unknown AI provider.', 'config');
    if (!o.key) throw new AIError('Add your own API key in Settings → AI first (template mode works without one).', 'no_key');
    let model = (o.model || p.defaultModel).trim().replace(/^models\//, '');
    if (o.provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const parts = [{ text: o.prompt }];
      if (o.image) parts.push({ inline_data: { mime_type: o.image.mimeType, data: o.image.base64 } });
      const body = { contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.9 } };
      if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
      if (o.json) body.generationConfig.responseMimeType = 'application/json';
      const { res, body: rb } = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': o.key }, body: JSON.stringify(body) }, 'gemini');
      if (!res.ok) throw friendly('gemini', res.status, rb, model);
      if (rb && rb.promptFeedback && rb.promptFeedback.blockReason) throw new AIError(`Gemini blocked this request (${rb.promptFeedback.blockReason}). Try different wording or another image.`, 'blocked');
      const cand = rb && rb.candidates && rb.candidates[0];
      const txt = cand && cand.content && (cand.content.parts || []).map(x => x.text || '').join('');
      if (!txt) throw new AIError(`Gemini returned no text${cand && cand.finishReason ? ' (' + cand.finishReason + ')' : ''}. Try again or reduce the count.`, 'empty');
      return txt;
    }
    // OpenAI-compatible: OpenRouter, Groq
    if (o.provider === 'groq' && o.image && /gpt-oss/.test(model)) model = p.visionModel;
    const url = o.provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const content = o.image ? [{ type: 'text', text: o.prompt }, { type: 'image_url', image_url: { url: `data:${o.image.mimeType};base64,${o.image.base64}` } }] : o.prompt;
    const msgs = []; if (o.system) msgs.push({ role: 'system', content: o.system }); msgs.push({ role: 'user', content });
    const body = { model, messages: msgs, temperature: 0.9 };
    if (o.json) body.response_format = { type: 'json_object' };
    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + o.key };
    if (o.provider === 'openrouter') { headers['X-Title'] = "Bizzle's Ultimate AI Tshirt Designer"; }
    const { res, body: rb } = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body) }, o.provider);
    if (!res.ok) throw friendly(o.provider, res.status, rb, model);
    const txt = rb && rb.choices && rb.choices[0] && rb.choices[0].message && rb.choices[0].message.content;
    if (!txt) throw new AIError(`${p.label} returned no text. Try again or choose another model.`, 'empty');
    return txt;
  }

  function parseJSON(txt) {
    let s = String(txt || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    try { return JSON.parse(s); } catch (e) { /* fallthrough */ }
    const a = s.indexOf('{'), b = s.lastIndexOf('}'), c = s.indexOf('['), d = s.lastIndexOf(']');
    const tries = [];
    if (a >= 0 && b > a) tries.push(s.slice(a, b + 1));
    if (c >= 0 && d > c) tries.push(s.slice(c, d + 1));
    for (const t of tries) { try { return JSON.parse(t); } catch (e) { /* next */ } }
    throw new AIError('The AI replied in an unexpected format. Please try again.', 'parse');
  }

  // Remove any spec-like lines / character-detail blocks the AI may have added; app.js appends them itself.
  function stripSpec(t) {
    let s = String(t || '');
    // Drop character-details section if the model echoed it
    s = s.replace(/\n*Character details,\s*\nHD ultra-realistic photorealistic,\s*\nHd 8k ultra realistic\n(?:\d+\.\s.*(?:\n|$))*/ig, '\n');
    return s.split('\n').filter(l => !/^\s*[•\-*]\s*(File format|Resolution|Print size|Color mode|Max file size|No blurry|No JPG)/i.test(l) && !/awesome background with cool orange boarder/i.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  window.BZAI = { PROVIDERS, AIError, call, parseJSON, stripSpec };
})();

// OpenRouter free models: live discovery + app-level fallback chain
// .env:
//   OPENROUTER_API_KEY=...
//   OPENROUTER_MODELS=modelA:free,modelB:free   (optional: කැමති models, අනුපිළිවෙලින්)
//
// Free models සතියෙන් සතියට අස් වෙනවා, ඉතින් request කරන්න කලින් OpenRouter එකේ
// දැනට ඇත්තටම free තියෙන models ලැයිස්තුව බලලා, මැරිච්ච ඒවා ඉවත් කරනවා.

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const MAX_TRIES = 4; // එක request එකකට උපරිම try කරන models ගාණ
const CACHE_MS = 60 * 60 * 1000; // free list එක පැයක් cache කරනවා

export class LLMError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const preferredModels = () =>
  (process.env.OPENROUTER_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

// Reasoning models සමහරක් <think>...</think> කොටසක් එක්කම යවනවා
const clean = (text) => text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// Model එක එකම වචනය/වාක්‍ය ඛණ්ඩය නැවත නැවත ලියන loop එකක හිරවුණාද බලනවා (Sinhala/Tamil වල සමහර models වලට වෙනවා)
const isDegenerate = (text) => {
  const w = text.split(/\s+/).filter(Boolean);
  let run = 1;
  const grams = new Map();
  for (let i = 1; i < w.length; i++) {
    run = w[i] === w[i - 1] ? run + 1 : 1;
    if (run >= 6) return true;
    if (i >= 3) {
      const g = w.slice(i - 3, i + 1).join(' ');
      const c = (grams.get(g) || 0) + 1;
      grams.set(g, c);
      if (c >= 5 && g.length > 12) return true;
    }
  }
  return false;
};

/* ---------- දැනට live free models ---------- */
let cache = { at: 0, list: null };

const fetchFreeModels = async () => {
  if (cache.list && Date.now() - cache.at < CACHE_MS) return cache.list;
  try {
    const res = await fetch(MODELS_URL, { signal: AbortSignal.timeout(10000) });
    const { data } = await res.json();
    const list = data
      .filter(
        (m) =>
          m.id.endsWith(':free') &&
          Number(m.pricing?.prompt) === 0 &&
          Number(m.pricing?.completion) === 0 &&
          m.architecture?.output_modalities?.includes('text') &&
          (m.context_length || 0) >= 32000 &&
          !/safety|guard|embed/i.test(m.id)
      )
      .map((m) => ({ id: m.id, ctx: m.context_length || 0 }));
    cache = { at: Date.now(), list };
    return list;
  } catch (err) {
    console.warn('Free model list ගන්න බැරි වුණා:', err.message);
    return cache.list; // කලින් cache එක, නැත්නම් null
  }
};

// .env එකේ කැමති models (තවමත් free ඒවා) මුලින්, ඊට පස්සේ ඉතිරි live free models (context ලොකු ඒවා මුලින්)
export const resolveModels = async () => {
  const preferred = preferredModels();
  const live = await fetchFreeModels();
  if (!live) return preferred.slice(0, MAX_TRIES); // discovery fail වුණොත් .env එකම

  const liveIds = new Set(live.map((m) => m.id));
  const alive = preferred.filter((id) => liveIds.has(id));
  const dead = preferred.filter((id) => !liveIds.has(id));
  if (dead.length) console.warn(`දැන් free නැති models (මග හැරියා): ${dead.join(', ')}`);

  const extras = live
    .filter((m) => !alive.includes(m.id))
    .sort((a, b) => b.ctx - a.ctx)
    .map((m) => m.id);

  return [...alive, ...extras].slice(0, MAX_TRIES);
};

/* ---------- එක model එකකට එක request එකක් (කවදාවත් throw කරන්නේ නෑ) ---------- */
const callModel = async (apiKey, model, messages, { maxTokens, temperature, extra }) => {
  let response;
  try {
    response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'ArchitectAI',
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, ...extra }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    const timeout = err.name === 'TimeoutError';
    return { status: timeout ? 504 : 502, message: timeout ? 'timeout' : 'network error' };
  }

  const data = await response.json().catch(() => null);

  if (response.ok && !data?.error) {
    const text = clean(data?.choices?.[0]?.message?.content || '');
    const finish = data?.choices?.[0]?.finish_reason;
    if (!text) return { status: 502, message: `empty response (finish: ${finish})` };
    if (isDegenerate(text)) return { status: 502, message: 'repetitive output' };
    return { status: 200, text, model: data.model || model };
  }

  return {
    status: data?.error?.code || response.status || 502,
    message: data?.error?.message || `HTTP ${response.status}`,
  };
};

export const askLLM = async (
  messages,
  { maxTokens = 1500, temperature = 0.2, prefer, exclude, retry429 = 0, extra } = {}
) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new LLMError(500, 'OPENROUTER_API_KEY එක .env file එකේ නැහැ.');

  let models = await resolveModels();
  // prefer: මේ pattern එකට ගැලපෙන models මුලට (උදා: බහුභාෂා වලට Gemma)
  // exclude: මේ pattern එකට ගැලපෙන models ඉවත් කරනවා (උදා: translation වලට code-specialized models)
  if (exclude) {
    const kept = models.filter((m) => !exclude.test(m));
    if (kept.length) models = kept;
  }
  if (prefer) models = [...models.filter((m) => prefer.test(m)), ...models.filter((m) => !prefer.test(m))];
  if (models.length === 0) {
    throw new LLMError(503, 'දැනට භාවිතා කළ හැකි free AI model එකක් හොයාගන්න බැරි වුණා.');
  }
  console.log(`AI models to try: ${models.join(', ')}`);

  const failures = [];

  for (const model of models) {
    let r = await callModel(apiKey, model, messages, { maxTokens, temperature, extra });

    // Shared free pool එක තාවකාලිකව busy නම් තත්පර 4ක් ඉඳලා එකම model එක නැවත try කරනවා
    for (let n = 0; n < retry429 && r.status === 429 && !/per[- ]?day|daily/i.test(String(r.message)); n++) {
      console.warn(`Rate limited: ${model}, තත්පර 4කින් නැවත උත්සාහ කරනවා...`);
      await new Promise((resolve) => setTimeout(resolve, 4000));
      r = await callModel(apiKey, model, messages, { maxTokens, temperature, extra });
    }

    if (r.status === 200) {
      console.log(`AI answered with: ${r.model}`);
      return { text: r.text, model: r.model };
    }

    console.warn(`Model failed: ${model} -> ${r.status} ${String(r.message).slice(0, 160)}`);

    // මේවා model එකෙන් model එකට වෙනස් වෙන්නේ නෑ, ඉතින් ඊළඟ එක try කරලා වැඩක් නෑ
    if (r.status === 401) throw new LLMError(500, 'OpenRouter API key එක වලංගු නැහැ. .env එක පරීක්ෂා කරන්න.');
    if (r.status === 402) throw new LLMError(402, 'OpenRouter account එකේ balance එක negative. Free models වලටත් ඒක positive විය යුතුයි.');
    if (r.status === 429 && /per[- ]?day|daily/i.test(String(r.message))) {
      throw new LLMError(429, 'අද දවසේ free AI requests සීමාව ඉවරයි. UTC අනුව reset වෙනවා (ශ්‍රී ලංකා වෙලාවෙන් උදේ 5.30 විතර).');
    }

    failures.push(`${model.split('/').pop()}: ${r.status}`);
  }

  const allRateLimited = failures.every((f) => f.endsWith(': 429'));
  throw new LLMError(
    allRateLimited ? 429 : 502,
    `Free AI models සියල්ලම දැන් busy හෝ limit වෙලා (${failures.join(', ')}). විනාඩි කීපයකින් නැවත උත්සාහ කරන්න.`
  );
};

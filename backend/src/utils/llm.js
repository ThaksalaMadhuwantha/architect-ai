// OpenRouter free models: live discovery + app-level fallback chain + Google Gemini primary support
// .env:
//   GEMINI_API_KEY=...                         (optional: Google AI Studio free key - bypasses OpenRouter limits)
//   OPENROUTER_API_KEY=...
//   OPENROUTER_MODELS=modelA:free,modelB:free  (optional: preferred models in order)

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const MAX_TRIES = 8; // Try up to 8 live models per request before failing
const CACHE_MS = 60 * 60 * 1000; // Cache live free list for 1 hour

const DEFAULT_PREFERRED_MODELS = [
  'qwen/qwen3-coder:free',
  'deepseek/deepseek-r1-0528:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
];

export class LLMError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const preferredModels = () => {
  const fromEnv = (process.env.OPENROUTER_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_PREFERRED_MODELS;
};

// Strip reasoning <think>...</think> blocks if returned by reasoning models
const clean = (text) => text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// Detect repetitive output loops (can happen on some models with Sinhala/Tamil)
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

/* ---------- Live Free Models Discovery ---------- */
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
    console.warn('Failed to fetch live free models:', err.message);
    return cache.list;
  }
};

export const resolveModels = async () => {
  const preferred = preferredModels();
  const live = await fetchFreeModels();
  if (!live) return [...preferred.slice(0, MAX_TRIES - 1), 'openrouter/free'];

  const liveIds = new Set(live.map((m) => m.id));
  const alive = preferred.filter((id) => liveIds.has(id));
  const dead = preferred.filter((id) => !liveIds.has(id));
  if (dead.length) console.warn(`Skipped retired/paid models: ${dead.join(', ')}`);

  const extras = live
    .filter((m) => !alive.includes(m.id))
    .sort((a, b) => b.ctx - a.ctx)
    .map((m) => m.id);

  const selected = [...alive, ...extras].slice(0, MAX_TRIES - 1);
  // Always append openrouter/free as the ultimate auto-routed free fallback
  if (!selected.includes('openrouter/free')) selected.push('openrouter/free');
  return selected;
};

/* ---------- Single Model Call (Never throws) ---------- */
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
  { maxTokens = 1500, temperature = 0.2, prefer, exclude, retry429 = 0, first = [], extra } = {}
) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new LLMError(500, 'OPENROUTER_API_KEY is missing in .env file.');

  let models = await resolveModels();
  if (exclude) {
    const kept = models.filter((m) => !exclude.test(m));
    if (kept.length) models = kept;
  }
  if (prefer) {
    const router = models.filter((m) => m === 'openrouter/free');
    const regular = models.filter((m) => m !== 'openrouter/free');
    models = [
      ...regular.filter((m) => prefer.test(m)),
      ...regular.filter((m) => !prefer.test(m)),
      ...router,
    ];
  }
  models = [...new Set([...first, ...models])];
  if (models.length === 0) {
    throw new LLMError(503, 'No free AI models are currently available.');
  }
  console.log(`AI models to try: ${models.join(', ')}`);

  const failures = [];

  for (const model of models) {
    let r = await callModel(apiKey, model, messages, { maxTokens, temperature, extra });

    for (let n = 0; n < retry429 && r.status === 429 && !/per[- ]?day|daily/i.test(String(r.message)); n++) {
      console.warn(`Rate limited: ${model}, retrying in 4s...`);
      await new Promise((resolve) => setTimeout(resolve, 4000));
      r = await callModel(apiKey, model, messages, { maxTokens, temperature, extra });
    }

    if (r.status === 200) {
      console.log(`AI answered with: ${r.model}`);
      return { text: r.text, model: r.model };
    }

    console.warn(`Model failed: ${model} -> ${r.status} ${String(r.message).slice(0, 160)}`);

    if (r.status === 401) throw new LLMError(500, 'Invalid OpenRouter API key. Check your .env file.');
    if (r.status === 402 && !first.includes(model)) {
      throw new LLMError(402, 'OpenRouter account balance is negative. Free models require a non-negative balance.');
    }
    if (r.status === 429 && /per[- ]?day|daily/i.test(String(r.message))) {
      throw new LLMError(429, 'Daily free AI request limit reached. Quota resets at 00:00 UTC.');
    }

    failures.push(`${model.split('/').pop()}: ${r.status}`);
  }

  if (failures.every((f) => f.endsWith(': 402'))) {
    throw new LLMError(402, 'Insufficient credits in OpenRouter account.');
  }
  const allRateLimited = failures.every((f) => f.endsWith(': 429'));
  throw new LLMError(
    allRateLimited ? 429 : 502,
    `All free AI models are currently busy or rate-limited (${failures.join(', ')}). Please try again in a few moments.`
  );
};

/* ---------- Google Gemini (Google AI Studio free key) ---------- */
const geminiUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export const askGemini = async (messages, { maxTokens = 1500, temperature = 0.2 } = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new LLMError(500, 'GEMINI_API_KEY is missing in .env file.');

  const models = (process.env.GEMINI_MODELS || 'gemini-2.5-flash,gemini-2.5-flash-lite')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const prompt = messages.map((m) => m.content).join('\n\n');
  const failures = [];

  for (const model of models) {
    let response;
    try {
      response = await fetch(geminiUrl(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: Math.max(maxTokens, 4096) },
        }),
        signal: AbortSignal.timeout(60000),
      });
    } catch (err) {
      failures.push(`${model}: ${err.name === 'TimeoutError' ? 'timeout' : 'network'}`);
      continue;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const msg = data?.error?.message || `HTTP ${response.status}`;
      console.warn(`Gemini failed: ${model} -> ${response.status} ${String(msg).slice(0, 160)}`);
      failures.push(`${model}: ${response.status}`);
      continue;
    }

    const text = clean((data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''));
    if (!text) {
      console.warn(`Gemini empty: ${model} (finish: ${data?.candidates?.[0]?.finishReason})`);
      failures.push(`${model}: empty`);
      continue;
    }
    if (isDegenerate(text)) {
      console.warn(`Gemini repetitive output: ${model}`);
      failures.push(`${model}: repetitive`);
      continue;
    }

    console.log(`AI answered with: gemini/${model}`);
    return { text, model: `gemini/${model}` };
  }

  throw new LLMError(502, `No response received from Gemini (${failures.join(', ')}).`);
};

// Uses Gemini first if GEMINI_API_KEY is set, then falls back to OpenRouter free chain
export const askAI = async (messages, opts = {}) => {
  if (process.env.GEMINI_API_KEY) {
    try {
      return await askGemini(messages, opts);
    } catch (err) {
      console.warn('Gemini failed, falling back to OpenRouter:', err.message);
    }
  }
  return askLLM(messages, opts);
};
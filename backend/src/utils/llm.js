// OpenRouter free models: Live discovery + Cooldown Circuit-Breaker + Google Gemini primary support
// .env:
//   GEMINI_API_KEY=...                         (Google AI Studio free key - recommended for zero rate limits)
//   OPENROUTER_API_KEY=...
//   OPENROUTER_MODELS=modelA:free,modelB:free  (optional: preferred models in order)

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_MS = 60 * 60 * 1000; // 1 hour cache for live model list
const COOLDOWN_MS = 90 * 1000; // Skip 429/502 failed models for 90 seconds

// Models known to return empty <think> blocks or fail frequently on JSON tasks
const UNRELIABLE_PATTERN = /safety|guard|embed|vl|nemotron-3\.5|ernie-5\.5/i;

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

const clean = (text) => text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

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

/* ---------- Cooldown + Success Memory ---------- */
const cooldownUntil = new Map();
const lastSuccessAt = new Map();

const markCooldown = (model, ms = COOLDOWN_MS) => {
  cooldownUntil.set(model, Date.now() + ms);
};

const isCoolingDown = (model) => {
  const until = cooldownUntil.get(model);
  if (!until) return false;
  if (Date.now() >= until) {
    cooldownUntil.delete(model);
    return false;
  }
  return true;
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
          (m.context_length || 0) >= 16000 &&
          !UNRELIABLE_PATTERN.test(m.id)
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
  if (!live) return [...preferred, 'openrouter/free'];

  const liveIds = new Set(live.map((m) => m.id));
  const alive = preferred.filter((id) => liveIds.has(id));

  // Sort remaining live models: previously succeeded models first, then larger context
  const extras = live
    .filter((m) => !alive.includes(m.id))
    .sort((a, b) => (lastSuccessAt.get(b.id) || 0) - (lastSuccessAt.get(a.id) || 0) || b.ctx - a.ctx)
    .map((m) => m.id);

  const all = [...alive, ...extras];
  if (!all.includes('openrouter/free')) all.push('openrouter/free');

  // Filter out models currently in cooldown (unless all are cooling down)
  const healthy = all.filter((m) => !isCoolingDown(m));
  return healthy.length ? healthy : all;
};

/* ---------- Single Model Call ---------- */
const callModel = async (apiKey, model, messages, { maxTokens, temperature, extra }) => {
  let response;
  try {
    const effectiveMaxTokens = Math.max(maxTokens, 3500);
    response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'ArchitectAI',
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: effectiveMaxTokens, ...extra }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (err) {
    const timeout = err.name === 'TimeoutError';
    return { status: timeout ? 504 : 502, message: timeout ? 'timeout' : 'network error', model };
  }

  const data = await response.json().catch(() => null);

  if (response.ok && !data?.error) {
    const text = clean(data?.choices?.[0]?.message?.content || '');
    const finish = data?.choices?.[0]?.finish_reason;
    if (!text) {
      markCooldown(model, 45 * 1000);
      return { status: 502, message: `empty response (finish: ${finish})`, model };
    }
    if (isDegenerate(text)) {
      markCooldown(model, 45 * 1000);
      return { status: 502, message: 'repetitive output', model };
    }
    lastSuccessAt.set(model, Date.now());
    return { status: 200, text, model: data.model || model };
  }

  const status = data?.error?.code || response.status || 502;
  const message = data?.error?.message || `HTTP ${response.status}`;

  if ((status === 429 || status === 502 || status === 503) && model !== 'openrouter/free') {
    markCooldown(model);
  }

  return { status, message, model };
};

export const askLLM = async (
  messages,
  { maxTokens = 1500, temperature = 0.2, prefer, exclude, first = [], extra } = {}
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

  console.log(`AI candidate pool (${models.length} models): ${models.slice(0, 6).join(', ')}...`);
  const failures = [];

  for (const model of models) {
    const r = await callModel(apiKey, model, messages, { maxTokens, temperature, extra });

    if (r.status === 200) {
      console.log(`AI answered with: ${r.model}`);
      return { text: r.text, model: r.model };
    }

    console.warn(`Model failed: ${r.model} -> ${r.status} ${String(r.message).slice(0, 120)}`);

    if (r.status === 401) {
      throw new LLMError(500, 'Invalid OpenRouter API key. Check your .env file.');
    }
    if (r.status === 402 && !first.includes(r.model)) {
      throw new LLMError(402, 'OpenRouter account balance is negative. Free models require a non-negative balance.');
    }
    if (r.status === 429 && /per[- ]?day|daily/i.test(String(r.message))) {
      throw new LLMError(429, 'Daily free AI request limit reached. Quota resets at 00:00 UTC.');
    }

    failures.push(`${r.model.split('/').pop()}: ${r.status}`);
  }

  const allRateLimited = failures.every((f) => f.endsWith(': 429'));
  throw new LLMError(
    allRateLimited ? 429 : 502,
    `All free AI models are currently busy (${failures.slice(0, 5).join(', ')}). Add GEMINI_API_KEY in .env for instant dedicated quota.`
  );
};

/* ---------- Google Gemini (Google AI Studio free key) ---------- */
const geminiUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export const askGemini = async (messages, { maxTokens = 1500, temperature = 0.2 } = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new LLMError(500, 'GEMINI_API_KEY is missing in .env file.');

  const models = (process.env.GEMINI_MODELS || 'gemini-3.8-flash,gemini-3.5-flash-lite')
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
      failures.push(`${model}: empty`);
      continue;
    }
    if (isDegenerate(text)) {
      failures.push(`${model}: repetitive`);
      continue;
    }

    console.log(`AI answered with: gemini/${model}`);
    return { text, model: `gemini/${model}` };
  }

  throw new LLMError(502, `No response received from Gemini (${failures.join(', ')}).`);
};

// Uses Gemini first if GEMINI_API_KEY is set, then falls back to OpenRouter live free pool
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
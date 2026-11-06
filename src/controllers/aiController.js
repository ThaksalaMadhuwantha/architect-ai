import { askLLM, LLMError } from '../utils/llm.js';

const sendError = (res, error, fallback) => {
  console.error('AI Error:', error);
  const known = error instanceof LLMError;
  res.status(known ? error.status : 500).json({
    success: false,
    error: known ? error.message : fallback,
  });
};

/* ---------- 1. Architecture audit (English) ---------- */
export const analyzeCodeWithAI = async (req, res) => {
  const { fileName, codeSnippet, path } = req.body;

  if (!codeSnippet) {
    return res.status(400).json({ success: false, error: 'කරුණාකර Analyze කිරීමට Code එකක් ලබා දෙන්න.' });
  }

  const prompt = `
You are an expert Senior Software Architect and Clean Code Specialist.
Analyze the following source code file from a Web Application project:

File Name: ${fileName}
File Path: ${path}

Code Snippet:
\`\`\`javascript
${String(codeSnippet).slice(0, 12000)}
\`\`\`

Provide a structured, clear evaluation focusing on:
1. **Architecture & Role Summary**: What this file does in the system architecture.
2. **Code Structure & Maintainability**: Readability, adherence to design patterns, and modularity.
3. **Optimization & Refactoring Suggestions**: 2-3 concrete tips to improve performance or code quality.

Keep the response concise (under 250 words) and developer-friendly, using short bullet points.
Do NOT use tables, horizontal rules, or code blocks.
`;

  try {
    const { text, model } = await askLLM([{ role: 'user', content: prompt }], { maxTokens: 1200 });
    res.status(200).json({ success: true, analysis: text, model });
  } catch (error) {
    sendError(res, error, 'AI Analysis ලබාගැනීමේදී දෝෂයක් සිදු විය.');
  }
};

/* ---------- 2. Translate an existing audit (on demand) ---------- */
// භාෂාවට අනුව: නම, ලියන විලාසය, සහ නිවැරදි උදාහරණයක් (few-shot)
const LANGUAGES = {
  si: {
    name: 'Sinhala (සිංහල)',
    style:
      'Write the way Sri Lankan developers talk to each other: simple, conversational Sinhala with present-tense "-නවා" endings (e.g. "කරනවා", "connect වෙනවා"). Do NOT use formal literary Sinhala (no "කරයි", "වේ"). Attach Sinhala suffixes after the English word with a space (e.g. "middleware එක", "server එකට", "routes වලට").',
    example:
      'English: "This file is the entry point. It starts the Express server, connects to MongoDB and registers the middleware and routes."\nSinhala: "මේ file එක application එකේ entry point එක. Express server එක start කරලා MongoDB එකට connect වෙනවා, ඊට පස්සේ middleware සහ routes register කරනවා."',
  },
  ta: {
    name: 'Tamil (தமிழ்)',
    style:
      'Write the way Tamil-speaking developers talk to each other: simple, conversational Tamil in Tamil script, with English technical words kept in English letters. Attach Tamil suffixes to English words with a hyphen (e.g. "server-ஐ", "MongoDB-க்கு", "middleware-ல்"). Avoid heavy formal/literary Tamil.',
    example:
      'English: "This file is the entry point. It starts the Express server, connects to MongoDB and registers the middleware and routes."\nTamil: "இந்த file தான் application-ஓட entry point. இது Express server-ஐ start பண்ணி, MongoDB-க்கு connect ஆகி, middleware மற்றும் routes-ஐ register பண்ணுது."',
  },
  hi: {
    name: 'Hindi (हिन्दी)',
    style:
      'Write the way Indian developers talk to each other: simple, conversational Hindi in Devanagari script, with English technical words kept in English letters (Hinglish style). Use common postpositions after English words with a space (e.g. "server को", "database में", "routes के लिए"). Avoid heavy Sanskritized Hindi.',
    example:
      'English: "This file is the entry point. It starts the Express server, connects to MongoDB and registers the middleware and routes."\nHindi: "यह file application का entry point है। यह Express server को start करती है, MongoDB से connect होती है और middleware व routes register करती है।"',
  },
};

export const translateAnalysis = async (req, res) => {
  const { text, language } = req.body;
  const lang = LANGUAGES[language];

  if (!text || !lang) {
    return res.status(400).json({ success: false, error: 'Text සහ වලංගු language එකක් අවශ්‍යයි.' });
  }

  // Code එක නැවත යවන්නේ නෑ, දැනටමත් හැදුණු English audit එක විතරක් translate කරනවා
  const prompt = `
You are a bilingual senior software engineer. Rewrite the following code-review report in natural ${lang.name} for fellow developers.

Style:
- ${lang.style}
- Keep ALL technical words in English, written in English letters. NEVER translate them and NEVER transliterate them into ${lang.name} script. This includes: server, client, middleware, route, router, API, endpoint, request, response, database, query, schema, model, controller, service, module, package, import, export, function, class, variable, async, await, promise, token, JWT, cache, env, config, file, folder, framework, library, DNS, and every file name, path, identifier, or text inside backticks.
- Do not invent words. If you are unsure how to say something in ${lang.name}, keep the English word.
- Keep the exact Markdown structure (headings, **bold**, bullets, indentation).
- Output ONLY the ${lang.name} report, with no introduction or notes.

Example of the target style:
${lang.example}

Report to rewrite:
${String(text).slice(0, 8000)}
`;

  try {
    const { text: translation, model } = await askLLM([{ role: 'user', content: prompt }], {
      maxTokens: 3500,
      temperature: 0.2,
      prefer: /gemma/i, // Google Gemma models බහුභාෂා වලට සාමාන්‍යයෙන් වඩා හොඳයි
      exclude: /code/i, // code-specialized models (North Mini Code වගේ) සිංහල/Tamil වලට දුර්වලයි
      retry429: 1, // shared pool එක busy නම් එක පාරක් නැවත try කරනවා
    });
    res.status(200).json({ success: true, translation, model });
  } catch (error) {
    sendError(res, error, 'Translation එක ලබාගැනීමේදී දෝෂයක් සිදු විය.');
  }
};

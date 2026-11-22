import { askAI, LLMError } from '../utils/llm.js';

const sendError = (res, error, fallback) => {
  console.error('AI Error:', error);
  const known = error instanceof LLMError;
  res.status(known ? error.status : 500).json({
    success: false,
    error: known ? error.message : fallback,
  });
};

/* ---------- 1. Architecture Audit (English) ---------- */
export const analyzeCodeWithAI = async (req, res) => {
  const { fileName, codeSnippet, path } = req.body;

  if (!codeSnippet) {
    return res.status(400).json({ success: false, error: 'Please provide source code to analyze.' });
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
    const { text, model } = await askAI([{ role: 'user', content: prompt }], { maxTokens: 1200 });
    res.status(200).json({ success: true, analysis: text, model });
  } catch (error) {
    sendError(res, error, 'Failed to generate AI architecture analysis.');
  }
};

/* ---------- 2. Translate an Existing Audit (On Demand) ---------- */
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
    return res.status(400).json({ success: false, error: 'Text and a valid target language are required.' });
  }

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
    const { text: translation, model } = await askAI([{ role: 'user', content: prompt }], {
      maxTokens: 3500,
      temperature: 0.2,
      prefer: /gemma/i,
      exclude: /code/i,
      retry429: 1,
    });
    res.status(200).json({ success: true, translation, model });
  } catch (error) {
    sendError(res, error, 'Failed to generate translation.');
  }
};

/* ---------- 3. AI Mentor: Explain Confirmed Static Finding ---------- */
const clip = (v, n) => String(v || '').slice(0, n);

export const mentorFinding = async (req, res) => {
  const { title, message, fix, example, cwe, fileName, line, context, language } = req.body || {};

  if (!title || !message) {
    return res.status(400).json({ success: false, error: 'Finding details are required.' });
  }
  const lang = LANGUAGES[language];

  const langRules = lang
    ? `Write the whole answer in ${lang.name}. ${lang.style}
Keep ALL technical words in English letters (server, middleware, route, API, request, query, token, JWT, function, variable, file names, anything in backticks). Never translate or transliterate them. Do not invent words; if unsure, keep the English word.
Example of the target style:
${lang.example}`
    : 'Write in clear, simple English.';

  const prompt = `
You are a friendly senior engineer mentoring a junior developer.
A static analysis tool (not you) has already CONFIRMED the issue below. Do not invent other problems and do not doubt the finding. If the code shown is not enough to be sure, say what the developer should check.

Issue: ${clip(title, 120)} (${clip(cwe, 20)})
Location: ${clip(fileName, 160)}:${Number(line) || 0}
What the tool found: ${clip(message, 600)}
Code around the issue:
${clip(context, 1500)}
Tool's suggested change: ${clip(example || fix, 400)}

Answer in Markdown with exactly these 3 short sections (use "## " headings, translated into the answer language):
## Why this is a problem
2-4 sentences with a concrete attack or failure scenario that uses this code.
## How a senior developer would write it
The corrected code in a fenced code block, then 1-2 sentences why it is better.
## Remember
One sentence rule of thumb.

Keep it under 200 words. ${langRules}
`;

  try {
    const { text, model } = await askAI([{ role: 'user', content: prompt }], {
      maxTokens: 2500,
      temperature: 0.3,
      ...(lang ? { prefer: /gemma/i, exclude: /code/i, retry429: 1 } : {}),
    });
    res.status(200).json({ success: true, mentor: text, model });
  } catch (error) {
    sendError(res, error, 'Failed to generate Mentor explanation.');
  }
};

/* ---------- 4. AI Refactor & Fix Agent ---------- */
const REFACTOR_MODES = {
  security: 'Fix all detected security vulnerabilities, sanitize inputs, prevent injection/XSS/mass-assignment, and harden configurations without changing public APIs.',
  clean: 'Refactor for readability, modularity, and SOLID principles. Extract complex logic into small helper functions, improve variable names, and remove duplication.',
  modernize: 'Modernize syntax to clean ES6+/TypeScript idioms: replace callbacks or .then() chains with async/await, use destructuring, optional chaining, and const/let.',
  resilience: 'Add robust error handling (try/catch), input validation checks, and safe edge-case guards while keeping business logic intact.',
};

export const refactorCodeWithAI = async (req, res) => {
  const { fileName, path, code, mode = 'security', findings = [] } = req.body || {};

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, error: 'Source code is required for refactoring.' });
  }

  const goal = REFACTOR_MODES[mode] || REFACTOR_MODES.security;
  const findingsList = Array.isArray(findings) && findings.length
    ? findings
        .slice(0, 12)
        .map((f) => `- Line ${f.line}: [${f.severity?.toUpperCase()}] ${f.title} (${f.cwe || 'Rule'}) - ${f.message}`)
        .join('\n')
    : 'None detected by static scanner.';

  const prompt = `
You are a Staff Software Engineer refactoring a file for a junior developer.
Preserve all existing exports, function signatures, and behavior so the rest of the application does not break.

File: ${clip(fileName, 120)} (${clip(path, 240)})
Primary Goal: ${goal}

Detected Static Findings in this file:
${findingsList}

Original Source Code:
\`\`\`javascript
${code.slice(0, 14000)}
\`\`\`

Return ONLY a valid JSON object (no markdown fences, no commentary outside JSON) with this exact schema:
{
  "summary": "1-2 sentence overview of what was improved",
  "changes": [
    {
      "title": "Short change title",
      "reason": "Clear 1-sentence explanation for a junior developer why this change matters",
      "category": "security | quality | performance | resilience"
    }
  ],
  "refactoredCode": "The complete, runnable refactored file content"
}
`;

  try {
    const { text, model } = await askAI([{ role: 'user', content: prompt }], {
      maxTokens: 4000,
      temperature: 0.2,
    });

    // Extract JSON safely even if the model wraps it in markdown fences
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new LLMError(502, 'AI returned an invalid refactor response format.');
    }

    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!parsed.refactoredCode || typeof parsed.refactoredCode !== 'string') {
      throw new LLMError(502, 'AI response did not include refactored code.');
    }

    res.status(200).json({
      success: true,
      summary: parsed.summary || 'Code refactored successfully.',
      changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0, 8) : [],
      refactoredCode: parsed.refactoredCode,
      model,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(502).json({ success: false, error: 'Failed to parse AI refactor output. Please retry.' });
    }
    sendError(res, error, 'Failed to refactor code with AI.');
  }
};

/* ---------- 5. Codebase-Aware AI RAG Chat ---------- */
export const chatWithCodebase = async (req, res) => {
  const { question, history = [], context = {} } = req.body || {};

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ success: false, error: 'Please enter a question.' });
  }

  const {
    projectName = 'Unknown Project',
    stats = {},
    files = [],
    endpoints = [],
    findings = [],
    archIssues = [],
    activeFile = null,
  } = context;

  const projectSummary = `
Project: ${clip(projectName, 120)}
Stats: ${stats.files || 0} files, ${stats.loc || 0} lines of code, ${stats.deps || 0} internal imports.
File Structure (sample):
${(files || []).slice(0, 80).join('\n')}

API Endpoints (${(endpoints || []).length}):
${(endpoints || []).slice(0, 30).map((e) => `- ${e.method} ${e.path} (${e.protected ? 'protected' : 'open'}) -> ${e.controller}`).join('\n') || 'None'}

Top Security Findings (${(findings || []).length}):
${(findings || []).slice(0, 20).map((f) => `- [${f.severity}] ${f.title} in ${f.file}:${f.line}`).join('\n') || 'None'}

Architecture Issues (${(archIssues || []).length}):
${(archIssues || []).slice(0, 15).map((a) => `- [${a.severity}] ${a.title}: ${a.message}`).join('\n') || 'None'}
`;

  const activeFileBlock = activeFile?.path
    ? `\nCurrently Selected File: ${clip(activeFile.path, 200)}\n\`\`\`javascript\n${clip(activeFile.code, 7000)}\n\`\`\``
    : '';

  const recentHistory = Array.isArray(history)
    ? history.slice(-6).map((m) => `${m.role === 'user' ? 'Developer' : 'ArchitectAI'}: ${clip(m.content, 800)}`).join('\n')
    : '';

  const prompt = `
You are ArchitectAI, a helpful senior software architect assisting a junior developer with their loaded codebase.
Answer clearly, concisely, and accurately using ONLY the provided codebase context. Reference exact file paths and line numbers when helpful.

${projectSummary}
${activeFileBlock}

${recentHistory ? `Recent Conversation:\n${recentHistory}\n` : ''}
Developer Question: ${clip(question.trim(), 1000)}
`;

  try {
    const { text, model } = await askAI([{ role: 'user', content: prompt }], {
      maxTokens: 1800,
      temperature: 0.25,
    });
    res.status(200).json({ success: true, reply: text, model });
  } catch (error) {
    sendError(res, error, 'Failed to get response from Codebase AI.');
  }
};
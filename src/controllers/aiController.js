import { askLLM, LLMError } from '../utils/llm.js';

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

Keep the response concise, developer-friendly, and clearly formatted with bullet points.
`;

  try {
    const { text, model } = await askLLM([{ role: 'user', content: prompt }], { maxTokens: 1200 });
    res.status(200).json({ success: true, analysis: text, model });
  } catch (error) {
    console.error('AI Analysis Error:', error);
    const known = error instanceof LLMError;
    res.status(known ? error.status : 500).json({
      success: false,
      error: known ? error.message : 'AI Analysis ලබාගැනීමේදී දෝෂයක් සිදු විය.',
    });
  }
};

import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

export const analyzeCodeWithAI = async (req, res) => {
  try {
    const { fileName, codeSnippet, path } = req.body;

    if (!codeSnippet) {
      return res.status(400).json({ error: 'කරුණාකර Analyze කිරීමට Code එකක් ලබා දෙන්න.' });
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      console.error('GROQ_API_KEY is missing!');
      return res.status(500).json({ error: 'Groq API Key එක සොයාගත නොහැකි විය.' });
    }

    const groq = new Groq({ apiKey });

    const prompt = `
You are an expert Senior Software Architect and Clean Code Specialist.
Analyze the following source code file from a Web Application project:

File Name: ${fileName}
File Path: ${path}

Code Snippet:
\`\`\`javascript
${codeSnippet}
\`\`\`

Provide a structured, clear evaluation focusing on:
1. **Architecture & Role Summary**: What this file does in the system architecture.
2. **Code Structure & Maintainability**: Readability, adherence to design patterns, and modularity.
3. **Optimization & Refactoring Suggestions**: 2-3 concrete tips to improve performance or code quality.

Keep the response concise, developer-friendly, and clearly formatted with bullet points.
`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.1-8b-instant',
    });

    res.status(200).json({
      success: true,
      analysis: chatCompletion.choices[0]?.message?.content || '',
    });
  } catch (error) {
    console.error('Groq AI Analysis Error:', error);
    res.status(500).json({ error: 'AI Analysis ලබාගැනීමේදී දෝෂයක් සිදු විය.' });
  }
};
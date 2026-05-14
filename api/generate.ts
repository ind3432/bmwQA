import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  maxDuration: 60,
};

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  promptFeedback?: { blockReason?: string };
};

const MODEL = 'gemini-2.5-flash-image';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server is not configured. Set GEMINI_API_KEY in environment variables.',
    });
  }

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt || prompt.length > 2000) {
    return res.status(400).json({ error: 'Invalid prompt.' });
  }

  try {
    const upstream = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('Gemini upstream error', upstream.status, detail.slice(0, 500));
      return res.status(502).json({ error: `Upstream error (${upstream.status}).` });
    }

    const data = (await upstream.json()) as GeminiResponse;

    if (data.promptFeedback?.blockReason) {
      return res.status(422).json({
        error: `Prompt was blocked (${data.promptFeedback.blockReason}). Try a different combination.`,
      });
    }

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      return res.status(502).json({ error: 'No image returned by the model.' });
    }

    return res.status(200).json({
      mimeType: imagePart.inlineData.mimeType ?? 'image/png',
      data: imagePart.inlineData.data,
    });
  } catch (err) {
    console.error('generate handler error', err);
    return res.status(500).json({ error: 'Generation failed. Please try again.' });
  }
}

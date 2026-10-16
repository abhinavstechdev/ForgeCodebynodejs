import { AIProviderAdapter, AICompletionOptions } from './AIProviderAdapter.js';

export class GeminiAdapter implements AIProviderAdapter {
  id = 'gemini';
  name = 'Google Gemini';

  async streamCompletion(
    options: AICompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key is missing. Please set your API key in AI Settings or .env');
    }

    const model = options.model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

    // Map messages to Gemini contents format
    const contents = options.messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: options.systemPrompt }],
        },
        generationConfig: {
          temperature: options.temperature ?? 0.2,
          maxOutputTokens: options.maxTokens ?? 4096,
        },
      }),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    if (!response.body) {
      throw new Error('No response body returned from Gemini');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              onChunk(text);
            }
          } catch {
            // ignore partial parse error
          }
        }
      }
    }
  }

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash?key=${apiKey}`
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

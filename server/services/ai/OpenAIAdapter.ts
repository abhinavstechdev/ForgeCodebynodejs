import { AIProviderAdapter, AICompletionOptions } from './AIProviderAdapter.js';

export class OpenAIAdapter implements AIProviderAdapter {
  id = 'openai';
  name = 'OpenAI';

  async streamCompletion(
    options: AICompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    const baseUrl = options.baseUrl || 'https://api.openai.com/v1';

    if (!apiKey && !options.baseUrl) {
      throw new Error('OpenAI API key is missing. Please set your API key in AI Settings or .env');
    }

    const messages = [
      { role: 'system', content: options.systemPrompt },
      ...options.messages,
    ];

    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: options.model || 'gpt-4o',
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
      }),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }

    if (!response.body) {
      throw new Error('No response body returned from OpenAI');
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
        if (trimmed === 'data: [DONE]') return;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              onChunk(delta);
            }
          } catch {
            // ignore partial parse error
          }
        }
      }
    }
  }

  async testConnection(apiKey: string, baseUrl?: string): Promise<boolean> {
    const targetUrl = baseUrl || 'https://api.openai.com/v1';
    try {
      const res = await fetch(`${targetUrl.replace(/\/+$/, '')}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

import { AIProviderAdapter, AICompletionOptions } from './AIProviderAdapter.js';

export class AnthropicAdapter implements AIProviderAdapter {
  id = 'anthropic';
  name = 'Anthropic Claude';

  async streamCompletion(
    options: AICompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key is missing. Please set your API key in AI Settings or .env');
    }

    const messages = options.messages.filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model || 'claude-3-5-sonnet-20241022',
        system: options.systemPrompt,
        messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.2,
        stream: true,
      }),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }

    if (!response.body) {
      throw new Error('No response body returned from Anthropic');
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
            if (data.type === 'content_block_delta' && data.delta?.text) {
              onChunk(data.delta.text);
            }
          } catch {
            // ignore partial json
          }
        }
      }
    }
  }

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
      });
      return res.status !== 401 && res.status !== 403;
    } catch {
      return false;
    }
  }
}

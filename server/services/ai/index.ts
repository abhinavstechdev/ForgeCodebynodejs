import { AIProviderAdapter } from './AIProviderAdapter.js';
import { OpenAIAdapter } from './OpenAIAdapter.js';
import { AnthropicAdapter } from './AnthropicAdapter.js';
import { GeminiAdapter } from './GeminiAdapter.js';

const openaiAdapter = new OpenAIAdapter();
const anthropicAdapter = new AnthropicAdapter();
const geminiAdapter = new GeminiAdapter();

export function getAIAdapter(providerId: string): AIProviderAdapter {
  switch (providerId) {
    case 'anthropic':
      return anthropicAdapter;
    case 'gemini':
      return geminiAdapter;
    case 'custom':
    case 'openai':
    default:
      return openaiAdapter;
  }
}

export * from './AIProviderAdapter.js';
export * from './contextEngine.js';
export * from './OpenAIAdapter.js';
export * from './AnthropicAdapter.js';
export * from './GeminiAdapter.js';

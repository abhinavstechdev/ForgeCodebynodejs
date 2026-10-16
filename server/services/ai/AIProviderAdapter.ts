export interface AICompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  apiKey?: string;
  baseUrl?: string;
  abortSignal?: AbortSignal;
}

export interface AIProviderAdapter {
  id: string;
  name: string;
  streamCompletion(
    options: AICompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<void>;
  testConnection(apiKey: string, baseUrl?: string): Promise<boolean>;
}

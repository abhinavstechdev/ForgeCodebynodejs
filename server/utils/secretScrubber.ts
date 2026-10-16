/**
 * Secret scrubber utility to redact API keys, tokens, and sensitive patterns
 * from AI prompts, error logs, and console outputs.
 */

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/g, // OpenAI keys
  /mcp_live_[a-zA-Z0-9_-]{20,}/g, // ForgeCode MCP keys
  /ghp_[a-zA-Z0-9]{36}/g, // GitHub PATs
  /xox[baprs]-[0-9a-zA-Z]{10,48}/g, // Slack tokens
  /AIza[0-9A-Za-z-_]{35}/g, // Google API keys
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, // JWT tokens
  /AKIA[0-9A-Z]{16}/g, // AWS Access Key ID
  /postgres(ql)?:\/\/[^:]+:[^@]+@[^/]+/g, // Postgres credentials in URLs
];

export function scrubSecrets(input: string): string {
  if (!input) return '';
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED_SECRET]');
  }
  return result;
}

/**
 * Filter out sensitive lines from .env contents
 */
export function scrubEnvFileContent(content: string): string {
  if (!content) return '';
  return content
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx);
        return `${key}=[REDACTED_ENV_VALUE]`;
      }
      return line;
    })
    .join('\n');
}

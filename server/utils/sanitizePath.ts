import path from 'path';

/**
 * Normalizes relative path for internal database storage (e.g. "src/index.ts")
 * Strips leading/trailing slashes, forbids '..' components.
 */
export function normalizeRelativePath(userInputPath: string): string {
  if (!userInputPath) return '';
  // Normalize slashes
  const clean = userInputPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = clean.split('/').filter(Boolean);
  
  for (const seg of segments) {
    if (seg === '..' || seg === '.') {
      throw new Error('Access denied: Path traversal detected');
    }
  }
  return segments.join('/');
}

/**
 * Ensures a path resides safely inside the project root directory
 */
export function sanitizePath(projectRoot: string, userInputPath: string): string {
  const normalizedUserPath = userInputPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedTarget = path.resolve(projectRoot, normalizedUserPath);
  
  if (!resolvedTarget.startsWith(resolvedRoot)) {
    throw new Error('Access denied: Path traversal detected');
  }
  return resolvedTarget;
}

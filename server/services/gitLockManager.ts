import { GitError } from '../utils/gitError.js';

interface LockInfo {
  operation: string;
  acquiredAt: number;
}

/**
 * Concurrency Lock Manager for Git repositories.
 * Prevents race conditions and corruption from concurrent Git operations.
 */
export class GitLockManager {
  private static locks = new Map<string, LockInfo>();
  private static readonly LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute auto-expiry

  /**
   * Acquire an exclusive lock for a project repository and execute the given operation.
   * Ensures the lock is reliably released in a finally block.
   */
  static async withLock<T>(projectId: string, operation: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.locks.get(projectId);
    if (existing) {
      const isExpired = Date.now() - existing.acquiredAt > this.LOCK_TIMEOUT_MS;
      if (!isExpired) {
        throw new GitError(
          'OPERATION_IN_PROGRESS',
          `Git operation '${existing.operation}' is already in progress on repository for project '${projectId}'`,
          {
            activeOperation: existing.operation,
            durationMs: Date.now() - existing.acquiredAt,
          }
        );
      }
    }

    this.locks.set(projectId, {
      operation,
      acquiredAt: Date.now(),
    });

    try {
      return await fn();
    } finally {
      this.locks.delete(projectId);
    }
  }

  /**
   * Check if an operation is currently locked.
   */
  static isLocked(projectId: string): boolean {
    const existing = this.locks.get(projectId);
    if (!existing) return false;
    return Date.now() - existing.acquiredAt <= this.LOCK_TIMEOUT_MS;
  }

  /**
   * For testing or manual unlock
   */
  static forceUnlock(projectId: string): void {
    this.locks.delete(projectId);
  }
}

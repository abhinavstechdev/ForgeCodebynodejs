/**
 * Standardized Git Error hierarchy and codes for ForgeCode AI MCP server.
 */

export type GitErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'NOT_A_GIT_REPOSITORY'
  | 'GIT_NOT_INSTALLED'
  | 'GIT_PERMISSION_DENIED'
  | 'AUTH_SCOPE_MISSING'
  | 'REMOTE_NOT_FOUND'
  | 'BRANCH_NOT_FOUND'
  | 'INVALID_REVISION'
  | 'MERGE_CONFLICT'
  | 'OPERATION_IN_PROGRESS'
  | 'GIT_OPERATION_FAILED'
  | 'INVALID_PARAMETER'
  | 'NON_FAST_FORWARD'
  | 'WORKING_TREE_DIRTY';

export class GitError extends Error {
  code: GitErrorCode;
  details?: Record<string, any>;

  constructor(code: GitErrorCode, message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'GitError';
    this.code = code;
    this.details = details;

    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, GitError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

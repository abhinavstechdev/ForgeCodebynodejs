import { scrubSecrets } from '../utils/secretScrubber.js';
import { GitError } from '../utils/gitError.js';

export interface GitHubRepoInfo {
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  permissions?: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
  openIssuesCount: number;
  forksCount: number;
  stargazersCount: number;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  head: string;
  base: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  draft: boolean;
  merged: boolean;
}

export class GitHubService {
  private static resolveToken(providedToken?: string): string {
    const token = providedToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
      throw new GitError(
        'GIT_PERMISSION_DENIED',
        'GitHub authentication required. Provide a Personal Access Token or set GITHUB_TOKEN environment variable.'
      );
    }
    return token.trim();
  }

  private static async request(endpoint: string, token: string, options: RequestInit = {}): Promise<any> {
    const url = `https://api.github.com${endpoint}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'ForgeCode-AI-MCP/1.0.0',
      Authorization: `Bearer ${token}`,
      ...((options.headers as Record<string, string>) || {}),
    };

    try {
      const res = await fetch(url, { ...options, headers });
      const contentType = res.headers.get('content-type') || '';
      const data: any = contentType.includes('application/json') ? await res.json() : await res.text();

      if (!res.ok) {
        const message = data?.message || res.statusText || 'GitHub API request failed';
        if (res.status === 401 || res.status === 403) {
          throw new GitError('GIT_PERMISSION_DENIED', `GitHub API unauthorized: ${message}`);
        }
        if (res.status === 404) {
          throw new GitError('REMOTE_NOT_FOUND', `GitHub resource not found: ${message}`);
        }
        throw new GitError('GIT_OPERATION_FAILED', `GitHub API error (${res.status}): ${message}`);
      }

      return data;
    } catch (err: any) {
      const cleanMessage = scrubSecrets(err.message || 'Unknown GitHub API error');
      if (err instanceof GitError) throw err;
      throw new GitError('GIT_OPERATION_FAILED', `GitHub API communication failed: ${cleanMessage}`);
    }
  }

  /**
   * Diagnostic check for GitHub token authentication, user claims, and API rate limits.
   */
  static async checkAuth(token?: string): Promise<{
    authenticated: boolean;
    login: string;
    name: string | null;
    scopes: string[];
    rateLimitRemaining: number;
    rateLimitLimit: number;
  }> {
    const resolvedToken = this.resolveToken(token);
    const url = 'https://api.github.com/user';
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'ForgeCode-AI-MCP/1.0.0',
        Authorization: `Bearer ${resolvedToken}`,
      },
    });

    if (!res.ok) {
      throw new GitError('GIT_PERMISSION_DENIED', `GitHub token invalid or unauthorized: ${res.statusText}`);
    }

    const data: any = await res.json();
    const scopesHeader = res.headers.get('x-oauth-scopes') || '';
    const scopes = scopesHeader.split(',').map(s => s.trim()).filter(Boolean);
    const rateLimitRemaining = parseInt(res.headers.get('x-ratelimit-remaining') || '0', 10);
    const rateLimitLimit = parseInt(res.headers.get('x-ratelimit-limit') || '0', 10);

    return {
      authenticated: true,
      login: data.login,
      name: data.name,
      scopes,
      rateLimitRemaining,
      rateLimitLimit,
    };
  }

  /**
   * Retrieve repository metadata from GitHub.
   */
  static async getRepo(owner: string, repo: string, token?: string): Promise<GitHubRepoInfo> {
    const resolvedToken = this.resolveToken(token);
    const data = await this.request(`/repos/${owner}/${repo}`, resolvedToken);
    return {
      name: data.name,
      fullName: data.full_name,
      owner: data.owner?.login,
      description: data.description,
      private: data.private,
      defaultBranch: data.default_branch,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
      sshUrl: data.ssh_url,
      permissions: data.permissions,
      openIssuesCount: data.open_issues_count,
      forksCount: data.forks_count,
      stargazersCount: data.stargazers_count,
    };
  }

  /**
   * List branches in a remote GitHub repository.
   */
  static async listBranches(owner: string, repo: string, token?: string): Promise<Array<{ name: string; sha: string; protected: boolean }>> {
    const resolvedToken = this.resolveToken(token);
    const data = await this.request(`/repos/${owner}/${repo}/branches`, resolvedToken);
    return (data || []).map((b: any) => ({
      name: b.name,
      sha: b.commit?.sha,
      protected: b.protected,
    }));
  }

  /**
   * List pull requests for a GitHub repository.
   */
  static async listPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    token?: string
  ): Promise<GitHubPullRequest[]> {
    const resolvedToken = this.resolveToken(token);
    const data = await this.request(`/repos/${owner}/${repo}/pulls?state=${state}`, resolvedToken);
    return (data || []).map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      htmlUrl: pr.html_url,
      head: pr.head?.ref,
      base: pr.base?.ref,
      author: pr.user?.login,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      draft: pr.draft || false,
      merged: Boolean(pr.merged_at),
    }));
  }

  /**
   * Create a new pull request on GitHub.
   */
  static async createPullRequest(
    owner: string,
    repo: string,
    params: { title: string; head: string; base: string; body?: string },
    token?: string
  ): Promise<GitHubPullRequest> {
    const resolvedToken = this.resolveToken(token);
    const data = await this.request(`/repos/${owner}/${repo}/pulls`, resolvedToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    return {
      number: data.number,
      title: data.title,
      state: data.state,
      htmlUrl: data.html_url,
      head: data.head?.ref,
      base: data.base?.ref,
      author: data.user?.login,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      draft: data.draft || false,
      merged: Boolean(data.merged_at),
    };
  }

  /**
   * Compare two commits or branches on GitHub.
   */
  static async compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string,
    token?: string
  ): Promise<{
    status: string;
    aheadBy: number;
    behindBy: number;
    totalCommits: number;
    commits: Array<{ sha: string; message: string; author: string }>;
    files: Array<{ filename: string; status: string; additions: number; deletions: number }>;
  }> {
    const resolvedToken = this.resolveToken(token);
    const data = await this.request(`/repos/${owner}/${repo}/compare/${base}...${head}`, resolvedToken);
    return {
      status: data.status,
      aheadBy: data.ahead_by,
      behindBy: data.behind_by,
      totalCommits: data.total_commits,
      commits: (data.commits || []).map((c: any) => ({
        sha: c.sha,
        message: c.commit?.message,
        author: c.commit?.author?.name,
      })),
      files: (data.files || []).map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      })),
    };
  }
}

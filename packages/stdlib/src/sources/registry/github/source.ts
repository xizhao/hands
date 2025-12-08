import { z } from "zod"
import { defineSource, type SourceContext } from "../../types.js"

/**
 * GitHub Source
 *
 * Syncs data from GitHub repositories using the GraphQL API.
 * Requires a personal access token with appropriate scopes.
 *
 * Streams:
 * - stars: Repository stargazers with timestamps
 * - issues: Repository issues
 * - pull_requests: Pull requests
 * - commits: Recent commits
 */

const GITHUB_API = "https://api.github.com/graphql"

const secrets = z.object({
  GITHUB_TOKEN: z.string().min(1, "GitHub token is required"),
})

// Record types
export interface GitHubStar {
  id: string
  repo: string
  user_login: string
  user_id: number
  starred_at: string
  synced_at: string
}

export interface GitHubIssue {
  id: string
  repo: string
  number: number
  title: string
  body: string | null
  state: string
  author_login: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  labels: string
  synced_at: string
}

export interface GitHubPullRequest {
  id: string
  repo: string
  number: number
  title: string
  body: string | null
  state: string
  author_login: string | null
  created_at: string
  updated_at: string
  merged_at: string | null
  closed_at: string | null
  additions: number
  deletions: number
  synced_at: string
}

export const config = {
  name: "github",
  title: "GitHub",
  description: "Sync stars, issues, and pull requests from GitHub repositories",
  schedule: "0 * * * *", // hourly
  secrets,
  streams: ["stars", "issues", "pull_requests", "commits"] as const,
  primaryKey: "id",
}

// Configurable options (user modifies after copying)
export const options = {
  /** Repositories to sync (owner/repo format) */
  repos: ["your-org/your-repo"] as string[],
  /** Which streams to sync */
  streams: ["stars", "issues"] as (typeof config.streams)[number][],
  /** Max items per stream per sync */
  limit: 100,
}

// GraphQL queries
const STARS_QUERY = `
  query($owner: String!, $name: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      stargazers(first: $first, after: $after, orderBy: {field: STARRED_AT, direction: DESC}) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          starredAt
          node {
            login
            databaseId
          }
        }
      }
    }
  }
`

const ISSUES_QUERY = `
  query($owner: String!, $name: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      issues(first: $first, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          number
          title
          body
          state
          author { login }
          createdAt
          updatedAt
          closedAt
          labels(first: 10) { nodes { name } }
        }
      }
    }
  }
`

const PRS_QUERY = `
  query($owner: String!, $name: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: $first, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          number
          title
          body
          state
          author { login }
          createdAt
          updatedAt
          mergedAt
          closedAt
          additions
          deletions
        }
      }
    }
  }
`

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await globalThis.fetch(GITHUB_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "hands-source-github",
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`)
  }

  const json: GraphQLResponse<T> = await res.json()
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`)
  }

  return json.data as T
}

function parseRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/")
  if (!owner || !name) throw new Error(`Invalid repo format: ${repo}`)
  return { owner, name }
}

interface StargazersResponse {
  repository: {
    stargazers: {
      pageInfo: { hasNextPage: boolean; endCursor: string }
      edges: Array<{
        starredAt: string
        node: { login: string; databaseId: number }
      }>
    }
  }
}

async function* getStars(
  ctx: SourceContext<typeof secrets>,
  repo: string
): AsyncGenerator<GitHubStar[]> {
  const { owner, name } = parseRepo(repo)
  const syncedAt = new Date().toISOString()
  let cursor: string | null = null
  let fetched = 0

  while (fetched < options.limit) {
    const pageSize = Math.min(50, options.limit - fetched)

    const data: StargazersResponse = await graphql<StargazersResponse>(
      ctx.secrets.GITHUB_TOKEN,
      STARS_QUERY,
      { owner, name, first: pageSize, after: cursor }
    )

    const edges = data.repository.stargazers.edges
    if (edges.length === 0) break

    const stars: GitHubStar[] = edges.map((e: StargazersResponse["repository"]["stargazers"]["edges"][0]) => ({
      id: `${repo}:${e.node.databaseId}`,
      repo,
      user_login: e.node.login,
      user_id: e.node.databaseId,
      starred_at: e.starredAt,
      synced_at: syncedAt,
    }))

    yield stars
    fetched += edges.length

    if (!data.repository.stargazers.pageInfo.hasNextPage) break
    cursor = data.repository.stargazers.pageInfo.endCursor
  }
}

interface IssuesResponse {
  repository: {
    issues: {
      pageInfo: { hasNextPage: boolean; endCursor: string }
      nodes: Array<{
        id: string
        number: number
        title: string
        body: string | null
        state: string
        author: { login: string } | null
        createdAt: string
        updatedAt: string
        closedAt: string | null
        labels: { nodes: Array<{ name: string }> }
      }>
    }
  }
}

async function* getIssues(
  ctx: SourceContext<typeof secrets>,
  repo: string
): AsyncGenerator<GitHubIssue[]> {
  const { owner, name } = parseRepo(repo)
  const syncedAt = new Date().toISOString()
  let cursor: string | null = null
  let fetched = 0

  while (fetched < options.limit) {
    const pageSize = Math.min(50, options.limit - fetched)

    const data: IssuesResponse = await graphql<IssuesResponse>(
      ctx.secrets.GITHUB_TOKEN,
      ISSUES_QUERY,
      { owner, name, first: pageSize, after: cursor }
    )

    type IssueNode = IssuesResponse["repository"]["issues"]["nodes"][0]
    const nodes = data.repository.issues.nodes
    if (nodes.length === 0) break

    const issues: GitHubIssue[] = nodes.map((n: IssueNode) => ({
      id: n.id,
      repo,
      number: n.number,
      title: n.title,
      body: n.body,
      state: n.state,
      author_login: n.author?.login ?? null,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
      closed_at: n.closedAt,
      labels: n.labels.nodes.map((l: { name: string }) => l.name).join(","),
      synced_at: syncedAt,
    }))

    yield issues
    fetched += nodes.length

    if (!data.repository.issues.pageInfo.hasNextPage) break
    cursor = data.repository.issues.pageInfo.endCursor
  }
}

interface PullRequestsResponse {
  repository: {
    pullRequests: {
      pageInfo: { hasNextPage: boolean; endCursor: string }
      nodes: Array<{
        id: string
        number: number
        title: string
        body: string | null
        state: string
        author: { login: string } | null
        createdAt: string
        updatedAt: string
        mergedAt: string | null
        closedAt: string | null
        additions: number
        deletions: number
      }>
    }
  }
}

async function* getPullRequests(
  ctx: SourceContext<typeof secrets>,
  repo: string
): AsyncGenerator<GitHubPullRequest[]> {
  const { owner, name } = parseRepo(repo)
  const syncedAt = new Date().toISOString()
  let cursor: string | null = null
  let fetched = 0

  while (fetched < options.limit) {
    const pageSize = Math.min(50, options.limit - fetched)

    const data: PullRequestsResponse = await graphql<PullRequestsResponse>(
      ctx.secrets.GITHUB_TOKEN,
      PRS_QUERY,
      { owner, name, first: pageSize, after: cursor }
    )

    type PRNode = PullRequestsResponse["repository"]["pullRequests"]["nodes"][0]
    const nodes = data.repository.pullRequests.nodes
    if (nodes.length === 0) break

    const prs: GitHubPullRequest[] = nodes.map((n: PRNode) => ({
      id: n.id,
      repo,
      number: n.number,
      title: n.title,
      body: n.body,
      state: n.state,
      author_login: n.author?.login ?? null,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
      merged_at: n.mergedAt,
      closed_at: n.closedAt,
      additions: n.additions,
      deletions: n.deletions,
      synced_at: syncedAt,
    }))

    yield prs
    fetched += nodes.length

    if (!data.repository.pullRequests.pageInfo.hasNextPage) break
    cursor = data.repository.pullRequests.pageInfo.endCursor
  }
}

async function* fetchData(
  ctx: SourceContext<typeof secrets>
): AsyncGenerator<(GitHubStar | GitHubIssue | GitHubPullRequest)[]> {
  for (const repo of options.repos) {
    ctx.log(`[github] Syncing ${repo}...`)

    for (const stream of options.streams) {
      ctx.log(`[github] Fetching ${stream} for ${repo}`)

      try {
        if (stream === "stars") {
          yield* getStars(ctx, repo)
        } else if (stream === "issues") {
          yield* getIssues(ctx, repo)
        } else if (stream === "pull_requests") {
          yield* getPullRequests(ctx, repo)
        }
      } catch (error) {
        ctx.log(`[github] Error fetching ${stream} for ${repo}:`, error)
      }
    }
  }

  ctx.log(`[github] Sync complete`)
}

export default defineSource(config, fetchData)

// Also export the handler directly for use in custom workers
export { fetchData as fetch }

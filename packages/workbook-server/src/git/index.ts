/**
 * Git Integration Module
 *
 * Provides git operations for workbook version control using isomorphic-git.
 * Pure JavaScript implementation - no external git binary required.
 * All commits use a fixed identity: Hands <hello@hands.app>
 */

import * as fs from "node:fs";
import { join } from "node:path";
import git from "isomorphic-git";

// Fixed committer identity for all workbook commits
const GIT_AUTHOR = {
  name: "Hands",
  email: "hello@hands.app",
};

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  hasChanges: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  remote: string | null;
  ahead: number;
  behind: number;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  date: string;
  timestamp: number;
}

export interface GitDiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  dbSizeCurrent: number | null;
  dbSizeLastCommit: number | null;
  hasDbChange: boolean;
}

/**
 * Default .gitignore content for workbooks
 */
const DEFAULT_GITIGNORE = `# Generated files
.hands/

# Secrets
.env.local

# Dependencies
node_modules/

# OS files
.DS_Store
Thumbs.db
`;

/**
 * Check if directory is a git repository
 */
export async function isGitRepo(workbookDir: string): Promise<boolean> {
  try {
    await git.findRoot({ fs, filepath: workbookDir });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get comprehensive git status for a workbook
 */
export async function getGitStatus(workbookDir: string): Promise<GitStatus> {
  const isRepo = await isGitRepo(workbookDir);

  if (!isRepo) {
    return {
      isRepo: false,
      branch: null,
      hasChanges: false,
      staged: [],
      unstaged: [],
      untracked: [],
      remote: null,
      ahead: 0,
      behind: 0,
    };
  }

  try {
    // Get current branch
    const branch = (await git.currentBranch({ fs, dir: workbookDir })) || null;

    // Get status matrix
    // Format: [filepath, HEAD, WORKDIR, STAGE]
    // Values: 0 = absent, 1 = identical to HEAD, 2 = different from HEAD
    const statusMatrix = await git.statusMatrix({ fs, dir: workbookDir });

    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    for (const row of statusMatrix) {
      const filepath = row[0] as string;
      const head = row[1] as number;
      const workdir = row[2] as number;
      const stage = row[3] as number;

      // Untracked: not in HEAD, in workdir, not staged
      if (head === 0 && workdir === 2 && stage === 0) {
        untracked.push(filepath);
      }
      // Staged (added or modified): stage differs from HEAD
      else if (stage === 2 || (head === 0 && stage === 2)) {
        staged.push(filepath);
      }
      // Unstaged modifications: workdir differs from stage/HEAD
      else if (workdir === 2 && stage !== 2) {
        unstaged.push(filepath);
      }
      // Staged for deletion
      else if (head === 1 && workdir === 0 && stage === 0) {
        staged.push(filepath);
      }
    }

    const hasChanges = staged.length > 0 || unstaged.length > 0 || untracked.length > 0;

    // Get remote URL if configured
    let remote: string | null = null;
    try {
      const remotes = await git.listRemotes({ fs, dir: workbookDir });
      const origin = remotes.find((r: { remote: string; url: string }) => r.remote === "origin");
      remote = origin?.url || null;
    } catch {
      // No remotes configured
    }

    // TODO: Calculate ahead/behind (requires fetching remote refs)
    const ahead = 0;
    const behind = 0;

    return {
      isRepo: true,
      branch,
      hasChanges,
      staged,
      unstaged,
      untracked,
      remote,
      ahead,
      behind,
    };
  } catch (err) {
    console.error("[git] Failed to get status:", err);
    return {
      isRepo: true,
      branch: null,
      hasChanges: false,
      staged: [],
      unstaged: [],
      untracked: [],
      remote: null,
      ahead: 0,
      behind: 0,
    };
  }
}

/**
 * Initialize a git repository for a workbook
 */
export async function initRepo(workbookDir: string): Promise<void> {
  // Initialize repo
  await git.init({ fs, dir: workbookDir, defaultBranch: "main" });

  // Create .gitignore if it doesn't exist
  const gitignorePath = join(workbookDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, DEFAULT_GITIGNORE);
  }

  // Set local config for author
  await git.setConfig({
    fs,
    dir: workbookDir,
    path: "user.name",
    value: GIT_AUTHOR.name,
  });
  await git.setConfig({
    fs,
    dir: workbookDir,
    path: "user.email",
    value: GIT_AUTHOR.email,
  });

  console.log(`[git] Initialized repository in ${workbookDir}`);
}

/**
 * Generate an automatic commit message based on changes
 */
function generateCommitMessage(files: string[]): string {
  const uniqueFiles = [...new Set(files)];

  // Check for specific file patterns
  const hasDbChanges = uniqueFiles.some((f) => f.endsWith("db.sqlite"));
  const hasBlockChanges = uniqueFiles.some((f) => f.startsWith("blocks/"));
  const hasActionChanges = uniqueFiles.some((f) => f.startsWith("actions/"));
  const hasConfigChanges = uniqueFiles.some((f) => f === "package.json");

  // Build message parts
  const parts: string[] = [];

  if (hasBlockChanges) {
    const blockFiles = uniqueFiles.filter((f) => f.startsWith("blocks/"));
    if (blockFiles.length === 1) {
      const blockName = blockFiles[0].replace("blocks/", "").replace(/\.tsx?$/, "");
      parts.push(`Update block: ${blockName}`);
    } else {
      parts.push(`Update ${blockFiles.length} blocks`);
    }
  }

  if (hasActionChanges) {
    parts.push("Update actions");
  }

  if (hasDbChanges) {
    parts.push("Save database snapshot");
  }

  if (hasConfigChanges) {
    parts.push("Update config");
  }

  // Fallback if nothing specific matched
  if (parts.length === 0) {
    if (uniqueFiles.length === 1) {
      parts.push(`Update ${uniqueFiles[0]}`);
    } else {
      parts.push(`Update ${uniqueFiles.length} files`);
    }
  }

  return parts.join(", ");
}

/**
 * Stage all changes and commit with auto-generated message
 */
export async function commit(
  workbookDir: string,
  message?: string,
): Promise<{ hash: string; message: string }> {
  // Get current status
  const statusMatrix = await git.statusMatrix({ fs, dir: workbookDir });

  // Find files that need to be staged
  const filesToStage: string[] = [];
  const filesToRemove: string[] = [];

  for (const [filepath, head, workdir, _stage] of statusMatrix) {
    if (workdir === 0 && head === 1) {
      // File was deleted
      filesToRemove.push(filepath);
    } else if (workdir === 2) {
      // File was added or modified
      filesToStage.push(filepath);
    }
  }

  if (filesToStage.length === 0 && filesToRemove.length === 0) {
    throw new Error("Nothing to commit - working tree is clean");
  }

  // Stage all files
  for (const filepath of filesToStage) {
    await git.add({ fs, dir: workbookDir, filepath });
  }

  // Remove deleted files from index
  for (const filepath of filesToRemove) {
    await git.remove({ fs, dir: workbookDir, filepath });
  }

  // Generate message if not provided
  const allFiles = [...filesToStage, ...filesToRemove];
  const commitMessage = message || generateCommitMessage(allFiles);

  // Commit
  const hash = await git.commit({
    fs,
    dir: workbookDir,
    message: commitMessage,
    author: GIT_AUTHOR,
  });

  console.log(`[git] Committed: ${hash.substring(0, 7)} - ${commitMessage}`);

  return {
    hash,
    message: commitMessage,
  };
}

/**
 * Get commit history
 */
export async function getHistory(workbookDir: string, limit = 50): Promise<GitCommit[]> {
  const isRepo = await isGitRepo(workbookDir);
  if (!isRepo) {
    return [];
  }

  try {
    const commits = await git.log({ fs, dir: workbookDir, depth: limit });

    return commits.map(
      (entry: {
        oid: string;
        commit: { message: string; author: { name: string; email: string; timestamp: number } };
      }) => ({
        hash: entry.oid,
        shortHash: entry.oid.substring(0, 7),
        message: entry.commit.message,
        author: entry.commit.author.name,
        email: entry.commit.author.email,
        date: new Date(entry.commit.author.timestamp * 1000).toISOString(),
        timestamp: entry.commit.author.timestamp * 1000,
      }),
    );
  } catch {
    // No commits yet
    return [];
  }
}

/**
 * Set or update the remote origin URL
 */
export async function setRemote(workbookDir: string, url: string): Promise<void> {
  try {
    const remotes = await git.listRemotes({ fs, dir: workbookDir });
    const hasOrigin = remotes.some((r: { remote: string }) => r.remote === "origin");

    if (hasOrigin) {
      await git.deleteRemote({ fs, dir: workbookDir, remote: "origin" });
    }

    await git.addRemote({ fs, dir: workbookDir, remote: "origin", url });

    console.log(`[git] Remote origin set to: ${url}`);
  } catch (err) {
    console.error("[git] Failed to set remote:", err);
    throw err;
  }
}

/**
 * Push to remote
 * Note: Remote operations require http transport and authentication.
 * This is not yet implemented for the bundled version.
 */
export async function push(_workbookDir: string): Promise<void> {
  // TODO: Implement with isomorphic-git http transport when needed
  // This would require: import http from 'isomorphic-git/http/node'
  // and passing http to git.push({ fs, http, dir, ... })
  throw new Error("Remote push is not yet implemented. Use local git for remote operations.");
}

/**
 * Pull from remote
 * Note: Remote operations require http transport and authentication.
 * This is not yet implemented for the bundled version.
 */
export async function pull(_workbookDir: string): Promise<void> {
  // TODO: Implement with isomorphic-git http transport when needed
  throw new Error("Remote pull is not yet implemented. Use local git for remote operations.");
}

/**
 * Revert to a specific commit by creating a new commit that restores that state
 * This is safe because it doesn't rewrite history - it creates a new commit
 */
export async function revertToCommit(
  workbookDir: string,
  targetHash: string,
  saveDb: () => Promise<void>,
): Promise<{ hash: string; message: string }> {
  // First, verify the target commit exists
  try {
    await git.readCommit({ fs, dir: workbookDir, oid: targetHash });
  } catch {
    throw new Error(`Commit ${targetHash} not found`);
  }

  // Get the target commit's message for reference
  const targetCommit = await git.readCommit({ fs, dir: workbookDir, oid: targetHash });
  const targetMessage = targetCommit.commit.message;

  // Check if there are unsaved changes - save them first
  const status = await getGitStatus(workbookDir);
  if (status.hasChanges) {
    // Save current state first
    await saveDb();
    await commit(workbookDir, "Auto-save before revert");
  }

  // Checkout the target commit's tree to restore files
  await git.checkout({
    fs,
    dir: workbookDir,
    ref: targetHash,
    force: true,
  });

  // Get back to the branch
  const branch = await git.currentBranch({ fs, dir: workbookDir });
  if (branch) {
    await git.checkout({
      fs,
      dir: workbookDir,
      ref: branch,
    });
  }

  // Commit the revert
  const revertMessage = `Revert to: ${targetMessage.split("\n")[0]}`;
  const result = await commit(workbookDir, revertMessage);

  console.log(`[git] Reverted to ${targetHash.substring(0, 7)}: ${revertMessage}`);

  return result;
}

/**
 * Save workbook state and commit
 * This is the main "save" action - saves db.sqlite then commits all changes
 */
export async function saveAndCommit(
  workbookDir: string,
  saveDb: () => Promise<void>,
): Promise<{ hash: string; message: string } | null> {
  // First save the database
  await saveDb();

  // Check if this is a git repo
  const isRepo = await isGitRepo(workbookDir);
  if (!isRepo) {
    // Initialize if not a repo
    await initRepo(workbookDir);
  }

  // Get status
  const status = await getGitStatus(workbookDir);

  // If no changes, return null (nothing to commit)
  if (!status.hasChanges) {
    console.log("[git] No changes to commit");
    return null;
  }

  // Commit changes
  return await commit(workbookDir);
}

/**
 * Get diff statistics for uncommitted changes
 */
export async function getDiffStats(workbookDir: string): Promise<GitDiffStats> {
  const repo = await isGitRepo(workbookDir);
  if (!repo) {
    return {
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      dbSizeCurrent: null,
      dbSizeLastCommit: null,
      hasDbChange: false,
    };
  }

  const status = await getGitStatus(workbookDir);

  if (!status.hasChanges) {
    return {
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      dbSizeCurrent: null,
      dbSizeLastCommit: null,
      hasDbChange: false,
    };
  }

  // Get all changed files
  const allFiles = [...status.staged, ...status.unstaged, ...status.untracked];
  const uniqueFiles = [...new Set(allFiles)];
  const hasDbChange = uniqueFiles.some((f) => f.endsWith("db.sqlite"));

  // Get current db.sqlite size
  const dbPath = join(workbookDir, "db.sqlite");
  let dbSizeCurrent: number | null = null;
  if (fs.existsSync(dbPath)) {
    try {
      dbSizeCurrent = fs.statSync(dbPath).size;
    } catch {
      // Ignore
    }
  }

  // Get db.sqlite size from last commit
  let dbSizeLastCommit: number | null = null;
  try {
    const commits = await git.log({ fs, dir: workbookDir, depth: 1 });
    if (commits.length > 0) {
      const headCommit = commits[0].oid;
      const { blob } = await git.readBlob({
        fs,
        dir: workbookDir,
        oid: headCommit,
        filepath: "db.sqlite",
      });
      dbSizeLastCommit = blob.length;
    }
  } catch {
    // No previous commit or db.sqlite not in last commit
  }

  // For now, we don't calculate line-level insertions/deletions
  // This would require implementing a diff algorithm
  const filesChanged = uniqueFiles.filter((f) => !f.endsWith("db.sqlite")).length;

  return {
    filesChanged,
    insertions: 0, // Would need diff implementation
    deletions: 0, // Would need diff implementation
    dbSizeCurrent,
    dbSizeLastCommit,
    hasDbChange,
  };
}

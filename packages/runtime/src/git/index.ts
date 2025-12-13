/**
 * Git Integration Module
 *
 * Provides git operations for workbook version control using simple-git.
 * All commits use a fixed identity: Hands <hello@hands.app>
 */

import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";

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
 * Get git instance for a workbook directory
 */
function getGit(workbookDir: string): SimpleGit {
  return simpleGit(workbookDir);
}

/**
 * Check if directory is a git repository
 */
export async function isGitRepo(workbookDir: string): Promise<boolean> {
  try {
    const git = getGit(workbookDir);
    return await git.checkIsRepo();
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

  const git = getGit(workbookDir);

  try {
    const status = await git.status();

    // Get remote URL if configured
    let remote: string | null = null;
    try {
      const remotes = await git.getRemotes(true);
      const origin = remotes.find((r) => r.name === "origin");
      remote = origin?.refs?.fetch || origin?.refs?.push || null;
    } catch {
      // No remotes configured
    }

    return {
      isRepo: true,
      branch: status.current,
      hasChanges: !status.isClean(),
      staged: status.staged,
      unstaged: status.modified,
      untracked: status.not_added,
      remote,
      ahead: status.ahead,
      behind: status.behind,
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
  const git = getGit(workbookDir);

  // Initialize repo
  await git.init();

  // Create .gitignore if it doesn't exist
  const gitignorePath = join(workbookDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, DEFAULT_GITIGNORE);
  }

  // Configure local identity for this repo
  await git.addConfig("user.name", GIT_AUTHOR.name, false, "local");
  await git.addConfig("user.email", GIT_AUTHOR.email, false, "local");

  console.log(`[git] Initialized repository in ${workbookDir}`);
}

/**
 * Generate an automatic commit message based on changes
 */
function generateCommitMessage(status: {
  staged: string[];
  modified: string[];
  not_added: string[];
}): string {
  const allFiles = [...status.staged, ...status.modified, ...status.not_added];
  const uniqueFiles = [...new Set(allFiles)];

  // Check for specific file patterns
  const hasDbChanges = uniqueFiles.some((f) => f.endsWith("db.tar.gz"));
  const hasBlockChanges = uniqueFiles.some((f) => f.startsWith("blocks/"));
  const hasSourceChanges = uniqueFiles.some((f) => f.startsWith("sources/"));
  const hasActionChanges = uniqueFiles.some((f) => f.startsWith("actions/"));
  const hasConfigChanges = uniqueFiles.some(
    (f) => f === "package.json" || f === "hands.json",
  );

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

  if (hasSourceChanges) {
    const sourceFiles = uniqueFiles.filter((f) => f.startsWith("sources/"));
    if (sourceFiles.length <= 2) {
      parts.push("Update sources");
    } else {
      parts.push(`Update ${sourceFiles.length} source files`);
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
  const git = getGit(workbookDir);

  // Get current status for message generation
  const status = await git.status();

  if (status.isClean()) {
    throw new Error("Nothing to commit - working tree is clean");
  }

  // Stage all changes
  await git.add(".");

  // Generate message if not provided
  const commitMessage = message || generateCommitMessage(status);

  // Commit with fixed author
  const result = await git.commit(commitMessage, {
    "--author": `${GIT_AUTHOR.name} <${GIT_AUTHOR.email}>`,
  });

  console.log(`[git] Committed: ${result.commit} - ${commitMessage}`);

  return {
    hash: result.commit,
    message: commitMessage,
  };
}

/**
 * Get commit history
 */
export async function getHistory(
  workbookDir: string,
  limit = 50,
): Promise<GitCommit[]> {
  const isRepo = await isGitRepo(workbookDir);
  if (!isRepo) {
    return [];
  }

  const git = getGit(workbookDir);

  try {
    const log = await git.log({ maxCount: limit });

    return log.all.map((entry) => ({
      hash: entry.hash,
      shortHash: entry.hash.substring(0, 7),
      message: entry.message,
      author: entry.author_name,
      email: entry.author_email,
      date: entry.date,
      timestamp: new Date(entry.date).getTime(),
    }));
  } catch {
    // No commits yet
    return [];
  }
}

/**
 * Set or update the remote origin URL
 */
export async function setRemote(workbookDir: string, url: string): Promise<void> {
  const git = getGit(workbookDir);

  try {
    const remotes = await git.getRemotes();
    const hasOrigin = remotes.some((r) => r.name === "origin");

    if (hasOrigin) {
      await git.remote(["set-url", "origin", url]);
    } else {
      await git.addRemote("origin", url);
    }

    console.log(`[git] Remote origin set to: ${url}`);
  } catch (err) {
    console.error("[git] Failed to set remote:", err);
    throw err;
  }
}

/**
 * Push to remote
 */
export async function push(workbookDir: string): Promise<void> {
  const git = getGit(workbookDir);

  try {
    const status = await git.status();
    const branch = status.current;

    if (!branch) {
      throw new Error("Not on a branch");
    }

    // Check if remote is configured
    const remotes = await git.getRemotes();
    if (!remotes.some((r) => r.name === "origin")) {
      throw new Error("No remote configured. Set a remote first.");
    }

    // Push with upstream tracking
    await git.push("origin", branch, ["--set-upstream"]);
    console.log(`[git] Pushed to origin/${branch}`);
  } catch (err) {
    console.error("[git] Push failed:", err);
    throw err;
  }
}

/**
 * Pull from remote
 */
export async function pull(workbookDir: string): Promise<void> {
  const git = getGit(workbookDir);

  try {
    await git.pull();
    console.log("[git] Pulled from remote");
  } catch (err) {
    console.error("[git] Pull failed:", err);
    throw err;
  }
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
  const git = getGit(workbookDir);

  // First, verify the target commit exists
  try {
    await git.show([targetHash, "--quiet"]);
  } catch {
    throw new Error(`Commit ${targetHash} not found`);
  }

  // Get the target commit's message for reference
  const targetLog = await git.log({ from: targetHash, to: targetHash, maxCount: 1 });
  const targetMessage = targetLog.latest?.message || "unknown";

  // Check if there are unsaved changes - save them first
  const status = await git.status();
  if (!status.isClean()) {
    // Save current state first
    await saveDb();
    await git.add(".");
    await git.commit("Auto-save before revert", {
      "--author": `${GIT_AUTHOR.name} <${GIT_AUTHOR.email}>`,
    });
  }

  // Use git checkout to restore files from target commit, then commit
  // This is safer than reset --hard because it preserves history
  await git.checkout([targetHash, "--", "."]);

  // Restore the database from the reverted state
  // The db.tar.gz from the target commit is now in the working directory

  // Stage and commit the revert
  await git.add(".");

  const revertMessage = `Revert to: ${targetMessage.split("\n")[0]}`;

  const result = await git.commit(revertMessage, {
    "--author": `${GIT_AUTHOR.name} <${GIT_AUTHOR.email}>`,
  });

  console.log(`[git] Reverted to ${targetHash.substring(0, 7)}: ${revertMessage}`);

  return {
    hash: result.commit,
    message: revertMessage,
  };
}

/**
 * Save workbook state and commit
 * This is the main "save" action - saves db.tar.gz then commits all changes
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
 * Get diff statistics for uncommitted changes (excluding db.tar.gz for line stats)
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

  const git = getGit(workbookDir);
  const status = await git.status();

  // Check if there are changes
  if (status.isClean()) {
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
  const allFiles = [...status.staged, ...status.modified, ...status.not_added];
  const uniqueFiles = [...new Set(allFiles)];
  const hasDbChange = uniqueFiles.some((f) => f.endsWith("db.tar.gz"));

  // Get current db.tar.gz size
  const dbPath = join(workbookDir, "db.tar.gz");
  let dbSizeCurrent: number | null = null;
  if (existsSync(dbPath)) {
    try {
      dbSizeCurrent = statSync(dbPath).size;
    } catch {
      // Ignore
    }
  }

  // Get db.tar.gz size from last commit
  let dbSizeLastCommit: number | null = null;
  try {
    const result = await git.raw(["ls-tree", "-l", "HEAD", "db.tar.gz"]);
    if (result.trim()) {
      // Format: mode type hash size filename
      const parts = result.trim().split(/\s+/);
      if (parts.length >= 4) {
        dbSizeLastCommit = parseInt(parts[3], 10);
      }
    }
  } catch {
    // No previous commit or db.tar.gz not in last commit
  }

  // Get diff stats excluding db.tar.gz (binary file would skew stats)
  let insertions = 0;
  let deletions = 0;
  let filesChanged = uniqueFiles.filter((f) => !f.endsWith("db.tar.gz")).length;

  try {
    // Get numstat for tracked files (excluding db.tar.gz)
    const diffResult = await git.diff(["--numstat", "--", ".", ":(exclude)db.tar.gz"]);
    if (diffResult.trim()) {
      const lines = diffResult.trim().split("\n");
      for (const line of lines) {
        const [add, del] = line.split("\t");
        if (add !== "-") insertions += parseInt(add, 10) || 0;
        if (del !== "-") deletions += parseInt(del, 10) || 0;
      }
    }
  } catch {
    // Diff failed, use file count only
  }

  return {
    filesChanged,
    insertions,
    deletions,
    dbSizeCurrent,
    dbSizeLastCommit,
    hasDbChange,
  };
}

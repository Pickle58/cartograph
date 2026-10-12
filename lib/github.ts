import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";

export const GITHUB_REPOSITORY = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "cartograph",
  "X-GitHub-Api-Version": "2022-11-28",
} as const;

// An archive bigger than this is a limit to state, not a queue to build.
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

export type FetchedRepository = {
  repository: string;
  commitSha: string;
  directory: string;
  cleanup: () => Promise<void>;
};

export class RepositoryFetchError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "RepositoryFetchError";
    this.status = status;
  }
}

export function parseGithubRepository(input: string): string {
  const trimmed = input.trim();
  if (GITHUB_REPOSITORY.test(trimmed)) return trimmed;

  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh !== null) return namedRepository(ssh[1], ssh[2]);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new RepositoryFetchError(
      "Not a GitHub repository URL. Use https://github.com/owner/repo.",
    );
  }

  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    throw new RepositoryFetchError(
      "Not a GitHub repository URL. Use https://github.com/owner/repo.",
    );
  }

  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length < 2) {
    throw new RepositoryFetchError(
      "Not a GitHub repository URL. Use https://github.com/owner/repo.",
    );
  }
  return namedRepository(segments[0], segments[1].replace(/\.git$/, ""));
}

export async function fetchPublicRepository(
  input: string,
): Promise<FetchedRepository> {
  const repository = parseGithubRepository(input);
  const commitSha = await fetchHeadCommit(repository);
  return fetchRepositoryAtCommit(repository, commitSha);
}

export async function fetchRepositoryAtCommit(
  repository: string,
  commitSha: string,
): Promise<FetchedRepository> {
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new RepositoryFetchError(`Not a commit: ${commitSha}`);
  }
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cartograph-"));
  const cleanup = async (): Promise<void> => {
    await fs.promises.rm(root, { recursive: true, force: true });
  };

  try {
    const archivePath = path.join(root, "archive.tar.gz");
    await downloadArchive(repository, commitSha, archivePath);
    const extracted = path.join(root, "src");
    await fs.promises.mkdir(extracted);
    // Relative names: GNU tar on Windows treats `C:` in an absolute path as a host.
    await extractArchive(root, "archive.tar.gz", "src");
    return {
      repository,
      commitSha,
      directory: await archiveRoot(extracted),
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

// One file at one commit. The archive is the right tool for a whole repository;
// an explanation only needs the file it was asked about.
export async function fetchRepositoryFile(
  repository: string,
  commitSha: string,
  filePath: string,
): Promise<Buffer> {
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new RepositoryFetchError(`Not a commit: ${commitSha}`);
  }
  if (!isRepoFilePath(filePath)) {
    throw new RepositoryFetchError(`Not a repository file path: ${filePath}`);
  }
  const encoded = filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const response = await githubFetch(
    `https://api.github.com/repos/${repository}/contents/${encoded}?ref=${commitSha}`,
  );
  if (response.status === 404) {
    throw new RepositoryFetchError(
      `${filePath} is not in ${repository} at ${commitSha.slice(0, 7)}`,
      404,
    );
  }
  if (response.status === 403) {
    throw new RepositoryFetchError(rateLimitMessage(response), 403);
  }
  if (!response.ok) {
    throw new RepositoryFetchError(
      `GitHub returned ${response.status} reading ${filePath}`,
      response.status,
    );
  }
  const body: unknown = await response.json();
  if (Array.isArray(body)) {
    throw new RepositoryFetchError(`${filePath} is a directory`);
  }
  if (typeof body !== "object" || body === null) {
    throw new RepositoryFetchError(`GitHub did not return ${filePath}`);
  }
  const content = "content" in body ? body.content : undefined;
  const encoding = "encoding" in body ? body.encoding : undefined;
  if (typeof content !== "string" || encoding !== "base64") {
    throw new RepositoryFetchError(
      `${filePath} is too large to read from GitHub`,
    );
  }
  return Buffer.from(content.replaceAll(/\s/g, ""), "base64");
}

export async function fetchHeadCommit(repository: string): Promise<string> {
  const response = await githubFetch(
    `https://api.github.com/repos/${repository}/commits/HEAD`,
  );
  if (response.status === 404) {
    throw new RepositoryFetchError("Repository not found or not public");
  }
  if (response.status === 403) {
    throw new RepositoryFetchError(rateLimitMessage(response));
  }
  if (!response.ok) {
    throw new RepositoryFetchError(
      `GitHub returned ${response.status} looking up ${repository}`,
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("sha" in body) ||
    typeof body.sha !== "string" ||
    !/^[0-9a-f]{40}$/.test(body.sha)
  ) {
    throw new RepositoryFetchError(
      `GitHub did not return a commit for ${repository}`,
    );
  }
  return body.sha;
}

async function downloadArchive(
  repository: string,
  commitSha: string,
  archivePath: string,
): Promise<void> {
  // The SHA we just read, not HEAD, so the file on disk is the commit we store.
  const response = await githubFetch(
    `https://codeload.github.com/${repository}/tar.gz/${commitSha}`,
  );
  if (response.status === 404) {
    throw new RepositoryFetchError("Repository not found or not public");
  }
  if (!response.ok) {
    throw new RepositoryFetchError(
      `GitHub returned ${response.status} downloading ${repository}`,
    );
  }
  if (response.body === null) {
    throw new RepositoryFetchError(`GitHub returned an empty archive for ${repository}`);
  }

  const length = response.headers.get("content-length");
  if (length !== null) {
    const size = Number(length);
    if (Number.isFinite(size) && size > MAX_ARCHIVE_BYTES) {
      throw new RepositoryFetchError(
        `Repository archive is larger than ${MAX_ARCHIVE_BYTES / (1024 * 1024)} MB`,
      );
    }
  }

  try {
    await writeLimited(response.body, archivePath);
    const written = await fs.promises.stat(archivePath);
    if (written.size === 0) {
      throw new RepositoryFetchError(`GitHub returned an empty archive for ${repository}`);
    }
  } catch (error) {
    if (error instanceof RepositoryFetchError) throw error;
    throw new RepositoryFetchError(
      `Could not download ${repository}: ${errorMessage(error)}`,
    );
  }
}

async function writeLimited(
  body: ReadableStream<Uint8Array>,
  archivePath: string,
): Promise<void> {
  const file = fs.createWriteStream(archivePath);
  const reader = body.getReader();
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_ARCHIVE_BYTES) {
        throw new RepositoryFetchError(
          `Repository archive is larger than ${MAX_ARCHIVE_BYTES / (1024 * 1024)} MB`,
        );
      }
      if (!file.write(Buffer.from(value))) {
        await once(file, "drain");
      }
    }
    file.end();
    await finished(file);
  } catch (error) {
    file.destroy();
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}

function extractArchive(
  cwd: string,
  archiveName: string,
  destinationName: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xzf", archiveName, "-C", destinationName], {
      cwd,
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(
        new RepositoryFetchError(
          `Could not extract the archive: ${errorMessage(error)}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new RepositoryFetchError(
          `Could not extract the archive${stderr.trim() === "" ? "" : `: ${stderr.trim()}`}`,
        ),
      );
    });
  });
}

async function archiveRoot(extracted: string): Promise<string> {
  const entries = await fs.promises.readdir(extracted, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length !== 1 || directories[0] === undefined) {
    throw new RepositoryFetchError("Archive did not contain a single repository directory");
  }
  return path.join(extracted, directories[0].name);
}

async function githubFetch(url: string): Promise<Response> {
  try {
    return await fetch(url, { headers: GITHUB_HEADERS });
  } catch (error) {
    throw new RepositoryFetchError(`Could not reach GitHub: ${errorMessage(error)}`);
  }
}

function isRepoFilePath(filePath: string): boolean {
  if (filePath.length === 0 || filePath.startsWith("/") || filePath.endsWith("/")) {
    return false;
  }
  return filePath.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function namedRepository(owner: string | undefined, name: string | undefined): string {
  if (owner === undefined || name === undefined || name.length === 0) {
    throw new RepositoryFetchError(
      "Not a GitHub repository URL. Use https://github.com/owner/repo.",
    );
  }
  const repository = `${owner}/${name}`;
  if (!GITHUB_REPOSITORY.test(repository)) {
    throw new RepositoryFetchError(
      "Not a GitHub repository URL. Use https://github.com/owner/repo.",
    );
  }
  return repository;
}

function rateLimitMessage(response: Response): string {
  const remaining = response.headers.get("x-ratelimit-remaining");
  if (remaining === "0") {
    return "GitHub rate limit exceeded. Try again in a few minutes.";
  }
  return "GitHub refused the request. The repository may be private.";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

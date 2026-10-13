import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { heldOutRole } from "../evals/held-out-role.ts";
import { completeJson, missingModelKey, modelConfigured } from "../lib/ai-client.ts";
import {
  parseAssignments,
  ROLE_BATCH,
  ROLE_SCHEMA,
  roleSystemPrompt,
  roleUserPrompt,
  sourceExcerpt,
} from "../lib/role-prompt.ts";
import { loadScriptEnv } from "../lib/script-env.ts";
import { selectAdapter } from "../parser/detect.mts";
import { parseRepository } from "../parser/parse.mts";
import { isModelRole, type ModelRoleId } from "../parser/roles.mts";

loadScriptEnv();

// Pinned so the percentage is over a fixed set. These are Nest's own samples.
// The role is this project's adapter and path convention, not a label from Nest.
const NEST_COMMIT = "4514623279f6087808e3c8f08fbf9f37d3c17482";
const MINIMUM = 30;

type HeldOut = {
  key: string;
  role: ModelRoleId;
  source: string;
};

const listOnly = process.argv.includes("--list");

try {
  const directory = await materialize();
  const collected = await collect(path.join(directory, "sample"));
  if (collected.files.length < MINIMUM) {
    throw new Error(
      `Role dataset has ${collected.files.length} files (${collected.unreadable} unreadable). It needs at least ${MINIMUM} whose conventional role the classifier is allowed to return.`,
    );
  }
  console.log(
    `dataset: ${collected.files.length} files at ${NEST_COMMIT} (${collected.unreadable} unreadable left out)`,
  );
  if (listOnly) {
    console.log(histogram(collected.files));
  } else {
    if (!modelConfigured()) throw new Error(missingModelKey());
    await score(collected.files);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function score(files: readonly HeldOut[]): Promise<void> {
  let correct = 0;
  const misses: string[] = [];
  for (let index = 0; index < files.length; index += ROLE_BATCH) {
    const batch = files.slice(index, index + ROLE_BATCH);
    const text = await completeJson(
      roleSystemPrompt(),
      roleUserPrompt(batch.map((file) => ({ path: file.key, source: file.source }))),
      ROLE_SCHEMA,
      1500,
    );
    const assignments = parseAssignments(text);
    for (const file of batch) {
      const got = assignments.get(file.key);
      if (got !== undefined && isModelRole(got) && got === file.role) {
        correct += 1;
        continue;
      }
      misses.push(`${file.key}  expected ${file.role}  got ${got ?? "no role"}`);
    }
  }
  console.log(`role accuracy: ${percent(correct, files.length)}`);
  for (const miss of misses) console.log(miss);
}

async function collect(sampleRoot: string): Promise<{ files: HeldOut[]; unreadable: number }> {
  const files: HeldOut[] = [];
  let unreadable = 0;
  const entries = await fs.readdir(sampleRoot, { withFileTypes: true });
  entries.sort((left, right) => compare(left.name, right.name));
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(sampleRoot, entry.name);
    const adapter = selectAdapter(directory);
    if (adapter.id !== "nestjs") continue;
    const parsed = parseRepository(directory, adapter);
    const assigned = new Map(parsed.roles.map((role) => [role.path, role.role]));
    for (const file of parsed.files) {
      const role = heldOutRole(file.path, assigned.get(file.path));
      if (role === undefined) continue;
      const bytes = await fs.readFile(path.join(directory, ...file.path.split("/")));
      const source = sourceExcerpt(bytes);
      if (source === null) {
        unreadable += 1;
        continue;
      }
      // The sample name is part of the path the model sees, so two samples
      // with the same relative path are not the same question. The role was
      // decided on the real relative path and is not in this prompt.
      files.push({ key: `${entry.name}/${file.path}`, role, source });
    }
  }
  files.sort((left, right) => compare(left.key, right.key));
  return { files, unreadable };
}

async function materialize(): Promise<string> {
  const directory = path.join(os.tmpdir(), "cartograph-role-eval", NEST_COMMIT);
  try {
    await fs.access(path.join(directory, ".complete"));
    return directory;
  } catch {
    // Fetch the pinned commit. A partial directory is not reused.
  }
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  await git(directory, ["init"]);
  await git(directory, ["remote", "add", "origin", "https://github.com/nestjs/nest.git"]);
  await git(directory, ["sparse-checkout", "set", "sample"]);
  await git(directory, ["fetch", "--filter=blob:none", "--depth", "1", "origin", NEST_COMMIT]);
  await git(directory, ["checkout", "FETCH_HEAD"]);
  await fs.writeFile(path.join(directory, ".complete"), "ok\n");
  return directory;
}

function git(cwd: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: Error) => {
      reject(error);
    });
    child.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`));
    });
  });
}

function histogram(files: readonly HeldOut[]): string {
  const counts = new Map<string, number>();
  for (const file of files) counts.set(file.role, (counts.get(file.role) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => compare(left[0], right[0]))
    .map(([role, count]) => `${role}: ${count}`)
    .join("\n");
}

function percent(correct: number, total: number): string {
  return `${((correct / total) * 100).toFixed(1)}% (${correct}/${total})`;
}

function compare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

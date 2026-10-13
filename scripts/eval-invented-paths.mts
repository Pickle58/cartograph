import { Client, type Run } from "langsmith";

import { checkInventedPaths, onlineEvaluatorCode } from "../evals/invented-path.ts";
import { pathsListedInPrompt } from "../lib/explanation-prompt.ts";
import {
  langsmithEndpoint,
  langsmithHeaders,
  tracingProject,
} from "../evals/langsmith-env.ts";
import { loadScriptEnv } from "../lib/script-env.ts";

loadScriptEnv();

const RECENT = 20;
const SPLICE = "invented-by-eval.ts";
const EVALUATOR_NAME = "Invented path";

type ScoredRun = {
  id: string;
  sessionId: string;
  explanation: string;
  shownPaths: string[];
  invented: string[];
  score: number;
};

try {
  assertChecker();
  const scored = await scoreRecent();
  if (scored[0] !== undefined) spliceInto(scored[0]);
  await installLiveEvaluator();
  if (scored.length === 0) process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function assertChecker(): void {
  const clean = checkInventedPaths("It reads `lib/explain.ts`.", ["lib/explain.ts"]);
  if (clean.invented.length !== 0) {
    throw new Error("The invented-path check flagged a path that was shown.");
  }
  const shortened = checkInventedPaths("It reads explain.ts.", ["lib/explain.ts"]);
  if (shortened.invented.length !== 0) {
    throw new Error("The invented-path check flagged a shortened shown path.");
  }
  const spliced = checkInventedPaths(
    "It reads `lib/explain.ts` and `invented-by-eval.ts`.",
    ["lib/explain.ts"],
  );
  if (spliced.invented.join(",") !== SPLICE) {
    throw new Error(`The invented-path check missed a made-up filename: ${spliced.invented.join(", ") || "none"}`);
  }
  console.log(`splice: caught ${SPLICE}`);
}

function spliceInto(run: ScoredRun): void {
  const verdict = checkInventedPaths(`${run.explanation}\nAlso \`${SPLICE}\`.`, run.shownPaths);
  if (!verdict.invented.includes(SPLICE)) {
    throw new Error("Splicing a made-up filename into a real explanation was not caught.");
  }
  console.log(`splice into ${run.id}: caught ${SPLICE}`);
}

async function scoreRecent(): Promise<ScoredRun[]> {
  const client = new Client();
  const projectName = tracingProject();
  const runs: Run[] = [];
  for await (const run of client.listRuns({
    projectName,
    filter: 'or(eq(name, "explain-file"), eq(name, "explain-folder"))',
    isRoot: true,
    order: "desc",
    limit: RECENT,
  })) {
    runs.push(run);
  }
  if (runs.length === 0) {
    console.log(
      `invented-path: no explain-file or explain-folder runs in ${projectName}. Explain a file, then run this again.`,
    );
    return [];
  }

  const scored: ScoredRun[] = [];
  let skipped = 0;
  for (const listed of runs) {
    const run = await client.readRun(listed.id, { loadChildRuns: true });
    const prepared = prepare(run);
    if (prepared === null) {
      skipped += 1;
      console.log(`skip ${listed.id}  no shown paths`);
      continue;
    }
    const verdict = checkInventedPaths(prepared.explanation, prepared.shownPaths);
    const sessionId = run.session_id;
    if (sessionId === undefined) {
      throw new Error(`Run ${run.id} has no project id, so feedback cannot be recorded.`);
    }
    const comment =
      verdict.invented.length === 0
        ? "Every path-shaped token was shown."
        : `Invented: ${verdict.invented.join(", ")}`;
    let recorded = false;
    for await (const feedback of client.listFeedback({
      runIds: [run.id],
      feedbackKeys: ["invented_path"],
    })) {
      if (feedback.comment === comment && feedback.score === verdict.score) recorded = true;
    }
    if (!recorded) {
      await client.createFeedback({
        runId: run.id,
        sessionId,
        key: "invented_path",
        score: verdict.score,
        comment,
      });
    }
    if (verdict.invented.length > 0) {
      console.log(`fail ${run.id}  ${comment}`);
    }
    scored.push({
      id: run.id,
      sessionId,
      explanation: prepared.explanation,
      shownPaths: prepared.shownPaths,
      invented: verdict.invented,
      score: verdict.score,
    });
  }

  if (scored.length === 0) {
    console.log(
      `invented-path: ${skipped} recent runs had no shown path set. Explain a file again so the trace records it.`,
    );
    return [];
  }
  const passed = scored.filter((run) => run.score === 1).length;
  console.log(`invented-path: ${percent(passed, scored.length)}`);
  return scored;
}

function prepare(run: Run): { explanation: string; shownPaths: string[] } | null {
  const outputs = run.outputs;
  const recorded = shownFromOutputs(outputs);
  const explanation = explanationFromOutputs(outputs);
  if (recorded !== null && explanation !== null) {
    return { explanation, shownPaths: recorded };
  }
  const prompt = findPrompt(run);
  if (prompt === null || explanation === null) return null;
  const shownPaths = pathsListedInPrompt(prompt);
  if (shownPaths.length === 0 && !prompt.includes("\nImports:\n") && !prompt.includes("\nFiles in this folder:\n")) {
    return null;
  }
  return { explanation, shownPaths };
}

function explanationFromOutputs(outputs: Run["outputs"]): string | null {
  if (outputs === undefined) return null;
  if (typeof outputs.explanation === "string") return outputs.explanation;
  if (typeof outputs.outputs === "string") return outputs.outputs;
  return null;
}

function shownFromOutputs(outputs: Run["outputs"]): string[] | null {
  if (outputs === undefined || !Array.isArray(outputs.shownPaths)) return null;
  const paths: string[] = [];
  for (const shown of outputs.shownPaths) {
    if (typeof shown !== "string") return null;
    paths.push(shown);
  }
  return paths;
}

function findPrompt(run: Run): string | null {
  const found = longestPrompt(run.inputs);
  if (found !== null) return found;
  let best: string | null = null;
  for (const child of run.child_runs ?? []) {
    const prompt = findPrompt(child);
    if (prompt !== null && (best === null || prompt.length > best.length)) best = prompt;
  }
  return best;
}

function longestPrompt(value: unknown): string | null {
  let best: string | null = null;
  const visit = (item: unknown): void => {
    if (typeof item === "string") {
      if (isPrompt(item) && (best === null || item.length > best.length)) best = item;
      return;
    }
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry);
      return;
    }
    if (typeof item === "object" && item !== null) {
      for (const entry of Object.values(item)) visit(entry);
    }
  };
  visit(value);
  return best;
}

function isPrompt(value: string): boolean {
  if (!value.includes("\nSource:\n") && !value.includes("\nImported from outside:\n")) return false;
  return value.includes("\nImports:\n") || value.includes("\nFiles in this folder:\n");
}

async function installLiveEvaluator(): Promise<void> {
  const client = new Client();
  const project = await client.readProject({ projectName: tracingProject() });
  const code = onlineEvaluatorCode();
  const evaluatorId = await ensureEvaluator(client, code);
  const rules = await listRules(project.id);
  const existing = rules.find((rule) => rule.display_name === EVALUATOR_NAME);
  if (existing !== undefined) {
    console.log(`live evaluator: already attached to ${tracingProject()} (${existing.id})`);
    return;
  }
  const created = await postJson("/api/v1/runs/rules", {
    display_name: EVALUATOR_NAME,
    session_id: project.id,
    sampling_rate: 1,
    filter: 'or(eq(name, "explain-file"), eq(name, "explain-folder"))',
    is_enabled: true,
    evaluator_id: evaluatorId,
  });
  const id = typeof created.id === "string" ? created.id : "created";
  console.log(`live evaluator: attached to ${tracingProject()} (${id})`);
}

async function ensureEvaluator(client: Client, code: string): Promise<string> {
  for await (const evaluator of client.evaluators.list({ name_contains: EVALUATOR_NAME })) {
    if (evaluator.name !== EVALUATOR_NAME || evaluator.id === undefined) continue;
    await client.evaluators.update(evaluator.id, {
      code_evaluator: { language: "javascript", code },
    });
    return evaluator.id;
  }
  const created = await client.evaluators.create({
    name: EVALUATOR_NAME,
    type: "code",
    code_evaluator: { language: "javascript", code },
  });
  const id = created.evaluator?.id;
  if (id === undefined) throw new Error("LangSmith did not return an evaluator id.");
  return id;
}

type RuleRow = { id?: string; display_name?: string };

async function listRules(sessionId: string): Promise<RuleRow[]> {
  const response = await fetch(
    `${langsmithEndpoint()}/api/v1/runs/rules?session_id=${encodeURIComponent(sessionId)}`,
    { headers: langsmithHeaders() },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Could not list run rules (${response.status}): ${JSON.stringify(body)}`);
  }
  const rows = ruleRows(body);
  if (rows === null) {
    throw new Error(`Could not read run rules: ${JSON.stringify(body)}`);
  }
  return rows;
}

function ruleRows(body: unknown): RuleRow[] | null {
  if (Array.isArray(body)) return body.flatMap(ruleRow);
  if (typeof body !== "object" || body === null) return null;
  if ("data" in body && Array.isArray(body.data)) return body.data.flatMap(ruleRow);
  if ("rules" in body && Array.isArray(body.rules)) return body.rules.flatMap(ruleRow);
  return null;
}

function ruleRow(value: unknown): RuleRow[] {
  if (typeof value !== "object" || value === null) return [];
  const id = "id" in value && typeof value.id === "string" ? value.id : undefined;
  const displayName =
    "display_name" in value && typeof value.display_name === "string" ? value.display_name : undefined;
  return [{ id, display_name: displayName }];
}

async function postJson(pathname: string, payload: { [key: string]: unknown }): Promise<{ [key: string]: unknown }> {
  const response = await fetch(`${langsmithEndpoint()}${pathname}`, {
    method: "POST",
    headers: langsmithHeaders(),
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Could not create the live evaluator (${response.status}): ${JSON.stringify(body)}`);
  }
  if (typeof body !== "object" || body === null) return {};
  return body as { [key: string]: unknown };
}

function percent(correct: number, total: number): string {
  return `${((correct / total) * 100).toFixed(1)}% (${correct}/${total})`;
}

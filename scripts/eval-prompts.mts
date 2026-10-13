import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "langsmith";
import { evaluate, type ExperimentResultRow } from "langsmith/evaluation";

import { retiredFileExplanation } from "../evals/file-explanation-v1.ts";
import { checkInventedPaths } from "../evals/invented-path.ts";
import { categoryLabel, categoryOf } from "../lib/categories.ts";
import { completeJson, completeText, missingModelKey, modelConfigured } from "../lib/ai-client.ts";
import {
  excerptSource,
  fileExplanation,
  pathsListedInPrompt,
  type ExplanationNeighbour,
} from "../lib/explanation-prompt.ts";
import { loadScriptEnv } from "../lib/script-env.ts";
import { selectAdapter } from "../parser/detect.mts";
import { parseRepository } from "../parser/parse.mts";
import { isRoleId } from "../parser/roles.mts";

loadScriptEnv();

const DATASET = "cartograph-file-explanations";
const DEFAULT_LIMIT = 8;

// "Specific enough to be useful" has no exact answer. The number below is a
// model's judgment. The invented-path column is the exact check.
const JUDGMENT =
  "Specificity is a model's judgment of whether an explanation is specific enough to be useful. It is not an exact score.";

const SPECIFICITY_SCHEMA: { [key: string]: unknown } = {
  type: "object",
  additionalProperties: false,
  properties: {
    specific: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["specific", "reason"],
};

type PromptVersion = "v1" | "current";

type ExplanationInput = {
  filePath: string;
  source: string;
  imports: ExplanationNeighbour[];
  importedBy: ExplanationNeighbour[];
};

try {
  console.log(JUDGMENT);
  if (!modelConfigured()) throw new Error(missingModelKey());
  const client = new Client();
  await ensureDataset(client);
  const retired = await runVersion(client, "v1");
  const current = await runVersion(client, "current");
  console.log(`explanation-v1       ${line(retired)}`);
  console.log(`explanation-current  ${line(current)}`);
  console.log(comparison(retired.specificity, current.specificity));
  console.log(await client.getDatasetUrl({ datasetName: DATASET }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

type Averages = {
  specificity: { sum: number; total: number };
  inventedPath: { sum: number; total: number };
};

async function runVersion(client: Client, version: PromptVersion): Promise<Averages> {
  const results = await evaluate(
    (inputs: unknown) => explain(version, inputs),
    {
      data: DATASET,
      client,
      experimentPrefix: version === "v1" ? "explanation-v1" : "explanation-current",
      description: `${version === "v1" ? "Retired prompt, kept with the evals." : "Current explanation prompt."} ${JUDGMENT} Invented-path is exact set membership.`,
      maxConcurrency: 2,
      metadata: { prompt_version: version },
      evaluators: [specificity, inventedPath],
    },
  );
  return {
    specificity: average(results.results, "specificity"),
    inventedPath: average(results.results, "invented_path"),
  };
}

async function explain(
  version: PromptVersion,
  raw: unknown,
): Promise<{ explanation: string; shownPaths: string[] }> {
  const input = readInput(raw);
  const prompt = messages(version, input);
  const explanation = await completeText(prompt.system, prompt.user, 800);
  return { explanation, shownPaths: pathsListedInPrompt(prompt.user) };
}

function messages(
  version: PromptVersion,
  input: ExplanationInput,
): { system: string; user: string } {
  switch (version) {
    case "v1":
      return retiredFileExplanation(input.source, input);
    case "current":
      return fileExplanation(input.filePath, input.source, input);
    default: {
      const unhandled: never = version;
      throw new Error(`Unhandled prompt: ${String(unhandled)}`);
    }
  }
}

async function specificity(args: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}): Promise<{ key: string; score: number; comment: string }> {
  const input = readInput(args.inputs);
  const explanation = typeof args.outputs.explanation === "string" ? args.outputs.explanation : "";
  const text = await completeJson(
    "You judge whether an explanation is specific enough to be useful to a developer who has not read the file. This is a judgment, not an exact check. Do not score whether the file names are real.",
    [
      `File: ${input.filePath}`,
      "",
      "Imports:",
      listed(input.imports),
      "",
      "Imported by:",
      listed(input.importedBy),
      "",
      "Explanation:",
      explanation,
    ].join("\n"),
    SPECIFICITY_SCHEMA,
    300,
    "specificity",
  );
  const judged = readSpecificity(text);
  return { key: "specificity", score: judged.score, comment: judged.reason };
}

function inventedPath(args: {
  outputs: Record<string, unknown>;
}): { key: string; score: number; comment: string } {
  const explanation = typeof args.outputs.explanation === "string" ? args.outputs.explanation : "";
  const shown = Array.isArray(args.outputs.shownPaths)
    ? args.outputs.shownPaths.filter((item): item is string => typeof item === "string")
    : [];
  const verdict = checkInventedPaths(explanation, shown);
  return {
    key: "invented_path",
    score: verdict.score,
    comment:
      verdict.invented.length === 0
        ? "Every path-shaped token was shown."
        : `Invented: ${verdict.invented.join(", ")}`,
  };
}

async function ensureDataset(client: Client): Promise<void> {
  let datasetId: string;
  try {
    const existing = await client.readDataset({ datasetName: DATASET });
    datasetId = existing.id;
  } catch {
    const created = await client.createDataset(DATASET, {
      description: `File explanations for prompt comparison. ${JUDGMENT}`,
    });
    datasetId = created.id;
  }
  const examples = [];
  for await (const example of client.listExamples({ datasetId })) examples.push(example);
  if (examples.length > 0) {
    console.log(`dataset: ${DATASET} (${examples.length} files)`);
    return;
  }
  const inputs = buildInputs(limitArg());
  if (inputs.length === 0) {
    throw new Error("No parsed file has a neighbour, so there is nothing to explain.");
  }
  await client.createExamples(
    inputs.map((input) => ({
      dataset_id: datasetId,
      inputs: input,
    })),
  );
  console.log(`dataset: ${DATASET} (${inputs.length} files)`);
}

function buildInputs(limit: number): ExplanationInput[] {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const adapter = selectAdapter(root);
  const parsed = parseRepository(root, adapter);
  const assigned = new Map(parsed.roles.map((role) => [role.path, role.role]));
  const labelOf = (filePath: string): string => {
    const role = assigned.get(filePath);
    const id = role !== undefined && isRoleId(role) ? role : categoryOf(filePath);
    return categoryLabel(id);
  };
  const imports = new Map<string, ExplanationNeighbour[]>();
  const importedBy = new Map<string, ExplanationNeighbour[]>();
  for (const edge of parsed.edges) {
    const outgoing = imports.get(edge.source) ?? [];
    outgoing.push({ path: edge.target, role: labelOf(edge.target) });
    imports.set(edge.source, outgoing);
    const incoming = importedBy.get(edge.target) ?? [];
    incoming.push({ path: edge.source, role: labelOf(edge.source) });
    importedBy.set(edge.target, incoming);
  }
  const ranked = parsed.files
    .map((file) => ({
      path: file.path,
      weight: (imports.get(file.path)?.length ?? 0) + (importedBy.get(file.path)?.length ?? 0),
    }))
    .filter((file) => file.weight > 0)
    .sort((left, right) => right.weight - left.weight || compare(left.path, right.path));
  const chosen: ExplanationInput[] = [];
  for (const file of ranked) {
    if (chosen.length >= limit) break;
    const absolute = path.join(root, ...file.path.split("/"));
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(absolute));
    } catch {
      continue;
    }
    chosen.push({
      filePath: file.path,
      source: excerptSource(text),
      imports: sortNeighbours(imports.get(file.path) ?? []),
      importedBy: sortNeighbours(importedBy.get(file.path) ?? []),
    });
  }
  return chosen;
}

function readInput(value: unknown): ExplanationInput {
  if (!isExplanationInput(value)) {
    throw new Error("Dataset example is not a file explanation input.");
  }
  return value;
}

function isExplanationInput(value: unknown): value is ExplanationInput {
  if (typeof value !== "object" || value === null) return false;
  if (!("filePath" in value) || typeof value.filePath !== "string") return false;
  if (!("source" in value) || typeof value.source !== "string") return false;
  if (!("imports" in value) || !isNeighbourList(value.imports)) return false;
  if (!("importedBy" in value) || !isNeighbourList(value.importedBy)) return false;
  return true;
}

function isNeighbourList(value: unknown): value is ExplanationNeighbour[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "path" in item &&
      "role" in item &&
      typeof item.path === "string" &&
      typeof item.role === "string",
  );
}

function readSpecificity(text: string): { score: number; reason: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("The judge did not return JSON.");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("specific" in value) ||
    !("reason" in value) ||
    typeof value.specific !== "boolean" ||
    typeof value.reason !== "string"
  ) {
    throw new Error("The judge did not return a specificity score.");
  }
  return { score: value.specific ? 1 : 0, reason: value.reason };
}

function average(rows: readonly ExperimentResultRow[], key: string): { sum: number; total: number } {
  let sum = 0;
  let total = 0;
  for (const row of rows) {
    const found = row.evaluationResults.results.find((item) => item.key === key);
    if (found === undefined || found.score === undefined || found.score === null) continue;
    total += 1;
    sum += typeof found.score === "boolean" ? (found.score ? 1 : 0) : found.score;
  }
  if (total === 0) throw new Error(`No ${key} scores were recorded.`);
  return { sum, total };
}

function line(averages: Averages): string {
  return `specificity ${percent(averages.specificity)}    invented-path ${percent(averages.inventedPath)}`;
}

function comparison(
  retired: { sum: number; total: number },
  current: { sum: number; total: number },
): string {
  const retiredMean = (retired.sum / retired.total) * 100;
  const currentMean = (current.sum / current.total) * 100;
  const delta = Math.abs(currentMean - retiredMean);
  if (delta < 0.05) return "specificity: the two prompts scored the same.";
  const better = currentMean > retiredMean ? "explanation-current" : "explanation-v1";
  return `specificity: ${better} is higher by ${delta.toFixed(1)} percentage points.`;
}

function percent(value: { sum: number; total: number }): string {
  return `${((value.sum / value.total) * 100).toFixed(1)}% (${value.sum}/${value.total})`;
}

function listed(neighbours: readonly ExplanationNeighbour[]): string {
  if (neighbours.length === 0) return "None.";
  return neighbours.map((neighbour) => neighbour.path).join("\n");
}

function sortNeighbours(neighbours: readonly ExplanationNeighbour[]): ExplanationNeighbour[] {
  return neighbours.slice().sort((left, right) => compare(left.path, right.path));
}

function limitArg(): number {
  const index = process.argv.indexOf("--limit");
  if (index === -1) return DEFAULT_LIMIT;
  const raw = process.argv[index + 1];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("--limit needs a positive integer.");
  }
  return parsed;
}

function compare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

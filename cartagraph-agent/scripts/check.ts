import {
  dependencyWalk,
  filesOfRole,
  neighbouringFiles,
  routeTableText,
  searchPaths,
  summarizeAnalysis,
} from "../tools/answers.ts";
import { parseSnapshot } from "../tools/snapshot.ts";
import { loadCanvas } from "../tools/canvas.ts";
import type { AnalysisSnapshot } from "../tools/snapshot.ts";

const snapshot: AnalysisSnapshot = {
  repository: "example/app",
  framework: "nextjs",
  files: [
    { path: "src/app/page.tsx", folder: "src/app", lines: 10, role: "page-route" },
    { path: "src/auth/session.ts", folder: "src/auth", lines: 20, role: "service" },
    { path: "src/db.ts", folder: "src", lines: 5, role: "util" },
    { path: "src/orphan.ts", folder: "src", lines: 3, role: "util" },
  ],
  links: [
    { source: "src/app/page.tsx", target: "src/auth/session.ts" },
    { source: "src/auth/session.ts", target: "src/db.ts" },
  ],
  routes: [{ file: "src/app/page.tsx", method: "GET", pattern: "/" }],
  coverage: {
    parsed: 4,
    source: 5,
    percent: 80,
    skips: [{ reason: "not a TypeScript or JavaScript source file", count: 1 }],
  },
};

try {
  await check();
  console.log("ok");
} catch (error) {
  const message = error instanceof Error ? error.message : "check failed";
  console.error(message);
  process.exitCode = 1;
}

async function check(): Promise<void> {
  const canvas = await loadCanvas();
  const summary = await summarizeAnalysis(snapshot);
  assert(summary.includes("Repository: example/app"), "summary dropped the repository");
  assert(summary.includes("Framework: Next.js"), "summary dropped the framework label");
  assert(summary.includes("Imports: 2"), "summary import count is not the link list length");
  assert(summary.includes("Nothing imports this file."), "summary did not use graph insights");
  assert(summary.includes("src/orphan.ts"), "summary dropped the unimported file");
  assert(!summary.includes("src/not-real.ts"), "summary invented a path");

  const found = await searchPaths(snapshot, "auth");
  assert(found.includes("src/auth/session.ts"), "search missed a matching path");
  assert(!found.includes("src/orphan.ts"), "search returned a path that does not match");
  const missed = await searchPaths(snapshot, "missing");
  assert(missed.startsWith("No file path contains"), "empty search invented files");

  const services = await filesOfRole(snapshot, "service");
  assert(services.includes("src/auth/session.ts"), "role list missed a service");
  assert(!services.includes("src/app/page.tsx"), "role list included another role");
  const unknown = await filesOfRole(snapshot, "not-a-role");
  assert(unknown.includes("not a role"), "unknown role was accepted");

  const neighbours = await neighbouringFiles(snapshot, "src/auth/session.ts");
  const [depends, depended] = neighbours.split("Depended on");
  assert(depends !== undefined && depended !== undefined, "neighbour headings missing");
  assert(depends.includes("src/db.ts"), "depends-on list is not the canvas list");
  assert(!depends.includes("src/orphan.ts"), "depends-on invented a neighbour");
  assert(depended.includes("src/app/page.tsx"), "depended-on list is not the canvas list");
  const missing = await neighbouringFiles(snapshot, "src/not-real.ts");
  assert(missing === "src/not-real.ts is not a file in this analysis.", "missing file was guessed");

  const chain = canvas.walkGraph("src/app/page.tsx", snapshot.links, "dependencies");
  const chainText = await walkText("src/app/page.tsx", "dependencies");
  assert(JSON.stringify(pathsOf(chainText)) === JSON.stringify(chain), "walk is not walkGraph");
  const radius = canvas.walkGraph("src/db.ts", snapshot.links, "dependents");
  const radiusText = await walkText("src/db.ts", "dependents");
  assert(JSON.stringify(pathsOf(radiusText)) === JSON.stringify(radius), "blast radius is not walkGraph");
  const nowhere = await walkText("src/not-real.ts", "dependents");
  assert(nowhere === "src/not-real.ts is not a file in this analysis.", "walk guessed a start file");

  const routes = await routeTableText(snapshot);
  assert(routes === "GET / src/app/page.tsx", "route table changed a recovered route");

  assert(
    throws(() =>
      parseSnapshot(
        { ...snapshot, links: [{ source: "src/db.ts", target: "src/nope.ts" }] },
        () => true,
      ),
    ),
    "a link to an unknown file was accepted",
  );
}

function throws(run: () => void): boolean {
  try {
    run();
    return false;
  } catch {
    return true;
  }
}

function walkText(filePath: string, direction: "dependencies" | "dependents"): Promise<string> {
  return dependencyWalk(snapshot, filePath, direction);
}

function pathsOf(text: string): string[] {
  const lines = text.split("\n").slice(1);
  if (lines.length === 1 && lines[0] === "None.") return [];
  return lines;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

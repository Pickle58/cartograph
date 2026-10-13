export type PathVerdict = {
  score: number;
  tokens: string[];
  invented: string[];
};

// Set membership against the paths the prompt listed. A trailing run of
// segments is that same path (`explain.ts` for `lib/explain.ts`); a human
// checking a failure can see the difference in one glance. Anything that is
// not one of those paths was invented. No model is asked.
export function checkInventedPaths(
  explanation: string,
  shownPaths: readonly string[],
): PathVerdict {
  const tokens = pathTokens(explanation);
  const invented = tokens.filter((token) => !isShownPath(token, shownPaths));
  return {
    score: invented.length === 0 ? 1 : 0,
    tokens,
    invented,
  };
}

function pathTokens(text: string): string[] {
  const sourceExtension = "tsx?|jsx?|mts|cts|mjs|cjs|astro";
  const pattern = new RegExp(
    `(?:[\\w.~+-]+/)+[\\w.~+-]+\\.(?:${sourceExtension})|[\\w.~+-]+\\.(?:${sourceExtension})`,
    "g",
  );
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > 0 && /[\w./~+-]/.test(text.charAt(start - 1))) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    found.push(token);
  }
  return found;
}

function isShownPath(token: string, shownPaths: readonly string[]): boolean {
  const name = normalizePath(token);
  for (const shown of shownPaths) {
    const allowed = normalizePath(shown);
    if (allowed === name || allowed.endsWith(`/${name}`)) return true;
  }
  return false;
}

function normalizePath(value: string): string {
  const slash = value.replaceAll("\\", "/");
  return slash.startsWith("./") ? slash.slice(2) : slash;
}

// LangSmith runs this function inside its own sandbox, so the source has to
// be plain JavaScript with no imports. `toString` is the function itself.
export function onlineEvaluatorCode(): string {
  return `${pathTokens.toString()}\n${isShownPath.toString()}\n${normalizePath.toString()}\n${checkInventedPaths.toString()}\n${PERFORM_EVAL}`;
}

const PERFORM_EVAL = `function performEval(run) {
  const outputs = run && run.outputs ? run.outputs : {};
  const explanation = outputs.explanation;
  const shown = outputs.shownPaths;
  if (typeof explanation !== "string" || !Array.isArray(shown)) {
    throw new Error("This run has no explanation or no shown paths, so it cannot be scored.");
  }
  const paths = [];
  for (const path of shown) {
    if (typeof path !== "string") {
      throw new Error("A shown path was not a string.");
    }
    paths.push(path);
  }
  const verdict = checkInventedPaths(explanation, paths);
  return { invented_path: verdict.score };
}`;

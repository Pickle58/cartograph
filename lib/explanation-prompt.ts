// The live explanation prompt. A retired wording lives with the evals and is
// not imported here — shipping it so a comparison can reach it would make the
// test part of the product.

export const SOURCE_EXCERPT = 12_000;

const FORMATTING = `You may format the reply with \`inline code\`, **bold**, and lines that start with "- ". No headings, no code fences, no links, no tables, no numbered lists.`;

export type ExplanationNeighbour = {
  path: string;
  role: string;
};

export type ExplanationNeighbours = {
  imports: readonly ExplanationNeighbour[];
  importedBy: readonly ExplanationNeighbour[];
};

export function fileExplanation(
  filePath: string,
  source: string,
  neighbours: ExplanationNeighbours,
): { system: string; user: string } {
  return {
    system: `You explain one file a parser has already mapped. You do not decide which files are connected, and you do not invent files. Use only the file and the neighbours below. ${FORMATTING}`,
    user: fileUser(filePath, source, neighbours),
  };
}

export function folderExplanation(
  directory: string,
  files: readonly ExplanationNeighbour[],
  inbound: readonly { source: string; target: string }[],
): { system: string; user: string } {
  return {
    system: `You explain one folder, not a single file inside it. You do not decide which files are connected, and you do not invent files. Use only the files and the imports below. ${FORMATTING}`,
    user: folderUser(directory, files, inbound),
  };
}

const INBOUND_HEADING = "Imported from outside:";

// Paths named in the prompt, and not paths that merely occur inside the source
// excerpt. The excerpt starts at the Source: line and is not part of the set
// the model was told it may name. An "imports" edge is only real under the
// inbound heading; a file bullet can contain that word and is still one path.
export function pathsListedInPrompt(prompt: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (value: string): void => {
    if (seen.has(value)) return;
    seen.add(value);
    paths.push(value);
  };
  let inbound = false;
  for (const line of prompt.split("\n")) {
    if (line === "Source:") break;
    if (line === INBOUND_HEADING) {
      inbound = true;
      continue;
    }
    if (line.endsWith(":") && !line.startsWith("File: ") && !line.startsWith("Folder: ")) {
      inbound = false;
      continue;
    }
    const file = /^File: (.+)$/.exec(line);
    if (file?.[1] !== undefined) {
      add(file[1]);
      continue;
    }
    const bullet = /^- (.+)$/.exec(line);
    if (bullet?.[1] === undefined) continue;
    if (inbound) {
      const imports = /^(.+) imports (.+)$/.exec(bullet[1]);
      if (imports?.[1] !== undefined && imports[2] !== undefined) {
        add(imports[1]);
        add(imports[2]);
        continue;
      }
    }
    const role = /^(.+) \([^)]+\)$/.exec(bullet[1]);
    add(role?.[1] ?? bullet[1]);
  }
  return paths;
}

export function excerptSource(source: string): string {
  if (source.length <= SOURCE_EXCERPT) return source;
  return `${source.slice(0, SOURCE_EXCERPT)}\n\n[${source.length - SOURCE_EXCERPT} characters omitted]`;
}

function fileUser(
  filePath: string,
  source: string,
  neighbours: ExplanationNeighbours,
): string {
  return [
    "Explain this file in a short paragraph. Say what it does given the files it imports and the files that import it. Name a neighbour when it matters. Do not name any file that is not listed.",
    "",
    `File: ${filePath}`,
    "",
    "Imports:",
    neighbourLines(neighbours.imports),
    "",
    "Imported by:",
    neighbourLines(neighbours.importedBy),
    "",
    "Source:",
    excerptSource(source),
  ].join("\n");
}

function folderUser(
  directory: string,
  files: readonly ExplanationNeighbour[],
  inbound: readonly { source: string; target: string }[],
): string {
  const fileLines = files.length === 0 ? "None." : files.map((file) => `- ${file.path} (${file.role})`).join("\n");
  const inboundLines =
    inbound.length === 0
      ? "Nothing outside this folder imports these files."
      : inbound.map((edge) => `- ${edge.source} imports ${edge.target}`).join("\n");
  return [
    "Explain this folder. Say what is in it, and why files outside it import the files inside it. Do not summarise one file and call that the folder. Do not name any file that is not listed.",
    "",
    `Folder: ${directory}`,
    "",
    "Files in this folder:",
    fileLines,
    "",
    INBOUND_HEADING,
    inboundLines,
  ].join("\n");
}

function neighbourLines(neighbours: readonly ExplanationNeighbour[]): string {
  if (neighbours.length === 0) return "None.";
  return neighbours.map((neighbour) => `- ${neighbour.path} (${neighbour.role})`).join("\n");
}

// Retired file-explanation prompt. v1 omitted the file path and each
// neighbour's role, which is why those cache entries were left unread. It
// stays here so the comparison can run it. The application does not import
// this file.

type Neighbour = {
  path: string;
  role: string;
};

const FORMATTING = `You may format the reply with \`inline code\`, **bold**, and lines that start with "- ". No headings, no code fences, no links, no tables, no numbered lists.`;

const SOURCE_EXCERPT = 12_000;

export function retiredFileExplanation(
  source: string,
  neighbours: {
    imports: readonly Neighbour[];
    importedBy: readonly Neighbour[];
  },
): { system: string; user: string } {
  const excerpt =
    source.length <= SOURCE_EXCERPT
      ? source
      : `${source.slice(0, SOURCE_EXCERPT)}\n\n[${source.length - SOURCE_EXCERPT} characters omitted]`;
  const user = [
    "Explain this file in a short paragraph. Say what it does given the files it imports and the files that import it. Name a neighbour when it matters. Do not name any file that is not listed.",
    "",
    "Imports:",
    lines(neighbours.imports),
    "",
    "Imported by:",
    lines(neighbours.importedBy),
    "",
    "Source:",
    excerpt,
  ].join("\n");
  return {
    system: `You explain one file a parser has already mapped. You do not decide which files are connected, and you do not invent files. Use only the file and the neighbours below. ${FORMATTING}`,
    user,
  };
}

function lines(neighbours: readonly Neighbour[]): string {
  if (neighbours.length === 0) return "None.";
  return neighbours.map((neighbour) => `- ${neighbour.path}`).join("\n");
}

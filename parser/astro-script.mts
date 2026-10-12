export const UNCLOSED_FRONTMATTER = "frontmatter fence does not close";

const FENCE = "---";

export type AstroScript = { closed: true; script: string } | { closed: false };

// The component script is the text between the fences. The template after the
// closing fence is not TypeScript, so it is never returned. A file that does
// not open a fence has an empty script and is still a source file.
export function astroScript(text: string): AstroScript {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (!source.startsWith(FENCE)) return { closed: true, script: "" };
  const after = source.slice(FENCE.length);
  let content: string;
  if (after.startsWith("\r\n")) content = after.slice(2);
  else if (after.startsWith("\n")) content = after.slice(1);
  else return { closed: false };
  const end = closingFence(content);
  if (end === undefined) return { closed: false };
  return { closed: true, script: content.slice(0, end) };
}

function closingFence(content: string): number | undefined {
  let index = 0;
  while (index <= content.length) {
    const newline = content.indexOf("\n", index);
    const lineEnd = newline === -1 ? content.length : newline;
    let line = content.slice(index, lineEnd);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line === FENCE) return index;
    if (newline === -1) return undefined;
    index = newline + 1;
  }
  return undefined;
}

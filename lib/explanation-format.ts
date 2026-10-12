// The prompt allows inline code, bold and bullets. Anything else the model
// emits is dropped here, so a heading or a fence can't show up as raw markers
// in a narrow pane.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; inlines: Inline[] }
  | { kind: "code"; text: string };

export type Block =
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "list"; items: Inline[][] };

export type TextPart = { kind: "text"; text: string } | { kind: "path"; path: string };

const PATH_CHAR = /[A-Za-z0-9._~/-]/;

export function explanationBlocks(source: string): Block[] {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;
  let fence = false;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const inlines = parseInlines(paragraph.join(" "));
    if (inlines.length > 0) blocks.push({ kind: "paragraph", inlines });
    paragraph = [];
  };

  const flushList = (): void => {
    if (list === null) return;
    const items = list
      .map((item) => parseInlines(item))
      .filter((item) => item.length > 0);
    if (items.length > 0) blocks.push({ kind: "list", items });
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      fence = !fence;
      continue;
    }
    if (trimmed.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }
    if (fence) {
      flushList();
      paragraph.push(trimmed);
      continue;
    }
    const bullet = /^[-*]\s+/.exec(trimmed);
    if (bullet !== null) {
      flushParagraph();
      const item = trimmed.slice(bullet[0].length);
      if (list === null) list = [];
      list.push(item);
      continue;
    }
    flushList();
    const heading = /^(#{1,6})\s+/.exec(trimmed);
    paragraph.push(heading === null ? trimmed : trimmed.slice(heading[0].length));
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function linkRepositoryPaths(
  text: string,
  paths: readonly string[],
): TextPart[] {
  const sorted = paths
    .filter((path) => path.length > 1 && path !== ".")
    .sort((left, right) => right.length - left.length || compareText(left, right));
  const parts: TextPart[] = [];
  let buffer = "";
  for (let index = 0; index < text.length; ) {
    let matched: string | undefined;
    for (const path of sorted) {
      if (!text.startsWith(path, index)) continue;
      if (!isBoundary(text, index, index + path.length)) continue;
      matched = path;
      break;
    }
    if (matched !== undefined) {
      if (buffer.length > 0) {
        parts.push({ kind: "text", text: buffer });
        buffer = "";
      }
      parts.push({ kind: "path", path: matched });
      index += matched.length;
      continue;
    }
    buffer += text.charAt(index);
    index += 1;
  }
  if (buffer.length > 0) parts.push({ kind: "text", text: buffer });
  return parts;
}

function parseInlines(input: string): Inline[] {
  const inlines: Inline[] = [];
  let text = "";
  const pushText = (): void => {
    const cleaned = stripMarkers(text);
    if (cleaned.length > 0) inlines.push({ kind: "text", text: cleaned });
    text = "";
  };

  for (let index = 0; index < input.length; ) {
    if (input.startsWith("**", index)) {
      const end = input.indexOf("**", index + 2);
      if (end !== -1) {
        pushText();
        const inner = parseInlines(input.slice(index + 2, end));
        if (inner.length > 0) inlines.push({ kind: "bold", inlines: inner });
        index = end + 2;
        continue;
      }
      index += 2;
      continue;
    }
    if (input.charAt(index) === "`") {
      const end = input.indexOf("`", index + 1);
      if (end !== -1) {
        pushText();
        const code = stripMarkers(input.slice(index + 1, end));
        if (code.length > 0) inlines.push({ kind: "code", text: code });
        index = end + 1;
        continue;
      }
      index += 1;
      continue;
    }
    const char = input.charAt(index);
    if (char === "*" || char === "#" || char === "`") {
      index += 1;
      continue;
    }
    text += char;
    index += 1;
  }
  pushText();
  return inlines;
}

function stripMarkers(value: string): string {
  return value.replaceAll("`", "").replaceAll("*", "").replaceAll("#", "");
}

function isBoundary(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text.charAt(start - 1) : "";
  if (before.length > 0 && PATH_CHAR.test(before)) return false;
  if (end >= text.length) return true;
  const after = text.charAt(end);
  if (!PATH_CHAR.test(after)) return true;
  // A period that ends the sentence is not the start of a longer path.
  if (after === ".") {
    const rest = end + 1 < text.length ? text.charAt(end + 1) : "";
    if (rest.length === 0 || !PATH_CHAR.test(rest)) return true;
  }
  return false;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

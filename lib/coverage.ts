// Same reason walk.mts records for files that were never going to be nodes.
const NOT_SOURCE = "not a TypeScript or JavaScript source file";

export type Coverage = {
  parsed: number;
  source: number;
  percent: number;
  skips: readonly { reason: string; count: number }[];
};

const BANNER_BELOW = 95;

export function coverageOf(
  files: readonly { skip_reason: string | null }[],
): Coverage {
  let parsed = 0;
  const skipCounts = new Map<string, number>();
  for (const file of files) {
    if (file.skip_reason === null) {
      parsed += 1;
      continue;
    }
    skipCounts.set(file.skip_reason, (skipCounts.get(file.skip_reason) ?? 0) + 1);
  }

  let unparsedSource = 0;
  const skips: { reason: string; count: number }[] = [];
  for (const [reason, count] of skipCounts) {
    if (reason !== NOT_SOURCE) unparsedSource += count;
    skips.push({ reason, count });
  }
  skips.sort((left, right) => right.count - left.count || compareText(left.reason, right.reason));

  const source = parsed + unparsedSource;
  const percent = source === 0 ? 100 : Math.floor((parsed / source) * 100);
  return { parsed, source, percent, skips };
}

export function coverageIsPartial(coverage: Coverage): boolean {
  return coverage.percent < BANNER_BELOW;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

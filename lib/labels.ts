// The shortest suffix of a path that no other path on screen shares.
// "." stays ".". A longer suffix is used only when the shorter one collides.
export function shortestUniqueLabels(
  paths: readonly string[],
): Map<string, string> {
  const segments = new Map<string, readonly string[]>();
  for (const path of paths) {
    segments.set(path, path === "." ? ["."] : path.split("/"));
  }

  const labels = new Map<string, string>();
  for (const path of paths) {
    const parts = segments.get(path) ?? [path];
    let label = parts[parts.length - 1] ?? path;
    for (let length = 1; length <= parts.length; length += 1) {
      label = parts.slice(parts.length - length).join("/");
      let collisions = 0;
      for (const other of paths) {
        const otherParts = segments.get(other) ?? [other];
        const otherLabel = otherParts
          .slice(otherParts.length - length)
          .join("/");
        if (otherLabel === label) collisions += 1;
      }
      if (collisions === 1) break;
    }
    labels.set(path, label);
  }
  return labels;
}

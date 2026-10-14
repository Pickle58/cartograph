export function installAlias(): void;

export function resolve(
  specifier: string,
  context: { parentURL?: string },
  nextResolve: (specifier: string, context?: { parentURL?: string }) => { url: string },
): { url: string };

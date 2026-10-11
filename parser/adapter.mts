export type DirectoryExclusion = {
  name: string;
  reason: string;
};

// Framework knowledge stays behind this. The parser asks, and never checks a
// framework's directory layout itself.
export type FrameworkAdapter = {
  readonly id: string;
  exclusions(): readonly DirectoryExclusion[];
};

// No framework. Nothing is excluded on a framework's behalf, and there are no
// entry points, so the walk keeps whole directories.
export const noFramework: FrameworkAdapter = {
  id: "none",
  exclusions() {
    return [];
  },
};

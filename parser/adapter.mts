import type { SourceFile } from "ts-morph";

export type DirectoryExclusion = {
  name: string;
  reason: string;
};

export type AdapterFile = {
  path: string;
  source: SourceFile;
};

export type AdapterRole = {
  path: string;
  role: string;
};

export type AdapterRoute = {
  file: string;
  method: string;
  pattern: string;
};

export type AdapterClassification = {
  roles: AdapterRole[];
  routes: AdapterRoute[];
};

// Framework knowledge stays behind this. The parser asks, and never checks a
// framework's directory layout itself.
export type FrameworkAdapter = {
  readonly id: string;
  exclusions(): readonly DirectoryExclusion[];
  matches(root: string): boolean;
  assign(root: string, files: readonly AdapterFile[]): AdapterClassification;
};

// No framework. Nothing is excluded on a framework's behalf, and there are no
// entry points, so the walk keeps whole directories and no route is emitted.
export const noFramework: FrameworkAdapter = {
  id: "none",
  exclusions() {
    return [];
  },
  matches() {
    return false;
  },
  assign() {
    return { roles: [], routes: [] };
  },
};

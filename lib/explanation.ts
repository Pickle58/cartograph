export type ExplainTarget =
  | { kind: "file"; path: string }
  | { kind: "folder"; directory: string };

export type Explanation =
  | { status: "ready"; body: string }
  | {
      status: "stale";
      body: string | null;
      fileChanged: boolean;
      commitMoved: boolean;
    }
  | { status: "failed"; message: string };

export function explainKey(target: ExplainTarget): string {
  switch (target.kind) {
    case "file":
      return `file\0${target.path}`;
    case "folder":
      return `folder\0${target.directory}`;
    default: {
      const unhandled: never = target;
      throw new Error(`Unhandled explain target: ${String(unhandled)}`);
    }
  }
}

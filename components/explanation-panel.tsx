"use client";

import { useState, useTransition } from "react";
import { useMapActions } from "@/components/map-actions";
import { reanalyse } from "@/lib/actions";
import {
  explanationBlocks,
  linkRepositoryPaths,
  type Block,
  type Inline,
} from "@/lib/explanation-format";
import type { Explanation } from "@/lib/explanation";

export function ExplanationPanel({
  analysisId,
  stored,
  pending,
  paths,
  directories,
  onExplain,
}: {
  analysisId: string;
  stored: Explanation | null;
  pending: boolean;
  paths: readonly string[];
  directories: readonly string[];
  onExplain: () => void;
}) {
  const body = stored !== null && stored.status !== "failed" ? stored.body : null;
  const showEmpty = stored === null && !pending;
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-3 py-1.5">
        <button
          type="button"
          onClick={onExplain}
          disabled={pending}
          className="border border-accent px-2 py-1 text-[11px] text-accent disabled:border-border disabled:text-muted"
        >
          Explain
        </button>
      </div>
      {stored?.status === "stale" ? (
        <StaleNotice
          analysisId={analysisId}
          fileChanged={stored.fileChanged}
          commitMoved={stored.commitMoved}
        />
      ) : null}
      {stored?.status === "failed" ? (
        <p className="px-3 py-2 text-[12px] text-muted">{stored.message}</p>
      ) : null}
      {pending && body === null && stored?.status !== "stale" ? (
        <p className="px-3 py-2 text-[12px] text-muted">Explaining…</p>
      ) : null}
      {showEmpty ? (
        <p className="px-3 py-2 text-[12px] text-muted">Nothing has explained this yet.</p>
      ) : null}
      {body !== null ? (
        <RepositoryText body={body} paths={paths} directories={directories} />
      ) : null}
    </div>
  );
}

function StaleNotice({
  analysisId,
  fileChanged,
  commitMoved,
}: {
  analysisId: string;
  fileChanged: boolean;
  commitMoved: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="border-b border-border px-3 py-2">
      <p className="text-[12px]">{staleCopy(fileChanged, commitMoved)}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await reanalyse(analysisId);
            if (result?.error) setError(result.error);
          });
        }}
        className="mt-1.5 border border-accent px-2 py-1 text-[11px] text-accent disabled:border-border disabled:text-muted"
      >
        Re-analyse
      </button>
      {error !== null ? <p className="mt-1 text-[12px] text-muted">{error}</p> : null}
    </div>
  );
}

function staleCopy(fileChanged: boolean, commitMoved: boolean): string {
  if (fileChanged && commitMoved) {
    return "This explanation is stale. The file has changed, and the repository has moved past the commit that was analysed.";
  }
  if (fileChanged) return "This explanation is stale. The file has changed.";
  if (commitMoved) {
    return "This explanation is stale. The repository has moved past the commit that was analysed.";
  }
  return "This explanation is stale.";
}

export function RepositoryText({
  body,
  paths,
  directories,
}: {
  body: string;
  paths: readonly string[];
  directories: readonly string[];
}) {
  const linkable = [...paths, ...directories];
  return (
    <div className="px-3 py-2 text-[12px]">
      {explanationBlocks(body).map((block, index) => (
        <BlockView key={index} block={block} linkable={linkable} files={paths} />
      ))}
    </div>
  );
}

function BlockView({
  block,
  linkable,
  files,
}: {
  block: Block;
  linkable: readonly string[];
  files: readonly string[];
}) {
  switch (block.kind) {
    case "paragraph":
      return (
        <p className="mb-2 last:mb-0">
          <InlineRun inlines={block.inlines} linkable={linkable} files={files} />
        </p>
      );
    case "list":
      return (
        <ul className="mb-2 list-disc pl-4 last:mb-0">
          {block.items.map((item, index) => (
            <li key={index}>
              <InlineRun inlines={item} linkable={linkable} files={files} />
            </li>
          ))}
        </ul>
      );
    default: {
      const unhandled: never = block;
      throw new Error(`Unhandled explanation block: ${String(unhandled)}`);
    }
  }
}

function InlineRun({
  inlines,
  linkable,
  files,
}: {
  inlines: readonly Inline[];
  linkable: readonly string[];
  files: readonly string[];
}) {
  return inlines.map((inline, index) => {
    switch (inline.kind) {
      case "text":
        return (
          <LinkedText key={index} text={inline.text} linkable={linkable} files={files} />
        );
      case "code":
        return (
          <code key={index} className="font-mono">
            <LinkedText text={inline.text} linkable={linkable} files={files} />
          </code>
        );
      case "bold":
        return (
          <strong key={index}>
            <InlineRun inlines={inline.inlines} linkable={linkable} files={files} />
          </strong>
        );
      default: {
        const unhandled: never = inline;
        throw new Error(`Unhandled explanation inline: ${String(unhandled)}`);
      }
    }
  });
}

function LinkedText({
  text,
  linkable,
  files,
}: {
  text: string;
  linkable: readonly string[];
  files: readonly string[];
}) {
  const fileSet = new Set(files);
  const { selectFile, openDirectory } = useMapActions();
  return linkRepositoryPaths(text, linkable).map((part, index) => {
    switch (part.kind) {
      case "text":
        return <span key={index}>{part.text}</span>;
      case "path":
        if (fileSet.has(part.path)) {
          return (
            <button
              key={index}
              type="button"
              data-file-path={part.path}
              onClick={() => selectFile(part.path)}
              className="font-mono text-accent"
            >
              {part.path}
            </button>
          );
        }
        return (
          <button
            key={index}
            type="button"
            onClick={() => openDirectory(part.path)}
            className="font-mono text-accent"
          >
            {part.path}
          </button>
        );
      default: {
        const unhandled: never = part;
        throw new Error(`Unhandled explanation part: ${String(unhandled)}`);
      }
    }
  });
}

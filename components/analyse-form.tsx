"use client";

import { useActionState } from "react";
import { analyseRepository } from "@/lib/actions";

export function AnalyseForm() {
  const [state, action, pending] = useActionState(analyseRepository, null);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <label htmlFor="repository-url" className="sr-only">
        GitHub repository URL
      </label>
      <input
        id="repository-url"
        name="url"
        type="text"
        required
        autoComplete="off"
        spellCheck={false}
        placeholder="https://github.com/owner/repo"
        className="min-w-64 flex-1 border border-border bg-surface px-2 py-1 font-mono text-[12px] outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={pending}
        className="border border-border bg-surface-raised px-2 py-1 text-[12px] text-fg disabled:text-muted"
      >
        Analyse
      </button>
      {state?.error !== undefined ? (
        <p className="basis-full text-[12px] text-fg">{state.error}</p>
      ) : null}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { submitRepository } from "@/lib/actions";

export function LandingForm() {
  const [state, action, pending] = useActionState(submitRepository, null);

  return (
    <form action={action} className="mt-8 flex max-w-md flex-col items-start gap-2">
      <label htmlFor="landing-repository-url" className="sr-only">
        GitHub repository URL
      </label>
      <input
        id="landing-repository-url"
        name="url"
        type="text"
        required
        autoComplete="off"
        spellCheck={false}
        placeholder="https://github.com/owner/repo"
        className="w-full min-w-0 border border-border bg-surface px-2 py-1 font-mono text-[12px] outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={pending}
        className="border border-border bg-surface-raised px-2 py-1 text-[12px] text-fg disabled:text-muted"
      >
        Analyse
      </button>
      {state?.error !== undefined ? (
        <p className="text-[12px] text-fg">{state.error}</p>
      ) : null}
    </form>
  );
}

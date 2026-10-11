"use client";

import { useState } from "react";
import { type Coverage } from "@/lib/coverage";

export function CoverageBanner({ coverage }: { coverage: Coverage }) {
  const [open, setOpen] = useState(true);
  const summary = `Parsed ${coverage.percent}% of source files`;

  return (
    <div className="border-b border-border bg-surface px-3 py-1.5 text-[12px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="text-left text-fg"
      >
        {summary}
      </button>
      {open ? (
        <ul className="mt-1 list-none p-0 text-muted">
          <li>
            {coverage.parsed} parsed / {coverage.source} source
          </li>
          {coverage.skips.map((skip) => (
            <li key={skip.reason}>
              {skip.count} skipped: {skip.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

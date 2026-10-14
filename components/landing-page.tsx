import type { ReactNode } from "react";
import Link from "next/link";
import {
  AbsenceFigure,
  FrameworkFigure,
  MapFigure,
  NeighboursFigure,
  ParseFigure,
} from "@/components/landing-figures";
import { LandingForm } from "@/components/landing-form";
import { ThemeControl } from "@/components/theme-control";

export function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-border bg-surface-raised">
        <div className="mx-auto flex max-w-[1140px] flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2">
          <span className="text-[12px] font-semibold tracking-tight">Cartograph</span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            <ThemeControl />
            <Link
              href="/sign-in"
              className="border border-border bg-surface px-2 py-1 text-[12px] text-fg"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <section className="flex min-h-[calc(100svh-2.75rem)] flex-col justify-center py-16 md:py-24">
        <div className="mx-auto grid w-full max-w-[1140px] items-center gap-y-12 px-6 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:gap-x-20">
          <div className="min-w-0">
            <h1 className="max-w-[14ch] text-[clamp(2.25rem,6vw,4rem)] leading-[1.1] tracking-[-0.03em]">
              A map of a public repository.
            </h1>
            <p className="mt-6 max-w-[46ch] text-[13px] leading-[1.45]">
              Paste a GitHub URL. Cartograph reads the TypeScript and JavaScript,
              resolves each import to a file, and draws what it found.
            </p>
            <LandingForm />
          </div>
          <div className="min-w-0">
            <MapFigure />
          </div>
        </div>
      </section>

      <Section title="Folders, files, and the lines between them." figure={<NeighboursFigure />}>
        <p>
          A folder is a box. Open it and the files are listed. Select one and
          see what it imports, what imports it, and what sits two steps out if
          it changes.
        </p>
        <p>
          An explanation is written from that file and its real neighbours. A
          file that was skipped is counted, with the reason.
        </p>
      </Section>

      <Section title="Parsed, then drawn." figure={<ParseFigure />}>
        <p>
          The parser walks the repository on its own. An import, a re-export, a
          dynamic import, or a require() becomes a line only when it resolves to
          a file that is there. Anything unresolved is reported, not filled in.
        </p>
        <p>
          A framework adapter then names what a file is, from the layout that
          framework already uses. The parser never checks which framework it
          is reading.
        </p>
      </Section>

      <Section title="Five frameworks, and none." figure={<FrameworkFigure />}>
        <p>
          Next.js, React, NestJS, Express, and Astro. Next.js and Astro pages
          and endpoints, NestJS controllers and the routes on them, React
          components. Express is recognised from its directories.
        </p>
        <p>
          A route is listed only when its method and full path are both in the
          syntax. Express routes are not listed. They are assembled at runtime,
          so the table stays empty. A repository that matches nothing still
          maps, with generic roles and no invented routes.
        </p>
      </Section>

      <Section title="What it doesn't do." figure={<AbsenceFigure />}>
        <p>
          It does not score the code, grade a file, or count issues. It
          explains a codebase. It does not review one.
        </p>
        <p>
          It does not decide that two files are connected. If an import does
          not resolve, that is reported, and no line is drawn.
        </p>
        <p>
          It does not read private repositories. There is no token to store.
        </p>
        <p>
          It does not guess a route. If the method or the path is missing, the
          route is absent.
        </p>
        <p>It parses TypeScript and JavaScript. Other languages are left out.</p>
      </Section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1140px] flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-6 py-8 text-[12px] text-muted">
          <span>Cartograph</span>
          <span>Public TypeScript and JavaScript.</span>
        </div>
      </footer>
    </div>
  );
}

function Section({
  title,
  figure,
  children,
}: {
  title: string;
  figure: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border py-32">
      <div className="mx-auto grid max-w-[1140px] items-start gap-y-12 px-6 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:gap-x-20">
        <div className="min-w-0">
          <h2 className="max-w-[16ch] text-[clamp(1.75rem,4vw,2.75rem)] leading-[1.1] tracking-[-0.03em]">
            {title}
          </h2>
          <div className="mt-6 max-w-[46ch] space-y-4 text-[13px] leading-[1.45]">
            {children}
          </div>
        </div>
        <div className="min-w-0">{figure}</div>
      </div>
    </section>
  );
}

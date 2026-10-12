# Phase 9.1 — Astro

**Goal.** An Astro repository is recognised, and its pages are on the map.

## Build

- An Astro adapter. It matches a repository that depends on Astro, or that has
  an Astro config, and it matches before Express and before React, so a site
  that also depends on React is Astro.
- `.astro` files are source. The script between the frontmatter fences is
  TypeScript and its imports resolve the same way as any other source file,
  including an import that names a `.astro` file. A file with no frontmatter is
  still a node, with no imports. The template is not read.
- Roles from place. A file under the pages directory is a page route when it is
  `.astro`, and an API endpoint when it is TypeScript or JavaScript. A file
  under a `layout` or `layouts` directory is a layout. A file under a
  `component` or `components` directory is a component. Singular and plural
  both count, and the nearest directory wins. The pages directory is decided
  first.
- Routes from those same pages. A page is GET. An endpoint's methods are the
  HTTP methods it exports. The pattern is the file's path: `index` is the
  directory, a bracketed segment stays bracketed, and an endpoint keeps a data
  extension (`rss.xml.ts` is `/rss.xml`) while the language extension is
  dropped.
- The rail for Astro is Page routes, API endpoints, Layouts, Components, then
  the same generic leftovers as every other rail. Those four stay listed when
  the count is zero. The stored framework name accepts Astro, and analyses
  already stored stay valid.

## Constraints

- Routes are exact or absent, same rule as phase 8. A dynamic route is the
  bracket pattern. `getStaticPaths` is not called, and its returned URLs are
  not routes.
- A path segment whose name starts with `_` is not a page and not an endpoint.
  That file is not in the route table.
- Two files that produce the same pattern both stay out of the table. Astro's
  priority order is not used to pick a winner.
- One config, and only literals. No config means the defaults: pages live in
  `src/pages`, `build.format` is `directory`, `trailingSlash` is `ignore`, and
  there is no base prefix. More than one config, a non-literal `base`,
  `srcDir`, `trailingSlash`, or `build.format`, or an `i18n` setting, means no
  route is emitted. An adapter with no explicit `build.format` also means no
  routes, because the adapter may replace the format. A `srcDir` literal must
  be a relative path inside the repository.
- `directory` emits the path with no `.html`. `file` adds `.html`, except the
  root index, which stays `/`. `preserve` adds `.html` except on `index`, which
  stays the directory path. `trailingSlash: "always"` appends a slash only when
  the pattern has no file extension. `"never"` and `"ignore"` do not. An
  endpoint whose pattern contains an extension never gains a slash.
- `export const ALL` is every method, so it contributes no route. A default
  export contributes none either.
- This touches the walk, which phase 9 also did. `.astro` is source the way
  `.tsx` is source. The walk does not know what a page, a layout, or an
  endpoint is. An import resolves to an `.astro` file only when the specifier
  names that extension. Every other resolution is unchanged: re-run the parser
  on a repository with no `.astro` files and the edge list is byte-identical.
- A frontmatter fence that does not close skips that file with a reason. The
  template is not parsed in its place. `import.meta.glob` is not an edge.

## Acceptance check

1. Analyse an Astro repository: the rail says Page routes, API endpoints,
   Layouts, Components, and the counts are right.
2. The route table shows pages as GET and endpoints as the methods they export.
   Open three and confirm the method and the path both match the code.
3. A `[slug]` page is one route, the bracket pattern, not the URLs
   `getStaticPaths` would generate.
4. A file under a `_` segment is absent from the table.
5. A repository that also depends on React is reported as Astro.
6. An import from one `.astro` file to another is an edge. A glob import is
   not.
7. Re-run the parser against a repository with no `.astro` files that was
   analysed before this change. The edge list is byte-identical.

## Not in this phase

Markdown and MDX pages. Content collections. Client `<script>` imports.
Actions. Redirects in config. Routes injected by an integration.

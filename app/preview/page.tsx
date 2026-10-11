import type { Metadata } from "next";
import { MapShell } from "@/components/map-shell";
import { categoryCounts, frameworkLabel, resolveRole } from "@/lib/categories";
import { previewParseResult, previewRepository } from "@/lib/preview-parse";

export const metadata: Metadata = {
  title: "Preview",
};

export default function PreviewPage() {
  const result = previewParseResult();
  const assigned = new Map(result.roles.map((role) => [role.path, role.role]));
  const categories = categoryCounts(
    result.files.map((file) => ({ role: resolveRole(file.path, assigned) })),
    result.framework,
  );
  const files = result.files.map((file) => ({
    path: file.path,
    folder: file.folder,
    lines: file.lines,
    role: resolveRole(file.path, assigned),
  }));
  const links = result.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));
  return (
    <div className="h-dvh">
      <MapShell
        name={previewRepository.name}
        framework={frameworkLabel(result.framework)}
        frameworkId={result.framework}
        importCount={result.imports.length}
        routeCount={result.routes.length}
        routes={result.routes}
        categories={categories}
        files={files}
        links={links}
      />
    </div>
  );
}

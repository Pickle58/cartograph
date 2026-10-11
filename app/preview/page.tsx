import type { Metadata } from "next";
import { MapShell } from "@/components/map-shell";
import { categoryCounts } from "@/lib/categories";
import { previewParseResult, previewRepository } from "@/lib/preview-parse";

export const metadata: Metadata = {
  title: "Preview",
};

export default function PreviewPage() {
  const result = previewParseResult();
  const categories = categoryCounts(result.files);
  const files = result.files.map((file) => ({
    path: file.path,
    folder: file.folder,
    lines: file.lines,
  }));
  const links = result.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));
  return (
    <div className="h-dvh">
      <MapShell
        name={previewRepository.name}
        framework={previewRepository.framework}
        importCount={result.imports.length}
        routeCount={previewRepository.routeCount}
        categories={categories}
        files={files}
        links={links}
      />
    </div>
  );
}

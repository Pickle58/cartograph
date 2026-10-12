import type { FileCategory } from "@/lib/categories";

export function KindSwatch({ category }: { category: FileCategory }) {
  return <span aria-hidden className={swatchClass(category)} />;
}

function swatchClass(category: FileCategory): string {
  // Whole class strings. A concatenated name is invisible to Tailwind and the
  // swatch renders with no colour.
  switch (category) {
    case "jsx":
      return "size-2 shrink-0 rounded-[2px] bg-kind-jsx";
    case "hook":
      return "size-2 shrink-0 rounded-[2px] bg-kind-hook";
    case "types":
      return "size-2 shrink-0 rounded-[2px] bg-kind-types";
    case "test":
      return "size-2 shrink-0 rounded-[2px] bg-kind-test";
    case "page-route":
      return "size-2 shrink-0 rounded-[2px] bg-kind-page";
    case "api-endpoint":
      return "size-2 shrink-0 rounded-[2px] bg-kind-api";
    case "layout":
      return "size-2 shrink-0 rounded-[2px] bg-kind-layout";
    case "component":
      return "size-2 shrink-0 rounded-[2px] bg-kind-component";
    case "server-action":
      return "size-2 shrink-0 rounded-[2px] bg-kind-action";
    case "controller":
      return "size-2 shrink-0 rounded-[2px] bg-kind-controller";
    case "service":
      return "size-2 shrink-0 rounded-[2px] bg-kind-service";
    case "module":
      return "size-2 shrink-0 rounded-[2px] bg-kind-module";
    case "entity":
      return "size-2 shrink-0 rounded-[2px] bg-kind-entity";
    case "repository":
      return "size-2 shrink-0 rounded-[2px] bg-kind-repository";
    case "model":
      return "size-2 shrink-0 rounded-[2px] bg-kind-model";
    case "util":
      return "size-2 shrink-0 rounded-[2px] bg-kind-util";
    case "config":
      return "size-2 shrink-0 rounded-[2px] bg-kind-config";
    case "unidentified":
      return "size-2 shrink-0 rounded-[2px] border border-muted";
    default: {
      const unhandled: never = category;
      throw new Error(`Unhandled file category: ${String(unhandled)}`);
    }
  }
}

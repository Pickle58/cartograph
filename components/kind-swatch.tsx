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
    case "unidentified":
      return "size-2 shrink-0 rounded-[2px] border border-muted";
    default: {
      const unhandled: never = category;
      throw new Error(`Unhandled file category: ${String(unhandled)}`);
    }
  }
}

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { ThemeControl } from "@/components/theme-control";

// The frame every signed-in page renders inside: one top bar for identity and
// preferences, and the remaining viewport for the page.
export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-border bg-surface-raised px-3">
        <span className="text-[12px] font-semibold tracking-tight">
          Cartograph
        </span>
        <span className="h-4 w-px bg-border" aria-hidden />
        {/* Switching, creating and inviting all live in Clerk's own menus.
            Personal accounts are hidden: everything belongs to an org. */}
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/"
          afterCreateOrganizationUrl="/"
          afterLeaveOrganizationUrl="/"
        />
        <div className="ml-auto flex items-center gap-3">
          <ThemeControl />
          <UserButton />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

import { WorkspaceFrame } from "@/components/workspace-frame";

export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return <WorkspaceFrame>{children}</WorkspaceFrame>;
}

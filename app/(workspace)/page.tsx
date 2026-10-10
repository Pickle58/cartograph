import { Suspense } from "react";
import { getActiveOrganization } from "@/lib/organization";

export default function WorkspacePage() {
  return (
    <div className="p-3">
      {/* Reading the session is request-time, so it streams in behind this
          boundary as part of the same HTML response. */}
      <Suspense fallback={null}>
        <ActiveOrganization />
      </Suspense>
    </div>
  );
}

async function ActiveOrganization() {
  const organization = await getActiveOrganization();

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt className="text-muted">Organization</dt>
      <dd>{organization.name}</dd>
      <dt className="text-muted">ID</dt>
      <dd className="font-mono text-[12px]">{organization.id}</dd>
    </dl>
  );
}

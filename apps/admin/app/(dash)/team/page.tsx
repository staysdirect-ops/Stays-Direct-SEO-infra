import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { listTeam, type TeamMember } from "./actions";
import { TeamView } from "./team-view";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const me = await requireRole([]);
  let members: TeamMember[] = [];
  let error: string | null = null;
  try {
    members = await listTeam();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load the team.";
  }
  return (
    <>
      <PageHeader
        title="Team"
        description="Admin only. Invite staff and set what they can see: sales (Radar, leads, properties), editor (SEO, towns) or admin (everything)."
      />
      {error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error} Check that the <code>admin-users</code> function is deployed.
        </p>
      ) : (
        <TeamView members={members} myId={me.userId} />
      )}
    </>
  );
}

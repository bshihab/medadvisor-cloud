import { PageHead } from "@/components/PageHead";
import { InvitesCard } from "@/components/InvitesCard";

export function Invites() {
  return (
    <div>
      <PageHead
        title="Invite codes"
        sub={`Codes people type in the app under "Join my program" · each code grants one role`}
      />
      <InvitesCard />
    </div>
  );
}

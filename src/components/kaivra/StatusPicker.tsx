import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logEvent, notify } from "@/lib/applications";
import { APPLICATION_STATUSES, STATUS_LABEL, type ApplicationStatus } from "@/lib/kaivra";

type Props = {
  applicationId: string;
  reference: string | null;
  investorId: string | null;
  current: ApplicationStatus;
  reviewerId?: string | undefined;
  onUpdated?: () => void;
  size?: "sm" | "default";
};

export function StatusPicker({
  applicationId,
  reference,
  investorId,
  current,
  reviewerId,
  onUpdated,
  size = "sm",
}: Props) {
  const [busy, setBusy] = useState(false);

  async function setStatus(next: ApplicationStatus) {
    if (next === current) return;
    setBusy(true);
    const { error } = await supabase
      .from("applications")
      .update({ status: next, reviewed_by: reviewerId ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", applicationId);
    setBusy(false);
    if (error) {
      toast.error("The status could not be updated. Please try again.");
      return;
    }
    toast.success(`Status updated to ${STATUS_LABEL[next]}.`);
    void logEvent(applicationId, "status_changed", `Status set to ${STATUS_LABEL[next]}`);
    if (investorId) {
      void notify(
        investorId,
        `Application ${STATUS_LABEL[next]}`,
        `Your application ${reference ?? ""} is now ${STATUS_LABEL[next].toLowerCase()}.`,
        `/applications/${applicationId}`,
      );
    }
    onUpdated?.();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant="outline" disabled={busy}>
          {busy ? "Saving…" : "Set status"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Mark application as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {APPLICATION_STATUSES.filter((s) => s !== "draft").map((s) => (
          <DropdownMenuItem key={s} disabled={s === current} onSelect={() => void setStatus(s)}>
            {STATUS_LABEL[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

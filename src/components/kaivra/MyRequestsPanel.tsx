import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquareWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToneBadge } from "@/components/kaivra/StatusBadge";
import { ReferenceChip } from "@/components/kaivra/ReferenceChip";
import { formatDate } from "@/lib/kaivra";
import {
  COMPLAINT_CATEGORIES,
  CORRECTION_STATUS_LABEL,
  complaintStatusLabel,
  complaintTone,
  correctionTone,
  fieldLabelOf,
  sectionOf,
  type CorrectionRequestRow,
  type CorrectionStatus,
} from "@/lib/corrections";
import { respondToCorrectionRequest } from "@/lib/corrections.functions";
import { createSupportTicket } from "@/lib/support.functions";

type Complaint = {
  id: string;
  reference: string | null;
  subject: string;
  category: string;
  message: string;
  status: string;
  resolution_note: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

/**
 * Investor-facing view of their correction requests and complaints. Reuses the
 * existing dashboard card language — no new page or navigation area.
 */
export function MyRequestsPanel({ userId }: { userId?: string }) {
  const queryClient = useQueryClient();

  const corrections = useQuery({
    queryKey: ["my-corrections", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("correction_requests")
        .select(
          "id, reference, investor_id, application_id, section, field_label, current_value, requested_value, reason, status, investor_response, admin_response, resolution_details, acknowledged_at, applied_at, resolved_at, created_at, updated_at",
        )
        .eq("investor_id", userId!)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as unknown as CorrectionRequestRow[];
    },
  });

  const complaints = useQuery({
    queryKey: ["my-complaints", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select(
          "id, reference, subject, category, message, status, resolution_note, acknowledged_at, resolved_at, created_at",
        )
        .eq("investor_id", userId!)
        .eq("channel", "complaint")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as unknown as Complaint[];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["my-corrections", userId] });
    void queryClient.invalidateQueries({ queryKey: ["my-complaints", userId] });
  };

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Corrections &amp; complaints</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track every request you have raised with KAIVRA.
          </p>
        </div>
        <ComplaintDialog onDone={refresh} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">Correction requests</h3>
          {corrections.data?.length ? (
            <ul className="mt-3 space-y-3">
              {corrections.data.map((row) => (
                <CorrectionCard key={row.id} row={row} onDone={refresh} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No correction requests. Open a submitted application to request one.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">Complaints</h3>
          {complaints.data?.length ? (
            <ul className="mt-3 space-y-3">
              {complaints.data.map((c) => (
                <li key={c.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ReferenceChip label="Complaint" value={c.reference} size="sm" />
                    <ToneBadge tone={complaintTone(c.status)} label={complaintStatusLabel(c.status)} />
                  </div>
                  <p className="mt-2 text-sm font-medium">{c.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.category} · submitted {formatDate(c.created_at)}
                    {c.acknowledged_at ? ` · acknowledged ${formatDate(c.acknowledged_at)}` : ""}
                    {c.resolved_at ? ` · resolved ${formatDate(c.resolved_at)}` : ""}
                  </p>
                  {c.resolution_note ? (
                    <p className="mt-2 rounded-md bg-muted/60 p-2 text-xs">{c.resolution_note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No complaints raised.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function CorrectionCard({ row, onDone }: { row: CorrectionRequestRow; onDone: () => void }) {
  const [response, setResponse] = useState("");
  const status = row.status as CorrectionStatus;

  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ReferenceChip label="Correction" value={row.reference} size="sm" />
        <ToneBadge
          tone={correctionTone(status)}
          label={CORRECTION_STATUS_LABEL[status] ?? row.status}
        />
      </div>
      <p className="mt-2 text-sm font-medium">
        {sectionOf(row.section)?.label ?? row.section} ·{" "}
        {fieldLabelOf(row.section, row.field_label)}
      </p>
      <p className="text-xs text-muted-foreground">
        Submitted {formatDate(row.created_at)}
        {row.acknowledged_at ? ` · acknowledged ${formatDate(row.acknowledged_at)}` : ""}
        {row.applied_at ? ` · applied ${formatDate(row.applied_at)}` : ""}
        {row.resolved_at ? ` · resolved ${formatDate(row.resolved_at)}` : ""}
      </p>
      <dl className="mt-2 grid gap-1 text-xs">
        <div>
          <dt className="inline text-muted-foreground">From: </dt>
          <dd className="inline break-words">{row.current_value || "—"}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">To: </dt>
          <dd className="inline break-words">{row.requested_value}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Reason: </dt>
          <dd className="inline break-words">{row.reason}</dd>
        </div>
      </dl>
      {row.admin_response ? (
        <p className="mt-2 rounded-md bg-muted/60 p-2 text-xs">
          <span className="font-semibold">KAIVRA: </span>
          {row.admin_response}
        </p>
      ) : null}
      {row.resolution_details ? (
        <p className="mt-2 rounded-md bg-muted/60 p-2 text-xs">
          <span className="font-semibold">Resolution: </span>
          {row.resolution_details}
        </p>
      ) : null}

      {row.status === "additional_info" ? (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`resp-${row.id}`} className="text-xs">
            Provide the requested information
          </Label>
          <Textarea
            id={`resp-${row.id}`}
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={2}
          />
          <AsyncButton
            size="sm"
            pendingLabel="Sending…"
            onClick={async () => {
              if (response.trim().length < 2) {
                toast.error("Enter your response first.");
                return;
              }
              await respondToCorrectionRequest({ data: { id: row.id, response: response.trim() } });
              toast.success("Response sent to KAIVRA.");
              setResponse("");
              onDone();
            }}
          >
            Send response
          </AsyncButton>
        </div>
      ) : null}
    </li>
  );
}

function ComplaintDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>(COMPLAINT_CATEGORIES[0]);
  const [message, setMessage] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageSquareWarning className="mr-2 size-4" /> Log a complaint
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a complaint</DialogTitle>
          <DialogDescription>
            A KAIVRA administrator will acknowledge and resolve your complaint, and you will be
            notified at each step.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cm-subject">Subject</Label>
            <Input
              id="cm-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={160}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPLAINT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-message">Description</Label>
            <Textarea
              id="cm-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
            />
          </div>
        </div>
        <DialogFooter>
          <AsyncButton
            pendingLabel="Submitting…"
            onClick={async () => {
              if (subject.trim().length < 3 || message.trim().length < 5) {
                toast.error("Add a subject and describe the complaint.");
                return;
              }
              const ticket = await createSupportTicket({
                data: {
                  subject: subject.trim(),
                  category,
                  message: message.trim(),
                  priority: "high",
                  channel: "complaint",
                },
              });
              toast.success(`Complaint ${ticket.reference ?? ""} submitted.`.trim());
              setOpen(false);
              setSubject("");
              setMessage("");
              onDone();
            }}
          >
            Submit complaint
          </AsyncButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

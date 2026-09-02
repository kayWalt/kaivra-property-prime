import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wrench } from "lucide-react";
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
import { CORRECTION_SECTIONS, sectionOf } from "@/lib/corrections";
import { applyInvestorRecordCorrection } from "@/lib/corrections.functions";

type AppRow = {
  id: string;
  reference: string | null;
  status: string;
  personal: Record<string, unknown> | null;
  contact: Record<string, unknown> | null;
  investment: Record<string, unknown> | null;
  payment_info: Record<string, unknown> | null;
};

/**
 * Lets an administrator open the investor's own record from a complaint and
 * effect the requested correction. Every change is written to the audit trail
 * and the application history by the server function.
 */
export function EffectCorrectionDialog({
  investorId,
  investorName,
  ticketId,
  defaultApplicationId,
}: {
  investorId: string;
  investorName?: string | null;
  ticketId?: string;
  defaultApplicationId?: string | null;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [appId, setAppId] = useState<string>(defaultApplicationId ?? "");
  const [section, setSection] = useState("personal");
  const [fieldKey, setFieldKey] = useState("");
  const [customField, setCustomField] = useState("");
  const [newValue, setNewValue] = useState("");
  const [note, setNote] = useState("");

  const apps = useQuery({
    queryKey: ["investor-applications-for-correction", investorId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("id, reference, status, personal, contact, investment, payment_info")
        .eq("investor_id", investorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AppRow[];
    },
  });

  const selectedApp = useMemo(
    () => (apps.data ?? []).find((a) => a.id === appId) ?? null,
    [apps.data, appId],
  );

  const config = sectionOf(section);
  const column = config?.column ?? null;
  const fields = config?.fields ?? [];
  const currentValue =
    selectedApp && column && fieldKey
      ? String(((selectedApp[column] ?? {}) as Record<string, unknown>)[fieldKey] ?? "")
      : "";

  function reset() {
    setSection("personal");
    setFieldKey("");
    setCustomField("");
    setNewValue("");
    setNote("");
  }

  async function submit() {
    if (!appId) {
      toast.error("Select the application to correct.");
      return;
    }
    if (!column) {
      toast.error("This section cannot be corrected automatically — reply to the investor instead.");
      return;
    }
    const key = fieldKey || customField.trim();
    if (!key) {
      toast.error("Select the field to correct.");
      return;
    }
    if (newValue.trim().length < 1) {
      toast.error("Enter the corrected value.");
      return;
    }

    await applyInvestorRecordCorrection({
      data: {
        investorId,
        applicationId: appId,
        column,
        fieldKey: key,
        fieldLabel: fields.find((f) => f.key === key)?.label ?? key,
        newValue: newValue.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(ticketId ? { ticketId } : {}),
      },
    });

    toast.success("Correction applied to the investor's record.");
    void queryClient.invalidateQueries({ queryKey: ["investor-applications-for-correction"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    void queryClient.invalidateQueries({ queryKey: ["support-messages", ticketId] });
    setOpen(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Wrench className="mr-2 size-4" /> Effect correction
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct investor record</DialogTitle>
          <DialogDescription>
            {investorName ? `${investorName} · ` : ""}The previous value is preserved in the audit
            trail and the application history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Application</Label>
            <Select value={appId} onValueChange={setAppId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={apps.isLoading ? "Loading…" : "Select the application"}
                />
              </SelectTrigger>
              <SelectContent>
                {(apps.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.reference ?? `Draft ${a.id.slice(0, 8)}`} · {a.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {apps.data && apps.data.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                This investor has no application on record.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Section</Label>
            <Select
              value={section}
              onValueChange={(v) => {
                setSection(v);
                setFieldKey("");
                setCustomField("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CORRECTION_SECTIONS.filter((s) => s.column).map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Field</Label>
            <Select value={fieldKey} onValueChange={setFieldKey}>
              <SelectTrigger>
                <SelectValue placeholder="Select the field" />
              </SelectTrigger>
              <SelectContent>
                {fields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fields.length === 0 ? (
              <Input
                value={customField}
                onChange={(e) => setCustomField(e.target.value)}
                placeholder="Field key"
                maxLength={80}
              />
            ) : null}
          </div>

          <div className="rounded-md border border-border bg-muted/50 px-3 py-2">
            <p className="eyebrow text-muted-foreground">Current value</p>
            <p className="mt-1 break-words text-sm">{currentValue || "—"}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ec-new">Corrected value</Label>
            <Input
              id="ec-new"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              maxLength={2000}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ec-note">Note to the investor (optional)</Label>
            <Textarea
              id="ec-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter>
          <AsyncButton onClick={() => submit()} pendingLabel="Applying…">
            Apply correction
          </AsyncButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

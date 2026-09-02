import { useState } from "react";
import { toast } from "sonner";
import { PencilLine, Paperclip } from "lucide-react";
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
import {
  createCorrectionUploadTicket,
  submitCorrectionRequest,
} from "@/lib/corrections.functions";

type Blobs = {
  personal?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  investment?: Record<string, unknown>;
  payment_info?: Record<string, unknown>;
};

/**
 * Lets an investor raise a correction request against a submitted application.
 * Nothing is written to the finalised record here — an administrator reviews
 * and applies the change.
 */
export function RequestCorrectionDialog({
  applicationId,
  values,
  onDone,
}: {
  applicationId: string;
  values: Blobs;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("personal");
  const [fieldKey, setFieldKey] = useState("");
  const [customField, setCustomField] = useState("");
  const [requested, setRequested] = useState("");
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const config = sectionOf(section);
  const hasFieldList = (config?.fields.length ?? 0) > 0;
  const column = config?.column ?? null;
  const currentValue =
    column && fieldKey ? String((values[column] ?? {})[fieldKey] ?? "") : "";

  function reset() {
    setSection("personal");
    setFieldKey("");
    setCustomField("");
    setRequested("");
    setReason("");
    setFiles([]);
  }

  async function submit() {
    const label = hasFieldList
      ? config?.fields.find((f) => f.key === fieldKey)?.label ?? ""
      : customField.trim();
    if (!label) {
      toast.error("Select or describe the information that is incorrect.");
      return;
    }
    if (requested.trim().length < 1) {
      toast.error("Enter the corrected information.");
      return;
    }
    if (reason.trim().length < 5) {
      toast.error("Explain briefly why this correction is needed.");
      return;
    }

    const created = await submitCorrectionRequest({
      data: {
        applicationId,
        section,
        fieldLabel: hasFieldList ? fieldKey : label,
        currentValue: currentValue || null,
        requestedValue: requested.trim(),
        reason: reason.trim(),
      },
    });

    for (const file of files) {
      try {
        const ticket = await createCorrectionUploadTicket({
          data: { correctionRequestId: created.id, fileName: file.name },
        });
        const { error } = await supabase.storage
          .from(ticket.bucket)
          .uploadToSignedUrl(ticket.path, ticket.token, file);
        if (error) throw error;
        await supabase.from("correction_request_documents").insert({
          correction_request_id: created.id,
          file_path: ticket.path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        });
      } catch {
        toast.error(`${file.name} could not be attached.`);
      }
    }

    toast.success(`Correction request ${created.reference ?? ""} submitted.`.trim());
    setOpen(false);
    reset();
    onDone?.();
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
        <Button variant="outline">
          <PencilLine className="mr-2 size-4" /> Request a correction
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a correction</DialogTitle>
          <DialogDescription>
            Tell us what is wrong. A KAIVRA administrator reviews every request before any record
            is changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                {CORRECTION_SECTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasFieldList ? (
            <div className="space-y-1.5">
              <Label>Field</Label>
              <Select value={fieldKey} onValueChange={setFieldKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Select the field" />
                </SelectTrigger>
                <SelectContent>
                  {config?.fields.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="cr-custom">What is incorrect?</Label>
              <Input
                id="cr-custom"
                value={customField}
                onChange={(e) => setCustomField(e.target.value)}
                placeholder="e.g. Passport photograph"
                maxLength={80}
              />
            </div>
          )}

          {currentValue ? (
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2">
              <p className="eyebrow text-muted-foreground">Current value</p>
              <p className="mt-1 break-words text-sm">{currentValue}</p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="cr-new">Corrected information</Label>
            <Textarea
              id="cr-new"
              value={requested}
              onChange={(e) => setRequested(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cr-reason">Reason for the correction</Label>
            <Textarea
              id="cr-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cr-files">Supporting document (optional)</Label>
            <Input
              id="cr-files"
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 ? (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Paperclip className="size-3" /> {files.length} file(s) selected
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <AsyncButton onClick={() => submit()} pendingLabel="Submitting…">
            Submit correction request
          </AsyncButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

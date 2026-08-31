import { useRef, useState } from "react";
import { Camera, Check, Loader2, Trash2, Upload, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createUploadTicket, getDocumentUrl } from "@/lib/storage.functions";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface UploadedDoc {
  id: string;
  kind: string;
  label: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_path: string;
  payment_id?: string | null;
}

async function compressImage(file: File, maxSize = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadDocument(options: {
  applicationId: string;
  kind: string;
  file: File | Blob;
  fileName?: string;
  label?: string;
  paymentId?: string | null;
}) {
  const raw =
    options.file instanceof File
      ? options.file
      : new File([options.file], options.fileName ?? "upload.png", { type: options.file.type || "image/png" });
  const file = await compressImage(raw);
  const ticket = await createUploadTicket({
    data: { applicationId: options.applicationId, kind: options.kind, fileName: file.name },
  });
  const { error: uploadError } = await supabase.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, file);
  if (uploadError) throw new Error("Your document could not be uploaded. Please try again.");

  const { data, error } = await supabase
    .from("application_documents")
    .insert({
      application_id: options.applicationId,
      kind: options.kind as never,
      label: options.label ?? null,
      file_path: ticket.path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      payment_id: options.paymentId ?? null,
    })
    .select()
    .single();
  if (error) throw new Error("Your document was uploaded but could not be saved. Please try again.");
  return data;
}

export async function openDocument(documentId: string) {
  const { url } = await getDocumentUrl({ data: { documentId } });
  window.open(url, "_blank", "noopener,noreferrer");
}

export function UploadCard({
  title,
  hint,
  accept = "image/jpeg,image/png,image/webp",
  capture,
  applicationId,
  kind,
  paymentId,
  existing,
  multiple = false,
  onChanged,
  disabled,
}: {
  title: string;
  hint?: string;
  accept?: string;
  capture?: boolean;
  applicationId: string;
  kind: string;
  paymentId?: string | null;
  existing: UploadedDoc[];
  multiple?: boolean;
  onChanged: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setProgress(20);
    try {
      const list: File[] = multiple ? Array.from(files) : Array.from(files).slice(0, 1);
      // Uploads are independent — run them concurrently instead of queueing.
      await Promise.all(
        list.map(async (file) => {
          await uploadDocument({ applicationId, kind, file, paymentId: paymentId ?? null, label: title });
          setProgress((p) => Math.min(90, p + 60 / list.length));
        }),
      );
      setProgress(100);
      toast.success(`${title} uploaded`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Your document could not be uploaded.");
    } finally {
      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("application_documents").delete().eq("id", id);
    if (error) {
      toast.error("The document could not be removed.");
      return;
    }
    toast.success("Document removed");
    onChanged();
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-5 transition-colors",
        dragging && "border-primary bg-primary/5",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) void handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {existing.length > 0 ? (
          <span className="eyebrow inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-primary">
            <Check className="size-3" aria-hidden /> Uploaded
          </span>
        ) : null}
      </div>

      {existing.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {existing.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
              <span className="truncate text-xs">{doc.file_name}</span>
              <div className="ml-auto flex gap-1">
                <AsyncButton
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`View ${doc.file_name}`}
                  onClick={() => openDocument(doc.id)}
                >
                  <Eye className="size-4" />
                </AsyncButton>
                {!disabled ? (
                  <AsyncButton
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${doc.file_name}`}
                    onClick={() => remove(doc.id)}
                  >
                    <Trash2 className="size-4" />
                  </AsyncButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {busy ? <Progress value={progress} className="mt-4 h-1.5" /> : null}

      {!disabled ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
            {existing.length > 0 && !multiple ? "Replace" : "Upload"}
          </Button>
          {capture !== false ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => cameraRef.current?.click()} disabled={busy}>
              <Camera className="mr-2 size-4" /> Take photo
            </Button>
          ) : null}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => void handleFiles(e.target.files)}
        aria-label={`Upload ${title}`}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => void handleFiles(e.target.files)}
        aria-label={`Take photo for ${title}`}
      />
    </div>
  );
}

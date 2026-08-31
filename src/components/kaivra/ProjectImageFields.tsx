import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createProjectImageUploadTicket } from "@/lib/project-media.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type GalleryImage = { url: string; caption: string };

const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 12 * 1024 * 1024; // 12MB before compression
const MAX_EDGE = 1920;

export function parseGallery(value: unknown): GalleryImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { url: item, caption: "" };
      if (item && typeof item === "object" && "url" in item) {
        const record = item as { url?: unknown; caption?: unknown };
        return {
          url: typeof record.url === "string" ? record.url : "",
          caption: typeof record.caption === "string" ? record.caption : "",
        };
      }
      return { url: "", caption: "" };
    })
    .filter((image) => image.url.length > 0);
}

function validate(file: File) {
  if (!ACCEPTED.includes(file.type.toLowerCase())) {
    throw new Error(`${file.name}: only JPG, PNG and WEBP images are supported.`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`${file.name} is larger than 12MB. Please choose a smaller image.`);
  }
}

/**
 * Downscale oversized photos in the browser so uploads stay fast on mobile
 * networks while keeping good visual quality. Falls back to the original file
 * whenever the browser cannot decode/encode it.
 */
async function compress(file: File): Promise<File> {
  if (typeof document === "undefined" || file.size < 400 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function uploadImage(file: File, scope: "project" | "property") {
  validate(file);
  const prepared = await compress(file);
  const ticket = await createProjectImageUploadTicket({ data: { scope, fileName: prepared.name } });
  const { error } = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, prepared);
  if (error) throw error;
  return ticket.url;
}

function useDropZone(onFiles: (files: FileList | File[]) => void) {
  const [over, setOver] = useState(false);
  const handlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
    },
  };
  return { over, handlers };
}

export function ImageUploadField({
  id,
  value,
  onChange,
  scope = "project",
}: {
  id: string;
  value: string;
  onChange: (url: string) => void;
  scope?: "project" | "property";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file || busy) return;
      setBusy(true);
      try {
        onChange(await uploadImage(file, scope));
        toast.success("Hero image uploaded.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The image could not be uploaded.");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [busy, onChange, scope],
  );

  const { over, handlers } = useDropZone((files) => void handleFile(files[0]));

  return (
    <div className="space-y-3">
      <div
        {...handlers}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-6 text-center transition-colors",
          over && "border-primary bg-accent",
        )}
      >
        {value ? (
          <img
            loading="lazy"
            decoding="async"
            src={value}
            alt="Project cover preview"
            className="h-36 w-full max-w-sm rounded-md object-cover"
          />
        ) : (
          <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
        )}
        <p className="text-xs text-muted-foreground">
          Drag an image here, or use the button below. JPG, PNG or WEBP, up to 12MB.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ImagePlus className="mr-2 size-4" />}
            {value ? "Replace image" : "Upload image"}
          </Button>
          {value ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
              <Trash2 className="mr-2 size-4" /> Remove
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Upload project hero image"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Image address (filled automatically after upload)"
      />
    </div>
  );
}

export function GalleryUploadField({
  idPrefix,
  images,
  onChange,
  scope = "project",
}: {
  idPrefix: string;
  images: GalleryImage[];
  onChange: (images: GalleryImage[]) => void;
  scope?: "project" | "property";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const handleFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0 || busy) return;
      setBusy(true);
      setProgress({ done: 0, total: files.length });
      const uploaded: GalleryImage[] = [];
      const failures: string[] = [];
      for (const file of files) {
        try {
          const url = await uploadImage(file, scope);
          if (!images.some((image) => image.url === url)) uploaded.push({ url, caption: "" });
        } catch (err) {
          failures.push(err instanceof Error ? err.message : `${file.name} could not be uploaded.`);
        } finally {
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      }
      if (uploaded.length > 0) {
        onChange([...images, ...uploaded]);
        toast.success(`${uploaded.length} image${uploaded.length === 1 ? "" : "s"} uploaded.`);
      }
      if (failures.length > 0) toast.error(failures[0]!);
      setBusy(false);
      setProgress({ done: 0, total: 0 });
      if (inputRef.current) inputRef.current.value = "";
    },
    [busy, images, onChange, scope],
  );

  const { over, handlers } = useDropZone((files) => void handleFiles(files));

  function move(index: number, delta: number) {
    const next = [...images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div
        {...handlers}
        className={cn(
          "flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-5 text-center transition-colors",
          over && "border-primary bg-accent",
        )}
      >
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ImagePlus className="mr-2 size-4" />}
          {busy ? `Uploading ${progress.done}/${progress.total}…` : "Upload images"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Drag several images here at once, then add a caption to each. JPG, PNG or WEBP.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Upload gallery images"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">No gallery images yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {images.map((image, index) => (
            <li key={`${image.url}-${index}`} className="rounded-md border border-border p-3">
              <img
                loading="lazy"
                decoding="async"
                src={image.url}
                alt={image.caption || "Gallery image"}
                className="h-28 w-full rounded object-cover"
              />
              <div className="mt-2 space-y-1.5">
                <Label htmlFor={`${idPrefix}-caption-${index}`} className="text-xs">
                  Caption
                </Label>
                <Input
                  id={`${idPrefix}-caption-${index}`}
                  value={image.caption}
                  placeholder="e.g. Terrace frontage at dusk"
                  onChange={(e) =>
                    onChange(images.map((item, i) => (i === index ? { ...item, caption: e.target.value } : item)))
                  }
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Move image earlier"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Move image later"
                  disabled={index === images.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => onChange(images.filter((_, i) => i !== index))}
                >
                  <Trash2 className="mr-2 size-4" /> Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

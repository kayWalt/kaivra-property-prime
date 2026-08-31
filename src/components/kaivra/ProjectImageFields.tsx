import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createProjectImageUploadTicket } from "@/lib/project-media.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type GalleryImage = { url: string; caption: string };

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

async function uploadImage(file: File, scope: "project" | "property") {
  const ticket = await createProjectImageUploadTicket({ data: { scope, fileName: file.name } });
  const { error } = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file);
  if (error) throw error;
  return ticket.url;
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

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadImage(file, scope));
      toast.success("Image uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The image could not be uploaded.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Upload an image or paste a URL"
        />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ImagePlus className="mr-2 size-4" />}
          Upload image
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Upload project image"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>
      {value ? (
        <img loading="lazy" decoding="async" src={value} alt="Project cover preview" className="h-28 w-full rounded-md object-cover sm:w-64" />
      ) : null}
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

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    setBusy(true);
    const uploaded: GalleryImage[] = [];
    try {
      for (const file of files) {
        const url = await uploadImage(file, scope);
        uploaded.push({ url, caption: "" });
      }
      onChange([...images, ...uploaded]);
      toast.success(`${uploaded.length} image${uploaded.length === 1 ? "" : "s"} uploaded.`);
    } catch (err) {
      if (uploaded.length > 0) onChange([...images, ...uploaded]);
      toast.error(err instanceof Error ? err.message : "Some images could not be uploaded.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ImagePlus className="mr-2 size-4" />}
          Upload images
        </Button>
        <p className="text-xs text-muted-foreground">Select several images at once, then add a caption to each.</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
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
              <img loading="lazy" decoding="async" src={image.url} alt={image.caption || "Gallery image"} className="h-28 w-full rounded object-cover" />
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
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => onChange(images.filter((_, i) => i !== index))}
              >
                <Trash2 className="mr-2 size-4" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

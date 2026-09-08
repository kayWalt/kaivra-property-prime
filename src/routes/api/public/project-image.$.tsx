import { createFileRoute } from "@tanstack/react-router";
import { downloadStorageObject } from "@/lib/supabase-env.server";

const BUCKET = "project-images";

const SAFE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/** Serves only inert raster image types; anything else is downgraded. */
function safeImageType(value: string | null | undefined) {
  const type = (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return SAFE_IMAGE_TYPES.has(type) ? type : "application/octet-stream";
}

export const Route = createFileRoute("/api/public/project-image/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = (params as { _splat?: string })._splat ?? "";
        if (!path || path.includes("..")) return new Response("Not found", { status: 404 });

        try {
          const file = await downloadStorageObject(BUCKET, path);
          if (!file) return new Response("Not found", { status: 404 });
          return new Response(file.body, {
            headers: {
              "Content-Type": safeImageType(file.contentType),
              "Cache-Control": "public, max-age=31536000, immutable",
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy": "default-src 'none'; sandbox",
            },
          });
        } catch (err) {
          console.error("[project-image] download failed", err);
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});

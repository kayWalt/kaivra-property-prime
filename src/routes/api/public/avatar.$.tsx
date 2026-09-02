import { createFileRoute } from "@tanstack/react-router";
import { downloadStorageObject } from "@/lib/supabase-env.server";
import { LOVABLE_ORIGIN, isLovableOrigin } from "@/lib/origin-fallback";

const BUCKET = "avatars";

const IMAGE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
};

/**
 * Self-hosted deployments (custom domain on Cloudflare) do not carry the
 * service-role key, so the private `avatars` bucket cannot be read locally.
 * Relay to the Lovable-hosted origin of the same app, which can.
 */
async function relay(request: Request, path: string) {
  if (isLovableOrigin(request)) return null;
  const res = await fetch(`${LOVABLE_ORIGIN}/api/public/avatar/${path}`);
  if (!res.ok) return null;
  return new Response(res.body, {
    headers: {
      ...IMAGE_HEADERS,
      "Content-Type": res.headers.get("content-type") || "image/jpeg",
    },
  });
}

export const Route = createFileRoute("/api/public/avatar/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const path = (params as { _splat?: string })._splat ?? "";
        if (!path || path.includes("..")) return new Response("Not found", { status: 404 });

        try {
          const file = await downloadStorageObject(BUCKET, path);
          if (file) {
            return new Response(file.body, {
              headers: { ...IMAGE_HEADERS, "Content-Type": file.contentType },
            });
          }
        } catch (err) {
          console.error("[avatar] download failed", err);
        }

        try {
          const relayed = await relay(request, path);
          if (relayed) return relayed;
        } catch (err) {
          console.error("[avatar] relay failed", err);
        }

        return new Response("Not found", { status: 404 });
      },
    },
  },
});

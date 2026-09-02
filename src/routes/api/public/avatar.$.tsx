import { createFileRoute } from "@tanstack/react-router";
import { downloadStorageObject } from "@/lib/supabase-env.server";

const BUCKET = "avatars";

export const Route = createFileRoute("/api/public/avatar/$")({
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
              "Content-Type": file.contentType,
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        } catch (err) {
          console.error("[avatar] download failed", err);
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});

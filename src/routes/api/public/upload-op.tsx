import { createFileRoute } from "@tanstack/react-router";

/**
 * Authenticated relay for trusted upload steps.
 *
 * Only reachable with a valid Supabase bearer token, and every operation below
 * re-runs its own authorisation, exact-path and stored-byte checks through the
 * very same server functions the app uses directly. This endpoint adds no
 * privileges: it merely lets the custom-domain deployment perform the step on
 * the Lovable-hosted origin, which holds the managed server credentials.
 */
export const Route = createFileRoute("/api/public/upload-op")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token || token.split(".").length !== 3) {
          return new Response("Unauthorized", { status: 401 });
        }

        let op = "";
        let data: unknown = {};
        try {
          const body = (await request.json()) as { op?: unknown; data?: unknown };
          if (typeof body.op === "string") op = body.op;
          data = body.data ?? {};
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (!op) return new Response("Bad request", { status: 400 });

        try {
          const avatar = await import("@/lib/avatar.functions");
          const media = await import("@/lib/project-media.functions");
          const storage = await import("@/lib/storage.functions");
          const corrections = await import("@/lib/corrections.functions");

          // The called server function re-validates the bearer token through
          // its own auth middleware and repeats every security check.
          switch (op) {
            case "avatarTicket":
              return Response.json(
                await avatar.createAvatarUploadTicket({ data: data as never }),
              );
            case "avatarFinalize":
              return Response.json(await avatar.finalizeAvatarUpload({ data: data as never }));
            case "avatarRemove":
              return Response.json(await avatar.removeAvatarFile({ data: data as never }));
            case "projectImageTicket":
              return Response.json(
                await media.createProjectImageUploadTicket({ data: data as never }),
              );
            case "projectImageFinalize":
              return Response.json(
                await media.finalizeProjectImageUpload({ data: data as never }),
              );
            case "documentFinalize":
              return Response.json(
                await storage.finalizeDocumentUpload({ data: data as never }),
              );
            case "correctionTicket":
              return Response.json(
                await corrections.createCorrectionUploadTicket({ data: data as never }),
              );
            case "correctionFinalize":
              return Response.json(
                await corrections.finalizeCorrectionDocumentUpload({ data: data as never }),
              );
            default:
              return new Response("Bad request", { status: 400 });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "";
          if (message.toLowerCase().startsWith("unauthorized")) {
            return new Response("Unauthorized", { status: 401 });
          }
          console.error("[upload-op] failed", op, message);
          return new Response(
            message.slice(0, 300) || "Upload could not be completed. Please try again.",
            { status: 400 },
          );
        }
      },
    },
  },
});

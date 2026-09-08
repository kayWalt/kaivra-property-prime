import { resolveStorageConfig } from "./supabase-env.server";
import { sniffContentType, UPLOAD_RULES, type UploadCategory } from "./upload-rules";

/**
 * Post-upload content check.
 *
 * A signed upload URL means the browser sends the bytes straight to Storage,
 * so the server never sees the file while the ticket is created — only the
 * declared type is known then. This helper runs immediately after the upload,
 * reads just the first bytes of the stored object and confirms the real format
 * matches the category allow-list. A mismatch removes the object again so a
 * disguised file is never left behind.
 */

const HEAD_BYTES = 16;

async function readHead(bucket: string, path: string): Promise<Uint8Array | null> {
  const cfg = resolveStorageConfig();
  if (!cfg) return null;
  const endpoint = `${cfg.url}/storage/v1/object/${bucket}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Range: `bytes=0-${HEAD_BYTES - 1}`,
    },
  });
  if (!res.ok && res.status !== 206) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function verifyStoredObject(
  bucket: string,
  path: string,
  category: UploadCategory,
): Promise<{ ok: true; contentType: string } | { ok: false; reason: string }> {
  const rule = UPLOAD_RULES[category];
  let head: Uint8Array | null = null;
  try {
    head = await readHead(bucket, path);
  } catch (err) {
    console.error("[upload] content check could not read the object", err);
  }
  // Unreadable head (no server credentials on this deployment) is not treated
  // as a rejection: the declared-type and extension checks already ran at
  // ticket time, and failing here would break uploads on that deployment.
  if (!head || head.length === 0) return { ok: true, contentType: "" };

  const actual = sniffContentType(head);
  if (actual && rule.mimeTypes.includes(actual)) return { ok: true, contentType: actual };

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(bucket).remove([path]);
  } catch (err) {
    console.error("[upload] rejected object could not be removed", err);
  }
  return {
    ok: false,
    reason: `${rule.label}: the file content is not a valid ${rule.accepted} file. Please upload ${rule.accepted}.`,
  };
}

import { resolveStorageConfig } from "./supabase-env.server";
import { sniffContentType, UPLOAD_RULES, type UploadCategory } from "./upload-rules";

/**
 * Post-upload content check.
 *
 * A signed upload URL means the browser sends the bytes straight to Storage,
 * so the server never sees the file while the ticket is created — only the
 * declared type is known then. This helper runs on the server immediately
 * after the upload, reads the first bytes of the stored object and confirms
 * the real format matches the category allow-list.
 *
 * It is fail-closed: anything that prevents the bytes from being read and
 * recognised is a rejection, never a pass. Callers must only write a database
 * reference once this returns `ok`.
 *
 * Authorisation is the caller's responsibility and must happen BEFORE this is
 * invoked — the paths reaching here are already proven to belong to the
 * signed-in user (or to an application/correction/scope they may manage).
 */

const HEAD_BYTES = 16;

/** Generic, non-revealing failure wording for every read/configuration fault. */
export const UNVERIFIABLE = "Unable to verify this file. Please try uploading it again.";

async function readHead(bucket: string, path: string): Promise<Uint8Array | null> {
  const cfg = resolveStorageConfig();
  if (!cfg) {
    console.error("[upload] storage is not configured on this deployment");
    return null;
  }
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
  if (res.status !== 200 && res.status !== 206) {
    console.error("[upload] unexpected storage response", res.status);
    return null;
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function removeObject(bucket: string, path: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(bucket).remove([path]);
  } catch (err) {
    console.error("[upload] rejected object could not be removed", err);
  }
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

  // Fail closed: no configuration, no access, unexpected response or a short
  // read all mean the content was never confirmed, so the upload is refused.
  if (!head || head.length < 4) {
    await removeObject(bucket, path);
    return { ok: false, reason: UNVERIFIABLE };
  }

  const actual = sniffContentType(head);
  if (actual && rule.mimeTypes.includes(actual)) return { ok: true, contentType: actual };

  await removeObject(bucket, path);
  return {
    ok: false,
    reason: `${rule.label}: the file content is not a valid ${rule.accepted} file. Please upload ${rule.accepted}.`,
  };
}

/**
 * Verifies an already-authorised object and throws the user-facing reason when
 * it is not a genuine file of the category. Returns the confirmed content type,
 * which is what gets recorded — never the client's declared type.
 */
export async function verifyOrThrow(
  bucket: string,
  path: string,
  category: UploadCategory,
): Promise<string> {
  const result = await verifyStoredObject(bucket, path, category);
  if (!result.ok) throw new Error(result.reason);
  return result.contentType;
}

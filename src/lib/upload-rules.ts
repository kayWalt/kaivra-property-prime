/**
 * Central upload allow-lists for KAIVRA.
 *
 * One source of truth used by three layers:
 *  - the browser components (fast, friendly rejection before any network work),
 *  - the server upload-ticket functions (authoritative: a signed upload URL is
 *    only ever issued for an allowed category/type/size combination),
 *  - the post-upload byte check (`upload-verify.functions.ts`), which is the
 *    only point where the real file content exists and can be inspected.
 *
 * Client-safe: pure data and pure functions, no server imports.
 */

export type UploadCategory =
  | "avatar"
  | "project_image"
  | "passport"
  | "signature"
  | "proof_of_payment"
  | "application_document"
  | "correction_document";

const IMAGES = ["image/jpeg", "image/png", "image/webp"] as const;
const IMAGES_AND_PDF = [...IMAGES, "application/pdf"] as const;

export type UploadRule = {
  label: string;
  mimeTypes: readonly string[];
  maxBytes: number;
  /** Human wording used in rejection messages. */
  accepted: string;
};

const MB = 1024 * 1024;

export const UPLOAD_RULES: Record<UploadCategory, UploadRule> = {
  avatar: {
    label: "Profile picture",
    mimeTypes: IMAGES,
    maxBytes: 5 * MB,
    accepted: "JPG, PNG or WebP",
  },
  project_image: {
    label: "Project image",
    mimeTypes: IMAGES,
    maxBytes: 10 * MB,
    accepted: "JPG, PNG or WebP",
  },
  passport: {
    label: "Passport photograph",
    mimeTypes: IMAGES,
    maxBytes: 10 * MB,
    accepted: "JPG, PNG or WebP",
  },
  // Existing records contain both PNG and JPEG signatures — both stay valid.
  signature: {
    label: "Signature",
    mimeTypes: ["image/jpeg", "image/png"],
    maxBytes: 5 * MB,
    accepted: "JPG or PNG",
  },
  proof_of_payment: {
    label: "Proof of payment",
    mimeTypes: IMAGES_AND_PDF,
    maxBytes: 25 * MB,
    accepted: "JPG, PNG, WebP or PDF",
  },
  application_document: {
    label: "Document",
    mimeTypes: IMAGES_AND_PDF,
    maxBytes: 25 * MB,
    accepted: "JPG, PNG, WebP or PDF",
  },
  correction_document: {
    label: "Attachment",
    mimeTypes: IMAGES_AND_PDF,
    maxBytes: 25 * MB,
    accepted: "JPG, PNG, WebP or PDF",
  },
};

/** Maps an application document `kind` to its upload category. */
export function categoryForDocumentKind(kind: string): UploadCategory {
  if (kind === "passport") return "passport";
  if (kind === "signature") return "signature";
  if (kind === "proof_of_payment") return "proof_of_payment";
  return "application_document";
}

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export function extensionType(fileName: string): string | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(fileName)?.[1]?.toLowerCase();
  return (ext && EXTENSION_TYPES[ext]) ?? null;
}

function normalise(contentType: string | null | undefined) {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export type UploadCandidate = {
  fileName: string;
  contentType?: string | null;
  size?: number | null;
};

/**
 * Returns a user-facing rejection message, or `null` when the file is allowed.
 * Both the declared content type and the file extension must resolve to a type
 * the category permits, so a `.svg` renamed to `.jpg` (or vice versa) fails.
 */
export function uploadRejectionReason(
  category: UploadCategory,
  file: UploadCandidate,
): string | null {
  const rule = UPLOAD_RULES[category];
  const declared = normalise(file.contentType);
  const byExtension = extensionType(file.fileName);

  if (declared && !rule.mimeTypes.includes(declared)) {
    return `${rule.label}: that file type is not accepted. Please upload ${rule.accepted}.`;
  }
  if (!byExtension || !rule.mimeTypes.includes(byExtension)) {
    return `${rule.label}: that file type is not accepted. Please upload ${rule.accepted}.`;
  }
  if (declared && declared !== byExtension) {
    return `${rule.label}: the file name and the file type do not match. Please upload ${rule.accepted}.`;
  }
  if (typeof file.size === "number" && file.size > rule.maxBytes) {
    return `${rule.label} is larger than ${Math.round(rule.maxBytes / MB)} MB. Please upload a smaller file.`;
  }
  return null;
}

export function assertUploadAllowed(category: UploadCategory, file: UploadCandidate) {
  const reason = uploadRejectionReason(category, file);
  if (reason) throw new Error(reason);
}

/**
 * Identifies a file from its leading bytes (magic numbers). Returns null when
 * the signature matches none of the accepted formats.
 */
export function sniffContentType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return "image/png";
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "image/webp";
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return "application/pdf";
  return null;
}

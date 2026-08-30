export const DOCS_BUCKET = "kaivra-docs";

export function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

export function buildDocPath(applicationId: string, kind: string, fileName: string) {
  return `${applicationId}/${kind}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

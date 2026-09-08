import { verifyStoredObject } from "@/lib/upload-verify.server";
const r = await verifyStoredObject("kaivra-docs","x/y/z.jpg","passport");
console.log("no-config result:", JSON.stringify(r));
process.exit(r.ok ? 1 : 0);

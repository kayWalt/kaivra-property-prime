import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/median";

/**
 * Investor-facing helper: copy or natively share the permanent KAIVRA Investor
 * ID so an authorised adviser/administrator can assist with the application.
 * The Investor ID is only an identifier — never a credential — so nothing
 * sensitive is ever included in the shared message.
 */
export function ShareInvestorId({ code }: { code: string | null | undefined }) {
  if (!code) return null;

  const message = `KAIVRA Investor ID:\n${code}\n\nPlease use this Investor ID to assist me with completing my KAIVRA investment application.`;

  async function copy() {
    haptic();
    try {
      await navigator.clipboard.writeText(code!);
      toast.success("Investor ID copied");
    } catch {
      toast.error("Your browser blocked copying. Please copy the ID manually.");
    }
  }

  async function share() {
    haptic();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "KAIVRA Investor ID", text: message });
        return;
      } catch {
        return; // user dismissed the native sheet
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Message copied", { description: "Paste it to your adviser." });
    } catch {
      toast.error("Sharing is not available on this device.");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
        <Copy className="mr-2 size-4" aria-hidden />
        Copy Investor ID
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => void share()}>
        <Share2 className="mr-2 size-4" aria-hidden />
        Share ID
      </Button>
    </div>
  );
}

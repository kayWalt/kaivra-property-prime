import { useState } from "react";
import QRCode from "react-qr-code";
import { Check, Copy, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const APP_URL = "https://kaivra-property-prime.lovable.app";

export function ShareQrButton() {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
      toast.success("Link copied — share it with your client");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the link");
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Share app QR code">
          <QrCode className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Share KAIVRA</DialogTitle>
          <DialogDescription>
            Ask your client to scan this code with their phone camera to open KAIVRA instantly.
          </DialogDescription>
        </DialogHeader>
        <div className="mx-auto rounded-xl border border-border bg-white p-5">
          <QRCode value={APP_URL} size={220} fgColor="#101513" />
        </div>
        <p className="break-all text-center text-xs text-muted-foreground">{APP_URL}</p>
        <Button variant="outline" className="w-full" onClick={copyLink}>
          {copied ? <Check className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

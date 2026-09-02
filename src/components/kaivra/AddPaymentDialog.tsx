import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { uploadDocument } from "@/components/kaivra/FileUpload";
import { logEvent, notifyStaffForProject } from "@/lib/applications";
import { accountLabel, useActivePaymentAccounts } from "@/lib/payment-accounts";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/kaivra";


/**
 * Lets an investor record a payment and attach the bank receipt / proof of
 * payment on an application, including after submission.
 */
export function AddPaymentDialog({
  applicationId,
  projectId,
  reference,
  onDone,
}: {
  applicationId: string;
  projectId?: string | null;
  reference?: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [bank, setBank] = useState("");
  const [sender, setSender] = useState("");
  const [payRef, setPayRef] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState("");
  const accounts = useActivePaymentAccounts();

  function reset() {
    setAmount("");
    setPaidOn("");
    setBank("");
    setSender("");
    setPayRef("");
    setMethod("bank_transfer");
    setNote("");
    setFile(null);
    setAccountId("");
  }


  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the amount you paid.");
      return;
    }
    if (!file) {
      toast.error("Attach your receipt or proof of payment.");
      return;
    }
    const hasAccounts = (accounts.data ?? []).length > 0;
    if (hasAccounts && !accountId) {
      toast.error("Select the account you paid into.");
      return;
    }
    try {
      const { data: payment, error } = await supabase
        .from("application_payments")
        .insert({
          application_id: applicationId,
          amount: value,
          paid_on: paidOn || null,
          bank: bank || null,
          sender: sender || null,
          reference: payRef || null,
          method,
          description: note || null,
          payment_account_id: accountId || null,
        })

        .select()
        .single();
      if (error || !payment) throw error ?? new Error("insert failed");

      await uploadDocument({
        applicationId,
        kind: "proof_of_payment",
        file,
        label: `Proof of payment · ${payRef || value}`,
        paymentId: payment.id,
      });

      void logEvent(
        applicationId,
        "payment_proof_uploaded",
        `Payment of ${value} submitted for verification`,
      );
      void notifyStaffForProject(
        projectId ?? null,
        "New payment proof uploaded",
        `An investor uploaded proof of payment for ${reference ?? "an application"}.`,
        `/admin/applications/${applicationId}`,
      );

      toast.success("Payment submitted. Our team will verify it shortly.");
      reset();
      setOpen(false);
      onDone();
    } catch {
      toast.error("Your payment could not be recorded. Please try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-2 size-4" /> Upload payment proof
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload proof of payment</DialogTitle>
          <DialogDescription>
            Record what you paid and attach the bank receipt. Our team will verify it and update
            your balance.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label htmlFor="pay-account">Account paid into</Label>
            <select
              id="pay-account"
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={accounts.isLoading}
            >
              <option value="">
                {accounts.isLoading ? "Loading accounts…" : "Select the account you paid into"}
              </option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
            </select>
            {!accounts.isLoading && (accounts.data ?? []).length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                No payment accounts are published yet — please contact your adviser.
              </p>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">

            <div>
              <Label htmlFor="pay-amount">Amount paid (₦)</Label>
              <Input
                id="pay-amount"
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pay-date">Payment date</Label>
              <Input
                id="pay-date"
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="pay-bank">Bank</Label>
              <Input id="pay-bank" value={bank} onChange={(e) => setBank(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pay-method">Method</Label>
              <select
                id="pay-method"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="pay-sender">Sender / depositor</Label>
              <Input id="pay-sender" value={sender} onChange={(e) => setSender(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pay-ref">Transaction reference</Label>
              <Input id="pay-ref" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="pay-note">Note (optional)</Label>
            <Textarea
              id="pay-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="pay-file">Receipt / proof of payment</Label>
            <Input
              id="pay-file"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? <p className="mt-1 text-xs text-muted-foreground">{file.name}</p> : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <AsyncButton onClick={() => submit()} pendingLabel="Submitting…">
            Submit payment
          </AsyncButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

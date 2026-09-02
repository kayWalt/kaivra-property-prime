import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { submitContactEnquiry } from "@/lib/contact.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Public KAIVRA enquiry form.
 *
 * Submission goes through a server function that validates every field,
 * applies spam/abuse protection, stores the enquiry in
 * `public.contact_enquiries` (staff-read only) and emails the KAIVRA support
 * mailbox. The visitor only sees success once the enquiry is safely stored.
 */
export function ContactForm() {
  const [sending, setSending] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
    company: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      subject: form.subject.trim(),
      message: form.message.trim(),
      source_page: typeof window !== "undefined" ? window.location.pathname : null,
      company: form.company,
    };
    try {
      let res: { reference: string | null };
      try {
        res = await submitContactEnquiry({ data: payload });
      } catch (primaryErr) {
        // The custom-domain runtime may lack the server secrets. Fall back to
        // the canonical origin's public intake endpoint (same app, same
        // database, same validation) so an enquiry is never lost.
        const relay = await fetch(`${LOVABLE_ORIGIN}/api/public/contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => null);
        const body = relay ? await relay.json().catch(() => null) : null;
        if (!relay || !relay.ok || !body || body.error) {
          throw new Error(
            body?.error ||
              (primaryErr instanceof Error && primaryErr.message
                ? primaryErr.message
                : "Your enquiry could not be sent. Please try again."),
          );
        }
        res = { reference: body.reference ?? null };
      }
      setReference(res.reference);
      setForm({
        full_name: "",
        email: "",
        phone: "",
        subject: "",
        message: "",
        company: "",
      });
      toast.success("Thank you — a KAIVRA adviser will be in touch.");
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Your enquiry could not be sent. Please try again.",
      );
    } finally {
      setSending(false);
    }
  }


  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="contact-name">Full name</Label>
        <Input
          id="contact-name"
          required
          minLength={2}
          maxLength={120}
          value={form.full_name}
          onChange={(e) => set("full_name")(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="contact-email">Email</Label>
        <Input
          id="contact-email"
          type="email"
          required
          maxLength={200}
          value={form.email}
          onChange={(e) => set("email")(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="contact-phone">Phone (optional)</Label>
        <Input
          id="contact-phone"
          maxLength={40}
          value={form.phone}
          onChange={(e) => set("phone")(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="contact-subject">Subject</Label>
        <Input
          id="contact-subject"
          required
          minLength={2}
          maxLength={160}
          value={form.subject}
          onChange={(e) => set("subject")(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="contact-message">How can we help?</Label>
        <Textarea
          id="contact-message"
          required
          rows={4}
          minLength={10}
          maxLength={2000}
          value={form.message}
          onChange={(e) => set("message")(e.target.value)}
        />
      </div>
      {/* Honeypot — hidden from humans, ignored server-side when filled. */}
      <div className="hidden" aria-hidden>
        <label htmlFor="contact-company">Company</label>
        <input
          id="contact-company"
          tabIndex={-1}
          autoComplete="off"
          value={form.company}
          onChange={(e) => set("company")(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={sending}>
          {sending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          Send enquiry
        </Button>
        {reference ? (
          <p className="text-sm text-muted-foreground">
            Enquiry received — your reference is{" "}
            <span className="font-medium text-foreground">{reference}</span>.
          </p>
        ) : null}
      </div>
    </form>
  );
}

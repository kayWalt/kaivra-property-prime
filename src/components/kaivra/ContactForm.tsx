import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Public KAIVRA enquiry form.
 *
 * Writes to `public.contact_enquiries`, which allows anonymous inserts but
 * only lets KAIVRA staff read the enquiries back, so nothing submitted here is
 * silently discarded and nothing is exposed to other visitors.
 */
export function ContactForm() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    const { error } = await supabase.from("contact_enquiries").insert({
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      subject: form.subject.trim(),
      message: form.message.trim(),
      source_page: typeof window !== "undefined" ? window.location.pathname : null,
    });
    setSending(false);
    if (error) {
      toast.error(error.message || "Your enquiry could not be sent. Please try again.");
      return;
    }
    setSent(true);
    setForm({ full_name: "", email: "", phone: "", subject: "", message: "" });
    toast.success("Thank you — a KAIVRA adviser will be in touch.");
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="contact-name">Full name</Label>
        <Input
          id="contact-name"
          required
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
          maxLength={2000}
          value={form.message}
          onChange={(e) => set("message")(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={sending}>
          {sending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          Send enquiry
        </Button>
        {sent ? (
          <p className="text-sm text-muted-foreground">
            Your enquiry has been received by the KAIVRA team.
          </p>
        ) : null}
      </div>
    </form>
  );
}

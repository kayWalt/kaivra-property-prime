import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SupportSettings = {
  escalation_enabled: boolean;
  whatsapp_enabled: boolean;
  whatsapp_number: string;
  support_phone: string;
  support_email: string;
  support_hours: string;
};

const FALLBACK: SupportSettings = {
  escalation_enabled: true,
  whatsapp_enabled: true,
  whatsapp_number: "2347058926912",
  support_phone: "+2349125067938",
  support_email: "support@kaivra.com",
  support_hours: "Monday to Saturday, 9:00am – 6:00pm (WAT)",
};

/** Support desk configuration (WhatsApp number, phone, email, hours). */
export function useSupportSettings() {
  const query = useQuery({
    queryKey: ["support-settings"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_settings")
        .select(
          "escalation_enabled, whatsapp_enabled, whatsapp_number, support_phone, support_email, support_hours",
        )
        .maybeSingle();
      return (data as SupportSettings | null) ?? FALLBACK;
    },
  });
  return query.data ?? FALLBACK;
}

/** Business hours are advisory only — WhatsApp and live chat stay available. */
export function buildWhatsAppLink(
  number: string,
  parts: {
    name?: string | null;
    investorCode?: string | null;
    reference?: string | null;
    page?: string | null;
    topic?: string | null;
  },
) {
  const digits = (number || FALLBACK.whatsapp_number).replace(/[^0-9]/g, "");
  const lines = [
    "Hello KAIVRA, I need help from a support agent.",
    parts.name ? `Name: ${parts.name}` : null,
    parts.investorCode ? `Investor ID: ${parts.investorCode}` : null,
    parts.reference ? `Reference: ${parts.reference}` : null,
    parts.topic ? `Topic: ${parts.topic}` : null,
    parts.page ? `Page: ${parts.page}` : null,
  ].filter(Boolean);
  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
}

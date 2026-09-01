import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { replyToSupportTicket } from "@/lib/support.functions";
import { formatDate } from "@/lib/kaivra";
import { cn } from "@/lib/utils";

export type SupportChatMessage = {
  id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  author_id: string | null;
};

/** Live agent conversation. Messages stream in over Realtime for both sides. */
export function useSupportThread(ticketId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["support-thread", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, body, is_internal, created_at, author_id")
        .eq("ticket_id", ticketId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as SupportChatMessage[];
    },
  });

  useEffect(() => {
    if (!ticketId) return;
    const channel = supabase
      .channel(`support-thread-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["support-thread", ticketId] });
          void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, ticketId]);

  return query;
}

export function SupportThread({
  ticketId,
  viewerId,
  allowInternal = false,
  placeholder = "Type your message…",
  className,
  emptyLabel = "No messages yet.",
}: {
  ticketId: string;
  viewerId: string | null | undefined;
  allowInternal?: boolean;
  placeholder?: string;
  className?: string;
  emptyLabel?: string;
}) {
  const thread = useSupportThread(ticketId);
  const reply = useServerFn(replyToSupportTicket);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.data]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await reply({ data: { ticketId, body: text, internal } });
      setBody("");
      await thread.refetch();
    } catch {
      toast.error("Your message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto py-2">
        {thread.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (thread.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyLabel}</p>
        ) : (
          (thread.data ?? []).map((m) => {
            const mine = !!viewerId && m.author_id === viewerId;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    m.is_internal
                      ? "border border-dashed border-border bg-muted/60 text-muted-foreground"
                      : mine
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm border border-border bg-card text-foreground",
                  )}
                >
                  {m.body}
                  <span
                    className={cn(
                      "mt-1 block text-[11px]",
                      mine && !m.is_internal ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {m.is_internal ? "Internal note · " : ""}
                    {formatDate(m.created_at)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-2">
        {allowInternal ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
              className="size-3.5 accent-current"
            />
            Internal note (investor cannot see this)
          </label>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={placeholder}
            aria-label="Message"
            className="min-h-[2.5rem] resize-none"
          />
          <Button
            size="icon"
            onClick={() => void send()}
            disabled={sending || body.trim().length === 0}
            aria-label="Send message"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

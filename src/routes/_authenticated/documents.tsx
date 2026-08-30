import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { openDocument } from "@/components/kaivra/FileUpload";
import { useSession } from "@/hooks/useAuth";
import { formatDate } from "@/lib/kaivra";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "KAIVRA | My Documents" },
      { name: "description", content: "Securely access the documents attached to your investment applications." },
      { property: "og:title", content: "KAIVRA | My Documents" },
      { property: "og:description", content: "Your securely stored investment documents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const { user } = useSession();

  const docs = useQuery({
    queryKey: ["my-documents", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: apps, error: appError } = await supabase
        .from("applications")
        .select("id, reference")
        .eq("investor_id", user!.id);
      if (appError) throw appError;
      const ids = (apps ?? []).map((a) => a.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("application_documents")
        .select("*")
        .in("application_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const refByApp = new Map((apps ?? []).map((a) => [a.id, a.reference]));
      return (data ?? []).map((d) => ({ ...d, reference: refByApp.get(d.application_id) ?? "Draft" }));
    },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl">My documents</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your documents are stored privately and can only be opened by you and authorised KAIVRA staff.
      </p>

      <div className="mt-8 space-y-2">
        {docs.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />) : null}
        {docs.data?.length === 0 ? (
          <EmptyState
            title="No documents yet."
            body="Documents you upload during an application will appear here."
            action={
              <Button asChild>
                <Link to="/application">Start application</Link>
              </Button>
            }
          />
        ) : null}
        {docs.data?.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium capitalize">{doc.kind.replace(/_/g, " ")}</p>
              <p className="text-xs text-muted-foreground">
                {doc.file_name} · {doc.reference} · {formatDate(doc.created_at)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void openDocument(doc.id)}>
              <Eye className="mr-2 size-4" /> View
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

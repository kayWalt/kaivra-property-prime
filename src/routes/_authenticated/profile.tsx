import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Trash2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createAvatarUploadTicket, removeAvatarFile } from "@/lib/avatar.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile, useRoles, useSession, primaryRole } from "@/hooks/useAuth";


export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "KAIVRA | My Profile" },
      { name: "description", content: "Manage your KAIVRA investor profile and contact details." },
      { property: "og:title", content: "KAIVRA | My Profile" },
      { property: "og:description", content: "Manage your investor profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Your profile could not be saved. Please try again.");
      return;
    }
    toast.success("Profile updated.");
    void queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
      <p className="eyebrow text-primary">{primaryRole(roles).replace("_", " ")}</p>
      <h1 className="mt-1 font-display text-4xl">My profile</h1>

      <div className="mt-8 space-y-5 rounded-lg border border-border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile_phone">Phone number</Label>
          <Input id="profile_phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile_email">Email address</Label>
          <Input id="profile_email" value={profile?.email ?? user?.email ?? ""} readOnly disabled />
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Save changes
        </Button>
      </div>

      <Button variant="outline" className="mt-6" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Trash2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createAvatarUploadTicket, removeAvatarFile } from "@/lib/avatar.functions";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
    setAvatarUrl((profile as { avatar_url?: string | null } | undefined)?.avatar_url ?? null);
  }, [profile]);

  async function persistAvatar(url: string | null) {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    if (error) throw new Error("Your picture could not be saved.");
    setAvatarUrl(url);
    void queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
  }

  async function handleFile(file: File | undefined) {
    if (!file || !user) return;
    setUploading(true);
    try {
      const ticket = await createAvatarUploadTicket({ data: { fileName: file.name } });
      const { error } = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file);
      if (error) throw new Error("Your picture could not be uploaded.");
      await persistAvatar(ticket.url);
      toast.success("Profile picture updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Your picture could not be uploaded.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAvatar() {
    if (!avatarUrl) return;
    setUploading(true);
    try {
      const path = avatarUrl.replace("/api/public/avatar/", "");
      await persistAvatar(null);
      await removeAvatarFile({ data: { path } });
      toast.success("Profile picture removed.");
    } catch {
      toast.error("Your picture could not be removed.");
    } finally {
      setUploading(false);
    }
  }

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


  function signOut() {
    // Instant transition; session teardown continues in the background.
    void navigate({ to: "/auth", replace: true });
    void queryClient.cancelQueries();
    queryClient.clear();
    void supabase.auth.signOut();
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
      <p className="eyebrow text-primary">{primaryRole(roles).replace("_", " ")}</p>
      <h1 className="mt-1 font-display text-4xl">My profile</h1>

      <div className="mt-8 space-y-5 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName ? `${fullName}'s profile picture` : "Profile picture"}
              className="size-20 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
              <User className="size-8" aria-hidden />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Camera className="mr-2 size-4" />}
              {avatarUrl ? "Change picture" : "Upload picture"}
            </Button>
            {avatarUrl ? (
              <AsyncButton type="button" variant="ghost" size="sm" disabled={uploading} pendingLabel="Removing…" onClick={() => removeAvatar()}>
                <Trash2 className="mr-2 size-4" /> Remove
              </AsyncButton>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Upload profile picture"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>

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
        <AsyncButton onClick={() => save()} disabled={saving} pendingLabel="Saving…">
          Save changes
        </AsyncButton>
      </div>

      <Button variant="outline" className="mt-6" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}

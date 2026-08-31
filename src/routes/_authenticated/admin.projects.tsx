import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Plus, Save, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  GalleryUploadField,
  ImageUploadField,
  parseGallery,
  type GalleryImage,
} from "@/components/kaivra/ProjectImageFields";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRoles, useSession, primaryRole } from "@/hooks/useAuth";
import { formatNaira } from "@/lib/kaivra";

export const Route = createFileRoute("/_authenticated/admin/projects")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Project Management" },
      {
        name: "description",
        content: "Create and manage real-estate projects, properties, prices and availability.",
      },
      { property: "og:title", content: "KAIVRA | Project Management" },
      { property: "og:description", content: "Manage projects and properties." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectManagement,
});

function ProjectManagement() {
  const { user } = useSession();
  const { data: roles, isLoading } = useRoles(user?.id);
  const role = primaryRole(roles);
  const canManage = role === "admin" || role === "super_admin";

  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [editProject, setEditProject] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", location: "", description: "", hero_image: "" });
  const [gallery, setGallery] = useState<GalleryImage[]>([]);

  const projects = useQuery({
    queryKey: ["admin-projects"],
    enabled: canManage,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, properties(*)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Targeted cache refresh: admin list + every investor-facing project view.
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
    void queryClient.invalidateQueries({ queryKey: ["public-projects"] });
    void queryClient.invalidateQueries({ queryKey: ["project"] });
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-3xl">Restricted area</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only administrators can manage projects.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Return to dashboard</Link>
        </Button>
      </div>
    );
  }

  async function createProject() {
    if (creating) return; // guards against duplicate submissions
    if (!form.name.trim()) {
      toast.error("Give the project a name.");
      return;
    }
    if (!form.location.trim()) {
      toast.error("Add the project location so investors know where it is.");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: form.name.trim(),
          location: form.location.trim(),
          description: form.description.trim(),
          hero_image: form.hero_image.trim() || (gallery[0]?.url ?? null),
          gallery_images: gallery,
        })
        .select("*, properties(*)")
        .single();
      if (error) throw error;

      // Show the new project instantly, then reconcile with the server.
      queryClient.setQueryData(["admin-projects"], (current: unknown) =>
        Array.isArray(current) ? [...current, data] : current,
      );
      toast.success("Project created.");
      setForm({ name: "", location: "", description: "", hero_image: "" });
      setGallery([]);
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "The project could not be created. Please try again.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    const { error } = await supabase.from("projects").update({ is_active: !isActive }).eq("id", id);
    if (error) {
      toast.error(error.message || "This project could not be updated.");
      return;
    }
    toast.success(
      isActive
        ? "Project deactivated — hidden from investors."
        : "Project activated and visible to investors.",
    );
    await refresh();
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-primary">Administration</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">Projects &amp; properties</h1>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin">Applications</Link>
        </Button>
      </div>

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <h2 className="font-display text-2xl">Create project</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="project_name">Project name</Label>
            <Input
              id="project_name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project_location">Location</Label>
            <Input
              id="project_location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="project_hero">Hero image</Label>
            <ImageUploadField
              id="project_hero"
              value={form.hero_image}
              onChange={(url) => setForm({ ...form, hero_image: url })}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Gallery images & captions</Label>
            <GalleryUploadField idPrefix="new-project" images={gallery} onChange={setGallery} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="project_desc">Description</Label>
            <Textarea
              id="project_desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <AsyncButton
          className="mt-4"
          onClick={() => createProject()}
          disabled={creating}
          pendingLabel="Creating…"
        >
          <Plus className="mr-2 size-4" />
          Create project
        </AsyncButton>
      </section>

      <div className="mt-10 space-y-4">
        {projects.isLoading
          ? [0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)
          : null}
        {projects.isError ? (
          <p className="text-sm text-destructive">
            Projects could not be loaded.{" "}
            <button type="button" className="underline" onClick={() => void projects.refetch()}>
              Try again
            </button>
          </p>
        ) : null}
        {!projects.isLoading && projects.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No projects yet. Create your first project above.
          </p>
        ) : null}
        {projects.data?.map((project) => (
          <section
            key={project.id}
            className="overflow-hidden rounded-lg border border-border bg-card p-4 sm:p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="break-words font-display text-xl leading-tight sm:text-2xl">
                  {project.name}
                </h2>
                <p className="text-sm text-muted-foreground">{project.location}</p>
                <span className="mt-1 inline-block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {project.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {project.is_active ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        Deactivate
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate {project.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The project will be hidden from the investor directory. You can activate
                          it again at any time.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void toggleActive(project.id, true)}>
                          Deactivate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <AsyncButton
                    size="sm"
                    variant="outline"
                    pendingLabel="Updating…"
                    onClick={() => toggleActive(project.id, false)}
                  >
                    Activate
                  </AsyncButton>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditProject((current) => (current === project.id ? null : project.id))
                  }
                >
                  {editProject === project.id ? "Close editor" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setOpenProject((current) => (current === project.id ? null : project.id))
                  }
                >
                  {openProject === project.id ? "Hide properties" : "Properties"}
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/projects/$projectId" params={{ projectId: project.id }}>
                    Preview
                  </Link>
                </Button>
              </div>
            </div>

            {editProject === project.id ? (
              <ProjectEditor
                project={project}
                onClose={() => setEditProject(null)}
                onSaved={refresh}
              />
            ) : null}

            {openProject === project.id ? (
              <PropertyManager
                projectId={project.id}
                onChanged={refresh}
                properties={project.properties ?? []}
              />
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

function PropertyManager({
  projectId,
  properties,
  onChanged,
}: {
  projectId: string;
  properties: {
    id: string;
    name: string;
    property_type: string | null;
    size_label: string | null;
    unit_price: number;
    units_available: number | null;
    is_active: boolean;
  }[];
  onChanged: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    property_type: "",
    size_label: "",
    unit_price: 0,
    units_available: 0,
  });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    property_type: "",
    unit_price: 0,
    units_available: 0,
    size_label: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  function startEdit(property: {
    id: string;
    name: string;
    property_type: string | null;
    unit_price: number;
    units_available: number | null;
    size_label: string | null;
  }) {
    setEditingId(property.id);
    setEditForm({
      name: property.name,
      property_type: property.property_type ?? "",
      unit_price: property.unit_price,
      units_available: property.units_available ?? 0,
      size_label: property.size_label ?? "",
    });
  }

  async function saveEdit(id: string) {
    if (!editForm.name.trim()) {
      toast.error("Enter a property name.");
      return;
    }
    if (editForm.unit_price <= 0) {
      toast.error("Enter a valid unit price (full naira amount, e.g. 22500000 for ₦22.5m).");
      return;
    }
    setEditSaving(true);
    const { error } = await supabase
      .from("properties")
      .update({
        name: editForm.name.trim(),
        property_type: editForm.property_type.trim(),
        unit_price: editForm.unit_price,
        units_available: editForm.units_available,
        size_label: editForm.size_label.trim(),
      })
      .eq("id", id);
    setEditSaving(false);
    if (error) {
      toast.error(error.message || "The property could not be updated. Please try again.");
      return;
    }
    toast.success("Property updated.");
    setEditingId(null);
    onChanged();
  }

  async function togglePropertyActive(id: string, isActive: boolean) {
    const { error } = await supabase
      .from("properties")
      .update({ is_active: !isActive })
      .eq("id", id);
    if (error) {
      toast.error(error.message || "The property could not be updated.");
      return;
    }
    toast.success(
      isActive ? "Property hidden from investors." : "Property is now visible to investors.",
    );
    onChanged();
  }

  async function removeProperty(id: string) {
    const { error } = await supabase.from("properties").delete().eq("id", id);
    if (error) {
      toast.error(
        error.message.includes("foreign key")
          ? "This property is referenced by an application, so it cannot be deleted. Deactivate it instead."
          : error.message || "The property could not be deleted.",
      );
      return;
    }
    toast.success("Property deleted.");
    onChanged();
  }

  async function addProperty() {
    if (!form.name.trim() || form.unit_price <= 0) {
      toast.error("Enter a property name and a unit price.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("properties").insert({
      project_id: projectId,
      name: form.name.trim(),
      property_type: form.property_type.trim(),
      size_label: form.size_label.trim(),
      unit_price: form.unit_price,
      units_available: form.units_available,
    });
    setSaving(false);
    if (error) {
      toast.error("The property could not be created. Please try again.");
      return;
    }
    toast.success("Property added.");
    setForm({ name: "", property_type: "", size_label: "", unit_price: 0, units_available: 0 });
    onChanged();
  }

  return (
    <div className="mt-5 border-t border-border pt-5">
      <ul className="space-y-2">
        {properties.length === 0 ? (
          <li className="text-sm text-muted-foreground">No properties yet for this project.</li>
        ) : null}
        {properties.map((property) => (
          <li
            key={property.id}
            className="rounded-md border border-border px-3 py-3 text-sm sm:px-4"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <strong className="break-words">{property.name}</strong>
                <span className="text-muted-foreground"> · {property.size_label || "—"}</span>
                <p className="text-muted-foreground">
                  {formatNaira(property.unit_price)} · {property.units_available ?? 0} units
                  {property.is_active ? "" : " · hidden"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    editingId === property.id ? setEditingId(null) : startEdit(property)
                  }
                >
                  {editingId === property.id ? "Close" : "Edit"}
                </Button>
                <AsyncButton
                  size="sm"
                  variant="ghost"
                  pendingLabel="Updating…"
                  onClick={() => togglePropertyActive(property.id, property.is_active)}
                >
                  {property.is_active ? "Deactivate" : "Activate"}
                </AsyncButton>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${property.name}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {property.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes the property. If investors have already applied for
                        it, deactivate it instead.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void removeProperty(property.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            {editingId === property.id ? (
              <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`e-name-${property.id}`}>Property name</Label>
                  <Input
                    id={`e-name-${property.id}`}
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`e-type-${property.id}`}>Property type</Label>
                  <Input
                    id={`e-type-${property.id}`}
                    value={editForm.property_type}
                    onChange={(e) => setEditForm({ ...editForm, property_type: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`e-size-${property.id}`}>Size</Label>
                  <Input
                    id={`e-size-${property.id}`}
                    value={editForm.size_label}
                    onChange={(e) => setEditForm({ ...editForm, size_label: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`e-price-${property.id}`}>Unit price (₦)</Label>
                  <Input
                    id={`e-price-${property.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={editForm.unit_price || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, unit_price: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`e-units-${property.id}`}>Units available</Label>
                  <Input
                    id={`e-units-${property.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={editForm.units_available || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, units_available: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <AsyncButton
                    size="sm"
                    onClick={() => saveEdit(property.id)}
                    disabled={editSaving}
                    pendingLabel="Saving…"
                  >
                    <Save className="mr-2 size-4" />
                    Save changes
                  </AsyncButton>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`p-name-${projectId}`}>Property name</Label>
          <Input
            id={`p-name-${projectId}`}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`p-type-${projectId}`}>Property type</Label>
          <Input
            id={`p-type-${projectId}`}
            value={form.property_type}
            onChange={(e) => setForm({ ...form, property_type: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`p-size-${projectId}`}>Size</Label>
          <Input
            id={`p-size-${projectId}`}
            value={form.size_label}
            placeholder="250 SQM"
            onChange={(e) => setForm({ ...form, size_label: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`p-price-${projectId}`}>Unit price (₦, full amount e.g. 22500000)</Label>
          <Input
            id={`p-price-${projectId}`}
            type="number"
            min={0}
            value={form.unit_price || ""}
            onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`p-units-${projectId}`}>Units available</Label>
          <Input
            id={`p-units-${projectId}`}
            type="number"
            min={0}
            value={form.units_available || ""}
            onChange={(e) => setForm({ ...form, units_available: Number(e.target.value) || 0 })}
          />
        </div>
      </div>
      <AsyncButton
        className="mt-4"
        size="sm"
        onClick={() => addProperty()}
        disabled={saving}
        pendingLabel="Saving…"
      >
        <Plus className="mr-2 size-4" />
        Add property
      </AsyncButton>
    </div>
  );
}

function ProjectEditor({
  project,
  onClose,
  onSaved,
}: {
  project: {
    id: string;
    name: string;
    location: string | null;
    description: string | null;
    hero_image: string | null;
    gallery_images?: unknown;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: project.name ?? "",
    location: project.location ?? "",
    description: project.description ?? "",
    hero_image: project.hero_image ?? "",
  });
  const [gallery, setGallery] = useState<GalleryImage[]>(() =>
    parseGallery(project.gallery_images),
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) {
      toast.error("Give the project a name.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({
        name: form.name.trim(),
        location: form.location.trim(),
        description: form.description.trim(),
        hero_image: form.hero_image.trim() || (gallery[0]?.url ?? null),
        gallery_images: gallery,
      })
      .eq("id", project.id);
    setSaving(false);
    if (error) {
      toast.error("The project could not be updated. Please try again.");
      return;
    }
    toast.success("Project updated.");
    onSaved();
    onClose();
  }

  return (
    <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`edit-name-${project.id}`}>Project name</Label>
        <Input
          id={`edit-name-${project.id}`}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`edit-loc-${project.id}`}>Location</Label>
        <Input
          id={`edit-loc-${project.id}`}
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`edit-hero-${project.id}`}>Hero image</Label>
        <ImageUploadField
          id={`edit-hero-${project.id}`}
          value={form.hero_image}
          onChange={(url) => setForm({ ...form, hero_image: url })}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Gallery images & captions</Label>
        <GalleryUploadField
          idPrefix={`edit-gallery-${project.id}`}
          images={gallery}
          onChange={setGallery}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`edit-desc-${project.id}`}>Description</Label>
        <Textarea
          id={`edit-desc-${project.id}`}
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <AsyncButton size="sm" onClick={() => save()} disabled={saving} pendingLabel="Saving…">
          <Save className="mr-2 size-4" />
          Save changes
        </AsyncButton>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="mr-2 size-4" /> Cancel
        </Button>
      </div>
    </div>
  );
}

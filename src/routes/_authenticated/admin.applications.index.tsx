import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/admin/applications` has no list of its own — the management workspace at
 * `/admin` already is that list. Redirect instead of showing a 404 to staff who
 * type or bookmark the URL.
 */
export const Route = createFileRoute("/_authenticated/admin/applications/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});

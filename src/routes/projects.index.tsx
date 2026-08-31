import { createFileRoute, redirect } from "@tanstack/react-router";

// The project catalogue lives in the "#projects" section of the home page.
// /projects is a URL people guess or bookmark, so send it there instead of 404.
export const Route = createFileRoute("/projects/")({
  beforeLoad: () => {
    throw redirect({ to: "/", hash: "projects" });
  },
});

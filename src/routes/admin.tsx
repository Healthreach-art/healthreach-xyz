import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
  component: () => <Navigate to="/login" search={{ mode: "admin" } as any} />,
});

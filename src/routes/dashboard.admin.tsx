import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/admin")({
  component: () => <Navigate to="/firebase-admin" replace />,
});

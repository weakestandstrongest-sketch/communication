import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageSpinner } from "@/components/ui/spinner";

// Everything behind sign-in renders on the client after the session is known,
// so the prerendered shell is just a loading state.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

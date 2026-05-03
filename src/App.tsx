import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useMemberSession } from "@/lib/useMemberSession";
import { AppShell } from "@/components/AppShell";

const Onboarding = lazy(() => import("./routes/Onboarding"));
const Schedule = lazy(() => import("./routes/Schedule"));
const Meetups = lazy(() => import("./routes/Meetups"));
const Coordinate = lazy(() => import("./routes/Coordinate"));

function RequireSession({ children }: { children: React.ReactNode }) {
  const session = useMemberSession();
  if (session.status === "loading") {
    return <FullScreenLoader />;
  }
  if (session.status === "anonymous") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function FullScreenLoader() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <div className="flex items-center gap-3">
        <div className="size-3 animate-pulse rounded-full bg-primary" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/" element={<Onboarding />} />
        <Route
          path="/schedule"
          element={
            <RequireSession>
              <AppShell>
                <Schedule />
              </AppShell>
            </RequireSession>
          }
        />
        <Route
          path="/meetups"
          element={
            <RequireSession>
              <AppShell>
                <Meetups />
              </AppShell>
            </RequireSession>
          }
        />
        <Route path="/people" element={<Navigate to="/meetups" replace />} />
        <Route
          path="/coordinate"
          element={
            <RequireSession>
              <AppShell>
                <Coordinate />
              </AppShell>
            </RequireSession>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

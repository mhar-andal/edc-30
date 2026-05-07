import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  resetting: boolean;
}

/**
 * Top-level boundary that catches render errors anywhere in the app
 * tree and offers two recovery paths:
 *
 * 1. Plain reload — handles transient errors (chunk load failures,
 *    Convex push happening mid-render, etc.).
 * 2. Hard reset — wipes localStorage, sessionStorage, IndexedDB,
 *    and unregisters the service worker, then reloads. Targets the
 *    "stale cache after deploy + data reset" failure mode.
 *
 * Without this boundary, a single component crash blanks the whole
 * page — the symptom users describe as "the app doesn't load" after
 * a deploy + data reset.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetting: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Surface the error in the console so it's visible in DevTools
    // and in any logging integration the host page wires up.
    console.error("App-level render error:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHardReset = async () => {
    this.setState({ resetting: true });
    try {
      try {
        window.localStorage.clear();
      } catch {
        /* ignore */
      }
      try {
        window.sessionStorage.clear();
      } catch {
        /* ignore */
      }
      // Wipe every IndexedDB database we can see — covers the
      // offline query cache plus anything Convex stores locally.
      try {
        const dbs = (await indexedDB.databases?.()) ?? [];
        await Promise.all(
          dbs
            .filter((db): db is { name: string } => Boolean(db?.name))
            .map(
              (db) =>
                new Promise<void>((resolve) => {
                  const req = indexedDB.deleteDatabase(db.name);
                  req.onsuccess = () => resolve();
                  req.onerror = () => resolve();
                  req.onblocked = () => resolve();
                }),
            ),
        );
      } catch {
        /* ignore — older browsers without indexedDB.databases() */
      }
      try {
        const regs =
          (await navigator.serviceWorker?.getRegistrations()) ?? [];
        await Promise.all(regs.map((r) => r.unregister()));
      } catch {
        /* ignore */
      }
      try {
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        }
      } catch {
        /* ignore */
      }
    } finally {
      window.location.reload();
    }
  };

  render() {
    const { error, resetting } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-4 rounded-xl border border-border/60 bg-card/60 p-6 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                Something broke loading the app
              </h1>
              <p className="text-xs text-muted-foreground">
                Usually clears up with a reload — if not, reset local
                data.
              </p>
            </div>
          </div>

          <pre className="max-h-32 overflow-auto rounded-md border border-border/60 bg-background/40 p-2 text-[10px] text-muted-foreground">
            {error.message || "Unknown error"}
          </pre>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={this.handleReload}
              disabled={resetting}
              className="w-full"
            >
              <RefreshCw className="size-4" />
              Reload app
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void this.handleHardReset()}
              disabled={resetting}
              className="w-full"
            >
              <Trash2 className="size-4" />
              {resetting ? "Resetting…" : "Reset local data and reload"}
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground">
            "Reset local data" wipes your saved name, picks cache, and
            offline data on this device. Server data is unaffected.
          </p>
        </div>
      </div>
    );
  }
}

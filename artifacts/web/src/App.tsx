import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { CandidatesPage } from "@/pages/candidates";
import { ChainPage } from "@/pages/chain";
import { PositionsPage } from "@/pages/positions";
import { HoldingsPage } from "@/pages/holdings";
import { SettingsPage } from "@/pages/settings";
import { AskPage } from "@/pages/ask";
import { LandingPage } from "@/pages/landing";
import NotFound from "@/pages/not-found";
import { SpokeSpinner } from "@/components/spoke-spinner";

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "").trim();
if (apiBaseUrl) setBaseUrl(apiBaseUrl);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);
  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <SpokeSpinner />
      </div>
    );
  }
  return <>{children}</>;
}

function Router() {
  const [location, navigate] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated && (location === "/" || location === "")) {
      navigate("/dashboard");
    }
  }, [isLoading, isAuthenticated, location, navigate]);

  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/dashboard">
        <ProtectedRoute>
          <CandidatesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/chain">
        <ProtectedRoute>
          <ChainPage />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/chain/:ticker">
        <ProtectedRoute>
          <ChainPage />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/positions">
        <ProtectedRoute>
          <PositionsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/holdings">
        <ProtectedRoute>
          <HoldingsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/settings">
        <ProtectedRoute>
          <SettingsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/ask">
        <ProtectedRoute>
          <AskPage />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={150}>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

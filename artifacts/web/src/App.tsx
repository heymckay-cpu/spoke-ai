import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { dark } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { CandidatesPage } from "@/pages/candidates";
import { ChainPage } from "@/pages/chain";
import { PositionsPage } from "@/pages/positions";
import { HoldingsPage } from "@/pages/holdings";
import { SettingsPage } from "@/pages/settings";
import { AskPage } from "@/pages/ask";
import { ResourcesPage } from "@/pages/resources";
import { LandingPage } from "@/pages/landing";
import NotFound from "@/pages/not-found";

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "").trim();
if (apiBaseUrl) setBaseUrl(apiBaseUrl);

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const clerkAppearance = {
  baseTheme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/spoke-mark.png`,
  },
  variables: {
    colorPrimary: "#6366F1",
    colorForeground: "#F1F5F9",
    colorMutedForeground: "#94A3B8",
    colorDanger: "#F43F5E",
    colorBackground: "#0F172A",
    colorInput: "#1E293B",
    colorInputForeground: "#F1F5F9",
    colorNeutral: "#1E293B",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-slate-950 border border-white/10 rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white font-semibold",
    headerSubtitle: "text-slate-400",
    socialButtonsBlockButtonText: "text-slate-100 font-medium",
    formFieldLabel: "text-slate-200 text-sm font-medium",
    footerActionLink: "text-indigo-300 hover:text-indigo-200 font-medium",
    footerActionText: "text-slate-400",
    dividerText: "text-slate-500",
    identityPreviewEditButton: "text-indigo-300",
    formFieldSuccessText: "text-emerald-400",
    alertText: "text-slate-200",
    logoBox: "flex justify-center",
    logoImage: "h-12 w-12 object-contain",
    socialButtonsBlockButton:
      "border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-slate-100",
    formButtonPrimary:
      "bg-indigo-500 hover:bg-indigo-400 text-white shadow-[0_0_30px_-5px_rgba(99,102,241,0.6)]",
    formFieldInput:
      "border border-white/10 bg-slate-900 text-slate-100 placeholder:text-slate-500",
    footerAction: "border-t border-white/5",
    dividerLine: "bg-white/10",
    alert: "bg-rose-500/10 border border-rose-500/30",
    otpCodeFieldInput: "border border-white/10 bg-slate-900 text-slate-100",
    formFieldRow: "",
    main: "",
  },
};

function AuthBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4 py-10"
      style={{
        backgroundImage:
          "radial-gradient(900px 500px at 50% -100px, rgba(99,102,241,0.18), transparent 60%), radial-gradient(700px 400px at 80% 110%, rgba(56,189,248,0.10), transparent 60%)",
      }}
    >
      {children}
    </div>
  );
}

function SignInPage() {
  return (
    <AuthBackdrop>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthBackdrop>
  );
}

function SignUpPage() {
  return (
    <AuthBackdrop>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthBackdrop>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkTokenWirer() {
  const { session } = useClerk();
  useEffect(() => {
    setAuthTokenGetter(async () => {
      if (!session) return null;
      return session.getToken();
    });
    return () => setAuthTokenGetter(null);
  }, [session]);
  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
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
      <Route path="/dashboard/resources">
        <ProtectedRoute>
          <ResourcesPage />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to your Spoke AI account",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Start using Spoke AI today",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <ClerkTokenWirer />
        <ThemeProvider>
          <TooltipProvider delayDuration={150}>
            <Router />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;

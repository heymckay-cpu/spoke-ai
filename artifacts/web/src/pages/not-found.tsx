import { Link } from "wouter";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Compass className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Off the chain
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That page isn't part of the screener. Head back to your candidates or
          dig into a chain.
        </p>
        <div className="mt-6 flex items-center gap-2">
          <Button asChild data-testid="link-not-found-candidates">
            <Link href="/dashboard">Candidates</Link>
          </Button>
          <Button asChild variant="outline" data-testid="link-not-found-chain">
            <Link href="/dashboard/chain">Chain Explorer</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

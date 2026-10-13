"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { microsoftSignInAction } from "@/app/actions/auth";

const ERROR_MESSAGES: Record<string, string> = {
  "not-registered": "Your Microsoft account isn't registered in the parking portal. Ask the parking administrator to add you.",
  inactive: "Your portal access has been deactivated. Contact the parking administrator.",
  "no-email": "Microsoft didn't share an email address for your account, so we couldn't match it to the portal.",
  "wrong-tenant": "Please sign in with your Alif work account.",
  AccessDenied: "Access was denied. Please sign in with your Alif work account.",
  Configuration: "Microsoft sign-in is misconfigured on the server. Contact the portal administrator.",
};

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="size-5" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="xl" variant="outline" className="w-full gap-3 bg-card text-base" disabled={disabled || pending}>
      {pending ? <Loader2 className="animate-spin" /> : <MicrosoftLogo />}
      {pending ? "Redirecting to Microsoft…" : "Continue with Microsoft"}
    </Button>
  );
}

export function MicrosoftSignIn({
  callbackUrl,
  error,
  configured,
}: {
  callbackUrl?: string;
  error?: string;
  configured: boolean;
}) {
  const message = error ? (ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again.") : null;

  return (
    <div className="w-full max-w-[400px] animate-fade-up">
      <p className="eyebrow text-gold-strong">Alif internal</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-muted-foreground">Sign in to Alif Parking Portal with your work account.</p>

      <div className="mt-8 space-y-5">
        {message ? (
          <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
            {message}
          </div>
        ) : null}
        {!configured ? (
          <div role="status" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            Microsoft sign-in isn&apos;t configured yet. Set the <code className="font-mono text-xs">AUTH_MICROSOFT_ENTRA_ID_*</code>{" "}
            variables (see <code className="font-mono text-xs">.env.example</code>) and restart the server.
          </div>
        ) : null}

        <form action={microsoftSignInAction.bind(null, callbackUrl)}>
          <SubmitButton disabled={!configured} />
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Only Alif employees registered by the parking administrator can sign in.
        </p>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { MicrosoftSignIn } from "@/components/auth/microsoft-sign-in";
import { isEntraConfigured } from "@/server/auth/entra";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;
  return (
    <AuthLayout>
      <MicrosoftSignIn callbackUrl={callbackUrl} error={error} configured={isEntraConfigured()} />
    </AuthLayout>
  );
}

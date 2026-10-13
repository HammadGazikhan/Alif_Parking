import "server-only";

const MULTI_TENANT_SEGMENTS = new Set(["common", "organizations", "consumers"]);
/** Directory (tenant) ID; tokens carry it as `tid` and in `iss`, so domain names won't match. */
const TENANT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Directory (tenant) ID from AUTH_MICROSOFT_ENTRA_ID_ISSUER. Returns null when
 * the issuer is missing or multi-tenant: sign-in must be restricted to our own
 * tenant, otherwise any Microsoft account could claim a registered email.
 */
export function entraTenantId(): string | null {
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? "";
  const tenant = issuer.match(/login\.microsoftonline\.com\/([^/]+)\/v2\.0/)?.[1];
  if (!tenant || MULTI_TENANT_SEGMENTS.has(tenant.toLowerCase())) return null;
  return TENANT_PATTERN.test(tenant) ? tenant : null;
}

export function isEntraConfigured(): boolean {
  return Boolean(
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET && entraTenantId(),
  );
}

/** Work emails that are always admins and are created on their first sign-in. */
export function bootstrapAdminEmails(): string[] {
  return (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

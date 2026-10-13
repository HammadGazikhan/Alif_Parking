import "server-only";
import { AppError } from "@/server/errors";
import { entraTenantId } from "@/server/auth/entra";
import { acceptDirectoryPhone } from "@/lib/validations/employee";

export type DirectoryPerson = {
  /** Entra object id. Empty when the directory payload omitted it. */
  id: string;
  name: string;
  /** Lowercased work email (mail, falling back to userPrincipalName). */
  email: string;
  /** Mobile number, or the first business number, when it fits the employee form. */
  phone: string | null;
  jobTitle: string | null;
  /** Lowercased userPrincipalName; may differ from `email`. */
  upn: string;
};

type GraphUser = {
  id?: string | null;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  jobTitle?: string | null;
  mobilePhone?: string | null;
  businessPhones?: string[] | null;
};

const DIRECTORY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_MAX_BYTES = 200 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/gif"]);

export type DirectoryPhoto = { bytes: Uint8Array<ArrayBuffer>; contentType: string };

export class DirectoryUnavailableError extends AppError {
  constructor(message: string) {
    super(503, "DIRECTORY_UNAVAILABLE", message);
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function appAccessToken(): Promise<string> {
  const tenant = entraTenantId();
  const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  const clientSecret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
  if (!tenant || !clientId || !clientSecret) {
    throw new DirectoryUnavailableError(
      "Microsoft directory lookup is not configured. Set the AUTH_MICROSOFT_ENTRA_ID_* variables.",
    );
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("[directory] token request failed", res.status, await res.text().catch(() => ""));
    throw new DirectoryUnavailableError("Could not connect to the Microsoft directory. Check the app credentials.");
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/** Enabled member accounts in our tenant matching `search` by name or email. */
export async function searchDirectoryUsers(search: string, top = 50): Promise<DirectoryPerson[]> {
  const token = await appAccessToken();
  const url = new URL("https://graph.microsoft.com/v1.0/users");
  url.searchParams.set("$select", "id,displayName,mail,userPrincipalName,jobTitle,mobilePhone,businessPhones");
  url.searchParams.set("$filter", "accountEnabled eq true and userType eq 'Member'");
  url.searchParams.set("$count", "true");
  url.searchParams.set("$top", String(top));
  const term = search.replace(/["\\]/g, "").trim();
  if (term) {
    url.searchParams.set(
      "$search",
      `"displayName:${term}" OR "mail:${term}" OR "userPrincipalName:${term}"`,
    );
  } else {
    url.searchParams.set("$orderby", "displayName");
  }

  const res = await fetch(url, {
    // $search, $count and the userType filter are advanced queries.
    headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("[directory] user search failed", res.status, await res.text().catch(() => ""));
    if (res.status === 401 || res.status === 403) cachedToken = null;
    throw new DirectoryUnavailableError(
      res.status === 403
        ? "The app is missing the Microsoft Graph User.Read.All application permission (admin consent required)."
        : "Microsoft directory search failed. Please try again.",
    );
  }
  const json = (await res.json()) as { value?: GraphUser[] };
  return toDirectoryPeople(json.value ?? []);
}

export function toDirectoryPeople(users: GraphUser[]): DirectoryPerson[] {
  const people: DirectoryPerson[] = [];
  for (const u of users) {
    const upn = u.userPrincipalName?.trim().toLowerCase() ?? "";
    const email = u.mail?.trim().toLowerCase() || upn;
    if (!email || upn.includes("#ext#")) continue;
    const phone = acceptDirectoryPhone(u.mobilePhone) ?? acceptDirectoryPhone(u.businessPhones?.find((n) => n?.trim()));
    people.push({
      id: u.id?.trim() ?? "",
      name: u.displayName?.trim() || email,
      email,
      phone,
      jobTitle: u.jobTitle ?? null,
      upn: upn || email,
    });
  }
  return people.sort((a, b) => a.name.localeCompare(b.name));
}

/** Drops people whose mail or UPN already belongs to a portal user. */
export function excludeRegistered(people: DirectoryPerson[], registeredEmails: Iterable<string>): DirectoryPerson[] {
  const registered = new Set(Array.from(registeredEmails, (e) => e.toLowerCase()));
  return people.filter((p) => !registered.has(p.email) && !registered.has(p.upn));
}

function emailsOf(user: { mail?: string | null; userPrincipalName?: string | null }) {
  return [user.mail, user.userPrincipalName].flatMap((value) => {
    const email = value?.trim().toLowerCase();
    return email ? [email] : [];
  });
}

/**
 * The 48x48 Entra photo for `directoryId`, only when that account's mail or
 * sign-in address is `email`. Missing, oversized, or unexpected images are skipped.
 */
export async function directoryPhotoForEmail(directoryId: string, email: string): Promise<DirectoryPhoto | null> {
  if (!DIRECTORY_ID.test(directoryId)) return null;
  try {
    const token = await appAccessToken();
    const userUrl = new URL(`https://graph.microsoft.com/v1.0/users/${directoryId}`);
    userUrl.searchParams.set("$select", "mail,userPrincipalName");
    const userRes = await fetch(userUrl, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!userRes.ok) return null;
    const user = (await userRes.json()) as { mail?: string | null; userPrincipalName?: string | null };
    if (!emailsOf(user).includes(email.trim().toLowerCase())) return null;

    const photoRes = await fetch(`https://graph.microsoft.com/v1.0/users/${directoryId}/photos/48x48/$value`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!photoRes.ok) return null;
    const contentType = (photoRes.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!PHOTO_TYPES.has(contentType)) return null;
    const bytes = new Uint8Array(await photoRes.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > PHOTO_MAX_BYTES) return null;
    return { bytes, contentType };
  } catch (error) {
    console.error("[directory] photo lookup failed", error);
    return null;
  }
}

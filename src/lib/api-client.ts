export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiOptions = Omit<RequestInit, "body"> & { body?: unknown; query?: Record<string, unknown> };

function buildUrl(path: string, query?: Record<string, unknown>) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "" || value === "all") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Typed fetch wrapper for the app's `{ data } | { error }` API envelope. */
export async function api<T>(path: string, { body, query, headers, ...init }: ApiOptions = {}): Promise<T> {
  const res = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // non-JSON response
  }

  if (!res.ok) {
    const err = (payload as { error?: { code?: string; message?: string; fieldErrors?: FieldErrors } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "HTTP_ERROR",
      err?.message ?? `Request failed (${res.status})`,
      err?.fieldErrors,
    );
  }
  return (payload as { data: T }).data;
}

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

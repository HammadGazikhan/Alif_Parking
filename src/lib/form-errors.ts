import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api-client";

/** Push server-side field errors (422/409) into React Hook Form. Returns true if any were applied. */
export function applyFieldErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
  if (!(error instanceof ApiError) || !error.fieldErrors) return false;
  let applied = false;
  for (const [field, message] of Object.entries(error.fieldErrors)) {
    if (field === "_") continue;
    setError(field as Path<T>, { type: "server", message }, { shouldFocus: !applied });
    applied = true;
  }
  return applied;
}

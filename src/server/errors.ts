export type FieldErrors = Record<string, string>;

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You need to sign in to continue.") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Resource") {
    super(404, "NOT_FOUND", `${entity} not found.`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, fieldErrors?: FieldErrors) {
    super(409, "CONFLICT", message, fieldErrors);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: FieldErrors) {
    super(422, "VALIDATION_ERROR", message, fieldErrors);
  }
}

export function isUniqueConstraintError(error: unknown): error is { code: "P2002"; meta?: unknown } {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

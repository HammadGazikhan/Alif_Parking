import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, isUniqueConstraintError, ValidationError, type FieldErrors } from "@/server/errors";
import { searchParamsToObject } from "@/lib/validations/common";

export type ApiErrorBody = {
  error: { code: string; message: string; fieldErrors?: FieldErrors };
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

function zodFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function toErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json<ApiErrorBody>(
      { error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Please correct the highlighted fields.",
          fieldErrors: zodFieldErrors(error),
        },
      },
      { status: 422 },
    );
  }
  if (isUniqueConstraintError(error)) {
    return NextResponse.json<ApiErrorBody>(
      { error: { code: "CONFLICT", message: "A record with these details already exists." } },
      { status: 409 },
    );
  }
  console.error("[api] unhandled error", error);
  return NextResponse.json<ApiErrorBody>(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wrap a route handler with uniform error handling. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
  return schema.parse(body);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const url = new URL(req.url);
  return schema.parse(searchParamsToObject(url.searchParams));
}

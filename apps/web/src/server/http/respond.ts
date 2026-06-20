import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "../auth/session";
import { CsrfError } from "../guards/origin";

export type ApiError = { error: { code: string; message: string; details?: unknown } };

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(code: string, message: string, status: number, details?: unknown): NextResponse {
  return NextResponse.json<ApiError>({ error: { code, message, details } }, { status });
}

/** Wraps a handler, converting thrown ZodError/AuthError/unknown into clean JSON. */
export function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  return fn().catch((e) => {
    if (e instanceof ZodError) {
      return fail("VALIDATION_ERROR", "Invalid request", 400, e.flatten());
    }
    if (e instanceof AuthError) {
      const message = e.code === "FORBIDDEN" ? "Insufficient permissions" : "Authentication required";
      return fail(e.code, message, e.status);
    }
    if (e instanceof CsrfError) {
      return fail(e.code, e.message, e.status);
    }
    // Domain errors expose { status:number, code:string } (DuelError, conflicts…).
    if (
      e &&
      typeof e === "object" &&
      typeof (e as { status?: unknown }).status === "number" &&
      typeof (e as { code?: unknown }).code === "string"
    ) {
      const de = e as { status: number; code: string; message?: string };
      return fail(de.code, de.message ?? de.code, de.status);
    }
    console.error("[api] unhandled error", e);
    return fail("INTERNAL_ERROR", "Something went wrong", 500);
  });
}

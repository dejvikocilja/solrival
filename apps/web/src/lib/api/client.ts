/**
 * Thin fetch wrapper for our JSON API. Normalizes the server's
 * `{ error: { code, message, details } }` envelope into a typed ApiError so
 * callers can branch on `code` and surface `message` directly to the user.
 */

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", ...init });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Network error — check your connection and try again.", 0);
  }

  const data = (await res.json().catch(() => null)) as (T & ApiErrorBody) | null;

  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(
      err?.code ?? "REQUEST_FAILED",
      err?.message ?? "Something went wrong. Please try again.",
      res.status,
      err?.details,
    );
  }
  return data as T;
}

export function apiGet<T>(url: string): Promise<T> {
  return request<T>(url, { method: "GET" });
}

export function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
export const apiBaseUrl = (
  configuredBaseUrl || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  options: { signal?: AbortSignal; timeoutMs: number },
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
    options.timeoutMs,
  );
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = `Backend request failed (${response.status})`;
      try {
        const errorBody: unknown = await response.json();
        if (
          typeof errorBody === "object" &&
          errorBody !== null &&
          "detail" in errorBody &&
          typeof errorBody.detail === "string"
        ) {
          detail = errorBody.detail;
        }
      } catch {
        // Keep the status-based message for non-JSON error responses.
      }
      throw new ApiRequestError(detail, response.status);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (controller.signal.aborted && !options.signal?.aborted) {
      throw new ApiRequestError("Backend request timed out");
    }
    if (options.signal?.aborted) throw error;
    throw new ApiRequestError("Unable to reach the RetailFlow API");
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export function apiGet<T>(
  path: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  return requestJson<T>(
    path,
    { method: "GET", headers: { Accept: "application/json" } },
    { ...options, timeoutMs: options.timeoutMs ?? 5_000 },
  );
}

export function apiPost<TResponse, TRequest>(
  path: string,
  body: TRequest,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<TResponse> {
  return requestJson<TResponse>(
    path,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    { ...options, timeoutMs: options.timeoutMs ?? 10_000 },
  );
}

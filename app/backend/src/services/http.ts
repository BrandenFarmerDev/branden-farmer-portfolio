import type { ApiErrorResponse } from "@portfolio/shared";

export function errorResponse(
  status: number,
  error: string,
  message: string,
  fieldErrors?: ApiErrorResponse["fieldErrors"],
  headers?: HeadersInit,
): Response {
  return Response.json({ error, message, fieldErrors } satisfies ApiErrorResponse, { status, headers });
}

export function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashClient(request: Request, prefix: string): Promise<string> {
  const clientNetwork = request.headers.get("CF-Connecting-IP") ?? "local";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientNetwork));
  return `${prefix}:${toHex(digest)}`;
}

export async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export type BodyResult = { ok: true; text: string } | { ok: false; response: Response };

export async function readBody(request: Request, limit: number, requireJson = true): Promise<BodyResult> {
  if (requireJson && !request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: errorResponse(415, "unsupported_media_type", "Send the request as JSON.") };
  }
  if (Number(request.headers.get("Content-Length") ?? 0) > limit) {
    return { ok: false, response: errorResponse(413, "request_too_large", "The request is too large.") };
  }
  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > limit) {
        await reader.cancel();
        return { ok: false, response: errorResponse(413, "request_too_large", "The request is too large.") };
      }
      text += decoder.decode(value, { stream: true });
    }
    return { ok: true, text: text + decoder.decode() };
  } catch {
    return { ok: false, response: errorResponse(400, "invalid_request", "The request could not be read.") };
  } finally {
    reader.releaseLock();
  }
}

export async function readJson(request: Request, limit: number): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const body = await readBody(request, limit);
  if (!body.ok) return body;
  try {
    return { ok: true, value: JSON.parse(body.text) };
  } catch {
    return { ok: false, response: errorResponse(400, "invalid_json", "The request contains invalid JSON.") };
  }
}

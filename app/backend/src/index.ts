import { askRoute, askStatusRoute } from "./routes/ask";
import { calWebhookRoute } from "./routes/cal-webhook";
import { contactRoute } from "./routes/contact";
import { healthRoute } from "./routes/health";
import { ownerRoute } from "./routes/owner";
import { runMaintenance } from "./services/maintenance";
import type { Env } from "./types";

function isAllowedOrigin(request: Request, env: Env): boolean {
  const allowedOrigin = env.ALLOWED_ORIGIN ?? "http://localhost:5173";
  return request.headers.get("Origin") === allowedOrigin;
}

function addResponseHeaders(response: Response, request: Request, env: Env, requestId: string): Response {
  const origin = request.headers.get("Origin");
  const allowedOrigin = env.ALLOWED_ORIGIN ?? "http://localhost:5173";
  const headers = new Headers(response.headers);

  if (origin === allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  }

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Request-ID", requestId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function methodNotAllowed(allowed: string): Response {
  return Response.json(
    { error: "method_not_allowed", message: `Use ${allowed} for this endpoint.` },
    { status: 405, headers: { Allow: allowed } },
  );
}

function originForbidden(): Response {
  return Response.json({ error: "origin_forbidden", message: "This origin is not allowed." }, { status: 403 });
}

export default {
  async fetch(request, env): Promise<Response> {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      const response = isAllowedOrigin(request, env)
        ? new Response(null, { status: 204 })
        : originForbidden();
      const finalResponse = addResponseHeaders(response, request, env, requestId);
      console.info(JSON.stringify({ event: "request_complete", requestId, method: request.method, path: pathname, status: finalResponse.status, durationMs: Date.now() - startedAt }));
      return finalResponse;
    }

    let response: Response;

    try {
      if (pathname === "/api/health") {
        response = request.method === "GET" ? healthRoute() : methodNotAllowed("GET");
      } else if (pathname === "/api/ask/status") {
        if (request.method !== "GET") response = methodNotAllowed("GET");
        else response = isAllowedOrigin(request, env) ? await askStatusRoute(request, env) : originForbidden();
      } else if (pathname === "/api/contact" || pathname === "/api/ask") {
        if (request.method !== "POST") response = methodNotAllowed("POST");
        else if (!isAllowedOrigin(request, env)) response = originForbidden();
        else response = pathname === "/api/ask" ? await askRoute(request, env) : await contactRoute(request, env);
      } else if (pathname === "/api/webhooks/cal") {
        response = request.method === "POST" ? await calWebhookRoute(request, env) : methodNotAllowed("POST");
      } else if (pathname.startsWith("/api/owner/")) {
        response = await ownerRoute(request, env, pathname);
        response.headers.set("X-Robots-Tag", "noindex");
      } else {
        response = Response.json(
          { error: "not_found", message: "The requested API route does not exist." },
          { status: 404 },
        );
      }
    } catch {
      console.error(JSON.stringify({ event: "request_error", requestId, method: request.method, path: pathname }));
      response = Response.json(
        { error: "internal_error", message: "The service could not complete the request." },
        { status: 500 },
      );
    }

    const finalResponse = addResponseHeaders(response, request, env, requestId);
    console.info(JSON.stringify({ event: "request_complete", requestId, method: request.method, path: pathname, status: finalResponse.status, durationMs: Date.now() - startedAt }));
    return finalResponse;
  },
  scheduled(_event, env, ctx): void {
    ctx.waitUntil(runMaintenance(env).catch(() => {
      console.error(JSON.stringify({ event: "maintenance_error" }));
    }));
  },
} satisfies ExportedHandler<Env>;

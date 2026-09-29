import type { HealthResponse } from "@portfolio/shared";

export function healthRoute(): Response {
  const body: HealthResponse = {
    status: "ok",
    service: "portfolio-api",
    timestamp: new Date().toISOString(),
  };

  return Response.json(body);
}
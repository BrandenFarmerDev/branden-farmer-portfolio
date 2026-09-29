import type { ApiErrorResponse } from "@portfolio/shared";
import { integrationMessages } from "../services/integration-status";

export function askRoute(): Response {
  const body: ApiErrorResponse = {
    error: "not_configured",
    message: integrationMessages.ask,
  };

  return Response.json(body, { status: 501 });
}
import { corsHeaders } from "./cors.ts";

export { corsHeaders };

export function generateRequestId(): string {
  return crypto.randomUUID();
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, request_id: requestId } }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
        ...extraHeaders,
      },
    },
  );
}

export function successResponse(
  data: unknown,
  requestId: string,
): Response {
  return new Response(
    JSON.stringify({ data, request_id: requestId }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

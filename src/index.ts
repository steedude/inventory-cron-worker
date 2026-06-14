export interface Env {
  INVENTORY_APP_URL: string;
  INVENTORY_CRON_SECRET: string;
}

const LOW_STOCK_CHECK_PATH = "/api/inventory/low-stock-check";
const MAX_ERROR_BODY_LENGTH = 500;

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(checkLowStock(env));
  },

  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/run" && request.method === "POST") {
      const authError = authorizeRequest(request, env);

      if (authError !== null) {
        return authError;
      }

      try {
        const result = await checkLowStock(env);
        return Response.json({ ok: true, result });
      }
      catch (error) {
        console.error("Manual low stock check failed:", error);
        return Response.json(
          { ok: false, error: getErrorMessage(error) },
          { status: 502 },
        );
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function checkLowStock(env: Env): Promise<unknown> {
  validateEnv(env);

  const appUrl = normalizeBaseUrl(env.INVENTORY_APP_URL);
  const response = await fetch(`${appUrl}${LOW_STOCK_CHECK_PATH}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.INVENTORY_CRON_SECRET}`,
      "x-cron-secret": env.INVENTORY_CRON_SECRET,
    },
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Low stock check failed: ${response.status} ${formatResponseText(responseText)}`);
  }

  const result = parseResponse(responseText);
  console.log("Low stock check result:", result);
  return result;
}

function authorizeRequest(request: Request, env: Env): Response | null {
  if (!env.INVENTORY_CRON_SECRET) {
    return Response.json(
      { ok: false, error: "Missing INVENTORY_CRON_SECRET" },
      { status: 500 },
    );
  }

  const authorization = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const providedSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : cronHeader;

  if (providedSecret !== env.INVENTORY_CRON_SECRET) {
    return Response.json(
      { ok: false, error: "Unauthorized cron request" },
      { status: 401 },
    );
  }

  return null;
}

function validateEnv(env: Env) {
  if (!env.INVENTORY_APP_URL) {
    throw new Error("Missing INVENTORY_APP_URL");
  }

  if (!env.INVENTORY_CRON_SECRET) {
    throw new Error("Missing INVENTORY_CRON_SECRET");
  }
}

function parseResponse(responseText: string): unknown {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  }
  catch {
    return responseText;
  }
}

function formatResponseText(responseText: string) {
  const parsed = parseResponse(responseText);

  if (typeof parsed === "string") {
    return parsed.length > MAX_ERROR_BODY_LENGTH
      ? `${parsed.slice(0, MAX_ERROR_BODY_LENGTH)}...`
      : parsed;
  }

  return JSON.stringify(parsed);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown worker error";
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

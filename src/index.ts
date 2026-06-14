export interface Env {
  INVENTORY_APP_URL: string;
  INVENTORY_CRON_SECRET: string;
}

const LOW_STOCK_CHECK_PATH = "/api/inventory/low-stock-check";

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
      const result = await checkLowStock(env);
      return Response.json({ ok: true, result });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function checkLowStock(env: Env): Promise<unknown> {
  const appUrl = normalizeBaseUrl(env.INVENTORY_APP_URL);
  const response = await fetch(`${appUrl}${LOW_STOCK_CHECK_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.INVENTORY_CRON_SECRET}`,
    },
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Low stock check failed: ${response.status} ${responseText}`);
  }

  const result = responseText ? JSON.parse(responseText) : null;
  console.log("Low stock check result:", result);
  return result;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

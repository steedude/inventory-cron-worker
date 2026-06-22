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

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(createHomePage(), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
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

function createHomePage() {
  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Inventory Cron Worker</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Arial, "Noto Sans TC", sans-serif;
        color: #172033;
        background: #f6f8fb;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }

      main {
        width: min(92vw, 560px);
        padding: 32px;
        border: 1px solid #dce3ee;
        border-radius: 10px;
        background: #ffffff;
        box-shadow: 0 16px 40px rgb(23 32 51 / 10%);
      }

      h1 {
        margin: 0 0 8px;
        font-size: 24px;
      }

      p {
        margin: 0 0 24px;
        color: #5b667a;
        line-height: 1.6;
      }

      label {
        display: block;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 700;
      }

      input {
        box-sizing: border-box;
        width: 100%;
        height: 44px;
        padding: 0 12px;
        border: 1px solid #cfd8e6;
        border-radius: 8px;
        font-size: 15px;
      }

      button {
        width: 100%;
        height: 44px;
        margin-top: 14px;
        border: 0;
        border-radius: 8px;
        background: #2563eb;
        color: #ffffff;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
      }

      button:disabled {
        opacity: 0.7;
        cursor: wait;
      }

      pre {
        overflow: auto;
        min-height: 96px;
        margin: 20px 0 0;
        padding: 14px;
        border-radius: 8px;
        background: #111827;
        color: #e5e7eb;
        font-size: 13px;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Inventory Cron Worker</h1>
      <p>輸入 INVENTORY_CRON_SECRET 後，可以直接測試正式排程低庫存通知。</p>
      <form id="cron-form">
        <label for="secret">INVENTORY_CRON_SECRET</label>
        <input id="secret" name="secret" type="password" autocomplete="off" required>
        <button id="submit" type="submit">測試正式排程</button>
      </form>
      <pre id="result">等待測試...</pre>
    </main>
    <script>
      const form = document.querySelector("#cron-form");
      const button = document.querySelector("#submit");
      const result = document.querySelector("#result");

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        button.disabled = true;
        result.textContent = "執行中...";

        try {
          const secret = new FormData(form).get("secret");
          const response = await fetch("/run", {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + secret,
              "x-cron-secret": secret
            }
          });
          const text = await response.text();

          try {
            result.textContent = JSON.stringify(JSON.parse(text), null, 2);
          }
          catch {
            result.textContent = text;
          }
        }
        catch (error) {
          result.textContent = error instanceof Error ? error.message : "Unknown error";
        }
        finally {
          button.disabled = false;
        }
      });
    </script>
  </body>
</html>`;
}

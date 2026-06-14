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

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(createManualTestPage(), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/run" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${env.INVENTORY_CRON_SECRET}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

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

function createManualTestPage(): string {
  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Inventory Cron Worker</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      main {
        width: min(100%, 560px);
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 24px;
        background: #111827;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 24px;
      }
      p {
        color: #94a3b8;
        line-height: 1.7;
      }
      label {
        display: block;
        margin: 18px 0 8px;
        font-size: 14px;
        font-weight: 600;
      }
      input, button, pre {
        width: 100%;
        box-sizing: border-box;
      }
      input {
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 12px;
        background: #0f172a;
        color: #e2e8f0;
      }
      button {
        margin-top: 12px;
        border: 0;
        border-radius: 8px;
        padding: 12px 14px;
        background: #3b82f6;
        color: white;
        font-weight: 700;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: wait;
      }
      pre {
        min-height: 120px;
        overflow: auto;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 12px;
        background: #020617;
        color: #bfdbfe;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Inventory Cron Worker</h1>
      <p>輸入 Cloudflare Worker 的 <code>INVENTORY_CRON_SECRET</code>，手動觸發一次低庫存檢查。Secret 只會送到這個 Worker，不會存進頁面。</p>

      <label for="secret">Cron secret</label>
      <input id="secret" type="password" autocomplete="off" placeholder="INVENTORY_CRON_SECRET">
      <button id="run" type="button">手動檢查低庫存</button>

      <label for="result">Result</label>
      <pre id="result">尚未執行</pre>
    </main>

    <script>
      const button = document.querySelector("#run");
      const secretInput = document.querySelector("#secret");
      const result = document.querySelector("#result");

      button.addEventListener("click", async () => {
        const secret = secretInput.value.trim();
        if (!secret) {
          result.textContent = "請先輸入 INVENTORY_CRON_SECRET";
          return;
        }

        button.disabled = true;
        result.textContent = "檢查中...";

        try {
          const response = await fetch("/run", {
            method: "POST",
            headers: {
              Authorization: \`Bearer \${secret}\`,
            },
          });
          const text = await response.text();
          const body = text ? JSON.parse(text) : null;
          result.textContent = JSON.stringify(body, null, 2);
        } catch (error) {
          result.textContent = error instanceof Error ? error.message : String(error);
        } finally {
          button.disabled = false;
        }
      });
    </script>
  </body>
</html>`;
}

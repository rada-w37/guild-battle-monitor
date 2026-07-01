import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 5177);
const MAX_REQUEST_BYTES = 128 * 1024;
const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT_DIR, "public");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function validateDiscordWebhookUrl(rawUrl) {
  let webhookUrl;

  try {
    webhookUrl = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Discord Webhook URL の形式が不正です。" };
  }

  const allowedHosts = new Set(["discord.com", "discordapp.com"]);
  if (webhookUrl.protocol !== "https:" || !allowedHosts.has(webhookUrl.hostname)) {
    return { ok: false, reason: "Discord の HTTPS Webhook URL のみ送信できます。" };
  }

  if (webhookUrl.search || webhookUrl.hash) {
    return { ok: false, reason: "Webhook URL に query/hash は付けないでください。" };
  }

  const webhookPathPattern = /^\/api\/webhooks\/[^/]+\/[^/]+$/;
  if (!webhookPathPattern.test(webhookUrl.pathname)) {
    return { ok: false, reason: "Webhook URL は /api/webhooks/{id}/{token} 形式にしてください。" };
  }

  return { ok: true, url: webhookUrl.toString() };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function handleSend(request, response) {
  let body;

  try {
    body = JSON.parse(await readRequestBody(request));
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Request body を読み取れませんでした。",
    });
    return;
  }

  const validation = validateDiscordWebhookUrl(body.webhookUrl);
  if (!validation.ok) {
    sendJson(response, 400, { ok: false, error: validation.reason });
    return;
  }

  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    sendJson(response, 400, { ok: false, error: "payload object が必要です。" });
    return;
  }

  try {
    const discordResponse = await fetch(validation.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body.payload),
    });
    const responseBody = await discordResponse.text();

    sendJson(response, 200, {
      ok: discordResponse.ok,
      status: discordResponse.status,
      statusText: discordResponse.statusText,
      body: responseBody,
    });
  } catch (error) {
    sendJson(response, 502, {
      ok: false,
      error: error instanceof Error ? error.message : "Discord Webhook への送信に失敗しました。",
    });
  }
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const normalizedPath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, normalizedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not Found");
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/send") {
    await handleSend(request, response);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    await serveStatic(request, response);
    return;
  }

  response.writeHead(405, { Allow: "GET, HEAD, POST" });
  response.end("Method Not Allowed");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Discord Webhook Tester: http://127.0.0.1:${PORT}`);
});

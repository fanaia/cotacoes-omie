import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "./store.js";
import { createOmieClient } from "./omie-client.js";
import { PocService } from "./service.js";

const root = fileURLToPath(new URL("../public", import.meta.url));
const store = new JsonStore(process.env.DATA_FILE || "./data/store.json");
await store.load();
const service = new PocService(store, createOmieClient());

const json = (res, status, value) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); };
const body = async req => { const chunks=[]; for await (const chunk of req) chunks.push(chunk); return chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; };

export const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/health/ready") return json(res, 200, { status: "ready", mode: process.env.OMIE_MODE || "mock" });
    if (req.url === "/api/health/version") return json(res, 200, { name: "cotacoes-omie", version: "0.1.0" });
    if (req.url === "/api/state" && req.method === "GET") return json(res, 200, service.view());
    if (req.url === "/api/sync" && req.method === "POST") return json(res, 200, await service.sync());
    if (req.url === "/api/allocations" && req.method === "POST") return json(res, 201, await service.allocate(await body(req)));
    if (req.url === "/api/orders" && req.method === "POST") return json(res, 201, await service.createOrders());
    if (req.url === "/api/orders/track" && req.method === "POST") return json(res, 200, await service.trackOrders());
    if (req.url?.startsWith("/api/")) return json(res, 404, { error: "Rota não encontrada" });
    const requested = req.url === "/" ? "index.html" : req.url.split("?")[0].slice(1);
    const safe = normalize(requested).replace(/^(\.\.[/\\])+/, "");
    const file = join(root, safe);
    if (!file.startsWith(root)) return json(res, 403, { error: "Acesso negado" });
    const content = await readFile(file);
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }); res.end(content);
  } catch (error) { json(res, 400, { error: error.message }); }
});

if (process.env.NODE_ENV !== "test") server.listen(Number(process.env.PORT || 3000), () => console.log(`Oon Cotações POC em http://localhost:${process.env.PORT || 3000}`));

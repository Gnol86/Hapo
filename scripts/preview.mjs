import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
const port = Number(portArgument?.slice(7) ?? process.env.HAPO_PREVIEW_PORT ?? 8766);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Use --port=8766 or HAPO_PREVIEW_PORT with a valid TCP port.");
}

const routes = new Map([
  ["/", ["frontend/preview/index.html", "text/html; charset=utf-8"]],
  ["/preview.js", ["frontend/preview/preview.js", "text/javascript; charset=utf-8"]],
  ["/fixtures.js", ["frontend/preview/fixtures.js", "text/javascript; charset=utf-8"]],
  ["/icons.js", ["frontend/preview/icons.js", "text/javascript; charset=utf-8"]],
  ["/hapo-panel.js", ["custom_components/hapo/frontend/hapo-panel.js", "text/javascript; charset=utf-8"]],
]);

await stat(new URL("custom_components/hapo/frontend/hapo-panel.js", root)).catch(() => {
  throw new Error("The panel bundle is missing. Run npm run build first.");
});

const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const route = routes.get(path);
  if (!route || !["GET", "HEAD"].includes(request.method ?? "")) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  try {
    const content = await readFile(new URL(route[0], root));
    response.writeHead(200, {
      "Content-Type": route[1],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    console.error(`Cannot serve ${fileURLToPath(new URL(route[0], root))}: ${error.message}`);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Preview asset unavailable");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Hapo local preview: http://127.0.0.1:${port}/?lang=fr&theme=dark`);
  console.log("Fictional data only. No Home Assistant connection. Run npm run build after source edits.");
});
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close());
}

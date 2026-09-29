import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 教典ビューア（content/scripture/{id}/viewer/）をビルドなしで見るための小さな静的サーバー。
// リポジトリの content/scripture/ だけを配信する。Markdownを直したら、ブラウザを再読み込みすれば反映される。
//
//   node scripts/serve-scripture.mjs            既定ポート 4717（PORT で変更可）
//   node scripts/serve-scripture.mjs --book <id>

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servedDir = path.join(rootDir, "content", "scripture");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

export function startScriptureServer({ port = Number(process.env.PORT) || 4717, host = "127.0.0.1" } = {}) {
  const server = http.createServer((request, response) => {
    const urlPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    let filePath = path.normalize(path.join(servedDir, urlPath));
    if (!filePath.startsWith(servedDir)) {
      response.writeHead(403).end();
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, "index.html");
    if (!fs.existsSync(filePath)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": types[path.extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve({ server, origin: `http://${host}:${server.address().port}` }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const bookIndex = args.indexOf("--book");
  const bookId = bookIndex >= 0 ? args[bookIndex + 1] : "manzokukyo";
  const { origin } = await startScriptureServer();
  console.log(`総合入口: ${origin}/`);
  console.log(`教典ビューア: ${origin}/${bookId}/viewer/`);
  console.log("Markdownを直したら、ブラウザを再読み込みしてください。止めるときは Ctrl+C。");
}

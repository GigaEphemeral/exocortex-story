#!/usr/bin/env node
/**
 * 零依赖静态文件服务器：仅用于本地预览（非构建工具）。
 *
 * 用法（以下写法都支持，默认 5173）：
 *   npm start
 *   npm start -- --port 5555
 *   npm start --port 5555      # npm 会告警并作为位置参数传入，本脚本兼容
 *   node scripts/serve.mjs 5555
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_PORT = 5173;

/** 解析端口：--port=5555 / --port 5555 / -p 5555 / 位置参数 5555。 */
function parsePort(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    let value = null;
    if (arg.startsWith('--port=')) value = arg.slice('--port='.length);
    else if (arg === '--port' || arg === '-p') value = argv[index + 1];
    else if (/^\d+$/.test(arg)) value = arg;
    if (value == null) continue;

    const port = Number(value);
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
    console.error(`端口参数无效：${value}（应为 1–65535 的整数）`);
    process.exit(1);
  }
  return DEFAULT_PORT;
}

const PORT = parsePort(process.argv.slice(2));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

/** 防止路径穿越：解析后必须仍位于项目根目录内。 */
function resolveSafe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = resolve(join(ROOT, normalize(decoded)));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  // 先剥离查询串/哈希，再映射到文件；否则 /?debug=1 这类根路径会 404。
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  const urlPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = resolveSafe(urlPath);
  if (!filePath) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'content-type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 Not Found');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。`);
    console.error('换个端口重试：npm start -- --port 5555（或 npm start --port=5555）');
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`本地预览: http://127.0.0.1:${PORT}/`);
  console.log('按 Ctrl+C 停止。');
});

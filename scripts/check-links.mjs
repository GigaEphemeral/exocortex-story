#!/usr/bin/env node
/**
 * 前沿研究方向外链健康检查。
 *
 * 只发送 HTTP 请求确认状态码（不下载、不解析正文，避免把外部内容当作事实来源），
 * 用于部署前确认卡片里的 arXiv 摘要页仍然可访问。
 *
 * 用法：npm run check-links
 */
import { researchData } from '../src/config/research.js';

const TIMEOUT_MS = 20000;

const seen = new Set();
const entries = [];
for (const item of researchData) {
  for (const link of item.frontier ?? []) {
    if (!link?.url || seen.has(link.url)) continue;
    seen.add(link.url);
    entries.push({ stage: item.stage, title: link.title, url: link.url });
  }
}

async function probe(entry) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(entry.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'memory-narrative-link-check/1.0' },
    });
    // 只确认可访问，不读取正文。
    await response.body?.cancel();
    return { ...entry, status: response.status, ok: response.ok };
  } catch (error) {
    return { ...entry, status: 'ERR', ok: false, error: error?.message ?? String(error) };
  } finally {
    clearTimeout(timer);
  }
}

console.log(`检查 ${entries.length} 条前沿研究方向外链…\n`);
const results = await Promise.all(entries.map(probe));
let failures = 0;
for (const row of results) {
  if (!row.ok) failures += 1;
  console.log(`${row.ok ? 'OK  ' : 'FAIL'} ${String(row.status).padEnd(4)} stage ${row.stage}  ${row.url}`);
  console.log(`         ${row.title}${row.error ? ' — ' + row.error : ''}`);
}
console.log(`\n${results.length - failures}/${results.length} 条外链可访问。`);
if (failures > 0) process.exitCode = 1;

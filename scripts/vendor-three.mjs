#!/usr/bin/env node
/**
 * 把固定版本的 Three.js 下载到 vendor/，让页面可以在离线环境运行。
 * 不执行也能运行：页面会回退到 CDN（见 src/three/three.js）。
 * vendor/ 已加入 .gitignore —— 第三方运行时不属于本项目源码。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.169.0';
const CDN = `https://cdn.jsdelivr.net/npm/three@${VERSION}/build/three.module.js`;
const TARGET = resolve(fileURLToPath(new URL('../vendor/three.module.js', import.meta.url)));

const response = await fetch(CDN);
if (!response.ok) {
  console.error(`下载失败: ${response.status} ${response.statusText}`);
  process.exit(1);
}
const source = await response.text();
if (!/REVISION/.test(source)) {
  console.error('下载内容不是预期的 Three.js 构建产物，已中止。');
  process.exit(1);
}
await mkdir(resolve(TARGET, '..'), { recursive: true });
await writeFile(TARGET, source, 'utf8');
console.log(`已写入 ${TARGET}（${(source.length / 1024).toFixed(0)} KiB，three@${VERSION}）`);

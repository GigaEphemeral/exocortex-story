#!/usr/bin/env node
/**
 * 配置与结构校验：不启动浏览器，直接检查内容层是否满足需求。
 * 用法：npm run validate
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chapterCount, chapters, researchStageCount } from '../src/config/chapters.js';
import { getResearchStage, researchData } from '../src/config/research.js';
import { sceneStateKeys, sceneStates } from '../src/config/sceneStates.js';
import { cameraStateKeys, cameraStates } from '../src/config/cameraStates.js';
import { easingFunctions } from '../src/core/easing.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
let checks = 0;

function check(label, fn) {
  fn();
  checks += 1;
  console.log(`  ✓ ${label}`);
}

function readFileSyncSafe(path) {
  return readFileSync(path, 'utf8');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** 需求 5.4 固定的 14 个单元顺序。 */
const EXPECTED_IDS = [
  'reading',
  'camera-book',
  'encoding',
  'pattern-separation',
  'abstraction',
  'camera-computer',
  'digitization',
  'retrieval',
  'offline-replay',
  'reconsolidation',
  'forgetting',
  'camera-network-wide',
  'camera-brain-view',
  'digital-brain',
];

/** 需求 5.1.4 / 3.3 中的 12 种粒子布局。 */
const EXPECTED_LAYOUTS = [
  'bookPage',
  'lifted',
  'clusters',
  'concepts',
  'screen',
  'retrieval',
  'replay',
  'conflict',
  'archive',
  'networkWide',
  'brainSeed',
  'brain',
];

console.log('\n[1/5] 章节配置');
check('14 个内容单元，顺序与需求 5.4 一致', () => {
  assert.equal(chapterCount, 14);
  assert.deepEqual(chapters.map((item) => item.id), EXPECTED_IDS);
});

check('10 个学术阶段 + 4 个运镜阶段', () => {
  assert.equal(researchStageCount, 10);
  assert.equal(chapters.filter((item) => item.type === 'camera').length, 4);
  const researchStages = chapters.filter((item) => item.type === 'research').map((item) => item.stage);
  assert.deepEqual(researchStages, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

check('每个单元的字段齐全且类型正确', () => {
  for (const unit of chapters) {
    assert.ok(isNonEmptyString(unit.id), 'id 不能为空');
    assert.ok(unit.type === 'research' || unit.type === 'camera', `${unit.id}: type 非法`);
    assert.ok(isNonEmptyString(unit.title), `${unit.id}: title`);
    assert.ok(isNonEmptyString(unit.description), `${unit.id}: description`);
    assert.ok(Number.isFinite(unit.duration) && unit.duration > 0, `${unit.id}: duration`);
    assert.ok(Object.hasOwn(easingFunctions, unit.easing), `${unit.id}: easing 未定义`);
    assert.ok(unit.scrollHint === 'next' || unit.scrollHint === 'review', `${unit.id}: scrollHint`);
    assert.ok(unit.showResearchCard === (unit.type === 'research'), `${unit.id}: showResearchCard`);
  }
});

check('学术单元 researchId 与阶段数据一一对应', () => {
  for (const unit of chapters) {
    if (unit.type === 'research') {
      assert.equal(typeof unit.researchId, 'number', `${unit.id}: researchId`);
      const stage = getResearchStage(unit.researchId);
      assert.ok(stage, `${unit.id}: 找不到阶段 ${unit.researchId}`);
      assert.equal(stage.title, unit.title, `${unit.id}: 阶段标题不一致`);
      assert.equal(unit.visualNote, null, `${unit.id}: 学术单元不应有 visualNote`);
    } else {
      assert.equal(unit.researchId, null, `${unit.id}: 运镜单元 researchId 应为 null`);
      assert.ok(isNonEmptyString(unit.visualNote), `${unit.id}: 运镜单元需要 visualNote`);
    }
  }
});

check('章节之间视觉/摄像机状态首尾相接（可逆的基础）', () => {
  for (let index = 0; index < chapters.length - 1; index += 1) {
    const current = chapters[index];
    const next = chapters[index + 1];
    assert.equal(current.sceneTo, next.sceneFrom, `场景状态链断裂：${current.id} → ${next.id}`);
    assert.equal(current.cameraTo, next.cameraFrom, `摄像机状态链断裂：${current.id} → ${next.id}`);
  }
});

console.log('\n[2/5] 场景与摄像机状态');
check('场景状态字段与 sceneStateKeys 完全一致', () => {
  assert.ok(sceneStateKeys.length > 0);
  for (const [name, state] of Object.entries(sceneStates)) {
    assert.deepEqual(Object.keys(state).sort(), [...sceneStateKeys].sort(), `${name}: 字段集合不一致`);
    for (const key of sceneStateKeys) {
      if (key === 'layout') {
        assert.ok(EXPECTED_LAYOUTS.includes(state.layout), `${name}: 未知布局 ${state.layout}`);
      } else {
        assert.ok(Number.isFinite(state[key]), `${name}.${key} 必须是有限数字`);
      }
    }
  }
});

check('章节引用的场景状态都存在', () => {
  for (const unit of chapters) {
    assert.ok(sceneStates[unit.sceneFrom], `${unit.id}: sceneFrom ${unit.sceneFrom}`);
    assert.ok(sceneStates[unit.sceneTo], `${unit.id}: sceneTo ${unit.sceneTo}`);
  }
});

check('摄像机状态字段与引用完整', () => {
  for (const [name, state] of Object.entries(cameraStates)) {
    assert.deepEqual(Object.keys(state).sort(), [...cameraStateKeys].sort(), `${name}: 字段集合不一致`);
    for (const key of ['position', 'target']) {
      assert.equal(state[key].length, 3, `${name}.${key} 长度`);
      for (const value of state[key]) assert.ok(Number.isFinite(value), `${name}.${key} 数值`);
    }
    assert.ok(Number.isFinite(state.fov) && state.fov > 0, `${name}.fov`);
  }
  for (const unit of chapters) {
    assert.ok(cameraStates[unit.cameraFrom], `${unit.id}: cameraFrom`);
    assert.ok(cameraStates[unit.cameraTo], `${unit.id}: cameraTo`);
  }
});

check('全部 12 种粒子布局都被章节引用', () => {
  const used = new Set(Object.values(sceneStates).map((state) => state.layout));
  for (const layout of EXPECTED_LAYOUTS) assert.ok(used.has(layout), `布局未被使用：${layout}`);
});

console.log('\n[3/5] 研究数据');
check('10 个学术阶段，stage 0–9 连续', () => {
  assert.equal(researchData.length, 10);
  researchData.forEach((item, index) => assert.equal(item.stage, index));
});

check('每阶段文案字段完整', () => {
  for (const item of researchData) {
    assert.ok(isNonEmptyString(item.title), `stage ${item.stage}: title`);
    assert.ok(isNonEmptyString(item.question), `stage ${item.stage}: question`);
    assert.ok(isNonEmptyString(item.diff), `stage ${item.stage}: diff`);
    assert.ok(Array.isArray(item.open) && item.open.length >= 2, `stage ${item.stage}: 待验证问题至少 2 条`);
    for (const question of item.open) assert.ok(isNonEmptyString(question), `stage ${item.stage}: open 条目`);
    assert.ok(item.brain.length >= 2, `stage ${item.stage}: brain`);
    assert.ok(item.ai.length >= 2, `stage ${item.stage}: ai`);
    assert.ok(item.tags.length >= 1 && item.tags.length <= 8, `stage ${item.stage}: 词云关键词 1–8 个`);
    for (const tag of item.tags) assert.ok(isNonEmptyString(tag), `stage ${item.stage}: tag`);
  }
});

check('论文数据严守法务边界：verifiedUrl 全部为 null，不编造链接', () => {
  for (const item of researchData) {
    assert.ok(item.papers.length >= 1, `stage ${item.stage}: 至少一篇文献`);
    for (const paper of item.papers) {
      assert.ok(isNonEmptyString(paper.authors), `stage ${item.stage}: paper.authors`);
      assert.ok(Number.isInteger(paper.year) && paper.year > 1900 && paper.year < 2100, `stage ${item.stage}: paper.year`);
      assert.ok(isNonEmptyString(paper.title), `stage ${item.stage}: paper.title`);
      assert.ok(isNonEmptyString(paper.venue), `stage ${item.stage}: paper.venue`);
      assert.ok(isNonEmptyString(paper.note), `stage ${item.stage}: paper.note`);
      assert.equal(paper.verifiedUrl, null, `stage ${item.stage}: verifiedUrl 必须为 null`);
      assert.ok(!Object.hasOwn(paper, 'url'), `stage ${item.stage}: 不允许额外的 url 字段`);
      assert.ok(!/^https?:\/\//i.test(paper.verifiedUrl ?? ''), `stage ${item.stage}: 不允许链接`);
    }
  }
});

check('前沿研究方向外链均为合法的 https 地址（避免 javascript: 等注入）', () => {
  for (const item of researchData) {
    assert.ok(Array.isArray(item.frontier) && item.frontier.length >= 1, `stage ${item.stage}: 至少一条前沿链接`);
    for (const link of item.frontier) {
      assert.ok(isNonEmptyString(link.title), `stage ${item.stage}: frontier.title`);
      assert.ok(isNonEmptyString(link.note), `stage ${item.stage}: frontier.note`);
      assert.ok(Number.isInteger(link.year), `stage ${item.stage}: frontier.year`);
      const url = new URL(link.url);
      assert.equal(url.protocol, 'https:', `stage ${item.stage}: 外链必须是 https`);
      assert.ok(url.hostname.endsWith('arxiv.org'), `stage ${item.stage}: 外链应指向 arXiv 摘要页`);
    }
  }
});

console.log('\n[4/5] 入口与模块文件');
const REQUIRED_FILES = [
  'index.html',
  'src/main.js',
  'src/styles/main.css',
  'src/core/chapterMachine.js',
  'src/core/scrollController.js',
  'src/core/capabilities.js',
  'src/core/easing.js',
  'src/core/rng.js',
  'src/core/performance.js',
  'src/config/chapters.js',
  'src/config/research.js',
  'src/config/sceneStates.js',
  'src/config/cameraStates.js',
  'src/three/three.js',
  'src/three/createScene.js',
  'src/ui/createUI.js',
  'src/ui/renderResearchCard.js',
  'src/ui/fallback2d.js',
];

check('核心文件全部存在', () => {
  for (const file of REQUIRED_FILES) {
    assert.ok(existsSync(resolve(ROOT, file)), `缺少文件：${file}`);
  }
});

check('3D 与 UI 领域按模块拆分（每层至少 3 个源码文件）', () => {
  for (const dir of ['src/three', 'src/ui']) {
    const files = readdirSync(resolve(ROOT, dir)).filter((name) => name.endsWith('.js'));
    assert.ok(files.length >= 3, `${dir} 至少需要 3 个 .js 文件，实际 ${files.length} 个`);
  }
});

check('index.html 包含应用所需的 DOM 契约', () => {
  // 同步读取，保持 check 辅助函数简单
  const html = readFileSyncSafe(resolve(ROOT, 'index.html'));
  const requiredIds = [
    'app', 'hud', 'stage', 'scene-canvas', 'fallback-2d', 'panel', 'panel-scroll',
    'research-card', 'visual-note', 'progress-fill', 'stage-type', 'stage-index',
    'stage-caption', 'btn-prev', 'btn-next', 'chapter-dots', 'scroll-hint',
    'scroll-hint-text', 'notice', 'boot', 'boot-text',
  ];
  for (const id of requiredIds) {
    assert.ok(html.includes(`id="${id}"`), `index.html 缺少 #${id}`);
  }
  assert.ok(html.includes('type="module"') && html.includes('./src/main.js'), '入口脚本');
});

check('未使用 storyProgress * N 反推卡片索引（需求 5.2.3 禁止项）', () => {
  const sources = ['src/main.js', 'src/core/chapterMachine.js', 'src/ui/createUI.js'].map((file) =>
    readFileSyncSafe(resolve(ROOT, file)),
  );
  for (const source of sources) {
    assert.ok(!/storyProgress\s*\*\s*\d/.test(source), '禁止用 storyProgress 乘系数计算索引');
  }
});

console.log('\n[5/5] 文字边界');
check('页面文案不使用「已实现人脑记忆/意识」类断言', () => {
  const banned = [/完全复现了人脑/, /AI 已拥有.*意识/, /等同于人类记忆/];
  const corpus = researchData
    .map((item) => [item.diff, item.open, ...item.brain, ...item.ai].join(' '))
    .join(' ');
  for (const pattern of banned) {
    assert.ok(!pattern.test(corpus), `检测到越界表述：${pattern}`);
  }
});

console.log(`\n全部 ${checks} 项校验通过。\n`);

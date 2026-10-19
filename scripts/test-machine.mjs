#!/usr/bin/env node
/**
 * 章节状态机测试：不依赖浏览器，验证正反向、连续性、防连跳与确定性。
 * 用法：node scripts/test-machine.mjs（npm test 会先跑 validate）
 */
import assert from 'node:assert/strict';

import { chapters } from '../src/config/chapters.js';
import { sceneStates } from '../src/config/sceneStates.js';
import { createChapterMachine } from '../src/core/chapterMachine.js';

let passed = 0;
function test(label, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const durationOf = (index) => chapters[index].duration;

console.log('\n[状态机]');

test('初始状态停在第 0 个单元（progress=1）', () => {
  const machine = createChapterMachine({ chapters });
  const state = machine.getState();
  assert.equal(state.chapterIndex, 0);
  assert.equal(state.chapterProgress, 1);
  assert.equal(state.isTransitioning, false);
  assert.equal(state.storyProgress, 1 / 14);
});

test('正向推进：索引先切换，progress 从 0 增至 1', () => {
  const machine = createChapterMachine({ chapters });
  assert.equal(machine.requestStep(1), true);
  let state = machine.getState();
  assert.equal(state.chapterIndex, 1);
  assert.equal(state.chapterProgress, 0);
  assert.equal(state.phase, 'forward');

  machine.tick(durationOf(1) / 2);
  state = machine.getState();
  assert.ok(state.chapterProgress > 0 && state.chapterProgress < 1);

  machine.tick(durationOf(1));
  state = machine.getState();
  assert.equal(state.chapterIndex, 1);
  assert.equal(state.chapterProgress, 1);
  assert.equal(state.isTransitioning, false);
});

test('反向返回：索引保持，progress 从 1 沿原路径退回', () => {
  const machine = createChapterMachine({ chapters });
  machine.requestStep(1);
  machine.tick(durationOf(1) * 2);
  assert.equal(machine.getState().chapterIndex, 1);

  assert.equal(machine.requestStep(-1), true);
  let state = machine.getState();
  assert.equal(state.phase, 'backward');
  assert.equal(state.chapterIndex, 1);
  assert.equal(state.chapterProgress, 1);

  machine.tick(durationOf(1) / 2);
  state = machine.getState();
  assert.ok(state.chapterProgress > 0 && state.chapterProgress < 1);

  machine.tick(durationOf(1));
  state = machine.getState();
  assert.equal(state.chapterIndex, 0);
  assert.equal(state.chapterProgress, 1);
  assert.equal(state.isTransitioning, false);
});

test('相邻单元 sceneTo === sceneFrom，保证边界无跳变', () => {
  for (let index = 0; index < chapters.length - 1; index += 1) {
    assert.equal(chapters[index].sceneTo, chapters[index + 1].sceneFrom);
  }
});

test('正向与反向走同一条插值路径（对称）', () => {
  const duration = durationOf(1);
  const forward = createChapterMachine({ chapters });
  const backward = createChapterMachine({ chapters });
  forward.requestStep(1);
  backward.requestStep(1);
  backward.tick(duration * 2);
  assert.equal(backward.getState().chapterIndex, 1);
  backward.requestStep(-1);

  // 以相同时间步推进：bwd(progress) 应等于 1 - fwd(progress)（缓动函数关于 (0.5, 0.5) 对称）。
  const samples = 10;
  for (let index = 1; index < samples; index += 1) {
    const dt = duration / samples;
    forward.tick(dt);
    backward.tick(dt);
    const forwardProgress = forward.getState().chapterProgress;
    const backwardProgress = backward.getState().chapterProgress;
    assert.ok(
      Math.abs(backwardProgress - (1 - forwardProgress)) < 1e-9,
      `第 ${index} 步不对称：${forwardProgress} / ${backwardProgress}`,
    );
  }
  backward.tick(duration);
  assert.equal(backward.getState().chapterIndex, 0);
  assert.equal(backward.getState().chapterProgress, 1);
});

test('过渡中重复滚轮输入被忽略，不会跳章', () => {
  const machine = createChapterMachine({ chapters });
  machine.requestStep(1);
  const before = machine.getState().chapterIndex;
  assert.equal(machine.requestStep(1), false);
  assert.equal(machine.requestStep(1), false);
  assert.equal(machine.getState().chapterIndex, before);
  assert.equal(machine.getState().pendingDirection, 0);
});

test('过渡中最多缓存一个按钮方向，完成后只多走一步', () => {
  const machine = createChapterMachine({ chapters });
  machine.requestStep(1); // 0 → 1
  machine.requestStep(1, { queue: true });
  machine.requestStep(1, { queue: true });
  assert.equal(machine.getState().pendingDirection, 1);

  machine.tick(durationOf(1) * 2);
  let state = machine.getState();
  assert.equal(state.chapterIndex, 2);
  assert.equal(state.phase, 'forward');

  machine.tick(durationOf(2) * 2);
  state = machine.getState();
  assert.equal(state.chapterIndex, 2);
  assert.equal(state.chapterProgress, 1);
});

test('边界保护：首单元不能上翻，末单元不能下翻', () => {
  const machine = createChapterMachine({ chapters });
  assert.equal(machine.requestStep(-1), false);
  assert.equal(machine.getState().chapterIndex, 0);

  machine.requestJump(13);
  assert.equal(machine.requestStep(1), false);
  assert.equal(machine.getState().chapterIndex, 13);
  assert.equal(machine.getState().chapterProgress, 1);
});

test('chapterProgress 是纯函数：相同输入序列得到相同状态序列', () => {
  function run() {
    const machine = createChapterMachine({ chapters });
    const trace = [];
    machine.requestStep(1);
    for (let i = 0; i < 10; i += 1) {
      machine.tick(0.07);
      trace.push(machine.getState().chapterProgress);
    }
    machine.tick(2);
    machine.requestStep(-1);
    for (let i = 0; i < 10; i += 1) {
      machine.tick(0.06);
      trace.push(machine.getState().chapterProgress);
    }
    machine.tick(2);
    trace.push(machine.getState().chapterIndex, machine.getState().chapterProgress);
    return trace;
  }
  assert.deepEqual(run(), run());
});

test('显式跳转立即落到目标单元停留态', () => {
  const machine = createChapterMachine({ chapters });
  assert.equal(machine.requestJump(7), true);
  const state = machine.getState();
  assert.equal(state.chapterIndex, 7);
  assert.equal(state.chapterProgress, 1);
  assert.equal(state.isTransitioning, false);
  assert.equal(state.storyProgress, 8 / 14);
});

test('storyProgress 连续且落在 [0, 1]', () => {
  const machine = createChapterMachine({ chapters });
  let previous = machine.getState().storyProgress;
  assert.ok(previous > 0 && previous <= 1);
  machine.requestStep(1);
  for (let i = 0; i < 30; i += 1) {
    machine.tick(0.03);
    const current = machine.getState().storyProgress;
    assert.ok(current >= 0 && current <= 1);
    assert.ok(current >= previous - 1e-9, '正向推进时整体进度不应回退');
    previous = current;
  }
});

test('reduced-motion 下过渡变短但仍可完成', () => {
  const normal = createChapterMachine({ chapters });
  const reduced = createChapterMachine({ chapters, reducedMotion: true });
  normal.requestStep(1);
  reduced.requestStep(1);
  const dt = chapters[1].duration * 0.5;
  normal.tick(dt);
  reduced.tick(dt);
  assert.ok(reduced.getState().chapterProgress > normal.getState().chapterProgress);
  reduced.tick(dt * 2);
  assert.equal(reduced.getState().chapterProgress, 1);
  assert.equal(reduced.getState().isTransitioning, false);
});

test('每个章节引用的场景状态存在', () => {
  for (const unit of chapters) {
    assert.ok(sceneStates[unit.sceneFrom]);
    assert.ok(sceneStates[unit.sceneTo]);
  }
});

console.log(`\n状态机 ${passed} 项测试通过。\n`);

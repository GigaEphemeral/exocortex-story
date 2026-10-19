/**
 * 2D 降级视图（WebGL 不可用或 3D 初始化失败时使用）。
 *
 * 契约（docs/architecture.md 3.4 / memory_animation.md 8.4）：
 *   mountFallback({ chapters, research, reason }) => { dispose() }
 *
 * 特点：
 * - 在 #fallback-2d 内渲染降级原因、独立进度、锚点导航、静态内联 SVG 示意图；
 * - 展示全部 14 个内容单元：10 张完整研究卡片 + 4 个运镜说明，不新增学术阶段；
 * - 自动隐藏 #boot、给 document.body 加 is-fallback、隐藏 3D 界面（样式负责）；
 * - 不依赖 WebGL / Three.js，不发起任何网络请求，监听器全部可清理。
 */

import {
  findResearchData,
  pad2,
  renderResearchCard,
  renderVisualNote,
} from './renderResearchCard.js';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const PROGRESS_EPSILON = 0.002;

function el(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function prefersReducedMotion() {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches
    );
  } catch (error) {
    return false;
  }
}

/** 把任意 reason 归一化为可读的一行文字，不把 [object Object] 直接展示给用户。 */
function normalizeReason(reason) {
  if (reason == null || reason === '') {
    return '当前环境不支持 WebGL，或 3D 场景初始化失败，已切换到静态图文版本。';
  }
  if (typeof reason === 'string') return reason.trim() || '未知原因。';
  if (reason instanceof Error) return reason.message || reason.name || String(reason);
  if (typeof reason === 'object') {
    const message = reason.message || reason.reason || reason.error;
    if (typeof message === 'string' && message.trim()) return message.trim();
    if (message != null) return normalizeReason(message);
    try {
      return JSON.stringify(reason);
    } catch (error) {
      return String(reason);
    }
  }
  return String(reason);
}

/* -------------------------------------------------------------------------- */
/* 静态示意图（纯内联 SVG，无图片、无外部字库）                                */
/* -------------------------------------------------------------------------- */

const MAP_SVG = `
<svg class="fb-map__svg" viewBox="0 0 860 280" role="img" aria-labelledby="fb-map-title fb-map-desc">
  <title id="fb-map-title">从人类记忆到数字大脑的静态示意图</title>
  <desc id="fb-map-desc">左侧是阅读中的人与书，代表生物学机制；中间是电脑中的外置知识库，代表工程类比；右侧是由粒子构成的数字大脑概念图。三者只表示功能层面的比较，不代表实现机制相同。</desc>

  <g fill="none" stroke="#e2b97f" stroke-width="1.4" stroke-linecap="round" opacity="0.82">
    <circle cx="96" cy="88" r="20"/>
    <path d="M60 158c5-22 19-34 36-34s31 12 36 34"/>
    <path d="M58 172c20-9 56-9 76 0v14H58z" fill="#e2b97f" fill-opacity="0.1" stroke-opacity="0.5"/>
    <path d="M58 180c18-5 40-5 58 0M58 186c20-5 48-5 70 0" stroke-opacity="0.36"/>
    <path d="M136 166c16-6 34-4 43 6" stroke-opacity="0.5"/>
  </g>
  <text x="96" y="222" text-anchor="middle" fill="#e7d3ae" font-size="16">人类记忆</text>
  <text x="96" y="243" text-anchor="middle" fill="#b99b74" font-size="12">生物学机制</text>

  <g fill="none" stroke="#8fa7bb" stroke-width="1.2" opacity="0.5" stroke-linecap="round">
    <path d="M178 140h42" stroke-dasharray="4 6"/>
    <path d="M216 135l8 5-8 5"/>
  </g>

  <g fill="none" stroke="#6cc6f5" stroke-width="1.4" opacity="0.85" stroke-linecap="round">
    <rect x="258" y="66" width="176" height="112" rx="8" fill="#0b1626" fill-opacity="0.55"/>
    <path d="M276 92h76M276 110h124M276 128h98M276 146h62" stroke-opacity="0.55"/>
    <path d="M292 158h30M330 158h22" stroke-opacity="0.32"/>
  </g>
  <text x="346" y="222" text-anchor="middle" fill="#b9d9ef" font-size="16">AI 外置知识库</text>
  <text x="346" y="243" text-anchor="middle" fill="#7fb6d8" font-size="12">工程类比</text>

  <g fill="none" stroke="#8fa7bb" stroke-width="1.2" opacity="0.5" stroke-linecap="round">
    <path d="M440 122h44" stroke-dasharray="4 6"/>
    <path d="M480 117l8 5-8 5"/>
  </g>

  <g fill="none" stroke="#7fd8ff" stroke-width="1" opacity="0.4">
    <path d="M520 128l38-28 42 24 32-32 36 28 28-12"/>
    <path d="M558 100v54M600 124v38M632 92v58M668 120v38M696 108v30"/>
  </g>
  <g fill="#9fd2f2">
    <circle cx="520" cy="128" r="2.6"/><circle cx="558" cy="100" r="2.8"/><circle cx="600" cy="124" r="2.4"/>
    <circle cx="632" cy="92" r="2.6"/><circle cx="668" cy="120" r="2.4"/><circle cx="696" cy="108" r="2.2"/>
    <circle cx="558" cy="154" r="2"/><circle cx="600" cy="162" r="2"/><circle cx="632" cy="150" r="2"/>
    <circle cx="668" cy="158" r="1.8"/><circle cx="696" cy="138" r="1.8"/>
  </g>

  <g fill="none" stroke="#6cc6f5" stroke-width="1.3" opacity="0.72" stroke-linecap="round">
    <path d="M766 70c-28-6-55 9-61 35-6 27 11 53 39 58 10 2 20 0 28-4"/>
    <path d="M766 70c28-6 55 9 61 35 6 27-11 53-39 58-10 2-20 0-28-4"/>
    <path d="M766 70v99" stroke-dasharray="2 7" opacity="0.45"/>
  </g>
  <g fill="#9fd2f2">
    <circle cx="736" cy="94" r="2.2"/><circle cx="750" cy="84" r="1.8"/><circle cx="724" cy="118" r="2"/>
    <circle cx="744" cy="122" r="2.4"/><circle cx="732" cy="148" r="1.8"/><circle cx="758" cy="110" r="1.8"/>
    <circle cx="786" cy="92" r="2"/><circle cx="802" cy="114" r="2.2"/><circle cx="790" cy="138" r="1.8"/>
    <circle cx="806" cy="148" r="1.8"/><circle cx="772" cy="128" r="2.4"/><circle cx="766" cy="156" r="1.8"/>
    <circle cx="750" cy="70" r="1.6"/><circle cx="784" cy="72" r="1.6"/>
  </g>
  <text x="772" y="222" text-anchor="middle" fill="#cfe7f8" font-size="16">数字大脑</text>
  <text x="772" y="243" text-anchor="middle" fill="#7fb6d8" font-size="12">概念表达 · 非机制复制</text>

  <text x="430" y="272" text-anchor="middle" fill="#7f91a5" font-size="12">示意图：功能层面可比，物理载体与实现机制不同</text>
</svg>
`;

function buildMapFigure() {
  const figure = el('figure', 'fb-map');
  const holder = document.createElement('div');
  holder.className = 'fb-map__holder';
  holder.innerHTML = MAP_SVG;
  if (holder.firstElementChild) figure.append(holder.firstElementChild);

  const caption = el(
    'figcaption',
    'fb-map__caption',
    '静态示意图：从左到右依次是阅读中的人脑（生物学机制）、外置知识库（工程类比）与数字大脑（概念表达）。功能可比，机制不同。',
  );
  figure.append(caption);

  const legend = el('ul', 'fb-map__legend');
  [
    ['warm', '人类记忆 · 生物学机制'],
    ['cool', 'AI 外置知识库 · 工程类比'],
    ['cyan', '数字大脑 · 概念表达'],
  ].forEach(([tone, text]) => {
    const item = el('li', 'fb-map__legend-item');
    const dot = el('span', `fb-map__dot fb-map__dot--${tone}`);
    dot.setAttribute('aria-hidden', 'true');
    item.append(dot, document.createTextNode(text));
    legend.append(item);
  });
  figure.append(legend);

  return figure;
}

/* -------------------------------------------------------------------------- */
/* 单元内容                                                                    */
/* -------------------------------------------------------------------------- */

function buildUnit(unit, index, total, research, researchTotal) {
  const isCamera = unit.type === 'camera';
  const section = el('section', `fb-unit${isCamera ? ' fb-unit--camera' : ''}`);
  section.id = `fb-unit-${pad2(index + 1)}`;
  section.tabIndex = -1;
  section.dataset.unitType = isCamera ? 'camera' : 'research';

  const card = isCamera
    ? renderVisualNote({ chapter: unit, index, total, fallback: true })
    : renderResearchCard({
        chapter: unit,
        data: findResearchData(research, unit.researchId ?? unit.stage),
        index,
        total,
        researchTotal,
        expanded: true,
      });

  const heading = card.querySelector('.rc-title, .visual-note__title');
  if (heading) {
    heading.id = `fb-unit-${pad2(index + 1)}-title`;
    section.setAttribute('aria-labelledby', heading.id);
  } else {
    section.setAttribute('aria-label', `第 ${pad2(index + 1)} 个内容单元：${unit.title || '未命名'}`);
  }

  section.append(card);
  return section;
}

/* -------------------------------------------------------------------------- */
/* 挂载                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} options
 * @param {Array} options.chapters 14 个内容单元
 * @param {Array} options.research 10 个学术阶段（researchData）
 * @param {string|Error} [options.reason] 3D 不可用的原因
 * @returns {{dispose: () => void}}
 */
export function mountFallback({ chapters = [], research = [], reason = '' } = {}) {
  const units = Array.isArray(chapters) ? chapters.filter(Boolean) : [];
  const total = units.length;
  const researchTotal = units.filter((unit) => unit && unit.type === 'research').length || 10;

  let container = document.getElementById('fallback-2d');
  let createdContainer = false;
  if (!container) {
    container = el('div', 'fallback');
    container.id = 'fallback-2d';
    document.body.append(container);
    createdContainer = true;
  }

  const body = document.body;
  const boot = document.getElementById('boot');
  const app = document.getElementById('app');
  const skipLink = document.querySelector('.skip-link');
  const previous = {
    hadFallbackClass: body.classList.contains('is-fallback'),
    bootHidden: boot ? boot.hidden : null,
    fallbackHidden: container.hidden,
    appBusy: app ? app.getAttribute('aria-busy') : null,
    skipHref: skipLink ? skipLink.getAttribute('href') : null,
  };

  body.classList.add('is-fallback');
  container.hidden = false;
  if (boot) boot.hidden = true;
  if (app) app.setAttribute('aria-busy', 'false');
  if (skipLink) skipLink.setAttribute('href', '#fb-main');

  /* ------------------------------ 头部 ------------------------------ */

  let progressFill = null;
  let progressBar = null;
  let progressText = null;

  const header = el('header', 'fb-head');
  header.id = 'fb-top';
  header.append(el('p', 'fb-head__kicker', '2D 阅读模式 · 无需 WebGL'));
  header.append(el('h1', 'fb-head__title', '从人类记忆到数字大脑'));
  header.append(
    el(
      'p',
      'fb-head__subtitle',
      '人脑知识体系 · AI 外置知识库 · 功能类比与机制差异',
    ),
  );

  const reasonBox = el('div', 'fb-head__reason');
  reasonBox.append(el('span', 'fb-head__reason-tag', '降级原因'));
  reasonBox.append(el('p', 'fb-head__reason-text', normalizeReason(reason)));
  header.append(reasonBox);

  progressBar = el('div', 'fb-progress');
  progressBar.setAttribute('role', 'progressbar');
  progressBar.setAttribute('aria-label', '2D 阅读进度');
  progressBar.setAttribute('aria-valuemin', '0');
  progressBar.setAttribute('aria-valuemax', '100');
  progressBar.setAttribute('aria-valuenow', '0');
  progressFill = el('span', 'fb-progress__fill');
  progressBar.append(progressFill);
  header.append(progressBar);

  progressText = el('p', 'fb-head__progress-text', '阅读进度 0%');
  header.append(progressText);

  header.append(
    el(
      'p',
      'fb-head__note',
      `此页面是静态图文版本，包含与 3D 版本相同的 ${total || 14} 个内容单元与 ${researchTotal} 张研究卡片；所有内容均可直接阅读、打印或键盘导航。`,
    ),
  );

  /* ------------------------------ 锚点导航 ------------------------------ */

  const nav = el('nav', 'fb-nav');
  nav.setAttribute('aria-label', '2D 模式内容单元导航');
  const navTrack = el('div', 'fb-nav__track');
  units.forEach((unit, index) => {
    const isCamera = unit.type === 'camera';
    const link = document.createElement('a');
    link.className = 'fb-nav__link' + (isCamera ? ' fb-nav__link--camera' : '');
    link.href = `#fb-unit-${pad2(index + 1)}`;
    link.dataset.target = `fb-unit-${pad2(index + 1)}`;
    link.append(el('span', 'fb-nav__num', pad2(index + 1)));
    link.append(el('span', 'fb-nav__label', unit.title || '未命名'));
    if (isCamera) link.append(el('span', 'fb-nav__kind', '视觉过渡'));
    navTrack.append(link);
  });
  nav.append(navTrack);

  /* ------------------------------ 主体 ------------------------------ */

  const main = el('main', 'fb-main');
  main.id = 'fb-main';
  main.tabIndex = -1;
  main.append(buildMapFigure());

  if (units.length) {
    units.forEach((unit, index) => {
      main.append(buildUnit(unit, index, total, research, researchTotal));
    });
  } else {
    main.append(el('p', 'fb-empty', '内容配置未加载，暂时无法显示研究卡片。'));
  }

  main.append(
    el(
      'p',
      'fb-disclaimer',
      '视觉与图示均为概念表达。人脑与 AI 外置知识系统可以在编码、关联、检索、更新与筛选等功能层面比较，但物理载体、学习过程与记忆机制并不相同。',
    ),
  );

  /* ------------------------------ 页脚 ------------------------------ */

  const footer = el('footer', 'fb-foot');
  footer.append(
    el(
      'p',
      'fb-foot__note',
      '2D 降级模式 · 不依赖 WebGL · 不加载外部字体、图片或网络资源',
    ),
  );
  const topButton = el('button', 'fb-foot__top', '↑ 回到顶部');
  topButton.type = 'button';
  footer.append(topButton);

  /* ------------------------------ 组装 ------------------------------ */

  const shell = el('div', 'fb-shell');
  shell.append(header, nav, main, footer);
  container.replaceChildren(shell);

  /* ------------------------------ 进度与导航 ------------------------------ */

  let rafId = 0;
  let lastRatio = -1;

  function updateProgress() {
    rafId = 0;
    if (!progressFill || !progressBar || !progressText) return;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, container.scrollTop / maxScroll)) : 0;
    const forced = lastRatio < 0 || (ratio === 1 && lastRatio !== 1) || (ratio === 0 && lastRatio !== 0);
    if (!forced && Math.abs(ratio - lastRatio) < PROGRESS_EPSILON) return;
    lastRatio = ratio;
    progressFill.style.width = `${(ratio * 100).toFixed(2)}%`;
    const percent = Math.round(ratio * 100);
    progressBar.setAttribute('aria-valuenow', String(percent));
    progressText.textContent = `阅读进度 ${percent}%`;
  }

  function scheduleProgress() {
    if (rafId) return;
    rafId = requestAnimationFrame(updateProgress);
  }

  function onNavClick(event) {
    const link = event.target instanceof Element ? event.target.closest('.fb-nav__link') : null;
    if (!link) return;
    const targetId = link.dataset.target;
    const target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;
    event.preventDefault();
    try {
      target.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
      target.focus({ preventScroll: true });
    } catch (error) {
      container.scrollTop = target.offsetTop || 0;
    }
  }

  function onBackToTop() {
    try {
      container.scrollTo({
        top: 0,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    } catch (error) {
      container.scrollTop = 0;
    }
  }

  function onResize() {
    scheduleProgress();
  }

  container.addEventListener('scroll', scheduleProgress, { passive: true });
  nav.addEventListener('click', onNavClick);
  topButton.addEventListener('click', onBackToTop);
  window.addEventListener('resize', onResize, { passive: true });

  updateProgress();

  /* ------------------------------ 清理 ------------------------------ */

  function dispose() {
    container.removeEventListener('scroll', scheduleProgress);
    nav.removeEventListener('click', onNavClick);
    topButton.removeEventListener('click', onBackToTop);
    window.removeEventListener('resize', onResize);
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }

    container.replaceChildren();
    container.hidden = previous.fallbackHidden ?? true;
    if (createdContainer && container.parentNode) container.parentNode.removeChild(container);

    if (!previous.hadFallbackClass) body.classList.remove('is-fallback');
    if (boot && previous.bootHidden != null) boot.hidden = previous.bootHidden;
    if (app && previous.appBusy != null) app.setAttribute('aria-busy', previous.appBusy);
    if (skipLink && previous.skipHref != null) skipLink.setAttribute('href', previous.skipHref);

    progressFill = null;
    progressBar = null;
    progressText = null;
  }

  return { dispose };
}

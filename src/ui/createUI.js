/**
 * 界面层入口：HUD、研究卡片、词云、论文、导航、滚动提示、进度与通知。
 *
 * 契约见 docs/architecture.md 3.4：
 *   createUI({ chapters, research, onStep, onJump }) => {
 *     showChapter(index), setProgress(ratio), setLocked(locked),
 *     setReducedMotion(reduced), canScrollCard(direction, eventTarget),
 *     setNotice(message | null), dispose(),
 *   }
 *
 * 说明：
 * - showChapter 只在章节变化时调用（本模块内部也会去重）；
 * - setProgress 每帧调用，DOM 写入按 0.2% 步长节流；
 * - 界面不自行判断状态机：上一章/下一章只调用 onStep(-1 / 1)，章节点只调用 onJump(index)。
 */

import {
  findResearchData,
  pad2,
  renderResearchCard,
  renderVisualNote,
} from './renderResearchCard.js';

const MOBILE_QUERY = '(max-width: 860px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const PROGRESS_EPSILON = 0.002; // 0.2%

function byId(id) {
  return typeof document === 'undefined' ? null : document.getElementById(id);
}

function mediaQuery(query) {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia(query);
    }
  } catch (error) {
    /* 环境不支持 matchMedia 时使用安全回退 */
  }
  return {
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  };
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 兼容旧版 Safari：matchMedia 只提供 addListener / removeListener。 */
function addMediaListener(media, handler) {
  if (!media) return;
  if (typeof media.addEventListener === 'function') media.addEventListener('change', handler);
  else if (typeof media.addListener === 'function') media.addListener(handler);
}

function removeMediaListener(media, handler) {
  if (!media) return;
  if (typeof media.removeEventListener === 'function') media.removeEventListener('change', handler);
  else if (typeof media.removeListener === 'function') media.removeListener(handler);
}

export function createUI({
  chapters = [],
  research = [],
  onStep = null,
  onJump = null,
} = {}) {
  const units = Array.isArray(chapters) ? chapters.filter(Boolean) : [];
  const total = units.length;
  const researchTotal = units.filter((unit) => unit && unit.type === 'research').length || 10;
  const step = typeof onStep === 'function' ? onStep : () => false;
  const jump = typeof onJump === 'function' ? onJump : () => false;

  const els = {
    app: byId('app'),
    hudStage: document.querySelector ? document.querySelector('.hud__stage') : null,
    stageType: byId('stage-type'),
    stageIndex: byId('stage-index'),
    stageCaption: byId('stage-caption'),
    progressBar: document.querySelector ? document.querySelector('.hud .progress') : null,
    progressFill: byId('progress-fill'),
    stage: byId('stage'),
    stageBadge: byId('stage-badge'),
    panel: byId('panel'),
    panelScroll: byId('panel-scroll'),
    researchCard: byId('research-card'),
    visualNote: byId('visual-note'),
    prevBtn: byId('btn-prev'),
    nextBtn: byId('btn-next'),
    dots: byId('chapter-dots'),
    hint: byId('scroll-hint'),
    hintArrow: byId('scroll-hint-arrow'),
    hintText: byId('scroll-hint-text'),
    notice: byId('notice'),
    skipLink: document.querySelector ? document.querySelector('.skip-link') : null,
  };

  const mobileMedia = mediaQuery(MOBILE_QUERY);
  const reducedMedia = mediaQuery(REDUCED_MOTION_QUERY);
  const originalSkipHref = els.skipLink ? els.skipLink.getAttribute('href') : null;

  let currentIndex = -1;
  let lastRatio = -1;
  let lastAriaNow = -1;
  let lastHintKey = '';
  let reducedMotion = Boolean(reducedMedia.matches);
  let destroyed = false;

  function prefersReduced() {
    return reducedMotion;
  }

  /* ---------------------------------------------------------------------- */
  /* 导航：14 个章节点                                                       */
  /* ---------------------------------------------------------------------- */

  function buildDots() {
    if (!els.dots) return;
    const fragment = document.createDocumentFragment();
    units.forEach((unit, index) => {
      const isCamera = unit.type === 'camera';
      const kindLabel = isCamera ? '视觉过渡' : '研究阶段';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav__dot' + (isCamera ? ' nav__dot--camera' : '');
      button.dataset.index = String(index);
      button.tabIndex = -1;
      const label = `第 ${pad2(index + 1)} 个内容单元：${unit.title || '未命名'}（${kindLabel}）`;
      button.setAttribute('aria-label', label);
      button.title = label;

      const mark = document.createElement('span');
      mark.className = 'nav__dot-mark';
      mark.setAttribute('aria-hidden', 'true');
      button.append(mark);
      fragment.append(button);
    });
    els.dots.replaceChildren(fragment);
  }

  function onDotsClick(event) {
    const target = event.target instanceof Element ? event.target.closest('.nav__dot') : null;
    if (!target || !els.dots || !els.dots.contains(target)) return;
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= units.length) return;
    jump(index);
  }

  function onDotsKeydown(event) {
    if (!els.dots) return;
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(els.dots.querySelectorAll('.nav__dot'));
    if (!buttons.length) return;
    const active = document.activeElement;
    const from = buttons.indexOf(active);
    if (from === -1) return;

    event.preventDefault();
    let next = from;
    if (event.key === 'ArrowRight') next = Math.min(buttons.length - 1, from + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, from - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;

    buttons.forEach((button, index) => {
      button.tabIndex = index === next ? 0 : -1;
    });
    buttons[next].focus();
  }

  function onPrevClick() {
    if (destroyed) return;
    step(-1);
  }

  function onNextClick() {
    if (destroyed) return;
    step(1);
  }

  /* ---------------------------------------------------------------------- */
  /* 滚动提示（需求 4.4）                                                    */
  /* ---------------------------------------------------------------------- */

  function hintContent(index) {
    const mobile = Boolean(mobileMedia.matches);
    const isFirst = index <= 0;
    const isLast = total > 0 && index >= total - 1;

    if (mobile) {
      if (isFirst) return { arrow: '↑', text: '上滑继续探索' };
      if (isLast) return { arrow: '↓', text: '下滑返回上一阶段 · 已到达故事终点' };
      return { arrow: '↑↓', text: '上滑继续探索 / 下滑返回上一阶段' };
    }
    if (isFirst) return { arrow: '↓', text: '向下滚动，开始探索' };
    if (isLast) return { arrow: '↑', text: '向上滚动，回顾整个知识演化过程' };
    return { arrow: '↑↓', text: '向下滚动，继续探索 / 向上滚动，返回上一阶段' };
  }

  function updateHint(index) {
    if (!els.hint) return;
    const hint = hintContent(index);
    const key = `${index}:${mobileMedia.matches ? 'm' : 'd'}`;
    if (key === lastHintKey) return;
    lastHintKey = key;

    if (els.hintArrow) els.hintArrow.textContent = hint.arrow;
    if (els.hintText) els.hintText.textContent = hint.text;
    els.hint.classList.toggle('is-first', index <= 0);
    els.hint.classList.toggle('is-last', total > 0 && index >= total - 1);
    els.hint.classList.toggle('is-middle', index > 0 && index < total - 1);
  }

  function onMediaChange() {
    if (destroyed) return;
    lastHintKey = '';
    if (currentIndex >= 0) updateHint(currentIndex);
  }

  function onReducedMotionChange(event) {
    setReducedMotion(Boolean(event.matches));
  }

  /* ---------------------------------------------------------------------- */
  /* 卡片动画（装饰性，遵循 reduced motion）                                 */
  /* ---------------------------------------------------------------------- */

  function animateCardIn(node) {
    if (!node || prefersReduced() || typeof node.animate !== 'function') return;
    try {
      node.animate(
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 340, easing: 'cubic-bezier(0.22, 0.68, 0.2, 1)' },
      );
    } catch (error) {
      /* 动画失败不影响功能 */
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 章节切换                                                                */
  /* ---------------------------------------------------------------------- */

  function showChapter(index) {
    if (destroyed || !units.length) return;
    const parsed = Number(index);
    if (!Number.isFinite(parsed)) return;
    const nextIndex = Math.min(units.length - 1, Math.max(0, Math.trunc(parsed)));
    if (nextIndex === currentIndex) return;

    const unit = units[nextIndex];
    const isCamera = unit.type === 'camera';
    const kindLabel = isCamera ? '视觉过渡' : '研究阶段';

    const activeBefore = document.activeElement;
    const cardHadFocus = Boolean(
      activeBefore &&
        ((els.researchCard && els.researchCard.contains(activeBefore)) ||
          (els.visualNote && els.visualNote.contains(activeBefore))),
    );

    currentIndex = nextIndex;

    // 顶部 HUD：类别 + 编号（按全部 14 个内容单元计算）+ 标题
    if (els.stageType) els.stageType.textContent = `${kindLabel} ·`;
    if (els.stageIndex) els.stageIndex.textContent = `${pad2(nextIndex + 1)} / ${pad2(total)}`;
    if (els.stageCaption) els.stageCaption.textContent = unit.title || '';
    if (els.hudStage) els.hudStage.setAttribute('aria-label', `${kindLabel} ${pad2(nextIndex + 1)} / ${pad2(total)}`);

    if (els.app) {
      els.app.dataset.chapterType = isCamera ? 'camera' : 'research';
    }

    if (els.stageBadge) {
      if (isCamera) {
        els.stageBadge.hidden = false;
        els.stageBadge.textContent = `视觉过渡 · ${pad2(nextIndex + 1)} / ${pad2(total)}`;
      } else {
        els.stageBadge.hidden = true;
        els.stageBadge.textContent = '视觉过渡';
      }
    }

    if (els.panel) {
      els.panel.setAttribute(
        'aria-label',
        `${kindLabel} ${pad2(nextIndex + 1)} / ${pad2(total)}：${unit.title || '内容单元'}`,
      );
    }

    // 右侧内容：研究卡片或运镜说明（二者互斥）
    if (isCamera) {
      if (els.researchCard) {
        els.researchCard.hidden = true;
        els.researchCard.replaceChildren();
      }
      if (els.visualNote) {
        els.visualNote.hidden = false;
        els.visualNote.replaceChildren(
          renderVisualNote({ chapter: unit, index: nextIndex, total }),
        );
        animateCardIn(els.visualNote);
      }
    } else {
      const data = findResearchData(research, unit.researchId ?? unit.stage);
      if (els.visualNote) {
        els.visualNote.hidden = true;
        els.visualNote.replaceChildren();
      }
      if (els.researchCard) {
        els.researchCard.hidden = false;
        els.researchCard.replaceChildren(
          renderResearchCard({
            chapter: unit,
            data,
            index: nextIndex,
            total,
            researchTotal,
          }),
        );
        animateCardIn(els.researchCard);
      }
    }

    if (els.panelScroll) {
      els.panelScroll.scrollTop = 0;
      if (cardHadFocus) {
        try {
          els.panelScroll.focus({ preventScroll: true });
        } catch (error) {
          /* 忽略焦点异常 */
        }
      }
    }

    // 14 个章节点：当前项高亮 + roving tabindex
    if (els.dots) {
      Array.from(els.dots.querySelectorAll('.nav__dot')).forEach((button, dotIndex) => {
        const isCurrent = dotIndex === nextIndex;
        if (isCurrent) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
        button.tabIndex = isCurrent ? 0 : -1;
      });
    }

    // 上一章 / 下一章：只更新禁用态，不代替状态机判断
    if (els.prevBtn) {
      const disabled = nextIndex === 0;
      els.prevBtn.disabled = disabled;
      els.prevBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
    if (els.nextBtn) {
      const disabled = nextIndex === units.length - 1;
      els.nextBtn.disabled = disabled;
      els.nextBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }

    updateHint(nextIndex);
  }

  /* ---------------------------------------------------------------------- */
  /* 进度                                                                     */
  /* ---------------------------------------------------------------------- */

  function setProgress(ratio) {
    if (destroyed || !Number.isFinite(ratio)) return;
    const value = clamp01(ratio);
    const forced = lastRatio < 0 || (value === 1 && lastRatio !== 1) || (value === 0 && lastRatio !== 0);
    if (!forced && Math.abs(value - lastRatio) < PROGRESS_EPSILON) return;
    lastRatio = value;

    if (els.progressFill) {
      els.progressFill.style.width = `${(value * 100).toFixed(2)}%`;
    }
    const ariaNow = Math.round(value * 100);
    if (els.progressBar) {
      if (ariaNow !== lastAriaNow) {
        els.progressBar.setAttribute('aria-valuenow', String(ariaNow));
        els.progressBar.setAttribute('aria-valuetext', `整体叙事进度 ${ariaNow}%`);
        lastAriaNow = ariaNow;
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 其他公开方法                                                            */
  /* ---------------------------------------------------------------------- */

  function setLocked(locked) {
    if (destroyed || !els.app) return;
    els.app.classList.toggle('is-locked', Boolean(locked));
  }

  function setReducedMotion(reduced) {
    reducedMotion = Boolean(reduced);
    if (els.app) {
      els.app.classList.toggle('is-reduced-motion', reducedMotion);
      els.app.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
    }
  }

  function setNotice(message) {
    if (destroyed || !els.notice) return;
    if (message == null || message === '') {
      els.notice.hidden = true;
      els.notice.textContent = '';
      els.notice.classList.remove('is-visible');
      return;
    }
    els.notice.textContent = String(message);
    els.notice.hidden = false;
    els.notice.classList.add('is-visible');
  }

  /**
   * 滚轮/触摸是否应优先滚动卡片。
   * @param {-1|1|number|string} direction 1 = 向下滚（前往下一章），-1 = 向上滚
   * @param {EventTarget|null} eventTarget 原始事件目标
   * @returns {boolean} true 表示卡片在该方向仍有滚动余量
   */
  function canScrollCard(direction, eventTarget) {
    if (destroyed || !els.panelScroll) return false;

    let dir = 0;
    if (direction === 'up') dir = -1;
    else if (direction === 'down') dir = 1;
    else {
      const numeric = Number(direction);
      if (!Number.isFinite(numeric) || numeric === 0) return false;
      dir = numeric > 0 ? 1 : -1;
    }

    const isInsidePanel = (node) => {
      if (!node || typeof node.nodeType !== 'number') return false;
      return node === els.panelScroll || els.panelScroll.contains(node);
    };

    let inside = isInsidePanel(eventTarget);
    if (!inside && typeof document !== 'undefined') {
      // 个别浏览器会把滚轮事件目标归一到 document / body；仅在目标确实是文档级节点时，
      // 才退回到焦点位置判断。鼠标位于 3D 舞台或其他区域时绝不能误判为卡片滚动。
      const isDocumentLevelTarget =
        eventTarget === document ||
        eventTarget === document.documentElement ||
        eventTarget === document.body;
      if (isDocumentLevelTarget) inside = isInsidePanel(document.activeElement);
    }
    if (!inside) return false;

    const maxScroll = els.panelScroll.scrollHeight - els.panelScroll.clientHeight;
    if (maxScroll <= 1) return false;
    if (dir > 0) return els.panelScroll.scrollTop < maxScroll - 1;
    return els.panelScroll.scrollTop > 1;
  }

  function dispose() {
    if (destroyed) return;
    destroyed = true;

    if (els.prevBtn) els.prevBtn.removeEventListener('click', onPrevClick);
    if (els.nextBtn) els.nextBtn.removeEventListener('click', onNextClick);
    if (els.dots) {
      els.dots.removeEventListener('click', onDotsClick);
      els.dots.removeEventListener('keydown', onDotsKeydown);
    }
    removeMediaListener(mobileMedia, onMediaChange);
    removeMediaListener(reducedMedia, onReducedMotionChange);

    if (els.skipLink && originalSkipHref != null) {
      els.skipLink.setAttribute('href', originalSkipHref);
    }

    if (els.researchCard) {
      els.researchCard.replaceChildren();
      els.researchCard.hidden = true;
    }
    if (els.visualNote) {
      els.visualNote.replaceChildren();
      els.visualNote.hidden = true;
    }
    if (els.notice) {
      els.notice.hidden = true;
      els.notice.textContent = '';
    }
    if (els.app) {
      els.app.classList.remove('is-locked', 'is-reduced-motion');
      delete els.app.dataset.chapterType;
      delete els.app.dataset.reducedMotion;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 初始化                                                                  */
  /* ---------------------------------------------------------------------- */

  buildDots();

  if (els.prevBtn) els.prevBtn.addEventListener('click', onPrevClick);
  if (els.nextBtn) els.nextBtn.addEventListener('click', onNextClick);
  if (els.dots) {
    els.dots.addEventListener('click', onDotsClick);
    els.dots.addEventListener('keydown', onDotsKeydown);
  }
  addMediaListener(mobileMedia, onMediaChange);
  addMediaListener(reducedMedia, onReducedMotionChange);

  // 跳转链接在 3D 模式下直接指向可滚动、可聚焦的研究面板。
  if (els.skipLink) els.skipLink.setAttribute('href', '#panel-scroll');

  setReducedMotion(reducedMotion);

  if (units.length) showChapter(0);
  setProgress(0);

  return {
    showChapter,
    setProgress,
    setLocked,
    setReducedMotion,
    canScrollCard,
    setNotice,
    dispose,
  };
}

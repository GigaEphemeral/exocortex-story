const WHEEL_STEP_THRESHOLD = 32;
const WHEEL_IDLE_RESET_MS = 200;
const TOUCH_STEP_THRESHOLD = 48;
const TOUCH_AXIS_RATIO = 1.15;
const TRANSITION_TAIL_GUARD_MS = 160;
// 研究卡片到达文字底部/顶部后，再累计约一格滚轮（100px）才切换章节。
const PANEL_EDGE_PASSTHROUGH = 100;

const PANEL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ']);

/**
 * 输入层：把滚轮 / 触摸 / 键盘翻译成「一次最多一次章节步进」的请求。
 *
 * 防连跳策略（需求 4.3）：
 * 1. 滚轮累计阈值 32（触控板高频小输入需要累计，鼠标一格即可越过）；
 * 2. 方向翻转时清空反向累计；
 * 3. 过渡进行中忽略滚轮/触摸输入，只允许状态机缓存一个按钮方向；
 * 4. 过渡刚结束的 160ms 内忽略残余惯性；
 * 5. 卡片仍可滚动时，滚轮优先交给卡片（原生滚动），不切章；
 * 6. 卡片到达文字底部/顶部后，再累计约一格滚轮（100px）才切章，避免刚读完就跳章。
 *
 * 本模块不修改场景状态，只调用 onStep；章节状态由 chapterMachine 唯一管理。
 */
export function createScrollController({
  onStep,
  isBusy = () => false,
  canScrollCard = () => false,
  panelElement = null,
  view = window,
} = {}) {
  const doc = view.document;
  const now = () => (view.performance ? view.performance.now() : Date.now());

  let wheelAccumulator = 0;
  let wheelLastAt = 0;
  // 卡片端点处的“冗余”滚轮累计：到文字底部后还需要继续滚动一点才切章。
  let panelEdgeAccumulator = 0;
  let wasBusy = false;
  let guardUntil = 0;
  /** @type {{ x: number, y: number } | null} */
  let touchStart = null;
  let touchConsumed = false;
  /** 触摸起点是否位于研究面板内（卡片滚动优先） */
  let touchFromPanel = false;
  /** @type {EventTarget | null} */
  let touchOriginTarget = null;
  let disposed = false;

  function busy() {
    try {
      return Boolean(isBusy());
    } catch {
      return false;
    }
  }

  /** 过渡从 busy → idle 时，给尾部惯性加一个短保护窗口。 */
  function syncTransitionTail() {
    const current = busy();
    if (wasBusy && !current) guardUntil = now() + TRANSITION_TAIL_GUARD_MS;
    wasBusy = current;
  }

  function step(direction, source) {
    if (disposed || busy()) return false;
    return onStep(direction, source) !== false;
  }

  function handleWheel(event) {
    if (event.ctrlKey || event.metaKey) return; // 触控板缩放，不参与章节切换
    const delta = event.deltaY;
    if (!delta) return;

    const direction = delta > 0 ? 1 : -1;
    syncTransitionTail();

    // 卡片内部仍有滚动空间时，滚轮优先给卡片，交给浏览器原生滚动。
    if (event.target && canScrollCard(direction, event.target)) {
      panelEdgeAccumulator = 0;
      return;
    }

    event.preventDefault();

    if (busy()) {
      wheelAccumulator = 0;
      wheelLastAt = now();
      return;
    }

    const timestamp = now();

    // 卡片已到达文字底部/顶部：累计冗余滚轮量，越过阈值才切换章节。
    // 这条路径独立于过渡尾部锁，保证“读完最后一行还要再滚一点”的体感稳定。
    const panelScrollable = Boolean(
      panelElement && panelElement.scrollHeight - panelElement.clientHeight > 1,
    );
    const insidePanel = Boolean(
      panelScrollable && event.target instanceof view.Node && panelElement.contains(event.target),
    );
    if (insidePanel) {
      // 只按方向累计，不做时间窗口重置：慢速滚动/低帧率设备也能稳定达到阈值。
      if (panelEdgeAccumulator !== 0 && Math.sign(panelEdgeAccumulator) !== Math.sign(delta)) {
        panelEdgeAccumulator = 0;
      }
      panelEdgeAccumulator += delta;
      if (Math.abs(panelEdgeAccumulator) < PANEL_EDGE_PASSTHROUGH) return;
      panelEdgeAccumulator = 0;
      step(direction, 'wheel');
      return;
    }

    // 过渡刚结束的短窗口内，只接受一次明显的滚轮动作，过滤触控板惯性残余。
    // （残余惯性通常是小 delta 连续流；新的滚轮动作一般单次 delta 更大。）
    if (timestamp < guardUntil) {
      wheelAccumulator = 0;
      wheelLastAt = timestamp;
      if (Math.abs(delta) >= WHEEL_STEP_THRESHOLD * 2.5) step(direction, 'wheel');
      return;
    }

    if (timestamp - wheelLastAt > WHEEL_IDLE_RESET_MS) wheelAccumulator = 0;
    wheelLastAt = timestamp;

    if (wheelAccumulator !== 0 && Math.sign(wheelAccumulator) !== Math.sign(delta)) {
      wheelAccumulator = 0;
    }
    wheelAccumulator += delta;
    if (Math.abs(wheelAccumulator) < WHEEL_STEP_THRESHOLD) return;

    const stepDirection = wheelAccumulator > 0 ? 1 : -1;
    wheelAccumulator = 0;
    step(stepDirection, 'wheel');
  }

  function handleTouchStart(event) {
    syncTransitionTail();
    touchStart = null;
    touchConsumed = false;
    touchFromPanel = false;
    touchOriginTarget = null;
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };

    // 从研究面板开始的滑动先交给卡片原生滚动；触摸到面板两端后继续滑动才切章。
    if (panelElement && event.target instanceof view.Node && panelElement.contains(event.target)) {
      touchFromPanel = true;
      touchOriginTarget = event.target;
    }
  }

  function handleTouchMove(event) {
    if (!touchStart || touchConsumed || busy()) return;
    if (event.touches.length !== 1) {
      touchStart = null;
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    if (Math.abs(deltaY) < TOUCH_STEP_THRESHOLD) return;
    if (Math.abs(deltaY) < Math.abs(deltaX) * TOUCH_AXIS_RATIO) return;

    const direction = deltaY < 0 ? 1 : -1; // 上滑 → 下一章
    if (touchFromPanel && canScrollCard(direction, touchOriginTarget)) {
      return; // 卡片该方向仍有滚动余量，交给原生滚动
    }

    event.preventDefault(); // 阻止移动端下拉刷新/页面滚动
    touchConsumed = true;
    step(direction, 'touch');
  }

  function resetTouch() {
    touchStart = null;
    touchConsumed = false;
    touchFromPanel = false;
    touchOriginTarget = null;
  }

  function handleKeyDown(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!PANEL_KEYS.has(event.key)) return;

    const target = event.target;
    const tag = target?.tagName;
    if (target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const inPanel = Boolean(panelElement && target instanceof view.Node && panelElement.contains(target));

    if (event.key === ' ') {
      // 空格：焦点在按钮/链接/面板内时不拦截，交给原生行为。
      if (inPanel || tag === 'BUTTON' || tag === 'A') return;
      syncTransitionTail();
      if (busy()) return;
      if (step(1, 'keyboard')) event.preventDefault();
      return;
    }

    const direction = event.key === 'ArrowDown' || event.key === 'PageDown' ? 1 : -1;
    // 面板内方向键优先滚动卡片；滚动到两端后继续按方向键才切换章节。
    if (inPanel && canScrollCard(direction, target)) return;

    syncTransitionTail();
    if (busy()) return;
    if (step(direction, 'keyboard')) event.preventDefault();
  }

  function resetInput() {
    wheelAccumulator = 0;
    wheelLastAt = 0;
    panelEdgeAccumulator = 0;
    resetTouch();
    wasBusy = busy();
    guardUntil = 0;
  }

  function handleVisibilityChange() {
    // 页面切回前台时不继承上次的输入累计与时间窗口。
    resetInput();
  }

  function handleWindowBlur() {
    resetInput();
  }

  view.addEventListener('wheel', handleWheel, { passive: false });
  view.addEventListener('touchstart', handleTouchStart, { passive: true });
  view.addEventListener('touchmove', handleTouchMove, { passive: false });
  view.addEventListener('touchend', resetTouch, { passive: true });
  view.addEventListener('touchcancel', resetTouch, { passive: true });
  view.addEventListener('keydown', handleKeyDown);
  view.addEventListener('resize', resetInput);
  view.addEventListener('blur', handleWindowBlur);
  doc.addEventListener('visibilitychange', handleVisibilityChange);

  return {
    reset: resetInput,
    dispose() {
      if (disposed) return;
      disposed = true;
      view.removeEventListener('wheel', handleWheel);
      view.removeEventListener('touchstart', handleTouchStart);
      view.removeEventListener('touchmove', handleTouchMove);
      view.removeEventListener('touchend', resetTouch);
      view.removeEventListener('touchcancel', resetTouch);
      view.removeEventListener('keydown', handleKeyDown);
      view.removeEventListener('resize', resetInput);
      view.removeEventListener('blur', handleWindowBlur);
      doc.removeEventListener('visibilitychange', handleVisibilityChange);
    },
  };
}

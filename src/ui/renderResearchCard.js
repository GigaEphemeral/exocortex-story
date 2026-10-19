/**
 * 研究卡片渲染（3D 模式与 2D 降级共用）。
 *
 * 设计约束（docs/architecture.md 3.4 / memory_animation.md 6.1、6.3）：
 * - 只读取调用方传入的 config 数据，不发起任何网络请求；
 * - 卡片顺序：阶段标题 → 一句话概述 → 核心问题 → 人脑机制/AI 工程对照（折叠）
 *   → 关键差异（常驻）→ 学科词云（折叠）→ 论文列表（折叠）→ 待研究问题（常驻）；
 * - 词云最多 8 个关键词、3 个字号层级（1 / 2 / 其余）；移动端只显示 3 个 + “更多关键词”；
 * - 论文 verifiedUrl 为 null（或不是合法的 http/https 地址）时只渲染纯文本，绝不生成 <a>。
 */

/** 证据标签文案（需求 6.2：用明确标签区分证据与假设）。 */
const EVIDENCE_LABELS = Object.freeze({
  bio: '生物学机制',
  eng: '工程类比',
  emp: '实证研究',
  thy: '理论假设',
  open: '待验证问题',
});

let wordCloudSequence = 0;

/** 两位数编号（01、14）。 */
export function pad2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return String(Math.max(0, Math.trunc(n))).padStart(2, '0');
}

/**
 * 从 research 配置中取某个学术阶段的数据。
 * 兼容数组（researchData 的常见形态）、Map 以及 { researchData: [...] } 包装对象。
 */
export function findResearchData(research, stage) {
  if (research == null || stage == null) return null;
  if (Array.isArray(research)) {
    return research.find((item) => item && item.stage === stage) ?? null;
  }
  if (research instanceof Map) {
    return research.get(stage) ?? null;
  }
  if (typeof research === 'object') {
    if (Array.isArray(research.researchData)) {
      return research.researchData.find((item) => item && item.stage === stage) ?? null;
    }
    if (Array.isArray(research.research)) {
      return research.research.find((item) => item && item.stage === stage) ?? null;
    }
    return research[stage] ?? null;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* 小工具                                                                      */
/* -------------------------------------------------------------------------- */

function el(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function evidenceTag(kind, label) {
  const span = el('span', `evidence-tag evidence-tag--${kind}`, label ?? EVIDENCE_LABELS[kind] ?? '');
  return span;
}

function sectionTitle(text, tagKind, tagLabel) {
  const heading = el('h3', 'rc-section__title');
  if (tagKind) heading.append(evidenceTag(tagKind, tagLabel));
  heading.append(el('span', 'rc-section__label', text));
  return heading;
}

function createFold({ label, count, expanded = false, className = '' }) {
  const details = el('details', `rc-fold${className ? ' ' + className : ''}`);
  if (expanded) details.open = true;
  const summary = el('summary', 'rc-fold__summary');
  summary.append(el('span', 'rc-fold__label', label), el('span', 'rc-fold__count', count));
  const body = el('div', 'rc-fold__body');
  details.append(summary, body);
  return { details, summary, body };
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim());
}

/** 只有明确合法的 http/https 地址才允许变成链接；null / 空串 / 其他协议一律纯文本。 */
function safeExternalHref(value) {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

/* -------------------------------------------------------------------------- */
/* 词云                                                                        */
/* -------------------------------------------------------------------------- */

function wordTag(text, index) {
  const tier = index === 0 ? 'wordcloud__tag--xl' : index < 3 ? 'wordcloud__tag--lg' : 'wordcloud__tag--md';
  return el('span', `wordcloud__tag ${tier}`, text);
}

function renderWordCloud(tags, expanded) {
  const keywords = normalizeStringList(tags).slice(0, 8);
  const fold = createFold({
    label: '学科关键词 · 词云',
    count: `${keywords.length} 个`,
    expanded,
  });

  const cloud = el('div', 'wordcloud');
  cloud.setAttribute('role', 'group');
  cloud.setAttribute('aria-label', '本阶段学科关键词');

  if (!keywords.length) {
    cloud.append(el('p', 'rc-empty', '暂无关键词数据。'));
    fold.body.append(cloud);
    return fold.details;
  }

  // 桌面端全部展示；移动端只展示前 3 个，其余收进“更多关键词”。
  const visible = keywords.slice(0, 3);
  const rest = keywords.slice(3);

  visible.forEach((tag, i) => cloud.append(wordTag(tag, i)));

  if (rest.length) {
    const extrasId = `wordcloud-extra-${++wordCloudSequence}`;
    const extras = el('div', 'wordcloud__extras');
    extras.id = extrasId;
    rest.forEach((tag, i) => extras.append(wordTag(tag, i + 3)));

    const more = el('button', 'wordcloud__more', `更多关键词（${rest.length}）`);
    more.type = 'button';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', extrasId);
    more.addEventListener('click', () => {
      const open = extras.classList.toggle('is-open');
      more.setAttribute('aria-expanded', open ? 'true' : 'false');
      more.textContent = open ? '收起关键词' : `更多关键词（${rest.length}）`;
    });

    cloud.append(extras, more);
  }

  fold.body.append(cloud);
  return fold.details;
}

/* -------------------------------------------------------------------------- */
/* 论文                                                                        */
/* -------------------------------------------------------------------------- */

function renderPaper(paper) {
  const item = el('li', 'paper');

  const meta = el('p', 'paper__meta');
  meta.append(
    el('span', 'paper__authors', paper.authors || '作者信息待核验'),
    el('span', 'paper__year', paper.year != null ? String(paper.year) : '年份待核验'),
  );
  item.append(meta);

  const titleRow = el('p', 'paper__title');
  const titleText = paper.title || '标题待核验';
  const safeUrl = safeExternalHref(paper.verifiedUrl);
  if (safeUrl) {
    // 未来若配置了经人工核验的 URL，才生成可读链接。
    const link = document.createElement('a');
    link.className = 'paper__title-link';
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = titleText;
    link.append(el('span', 'sr-only', '（外部链接，将在新窗口打开）'));
    titleRow.append(link);
  } else {
    // verifiedUrl 为 null：纯文本，不生成任何 <a>。
    titleRow.textContent = titleText;
  }
  item.append(titleRow);

  if (paper.venue) item.append(el('p', 'paper__venue', paper.venue));
  if (paper.note) item.append(el('p', 'paper__note', paper.note));

  return item;
}

function renderPapers(papers, expanded) {
  const list = Array.isArray(papers) ? papers.filter(Boolean) : [];
  const fold = createFold({
    label: '代表性研究 · 实证研究',
    count: `${list.length} 篇`,
    expanded,
  });

  fold.body.append(
    el(
      'p',
      'rc-note',
      '题录信息按原始文本呈现；在链接经过逐条人工核验之前，本页不提供外部链接，也不推断 DOI。',
    ),
  );

  if (!list.length) {
    fold.body.append(el('p', 'rc-empty', '暂无代表研究数据。'));
    return fold.details;
  }

  const ol = document.createElement('ol');
  ol.className = 'papers';
  list.forEach((paper) => ol.append(renderPaper(paper)));
  fold.body.append(ol);
  return fold.details;
}

/* -------------------------------------------------------------------------- */
/* 对照列                                                                      */
/* -------------------------------------------------------------------------- */

function renderCompareColumn(label, kind, entries) {
  const column = el('div', 'rc-col');
  const heading = el('h4', 'rc-col__title');
  heading.append(evidenceTag(kind, label));
  column.append(heading);

  const list = normalizeStringList(entries);
  if (!list.length) {
    column.append(el('p', 'rc-empty', '暂无数据。'));
    return column;
  }

  const ul = document.createElement('ul');
  ul.className = 'rc-col__list';
  list.forEach((text) => ul.append(el('li', null, text)));
  column.append(ul);
  return column;
}

/* -------------------------------------------------------------------------- */
/* 研究卡片                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 渲染一张研究卡片。
 * @param {object} options
 * @param {object} [options.chapter]       对应的内容单元（提供 title / description）
 * @param {object} [options.data]          researchData 中该阶段的数据
 * @param {number} [options.index]         内容单元下标（0 起）
 * @param {number} [options.total]         内容单元总数（14）
 * @param {number} [options.researchTotal] 学术阶段总数（10）
 * @param {boolean} [options.expanded]     为 true 时展开全部折叠区（2D 降级使用）
 * @returns {HTMLDivElement}
 */
export function renderResearchCard({
  chapter = null,
  data = null,
  index = 0,
  total = 14,
  researchTotal = 10,
  expanded = false,
} = {}) {
  const unit = chapter ?? {};
  const stageId = data?.stage ?? unit.researchId ?? unit.stage;
  const stageNumber = Number.isInteger(stageId) ? stageId + 1 : null;

  const root = el('div', 'research-card');

  const header = el('header', 'rc-header');
  const kicker = el('p', 'rc-kicker');
  kicker.append(evidenceTagForStage());
  kicker.append(el('span', 'rc-stage-num', `学术阶段 ${stageNumber ? pad2(stageNumber) : '--'} / ${pad2(researchTotal)}`));
  kicker.append(el('span', 'rc-unit', `内容单元 ${pad2(index + 1)} / ${pad2(total)}`));
  header.append(kicker);

  const title = el('h2', 'rc-title', data?.title || unit.title || '未命名阶段');
  header.append(title);
  header.append(
    el('p', 'rc-lede', unit.description || '本阶段暂无一句话概述。'),
  );

  const legend = el('div', 'rc-legend');
  legend.setAttribute('role', 'group');
  legend.setAttribute('aria-label', '证据标签：生物学机制、工程类比、实证研究、理论假设、待验证问题');
  legend.append(el('span', 'rc-legend__lead', '证据标签'));
  Object.keys(EVIDENCE_LABELS).forEach((kind) => {
    const tag = evidenceTag(kind);
    tag.title = LEGEND_HINTS[kind];
    legend.append(tag);
  });
  header.append(legend);

  root.append(header);

  if (!data) {
    root.append(el('p', 'rc-empty', '该内容单元暂无研究数据，请检查 config 配置。'));
    return root;
  }

  // 1. 核心研究问题（常驻）
  const questionSection = el('section', 'rc-section');
  questionSection.append(sectionTitle('核心研究问题'));
  questionSection.append(el('p', 'rc-question', data.question || '该阶段暂无核心问题数据。'));
  root.append(questionSection);

  // 2. 人脑机制 / AI 工程对应（默认折叠）
  const brain = normalizeStringList(data.brain);
  const ai = normalizeStringList(data.ai);
  const compareFold = createFold({
    label: '人脑机制与 AI 工程对应',
    count: `${brain.length + ai.length} 项`,
    expanded,
    className: 'rc-fold--compare',
  });
  const columns = el('div', 'rc-cols');
  columns.append(
    renderCompareColumn('生物学机制', 'bio', brain),
    renderCompareColumn('工程类比', 'eng', ai),
  );
  compareFold.body.append(columns);
  const caveat = el('p', 'rc-caveat');
  caveat.append(evidenceTag('thy', '理论假设'));
  caveat.append(
    document.createTextNode(' 功能层面的对照属于理论类比，不代表两种机制等价，也不等同于实证结论。'),
  );
  compareFold.body.append(caveat);
  root.append(compareFold.details);

  // 3. 关键差异（常驻）
  const diffSection = el('section', 'rc-section rc-diff');
  diffSection.append(sectionTitle('关键差异提示'));
  diffSection.append(el('p', 'rc-diff__text', data.diff || '该阶段暂无差异提示数据。'));
  root.append(diffSection);

  // 4. 学科词云（默认折叠）
  root.append(renderWordCloud(data.tags, expanded));

  // 5. 论文列表（默认折叠）
  root.append(renderPapers(data.papers, expanded));

  // 6. 当前待研究问题（常驻）
  const openSection = el('section', 'rc-section rc-open');
  openSection.append(sectionTitle('当前待研究问题', 'open', '待验证问题'));
  openSection.append(el('p', 'rc-open__text', data.open || '该阶段暂无待验证问题数据。'));
  root.append(openSection);

  return root;
}

const LEGEND_HINTS = Object.freeze({
  bio: '来自神经科学 / 认知心理学的生物学机制描述',
  eng: 'AI 外置知识系统中的工程设计与对应关系',
  emp: '来自论文与实验的实证研究线索',
  thy: '理论模型或功能类比，尚未被证明为等价机制',
  open: '当前仍开放、需要进一步验证的问题',
});

function evidenceTagForStage() {
  // 研究卡片的阶段徽标沿用“证据标签”的颜色体系，但文案固定为“研究阶段”。
  return el('span', 'rc-badge', '研究阶段');
}

/* -------------------------------------------------------------------------- */
/* 运镜单元（视觉过渡）                                                        */
/* -------------------------------------------------------------------------- */

function cameraIcon() {
  const wrapper = el('span', 'visual-note__icon');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.innerHTML =
    '<svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">' +
    '<circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>' +
    '<circle cx="16" cy="16" r="5.2" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.9"/>' +
    '<circle cx="16" cy="16" r="1.7" fill="currentColor"/>' +
    '<path d="M16 3.5v4.2M16 24.3v4.2M3.5 16h4.2M24.3 16h4.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.65"/>' +
    '</svg>';
  return wrapper;
}

/**
 * 渲染运镜单元（视觉过渡）内容：只展示 visualNote 与说明，不生成研究卡片。
 * @param {object} options
 * @param {object} options.chapter 内容单元（type === 'camera'）
 * @param {number} [options.index]
 * @param {number} [options.total]
 * @param {boolean} [options.fallback] 2D 降级版式
 * @returns {HTMLDivElement}
 */
export function renderVisualNote({ chapter = null, index = 0, total = 14, fallback = false } = {}) {
  const unit = chapter ?? {};
  const root = el('div', `visual-note__card${fallback ? ' visual-note__card--fallback' : ''}`);

  const header = el('header', 'visual-note__head');
  header.append(cameraIcon());

  const headText = el('div', 'visual-note__head-text');
  const kicker = el('p', 'visual-note__kicker');
  kicker.append(el('span', 'rc-badge rc-badge--warm', '视觉过渡'));
  kicker.append(el('span', 'visual-note__num', `${pad2(index + 1)} / ${pad2(total)}`));
  headText.append(kicker);
  headText.append(el('h2', 'visual-note__title', unit.title || '视觉过渡'));
  header.append(headText);
  root.append(header);

  root.append(el('p', 'visual-note__desc', unit.description || '本单元只调整镜头视角。'));

  const callout = el('div', 'visual-note__callout');
  callout.append(el('span', 'visual-note__tag', '运镜说明'));
  callout.append(el('p', 'visual-note__note', unit.visualNote || '镜头沿平滑路径移动，不改变学术阶段。'));
  root.append(callout);

  root.append(
    el(
      'p',
      'visual-note__hint',
      '本单元是独立的视觉过渡，不新增学术研究卡片；章节编号与整体进度仍按全部 14 个内容单元计算。',
    ),
  );

  return root;
}

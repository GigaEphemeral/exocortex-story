/**
 * 十阶段研究数据（唯一真值）。
 *
 * 内容边界（需求第六、七章）：
 * - 每条论文记录的 verifiedUrl 一律为 null。渲染层在 null 时只显示作者、年份、标题的
 *   纯文本，不生成 <a> 链接；部署前如需链接，由项目所有者逐条人工核验后填入。
 * - 不编造 DOI、PubMed ID、arXiv 链接或出版信息。venue 字段仅保留原始题录文本。
 * - brain / ai / diff / open 的措辞区分「生物学机制」「工程类比」「实证研究」
 *   「理论假设」「待验证问题」，不使用没有证据支持的强因果表述。
 *
 * 字段：
 * - stage：学术阶段编号 0–9，与 chapterConfig 的 researchId 对应；
 * - question：核心研究问题；brain：人脑相关机制；ai：工程对应；
 * - diff：人脑与 AI 的关键差异；tags：词云关键词（≤8 个）；
 * - papers：代表性研究（authors / year / title / venue / note / verifiedUrl）；
 * - open：当前仍然待解决的问题。
 */

/** @typedef {{ authors: string, year: number, title: string, venue: string, note: string, verifiedUrl: string | null }} Paper */

export const researchData = Object.freeze([
  Object.freeze({
    stage: 0,
    title: '阅读与信息感知',
    question: '外部信息如何经由感知、注意和工作记忆进入认知系统？',
    brain: Object.freeze(['视觉与语言加工', '注意力分配', '工作记忆', '认知负荷']),
    ai: Object.freeze(['输入解析', '上下文窗口', '多模态编码', '信息筛选']),
    diff: '人类感知受身体、注意和环境约束；AI 输入处理由模型架构、提示词、上下文长度及预处理机制决定。',
    tags: Object.freeze(['认知心理学', '注意机制', '阅读理解', '工作记忆']),
    papers: Object.freeze([
      Object.freeze({ authors: 'Baddeley & Hitch', year: 1974, title: 'Working Memory', venue: 'Psychology of Learning and Motivation, 8, 47–89', note: '工作记忆的多成分模型', verifiedUrl: null }),
      Object.freeze({ authors: 'Dehaene et al.', year: 2005, title: 'The neural basis of reading', venue: '出处待核验', note: '阅读的神经基础', verifiedUrl: null }),
    ]),
    open: '哪些输入特征决定信息值得被长期保留？',
  }),
  Object.freeze({
    stage: 1,
    title: '理解与编码',
    question: '信息如何从短暂加工转化为可在之后提取的记忆表征？',
    brain: Object.freeze(['海马体参与的情景记忆形成', '突触可塑性', '长时程增强', '不同记忆系统交互']),
    ai: Object.freeze(['文本解析与结构化', '语义嵌入', '记忆条目生成', '原文与摘要保存']),
    diff: '神经系统记忆涉及多种神经回路和生物过程；AI 的向量和文本存储是工程表征，不能等同于神经记忆。',
    tags: Object.freeze(['记忆编码', '海马体', '突触可塑性', '情景记忆', '表征学习']),
    papers: Object.freeze([
      Object.freeze({ authors: 'Squire', year: 1992, title: 'Memory and the hippocampus: A synthesis from findings with rats, monkeys, and humans', venue: 'Psychological Review, 99(2), 195–231', note: '海马体与陈述性记忆', verifiedUrl: null }),
      Object.freeze({ authors: 'Eichenbaum', year: 2000, title: 'A cortical-hippocampal system for declarative memory', venue: 'Nature Reviews Neuroscience, 1, 41–50', note: '皮层-海马陈述性记忆系统', verifiedUrl: null }),
    ]),
    open: '如何在保留原始证据的同时生成可检索、可更新的知识表征？',
  }),
  Object.freeze({
    stage: 2,
    title: '模式分离',
    question: '系统如何区分相似经历、近似概念和容易混淆的事实？',
    brain: Object.freeze(['模式分离', '模式补全', '海马相关回路', '记忆干扰']),
    ai: Object.freeze(['向量检索', '相似度阈值', '对比学习', '负样本与去重策略']),
    diff: '神经模式分离不等同于向量空间距离计算。相似度检索既可能帮助找到关联，也可能把相似但不同的事实混淆。',
    tags: Object.freeze(['模式分离', '模式补全', '海马齿状回', '相似性辨别', '嵌入空间']),
    papers: Object.freeze([
      Object.freeze({ authors: 'Marr', year: 1971, title: 'Simple memory: A theory for archicortex', venue: 'Phil. Trans. R. Soc. B, 262(841), 23–81', note: '海马计算理论', verifiedUrl: null }),
      Object.freeze({ authors: 'Yassa & Stark', year: 2011, title: 'Pattern separation in the hippocampus', venue: 'Trends in Neurosciences, 34(10), 515–525', note: '模式分离综述', verifiedUrl: null }),
    ]),
    open: '如何同时识别语义相关性与事实差异，避免把相似内容合并成错误结论？',
  }),
  Object.freeze({
    stage: 3,
    title: '抽象与知识整合',
    question: '系统如何从多次具体经历中提取稳定规律，同时保留重要细节？',
    brain: Object.freeze(['互补学习系统', '海马—新皮层交互', '系统巩固', '抽象化与概念形成']),
    ai: Object.freeze(['记忆摘要', '知识蒸馏', '文档聚合', 'LLM Wiki', 'GraphRAG', '长期知识更新']),
    diff: 'AI 的摘要和知识聚合不自动等于生物学系统巩固。压缩可能丢失细节、来源、时间顺序及少数但重要的例外。',
    tags: Object.freeze(['互补学习系统', '系统巩固', '抽象化', '归纳学习', '灾难性遗忘']),
    papers: Object.freeze([
      Object.freeze({ authors: 'McClelland, McNaughton & O\'Reilly', year: 1995, title: 'Why there are complementary learning systems in the hippocampus and neocortex', venue: 'Psychological Review, 102(3), 419–457', note: '互补学习系统理论', verifiedUrl: null }),
      Object.freeze({ authors: 'Kumaran, Hassabis & McClelland', year: 2016, title: 'What Learning Systems do Intelligent Agents Need?', venue: 'Trends in Cognitive Sciences, 20(7), 512–534', note: 'CLS 理论更新', verifiedUrl: null }),
    ]),
    open: '如何在抽象出一般规律的同时保留例外、原始证据和时间信息？',
  }),
  Object.freeze({
    stage: 4,
    title: '知识数字化与外置存储',
    question: '哪些内容应该原样保存，哪些适合压缩、索引或建立关系？',
    brain: Object.freeze(['内部记忆与外部线索的交互', '记忆内容与提取线索的关系', '对环境信息的利用']),
    ai: Object.freeze(['RAG', '向量数据库', '稀疏检索', '知识图谱', '元数据与版本管理', '分层存储']),
    diff: '外部知识库可直接保留精确原文、来源和版本；人脑记忆不是对经历的逐字录像。',
    tags: Object.freeze(['RAG', '向量数据库', '稀疏检索', '知识图谱', '分块策略', 'LLM Wiki']),
    papers: Object.freeze([
      Object.freeze({ authors: 'Lewis et al.', year: 2020, title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', venue: 'NeurIPS 2020, arXiv:2005.11401', note: 'RAG 原始论文', verifiedUrl: null }),
      Object.freeze({ authors: 'Karpukhin et al.', year: 2020, title: 'Dense Passage Retrieval for Open-Domain Question Answering', venue: 'EMNLP 2020, arXiv:2004.04906', note: '稠密段落检索', verifiedUrl: null }),
    ]),
    open: '如何让原始证据、摘要、事实、来源与知识关系保持一致并可追溯？',
  }),
  Object.freeze({
    stage: 5,
    title: '检索与模式补全',
    question: '面对不完整线索，系统如何找到相关记忆并组合出可靠答案？',
    brain: Object.freeze(['线索依赖的记忆提取', '联想提取', '模式补全']),
    ai: Object.freeze(['查询改写', '混合检索', '重排序', '上下文构建', '检索增强生成']),
    diff: '人脑联想和 AI 检索不是同一机制。模式补全是神经系统从部分线索重建完整表征的过程；RAG 的生成本质上是基于检索片段的有损压缩后的条件生成，两者在证据保真度上不可直接类比。',
    tags: Object.freeze(['联想提取', '线索依赖', '模式补全', '混合检索', '重排序', '生成式问答']),
    papers: Object.freeze([
      Object.freeze({ authors: 'Tulving & Thomson', year: 1973, title: 'Encoding specificity and retrieval processes in episodic memory', venue: 'Psychological Review, 80(5), 352–373', note: '编码特异性原则', verifiedUrl: null }),
      Object.freeze({ authors: 'Lewis et al.', year: 2020, title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', venue: 'NeurIPS 2020, arXiv:2005.11401', note: 'RAG 原始论文（此处侧重检索与生成链路）', verifiedUrl: null }),
    ]),
    open: '怎样判断生成内容是有证据支持的回忆、合理推断，还是无依据的补全？',
  }),
  Object.freeze({
    stage: 6,
    title: '离线重放与巩固',
    question: '不接收新输入时，系统能否通过重放和整合改善长期知识结构？',
    brain: Object.freeze(['睡眠期间的记忆重放', '海马序列再激活', '记忆巩固']),
    ai: Object.freeze(['经验回放', '后台反思', '定期总结', '记忆索引更新', '持续学习']),
    diff: '生物学重放具有具体的神经生理机制。后台总结、定期运行 LLM 或经验回放是不同工程方法，不能直接视为同一过程。',
    tags: Object.freeze(['睡眠重放', '海马序列', '记忆巩固', '离线学习', '经验回放', '持续学习']),
    papers: Object.freeze([
      Object.freeze({ authors: 'Wilson & McNaughton', year: 1994, title: 'Reactivation of hippocampal ensemble memories during sleep', venue: 'Science, 265(5172), 676–679', note: '睡眠中海马序列重放', verifiedUrl: null }),
      Object.freeze({ authors: 'Mnih et al.', year: 2015, title: 'Human-level control through deep reinforcement learning', venue: 'Nature, 518, 529–533', note: '经验回放机制', verifiedUrl: null }),
    ]),
    open: '如何评估后台整合是否真的改善了长期记忆，而不是仅仅产生更多摘要？',
  }),
  Object.freeze({
    stage: 7,
    title: '冲突检测与再巩固',
    question: '发现新旧信息矛盾后，系统如何判断保留、修订或标记不确定性？',
    brain: Object.freeze(['记忆提取后的再巩固过程', '预测误差', '记忆更新条件']),
    ai: Object.freeze(['事实核验', '知识冲突检测', '来源优先级', '版本控制', '不确定性标记', '知识编辑']),
    diff: '不是所有记忆提取都会触发再巩固（预测误差是必要条件，且误差大小调节更新性质）。AI 更新知识条目也不是生物学再巩固的直接复制。',
    tags: Object.freeze(['记忆再巩固', '预测误差', '事实核验', '知识冲突', '版本控制', '信念修正']),
    papers: Object.freeze([
      Object.freeze({ authors: 'Nader, Schafe & LeDoux', year: 2000, title: 'Fear memories require protein synthesis in the amygdala for reconsolidation after retrieval', venue: 'Nature, 406, 722–726', note: '再巩固需要蛋白质合成', verifiedUrl: null }),
      Object.freeze({ authors: 'Lee, Nader & Schiller', year: 2017, title: 'An update on memory reconsolidation updating', venue: 'Trends in Cognitive Sciences, 21(7), 531–545', note: '再巩固更新综述', verifiedUrl: null }),
    ]),
    open: '当新旧信息冲突时，如何保留证据历史并避免覆盖真实但少见的事实？',
  }),
  Object.freeze({
    stage: 8,
    title: '主动遗忘与信息筛选',
    question: '如何控制记忆增长，避免过时、重复、低价值或错误信息污染系统？',
    brain: Object.freeze(['记忆抑制', '遗忘与干扰', '记忆竞争', '适应性信息筛选']),
    ai: Object.freeze(['去重', 'TTL 与过期策略', '记忆淘汰', '重要性评分', '压缩与归档', '隐私删除']),
    diff: '遗忘并非一律意味着删除；记忆可访问性降低、提取失败、干扰和存储删除是不同现象。AI 系统可在工程层面显式删除指定文件或条目。',
    tags: Object.freeze(['主动遗忘', '干扰抑制', '记忆竞争', '信息压缩', '去重', '时效性']),
    papers: Object.freeze([
      Object.freeze({ authors: 'Anderson & Green', year: 2001, title: 'Suppressing unwanted memories by executive control', venue: 'Nature, 410, 366–369', note: '执行控制抑制记忆', verifiedUrl: null }),
      Object.freeze({ authors: 'Anderson et al.', year: 2004, title: 'Neural systems underlying the suppression of unwanted memories', venue: 'Science, 303(5655), 232–235', note: '记忆抑制的神经基础', verifiedUrl: null }),
    ]),
    open: '如何让外置记忆主动淘汰低价值信息，同时保留重要例外和审计记录？',
  }),
  Object.freeze({
    stage: 9,
    title: '数字大脑',
    question: '怎样让知识系统具备可追溯、可更新、可纠错、可遗忘的长期组织能力？',
    brain: Object.freeze(['多种记忆系统协同', '不同时间尺度上的整合', '情景与语义知识之间的交互']),
    ai: Object.freeze(['Agent Memory', 'GraphRAG', '长期上下文管理', '多层知识存储', '自我修正', '持续学习', '记忆评估']),
    diff: '将许多 AI 记忆组件组合起来，不代表系统已拥有类似人脑的认知能力。必须通过任务、长期运行和对照实验评估实际表现。',
    tags: Object.freeze(['Agent Memory', 'GraphRAG', '知识演化', '长期上下文', '自我修正', '认知架构']),
    papers: Object.freeze([
      Object.freeze({ authors: 'Park et al.', year: 2023, title: 'Generative Agents: Interactive Simulacra of Human Behavior', venue: 'arXiv:2304.03442', note: '生成式智能体记忆流', verifiedUrl: null }),
      Object.freeze({ authors: 'Packer et al.', year: 2023, title: 'MemGPT: Towards LLMs as Operating Systems', venue: 'arXiv:2310.08560', note: '分层记忆管理', verifiedUrl: null }),
    ]),
    open: '什么样的评估体系能够衡量 AI 外置知识系统的长期可靠性、可追溯性、纠错能力和遗忘质量？',
  }),
]);

/** 按学术阶段号取研究数据。 */
export function getResearchStage(stage) {
  return researchData.find((item) => item.stage === stage) ?? null;
}

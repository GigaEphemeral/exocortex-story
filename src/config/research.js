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
 * - open：当前仍然待解决的问题数组（首条为章节核心问题，其余为工程实现层面的难点）；
 * - frontier：前沿研究方向的外部阅读链接（title / year / url / note）。这里的外链只代表
 *   研究方向，不用于支撑卡片结论；论文列表的 verifiedUrl 规则保持不变（仍全部为 null）。
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
    frontier: Object.freeze([
      Object.freeze({
        title: 'A Survey of Context Engineering for Large Language Models',
        year: 2025,
        url: 'https://arxiv.org/abs/2507.13334',
        note: '上下文工程的系统综述：输入组织、检索与工具调用的统一工程视角',
      }),
      Object.freeze({
        title: 'Lost in the Middle: How Language Models Use Long Contexts',
        year: 2023,
        url: 'https://arxiv.org/abs/2307.03172',
        note: '长上下文中信息位置对使用效果影响的经典实证研究',
      }),
    ]),
    open: Object.freeze([
      '哪些输入特征决定信息值得被长期保留？',
      '超长上下文下，注意力/检索预算如何在延迟、成本与信息完整性之间取得可验证的平衡？',
      '多模态输入（文档、表格、图像、语音）如何统一编码，并保持跨模态引用的一致性与可追溯性？',
      '输入侧的噪声过滤与去重，如何避免误删低频但关键的信息？',
    ]),
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
    frontier: Object.freeze([
      Object.freeze({
        title: 'A-MEM: Agentic Memory for LLM Agents',
        year: 2025,
        url: 'https://arxiv.org/abs/2502.12110',
        note: '面向智能体的结构化记忆写入、组织与动态演化',
      }),
      Object.freeze({
        title: 'Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory',
        year: 2025,
        url: 'https://arxiv.org/abs/2504.19413',
        note: '生产级长期记忆架构：抽取、合并、检索与成本权衡',
      }),
    ]),
    open: Object.freeze([
      '如何在保留原始证据的同时生成可检索、可更新的知识表征？',
      '记忆写入的粒度（原文 / 分块 / 摘要 / 事实）如何选择，才能同时满足召回率与存储成本？',
      '多用户、多租户场景下，记忆的隔离、权限与可审计删除如何设计？',
      '写入时的语义去重与版本合并，如何避免把不同语境下的同一事实错误合并？',
    ]),
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
    frontier: Object.freeze([
      Object.freeze({
        title: 'HippoRAG: Neurobiologically Inspired Long-Term Memory for Large Language Models',
        year: 2024,
        url: 'https://arxiv.org/abs/2405.14831',
        note: '受海马记忆机制启发的长期记忆编码与模式补全式检索',
      }),
      Object.freeze({
        title: 'LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory',
        year: 2024,
        url: 'https://arxiv.org/abs/2410.10813',
        note: '长期交互记忆的区分、更新与时间推理评测基准',
      }),
    ]),
    open: Object.freeze([
      '如何同时识别语义相关性与事实差异，避免把相似内容合并成错误结论？',
      '高维嵌入空间中的相似度阈值如何随领域与时间自适应，而不是全局固定？',
      '当检索召回高度相似但相互矛盾的多条记忆时，如何做可解释的区分与取舍？',
      '负样本构造与对比学习，如何在长尾实体和罕见事实上保持判别力？',
    ]),
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
    frontier: Object.freeze([
      Object.freeze({
        title: 'RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval',
        year: 2024,
        url: 'https://arxiv.org/abs/2401.18059',
        note: '递归摘要构建树状知识结构，兼顾细粒度证据与高层抽象',
      }),
      Object.freeze({
        title: 'From Local to Global: A Graph RAG Approach to Query-Focused Summarization',
        year: 2024,
        url: 'https://arxiv.org/abs/2404.16130',
        note: '图结构与社区摘要支持跨文档的全局整合式问答',
      }),
    ]),
    open: Object.freeze([
      '如何在抽象出一般规律的同时保留例外、原始证据和时间信息？',
      '图结构/层级结构的知识组织，在增量更新时如何避免全量重建与“图漂移”？',
      '摘要与聚合过程如何做到可追溯：每条抽象结论都能回溯到原始证据链？',
      '知识整合的“压缩率—保真度”权衡，如何用下游任务指标而非直觉来评估？',
    ]),
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
    frontier: Object.freeze([
      Object.freeze({
        title: 'Retrieval-Augmented Generation for Large Language Models: A Survey',
        year: 2023,
        url: 'https://arxiv.org/abs/2312.10997',
        note: 'RAG 全链路工程组件综述：分块、索引、检索与生成',
      }),
      Object.freeze({
        title: 'MemOS: An Operating System for Memory-Augmented Generation (MAG) in Large Language Models',
        year: 2025,
        url: 'https://arxiv.org/abs/2505.22101',
        note: '把记忆作为可调度资源的分层记忆操作系统架构',
      }),
    ]),
    open: Object.freeze([
      '如何让原始证据、摘要、事实、来源与知识关系保持一致并可追溯？',
      '向量索引、倒排索引与图索引的混合检索，如何在延迟预算内完成路由与融合？',
      '数据分块策略（固定窗口 / 语义分块 / 递归分块）如何随文档类型自动选择？',
      '存储层的版本、元数据与血缘（lineage）如何支持回溯到任意历史快照？',
    ]),
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
    frontier: Object.freeze([
      Object.freeze({
        title: 'Agentic Retrieval-Augmented Generation: A Survey on Agentic RAG',
        year: 2025,
        url: 'https://arxiv.org/abs/2501.09136',
        note: '智能体化检索：规划、工具调用、迭代检索与结果自检的系统综述',
      }),
      Object.freeze({
        title: 'Search-R1: Training LLMs to Reason and Leverage Search Engines with Reinforcement Learning',
        year: 2025,
        url: 'https://arxiv.org/abs/2503.09516',
        note: '用强化学习训练“推理—搜索”交替策略，减少无效检索',
      }),
    ]),
    open: Object.freeze([
      '怎样判断生成内容是有证据支持的回忆、合理推断，还是无依据的补全？',
      '多跳检索中，如何控制查询改写与重排带来的误差累积和成本增长？',
      '检索增强生成如何给出可核验的引用粒度（句级 / 段级 / 来源级），并在来源缺失时明确拒答？',
      '没有人工标注时，如何在线评估检索质量，发现“看似相关但无用”的片段？',
    ]),
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
    frontier: Object.freeze([
      Object.freeze({
        title: 'Sleep-time Compute: Beyond Inference Scaling at Test-time',
        year: 2025,
        url: 'https://arxiv.org/abs/2504.13171',
        note: '把“离线思考/预处理”作为可调度的算力预算',
      }),
      Object.freeze({
        title: 'Titans: Learning to Memorize at Test Time',
        year: 2024,
        url: 'https://arxiv.org/abs/2501.00663',
        note: '测试时持续写入与更新长期记忆的模型架构探索',
      }),
    ]),
    open: Object.freeze([
      '如何评估后台整合是否真的改善了长期记忆，而不是仅仅产生更多摘要？',
      '离线巩固的计算预算（何时触发、整合多少、保留哪些证据）如何调度与计量？',
      '持续学习中如何避免“总结漂移”和灾难性遗忘：增量巩固与全量重训如何取舍？',
      '如何度量巩固收益在跨会话、跨任务上的迁移，而不是只在单一 benchmark 上提升？',
    ]),
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
    frontier: Object.freeze([
      Object.freeze({
        title: 'ConflictBank: A Benchmark for Evaluating the Influence of Knowledge Conflicts in LLMs',
        year: 2024,
        url: 'https://arxiv.org/abs/2408.12076',
        note: '系统构造知识冲突场景，评测模型对冲突信息的处理',
      }),
      Object.freeze({
        title: 'Knowledge Editing for Large Language Models: A Survey',
        year: 2023,
        url: 'https://arxiv.org/abs/2310.16218',
        note: '知识编辑的方法、边界与副作用综述',
      }),
    ]),
    open: Object.freeze([
      '当新旧信息冲突时，如何保留证据历史并避免覆盖真实但少见的事实？',
      '冲突检测的置信度如何校准，才能区分“来源不可靠”与“事实确实被更新”？',
      '知识编辑如何做到局部更新不外溢、可回滚、并可审计？',
      '多源冲突下，版本控制与来源优先级策略如何复现与验证？',
    ]),
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
    frontier: Object.freeze([
      Object.freeze({
        title: 'A Comprehensive Survey of Machine Unlearning Techniques for Large Language Models',
        year: 2025,
        url: 'https://arxiv.org/abs/2503.01854',
        note: 'LLM 机器遗忘的方法分类、工程难点与评估挑战',
      }),
      Object.freeze({
        title: 'Eight Methods to Evaluate Robust Unlearning in LLMs',
        year: 2024,
        url: 'https://arxiv.org/abs/2402.16835',
        note: '从多个角度检验“声称遗忘”是否真的稳健',
      }),
    ]),
    open: Object.freeze([
      '如何让外置记忆主动淘汰低价值信息，同时保留重要例外和审计记录？',
      '隐私/合规删除如何做到跨索引、跨缓存、跨备份的彻底遗忘，并给出可检验的证明？',
      '重要性/时效性评分如何在线学习，避免把低频但高价值的信息误删？',
      '归档、压缩与删除的边界：如何设计可逆的“弱化”机制而不是不可逆丢失？',
    ]),
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
    frontier: Object.freeze([
      Object.freeze({
        title: 'Memory in the Age of AI Agents',
        year: 2025,
        url: 'https://arxiv.org/abs/2512.13564',
        note: '智能体记忆的系统综述：形态、功能、演化与开放问题',
      }),
      Object.freeze({
        title: 'From Human Memory to AI Memory: A Survey on Memory Mechanisms in the Era of LLMs',
        year: 2025,
        url: 'https://arxiv.org/abs/2504.15965',
        note: '人脑记忆机制与 LLM 记忆机制的系统对照',
      }),
    ]),
    open: Object.freeze([
      '什么样的评估体系能够衡量 AI 外置知识系统的长期可靠性、可追溯性、纠错能力和遗忘质量？',
      '多个记忆模块（工作记忆 / 情景记忆 / 语义记忆）之间如何统一调度与冲突仲裁？',
      '长期运行下的成本、延迟与能耗如何纳入系统级评估，而不只看答案准确率？',
      '如何构建可复现的“记忆演化”长周期基准，覆盖更新、遗忘、冲突与审计全链路？',
    ]),
  }),
]);

/** 按学术阶段号取研究数据。 */
export function getResearchStage(stage) {
  return researchData.find((item) => item.stage === stage) ?? null;
}

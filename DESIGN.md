# Project 07: GitHub PR Review Bot

> AI 驱动的代码审查机器人，自动分析 PR 变更并提供结构化审查意见。

---

## 1. 产品定位

### 1.1 目标用户
- 个人开发者：给自己的 PR 多一双眼睛
- 小团队：减轻 Senior 的 Review 负担
- 开源项目：帮助维护者初筛贡献

### 1.2 核心价值
- **自动化**：PR 创建/更新时自动触发审查
- **多维度**：逻辑、安全、风格、性能多角度分析
- **可操作**：输出具体的行级评论，而非泛泛而谈

### 1.3 产品形态演进
```
Phase 1: CLI 工具（本地运行，验证核心能力）
    ↓
Phase 2: GitHub Action（CI 集成，用户自托管）
    ↓
Phase 3: GitHub App（可选，SaaS 形态）
```

---

## 2. 技术架构

### 2.1 整体流程

```
┌─────────────────────────────────────────────────────────────┐
│                         Input Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  CLI Input  │  │ GitHub Hook │  │ GitHub Action       │ │
│  │  (PR URL)   │  │ (Webhook)   │  │ (Event Trigger)     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
└─────────┴────────────────┴───────────────────┬─────────────┘
                                               ↓
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Adapter                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  - 获取 PR 元信息（title, body, author）            │   │
│  │  - 获取 PR Diff（文件列表、变更内容）               │   │
│  │  - 获取相关文件完整内容（可选，用于上下文）         │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                      Review Engine                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Diff Parser │→ │ Chunk Builder│→ │  Review Agents     │ │
│  │             │  │             │  │  - Logic Reviewer   │ │
│  │             │  │             │  │  - Security Checker │ │
│  │             │  │             │  │  - Style Advisor    │ │
│  └─────────────┘  └─────────────┘  └──────────┬──────────┘ │
└────────────────────────────────────────────────┬────────────┘
                                                 ↓
┌─────────────────────────────────────────────────────────────┐
│                      Output Layer                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  - 结构化 Review 结果                               │   │
│  │  - GitHub PR Review Comment（行级评论）             │   │
│  │  - Summary Comment（总结性评论）                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈

| 层级 | 技术选型 | 理由 |
|------|----------|------|
| Runtime | Node.js 20+ | 统一 TypeScript 栈 |
| GitHub API | @octokit/rest | 官方 SDK，类型完善 |
| LLM | OpenAI / Anthropic SDK | 直接调用，不依赖 LangChain |
| Schema | Zod | 复用 01 的能力 |
| CLI | Commander.js | 轻量、够用 |

---

## 3. 模块设计

### 3.1 目录结构

```
packages/07-pr-review-bot/
├── src/
│   ├── github/
│   │   ├── client.ts          # GitHub API 封装
│   │   ├── diff-parser.ts     # Diff 解析器
│   │   └── types.ts           # GitHub 相关类型
│   ├── review/
│   │   ├── agents/
│   │   │   ├── logic.ts       # 逻辑审查 Agent
│   │   │   ├── security.ts    # 安全审查 Agent
│   │   │   └── style.ts       # 风格审查 Agent
│   │   ├── orchestrator.ts    # Agent 编排器
│   │   ├── prompt-builder.ts  # Prompt 构建
│   │   └── types.ts           # Review 相关类型
│   ├── output/
│   │   ├── formatter.ts       # 输出格式化
│   │   └── github-comment.ts  # GitHub 评论生成
│   ├── cli.ts                 # CLI 入口
│   └── index.ts               # 库入口（供 Action 使用）
├── action/                    # GitHub Action 相关
│   ├── action.yml
│   └── index.ts
├── tests/
│   ├── fixtures/              # 测试用 PR diff
│   └── review.test.ts
├── package.json
├── tsconfig.json
├── .env.example
└── DESIGN.md
```

### 3.2 核心模块职责

#### github/client.ts
```typescript
interface GitHubClient {
  // PR 信息获取
  getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequest>;
  getPullRequestDiff(owner: string, repo: string, prNumber: number): Promise<string>;
  getPullRequestFiles(owner: string, repo: string, prNumber: number): Promise<PullRequestFile[]>;

  // 评论发表
  createReview(owner: string, repo: string, prNumber: number, review: ReviewPayload): Promise<void>;
  createComment(owner: string, repo: string, prNumber: number, comment: string): Promise<void>;
}
```

#### github/diff-parser.ts
```typescript
interface DiffChunk {
  filePath: string;
  oldPath?: string;          // 重命名场景
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  hunks: DiffHunk[];
}

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;           // 原始 diff 内容
  changes: DiffChange[];     // 解析后的行级变更
}

interface DiffChange {
  type: 'add' | 'delete' | 'context';
  lineNumber: number;        # 新文件中的行号（add/context）或旧文件行号（delete）
  content: string;
}

function parseDiff(diffText: string): DiffChunk[];
```

#### review/agents/*.ts
```typescript
// 每个 Agent 遵循统一接口
interface ReviewAgent {
  name: string;
  description: string;

  review(context: ReviewContext): Promise<ReviewResult>;
}

interface ReviewContext {
  prTitle: string;
  prBody: string;
  file: DiffChunk;
  fullFileContent?: string;  // 可选，完整文件内容（用于上下文）
}

interface ReviewResult {
  agent: string;
  comments: ReviewComment[];
  summary?: string;
}

interface ReviewComment {
  filePath: string;
  lineNumber: number;        // 评论定位的行号
  severity: 'error' | 'warning' | 'suggestion' | 'nitpick';
  category: 'logic' | 'security' | 'style' | 'performance';
  message: string;
  suggestion?: string;       // 可选的修复建议代码
}
```

#### review/orchestrator.ts
```typescript
interface ReviewOrchestrator {
  agents: ReviewAgent[];

  // 对单个文件执行所有 Agent 审查
  reviewFile(context: ReviewContext): Promise<ReviewResult[]>;

  // 对整个 PR 执行审查
  reviewPR(pr: PullRequest, diffs: DiffChunk[]): Promise<PRReviewResult>;
}

interface PRReviewResult {
  prNumber: number;
  totalComments: number;
  commentsByFile: Map<string, ReviewComment[]>;
  summary: string;
  stats: {
    errors: number;
    warnings: number;
    suggestions: number;
  };
}
```

---

## 4. Agent 设计

### 4.1 Logic Reviewer Agent

**职责**：审查代码逻辑正确性

**System Prompt 要点**：
```
你是一个严格的代码逻辑审查专家。

审查维度：
1. 边界条件处理 - 空值、越界、类型转换
2. 错误处理 - 异常捕获、错误传播
3. 逻辑漏洞 - 条件遗漏、状态不一致
4. 可能的 Bug - 拼写错误、错误的比较运算符

输出要求：
- 只指出真正的问题，不要过度挑剔
- 每个问题必须说明：在什么情况下会出问题
- 如果代码没有明显问题，不要强行挑刺
```

### 4.2 Security Checker Agent

**职责**：检测安全风险

**System Prompt 要点**：
```
你是一个安全审计专家。

审查维度：
1. 注入风险 - SQL、XSS、命令注入
2. 敏感信息 - 硬编码密钥、日志泄露
3. 认证授权 - 权限检查缺失
4. 依赖安全 - 危险的依赖使用方式

输出要求：
- 安全问题必须标记为 error 级别
- 说明具体的攻击场景
- 提供修复建议
```

### 4.3 Style Advisor Agent

**职责**：代码风格和最佳实践建议

**System Prompt 要点**：
```
你是一个代码风格顾问。

审查维度：
1. 命名规范 - 变量、函数、类的命名
2. 代码结构 - 函数长度、嵌套层级
3. 注释质量 - 必要的注释是否缺失
4. TypeScript 最佳实践 - 类型使用、any 滥用

输出要求：
- 风格建议标记为 suggestion 或 nitpick
- 不要过度苛刻，专注于影响可读性的问题
- 对于小问题，用 nitpick 级别
```

---

## 5. 数据结构

### 5.1 输入：Unified Diff 格式

```diff
diff --git a/src/utils.ts b/src/utils.ts
index 1234567..abcdefg 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,6 +10,15 @@ export function existingFunction() {
   return true;
 }

+export function validateEmail(email: string): boolean {
+  if (!email) {
+    return false;
+  }
+  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
+  return regex.test(email);
+}
+
 export function anotherFunction() {
```

### 5.2 输出：Structured Review

```typescript
const reviewResult: PRReviewResult = {
  prNumber: 123,
  totalComments: 3,
  commentsByFile: new Map([
    ['src/utils.ts', [
      {
        filePath: 'src/utils.ts',
        lineNumber: 12,
        severity: 'warning',
        category: 'logic',
        message: '邮箱验证正则过于简单，无法处理带 + 号的邮箱地址（如 user+tag@example.com）',
        suggestion: 'const regex = /^[a-zA-Z0-9.!#$%&\'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)*$/;'
      },
      {
        filePath: 'src/utils.ts',
        lineNumber: 11,
        severity: 'suggestion',
        category: 'style',
        message: '建议添加 JSDoc 注释说明函数用途和参数',
      }
    ]]
  ]),
  summary: '本次 PR 新增了邮箱验证函数。发现 1 个潜在问题（正则表达式覆盖范围不足）和 1 个改进建议（添加文档注释）。',
  stats: {
    errors: 0,
    warnings: 1,
    suggestions: 1
  }
};
```

---

## 6. CLI 使用方式

### 6.1 基础用法

```bash
# 审查指定 PR
pnpm run review https://github.com/owner/repo/pull/123

# 审查本地仓库的 PR（需要在 git 仓库目录下）
pnpm run review --pr 123

# 指定审查维度
pnpm run review https://github.com/owner/repo/pull/123 --agents logic,security

# 输出到文件
pnpm run review https://github.com/owner/repo/pull/123 --output review.json
```

### 6.2 配置文件

```yaml
# .pr-review.yml（项目根目录）
agents:
  - logic
  - security
  - style

# 忽略规则
ignore:
  paths:
    - "*.test.ts"
    - "*.spec.ts"
    - "dist/**"

# Prompt 覆盖（可选）
prompts:
  logic: |
    你是一个专注于 React 项目的代码审查专家...
```

---

## 7. 执行计划

### Phase 1: 核心能力（2周）

**Week 1: GitHub + Diff 解析**
- [ ] GitHub API 客户端封装
- [ ] Unified Diff 解析器
- [ ] 测试用例（使用 fixtures）

**Week 2: Review Agent**
- [ ] Agent 接口定义
- [ ] Logic Reviewer 实现
- [ ] Orchestrator 编排
- [ ] CLI 基础命令

**产出**：能在本地跑通，输入 PR URL，输出 Review 结果

### Phase 2: 完善 Agent（1周）

- [ ] Security Checker Agent
- [ ] Style Advisor Agent
- [ ] Review 结果聚合优化
- [ ] 输出格式化（Markdown、JSON）

### Phase 3: GitHub 集成（1周）

- [ ] 发表 PR Review Comment
- [ ] 行级评论定位
- [ ] GitHub Action 配置

### Phase 4: 增强（2周）

- [ ] 上下文增强（集成 RAG，理解完整文件）
- [ ] 配置文件支持
- [ ] 评估系统（Review 质量打分）
- [ ] Prompt 优化

---

## 8. 复用已有能力

| 已有模块 | 复用方式 |
|----------|----------|
| **01-structured-extractor** | Zod Schema 定义 Review 输出结构 |
| **03-evals** | 评估 Review 质量 |
| **05-rag-codebase** | 理解完整文件上下文（Phase 4） |
| **06-multi-agent** | Agent 协作模式参考 |

---

## 9. 风险与应对

| 风险 | 应对措施 |
|------|----------|
| GitHub API Rate Limit | 缓存 PR 数据，避免重复请求 |
| Diff 解析边界情况 | 使用成熟库（parse-diff）+ 自定义补充 |
| Agent 产出不稳定 | 结构化输出 + 重试机制 |
| Token 超限（大 PR） | 分文件处理，必要时截断 |
| 行号定位错误 | 根据 hunk header 计算，充分测试 |

---

## 10. 下一步

确认设计后，从 Phase 1 Week 1 开始：
1. 创建 `packages/07-pr-review-bot` 目录结构
2. 实现 GitHub Client
3. 实现 Diff Parser

# PR Review Bot — 架构设计

## 项目定位

AI 驱动的 GitHub PR 自动 Code Review Bot。支持两种运行方式：作为 GitHub Action 集成到 CI，或在本地通过 CLI 手动触发。

---

## 两个入口

### 1. `action/index.ts` — GitHub Action 入口

跑在 GitHub CI 环境。通过 `@actions/core` 读取 workflow 配置的参数（token、model、agents 等），结果通过 `core.setOutput` 输出。

### 2. `src/cli.ts` — 本地 CLI 入口

基于 `commander`，命令：

```bash
pr-review review <pr-url> [--post-comment] [-o ./reviews]
```

从 `.env` 读取环境变量，结果打印到终端并可写入 markdown 文件。

**两个入口的核心逻辑完全一致**，只是参数来源和结果输出方式不同。

---

## 主调用链路

```
入口（action/index.ts 或 src/cli.ts）
  │
  ├── GitHubClient.getPullRequest(prId)        # 拉取 PR 元信息
  ├── GitHubClient.getPullRequestDiff(prId)    # 拉取 PR diff 原始文本
  │
  ├── parseDiff(diffText)                      # 解析 diff → DiffChunk[]
  │     └── 每个 DiffChunk = 一个文件的变更
  │
  ├── getValidLineNumbers(chunk)               # 提取可评论的行号集合（新增/上下文行）
  │
  ├── new ReviewOrchestrator([agents])         # 组装 Orchestrator
  │
  └── orchestrator.reviewPR(prNumber, title, body, files)
        │
        └── for each file (非 deleted):
              └── orchestrator.reviewFile(context)
                    │
                    └── Promise.all(agents) — 并行执行各 agent
                          │
                          agent.review(context)
                            ├── formatDiffForReview(chunk)  # 格式化 diff 给 LLM 看
                            ├── OpenAI chat.completions.create(...)
                            └── 返回 ReviewResult { comments[], summary }

  结果处理：
  ├── filterValidComments()             # 过滤掉行号不在 diff 范围内的评论
  ├── GitHubClient.createReview()       # 批量发 inline 行级 comment
  └── GitHubClient.createIssueComment() # 发一条 markdown 格式的汇总 comment
```

---

## 核心模块职责

| 模块 | 文件 | 职责 |
|---|---|---|
| **GitHub 客户端** | `src/github/client.ts` | 封装 Octokit，提供 getPR / getDiff / createReview / createIssueComment |
| **Diff 解析器** | `src/github/diff-parser.ts` | 把 raw diff 文本解析为结构化 `DiffChunk[]`，并提供 `formatDiffForReview` 给 LLM 使用 |
| **类型定义** | `src/review/types.ts` | `ReviewAgent` 接口、`ReviewComment`、`PRReviewResult` 等核心类型（Zod schema） |
| **3 个 Agent** | `src/review/agents/` | `LogicReviewerAgent` / `SecurityCheckerAgent` / `StyleAdvisorAgent`，各自独立 system prompt，调 OpenAI 返回结构化 JSON |
| **Orchestrator** | `src/review/orchestrator.ts` | 遍历文件，对每个文件并行跑所有 agent，聚合全部 `ReviewResult` 为一个 `PRReviewResult` |

---

## 数据结构

### DiffChunk（来自 diff-parser）

```typescript
interface DiffChunk {
  filePath: string;
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  hunks: DiffHunk[];
}

interface DiffHunk {
  oldStart: number; newStart: number;
  changes: DiffChange[];
}

interface DiffChange {
  type: 'add' | 'delete' | 'context';
  lineNumber: number;
  content: string;
}
```

### ReviewComment（来自 types.ts，Zod 校验）

```typescript
interface ReviewComment {
  filePath: string;
  lineNumber: number;
  severity: 'error' | 'warning' | 'suggestion' | 'nitpick';
  category: 'logic' | 'security' | 'style' | 'performance';
  message: string;
  suggestion?: string;
}
```

### PRReviewResult

```typescript
interface PRReviewResult {
  prNumber: number;
  totalComments: number;
  commentsByFile: Map<string, ReviewComment[]>;
  summary: string;
  stats: { errors: number; warnings: number; suggestions: number; nitpicks: number };
}
```

---

## Agent 设计

每个 Agent 实现 `ReviewAgent` 接口：

```typescript
interface ReviewAgent {
  name: string;
  description: string;
  review(context: ReviewContext): Promise<ReviewResult>;
}
```

三个 Agent 职责：

| Agent | 文件 | 审查维度 |
|---|---|---|
| `LogicReviewerAgent` | `agents/logic.ts` | 边界条件、错误处理、逻辑漏洞、潜在 Bug |
| `SecurityCheckerAgent` | `agents/security.ts` | 注入、鉴权、敏感数据、依赖安全 |
| `StyleAdvisorAgent` | `agents/style.ts` | 命名规范、代码可读性、重复代码 |

所有 Agent 向 LLM 请求时使用 `response_format: { type: 'json_object' }`，返回结果经 Zod schema 校验后转为 `ReviewComment[]`。

---

## 行号过滤机制

LLM 返回的 comment 行号不一定落在 diff 范围内（LLM 可能幻觉），所以发布前有一道过滤：

- `getValidLineNumbers(chunk)` — 从 diff 中提取所有 `add` 和 `context` 类型行的行号，组成 `Set<number>`
- `filterValidComments()` — 只有行号在 Set 内的才作为 inline comment，其余降级为汇总 comment 里的文字描述

---

## 优化记录

- **2026-02-20**：`orchestrator.reviewFile` 从串行（for loop + await）改为并行（Promise.all），agent 间无状态依赖，并行安全。

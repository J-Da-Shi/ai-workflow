# shared 包运行时报错问题

## 错误信息

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/mi/Desktop/ai-workflow/packages/shared/src/types/user'
```

## 原因

NestJS 后端通过 `nest start --watch` 启动时，先把 `.ts` 编译成 `.js` 放到 `dist/` 目录，然后用 Node.js 运行 `dist/` 里的 `.js` 文件。

当后端代码 `import { WorkflowStatus } from 'shared'` 时，Node.js 去找 shared 包的入口文件。但 shared 包的 `package.json` 里 `main` 指向的是 `./src/index.ts` —— Node.js 运行时不能执行 `.ts` 文件，所以报错。

> **本质：** TypeScript 编译阶段能识别 `.ts`，但 Node.js 运行阶段不能。

## 修复方法

给 shared 包加构建步骤，把 `.ts` 编译成 `.js`：

### 1. 添加 `packages/shared/tsconfig.json`

```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "module": "commonjs",
    "target": "es2020",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### 2. 更新 `packages/shared/package.json`

```json
{
  "name": "shared",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

### 3. 构建 shared 包

```bash
cd packages/shared
pnpm build
```

### 4. 启动后端前先构建 shared

```bash
pnpm --filter shared build && pnpm --filter backend start:dev
```

---

# 审批通过后工作流不继续执行后续节点

## 错误表现

3 个节点 A→B→C 串联，A 执行完进入 waiting 状态，用户点击「通过」后：
- A 变成 approved
- B 和 C **完全没有变化**，停留在 pending
- 刷新页面后，发现 B、C 实际上已经在后端执行完了，状态是正确的

说明：**后端执行逻辑没问题，问题在前端没有实时同步状态到画布上。**

## 排查过程

### 第一步：检查后端 `approveNode` 调用链

`approveNode` 方法在审批通过后会调用 `continueWorkflow` 来继续执行后续节点：

```ts
// execution.service.ts - approveNode
if (userId) {
  await this.continueWorkflow(workflowId, nodeKey, userId);
}
```

`continueWorkflow` 内部遍历后续节点，对不需要审批的节点自动调用 `approveNode`：

```ts
// execution.service.ts - continueWorkflow
if (!nodeConfig.requireApproval) {
  await this.approveNode(workflowId, nodeKey); // ← 没传 userId！
}
```

**发现问题 1：** `continueWorkflow` 调用 `approveNode` 时没传 `userId`，导致 `approveNode` 里的 `if (userId)` 判断为 false，不会递归调用 `continueWorkflow`。如果链上有多个不需要审批的节点，只有第一个会被自动通过，后续断链。

`executeWorkflow` 中也有同样的问题（第 280 行），不过因为 `executeWorkflow` 自身有 while 循环推进，所以这里影响较小。

### 第二步：检查前端轮询机制

前端 `handleApprove`（StageNode 组件）的流程：

1. 乐观更新当前节点为 approved
2. 派发 `start-poll-executions` 事件 → NodePages 开始 3 秒间隔轮询
3. 调用 `approveNode` API（后端同步执行所有后续节点，可能耗时几十秒）
4. API 返回后派发 `sync-executions` → 停止轮询 + 做一次最终同步

**发现问题 2：** 轮询的自动停止条件是"没有 running 状态的节点就停"：

```ts
const hasRunning = executions.some((e) => e.status === 'running');
if (!hasRunning) {
  clearInterval(pollTimerRef.current);
}
```

但 `approveNode` API 是同步阻塞的 — NestJS 在处理这个请求期间，后续的 `getExecutions` 轮询请求也会被阻塞排队。轮询可能在后端还没开始执行下一个节点时就拍到"没有 running 节点"，从而提前停止。

**发现问题 3：** `sync-executions` 事件在 `approveNode` API 返回后触发。虽然此时 `syncExecutions()` 应该能拉到最终状态，但由于这是在 `handleSync` 里的一个 async 调用（没有 await），如果请求失败，错误被静默吞掉，UI 不会更新。

## 修复方法

### 修复 1：后端 — 传递 userId（`execution.service.ts`）

`continueWorkflow` 中自动审批时传入 `userId`：

```ts
// 修复前：
await this.approveNode(workflowId, nodeKey); 
// 修复后：
await this.approveNode(workflowId, nodeKey, userId);
```

`executeWorkflow` 中同样修复：

```ts
// 修复前：
await this.approveNode(workflowId, nodeKey);
// 修复后：
await this.approveNode(workflowId, nodeKey, userId);
```

### 修复 2：前端 — 改进轮询策略（`nodePages/index.tsx`）

将轮询停止条件从"没有 running 节点"改为"**连续 10 次轮询无变化（30 秒）才停**"：

```ts
const noChangeCountRef = useRef(0);

// 轮询中检测是否有状态变化
let hasChange = false;
setNodes((nds) =>
  nds.map((n) => {
    const exec = executions.find((e) => e.nodeKey === n.data.key);
    if (exec && (n.data.status !== exec.status || n.data.summary !== exec.summary)) {
      hasChange = true;
    }
    // ...
  }),
);

if (!hasChange) {
  noChangeCountRef.current += 1;
} else {
  noChangeCountRef.current = 0;
}
if (noChangeCountRef.current >= 10) {
  clearInterval(pollTimerRef.current);
}
```

同时加了 try/catch，轮询请求失败时不停止，等下次重试。

### 修复 3：前端 — 审批请求与 UI 解耦（`stageNode/index.tsx`）

`handleApprove` 不再依赖 API 返回后触发同步，改为"发请求 + 失败回退"模式，状态更新完全由轮询驱动：

```ts
// 修复前：
approveNode(workflowId, nodeKey)
  .then(() => {
    window.dispatchEvent(new CustomEvent('sync-executions'));
  })

// 修复后：
approveNode(workflowId, nodeKey)
  .catch(() => {
    // 审批失败时回退状态
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, status: 'waiting' } } : n,
      ),
    );
  })
```

### 修复 4：清理 debug 日志

删除 `approveNode` 和 `continueWorkflow` 中的 4 处 `console.log` 调试语句。

## 根本原因总结

| 层面 | 问题 | 影响 |
|------|------|------|
| 后端 | `approveNode` 调用缺少 `userId` 参数 | 不需要审批的节点链断开 |
| 前端 | 轮询在后端阻塞期间误判"无 running"而停止 | 后续节点状态变化无法推送到 UI |
| 前端 | 审批 API 同步阻塞，最终同步不可靠 | `sync-executions` 事件触发的同步可能不生效 |

# Agent Loop 上下文管理

## Context

Part 1 SSE 已完成。现在解决第二个问题：

Agent Loop 跑 10+ 轮后，messages 数组膨胀到几万 token：
- 每轮 AI 回复（含 tool_calls）+ 每个 tool 的 result 都全量保留
- read_file 返回整个文件可能有几百行（几千 token）
- DeepSeek 上下文窗口有限，超长后 AI 会"失忆"或直接报错

**目标：控制 messages 长度，让 Agent 跑 20+ 轮也不爆上下文。**

---

## 策略：源头截断 + 滚动窗口压缩

两层防御：

1. **源头控制（Step 1）**：read_file 返回结果过长时预截断，从产生端就控制大小
2. **历史压缩（Step 2-3）**：循环中定期压缩旧轮次的 tool result，保留最近 N 轮完整内容

messages 结构（压缩后）:

```
[0] system prompt          ← 始终完整保留
[1] user task              ← 始终完整保留
[2..N] 早期轮次            ← tool result 被截断为摘要
[N+1..末尾] 最近 5 轮     ← 完整保留（AI 需要最新上下文做决策）
```

---

## 改动文件

| Step | 文件 | 做什么 |
|------|------|--------|
| 1 | `backend/src/modules/agent/agent.tools.ts` | readFile 函数加截断逻辑 |
| 2 | `backend/src/modules/agent/agent.service.ts` | 新增 `compressMessages()` 私有方法 |
| 3 | `backend/src/modules/agent/agent.service.ts` | 循环中每轮调用前执行压缩 |

---

## Step 1: read_file 源头截断

**文件:** `backend/src/modules/agent/agent.tools.ts` — readFile 函数

**当前行为:** 只要文件 <1MB 就全量返回（可能有 500+ 行、几千 token）

**改为:**

- 文件超过 200 行，且未指定 startLine/endLine → 全量返回，但末尾追加提示：
  ```
  \n[文件共 N 行，较长，建议使用 startLine/endLine 精确读取]
  ```
- 文件超过 500 行，且未指定 startLine/endLine → 硬截断，只返回前 200 行 + 提示：
  ```
  \n[文件过长(共N行)，已只显示前 200 行。请使用 startLine/endLine 参数精确读取需要的部分]
  ```
- 指定了 startLine/endLine → 行为不变（用户已经在精确读取）

**为什么:**
- AI 通常不需要 500 行文件的全部内容
- 截断 + 提示 → AI 会学会先 search_code 定位再精确读取
- System Prompt 已写"大文件只通过 search_code + 片段读取"，截断是兜底强制

---

## Step 2: compressMessages 方法

**文件:** `backend/src/modules/agent/agent.service.ts`

**位置:** buildSystemPrompt 方法之后、runAgent 方法之前

**逻辑:**

- **输入:** messages 数组, keepRecent = 5
- **输出:** 压缩后的新 messages 数组

1. 前 2 条固定保留（system + user task）
2. 剩余消息按"轮"分组:
   - 一轮 = 1 条 assistant 消息 + 它后面的所有 tool 消息
3. 最近 keepRecent 轮 → 完整保留
4. 更早的轮次 → 压缩:
   - `role='tool'` 且 content > 500 字符 → 截断为前 200 字符 + `"\n...[已截断，共 N 字符]"`
   - `role='assistant'` 且 content > 300 字符 → 截断为前 200 字符 + `"\n...[中间思考已截断]"`
   - 其余消息保持原样

**关键约束:**
- 不能删除任何 assistant 消息中的 `tool_calls` 字段（OpenAI API 要求 tool_call 和 tool result 必须一一配对，删了会报错）
- 只压缩 content 文本内容，消息结构（role、tool_call_id 等）不动
- 不能删除任何消息，只能截短 content

---

## Step 3: 循环中应用压缩

**文件:** `backend/src/modules/agent/agent.service.ts`

**位置:** for 循环内，`onEvent?.({ type: 'thinking' ...})` 之后、LLM 调用之前

**代码:**

```typescript
if (messages.length > 12) {
  const compressed = this.compressMessages(messages);
  messages.length = 0;
  messages.push(...compressed);
}
```

**为什么阈值是 12:** system + user + 5 轮 × (1 assistant + ~1-2 tool) ≈ 12 条是正常工作范围，超过说明历史已经积累够多了。

**为什么用 `messages.length = 0` + push:** messages 是 const 声明不能重新赋值，原地替换内容。

---

## 验证

1. 后端 `npx tsc --noEmit` 编译通过
2. 用复杂 prompt 测试（创建 5+ 文件，触发 15+ 轮循环）
3. Agent 正常完成任务，后半段不"失忆"
4. read_file 超长文件时返回截断提示，AI 自动改用 startLine/endLine
5. 可选调试：循环中加 `console.log('msgs:', messages.length)` 观察压缩效果

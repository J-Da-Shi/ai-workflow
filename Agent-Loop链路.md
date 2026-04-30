用户输入节点级的Prompt -> 用户点击执行 -> 执行接口 executeNode -> 获取当前节点配置（this.workflowRepo.getNodeConfig(workflowId, nodeKey)）-> 拿到用户输入的Prompt

-> 判断当前是否为代码开发节点（是） -> 把上一个节点的 Prompt 与当前获取到的节点级 Prompt结合在一起 -> 调用 Agent Loop（this.agentService.runAgent()）-> 判断状态锁防止并发（runningAgents 使用哈希表 存节点与工作流key当key，布尔为值，true是并发）

-> 准备工作目录（通过 path.join('工作目录', workflowId)）-> 确保工作目录存在（不存在，自己创建 fs.mkdirSync(workDir, { recursive: true })）-> 构建初始消息列表（OpenAI 格式的消息数组）-> 创建一个循环上限（防止死循环）

-> 开始循环 -> 调用 DeepSeek 需要指定格式（this.openai.chat.completions.create({ 字段可查 DeepSeek 文档 })）会把工具的定义一起带给 AI -> AI 判断是否需要使用工具 -> 需要使用的话返回 message.tool_calls(工具列) 通过循环挨个调用 

-> 通过 executeTool（name） 调用工具 使用 case 判断 name 是哪个工具然后执行 -> 记录日志（字段存储 logs.push）(持久化存储 this.logRepo.save) -> 把工具执行结果加入消息历史（格式：role="tool",content=执行结果,tool_call_id=对应的调用 ID，DeepSeek/OpenAI 要求每个 tool_call 都有对应的 tool result 消息）
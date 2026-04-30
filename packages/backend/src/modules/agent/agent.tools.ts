/**
 * Agent 工具定义与执行
 *
 * 这个文件做两件事:
 * 1. 定义工具的 JSON Schema（发给 DeepSeek API 的 tools 参数）
 *    DeepSeek 根据这些 Schema 知道有哪些工具可用，需要什么参数
 *    然后在回复中返回 tool_calls 告诉后端要调用哪个工具
 *
 * 2. 实现工具的执行逻辑（后端收到 tool_calls 后，真正执行文件操作）
 *
 * 工具的参数中所有 path 都是相对路径（相对于工作目录 workDir）
 * 每个工具执行前都会做路径安全检查，防止 AI 操作工作目录之外的文件
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * 第一部分：工具 Schema 定义
 *
 *
 * 格式遵循 OpenAI Function Calling 标准（DeepSeek 兼容）
 * 每个工具包含：
 *    type: "function"（固定值）
 *    function.name：工具名称（AI 调用时用这个名字）
 *    function.description：工具描述（AI 根据描述判断何时使用这个工具）
 *    function.parameters：JSON Schema 格式的参数定义
 */
export const AGENT_TOOLS: any[] = [
  {
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description:
        '列出指定目录下的文件和子目录。返回树形结构，包含文件类型标识（📁目录/📄文件）。' +
        '用于了解项目结构，决定需要读取哪些文件。',
      parameters: {
        type: 'object',
        properties: {
          // path 要列出的目录路径（相对于项目根目录）
          // 例如：'src/modules' 会列出 src/modules/ 下的所有内容
          path: {
            type: 'string',
            description:
              '目录路径（相对于项目根目录），例如 "src/modules"。传 “.” 表示根目录',
          },
          // depth：递归深度，防止目录层级太深导致输出过长
          // 默认 2 层，最多5层
          depth: {
            type: 'number',
            description:
              '递归深度（默认 2，最大 5）。层级越深输出越长，建议先用小深度概览',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description:
        '读取指定文件的内容。支持通过 startLine/endLine 只读取部分内容，' +
        '避免大文件占满上下文窗口。建议先用 search_code 定位关键代码的行号，再精确读取。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件路径（相对于项目根目录），例如 "src/app.ts"',
          },
          // startLine / endLine 可选的行范围参数
          // 用于只读取文件的某个片段，节省 token
          // 例如 search_code 找到关键代码在第 42 行，可以读 30-60 行的上下文
          startLine: {
            type: 'number',
            description: '起始行号（从 1 开始，可选）。不传则从第 1 行开始',
          },
          endLine: {
            type: 'number',
            description: '结束行号（包含，可选）。不传则读到文件末尾',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_code',
      description:
        '在项目中搜索包含指定文本的代码行（类似 grep）。返回匹配的文件路径和行号。' +
        '用于定位函数、变量、类名等在哪个文件的哪一行，然后用 read_file 精确读取。',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description:
              '要搜索的文本或正则表单是，例如 "validatePassword" 或 "class.*Service"',
          },
          // path 搜索范围，限定在某个目录下搜索
          // 不传则搜索整个项目（可能结果太多）
          path: {
            type: 'string',
            description:
              '搜索范围（目录路径，可选）。例如 "src/modules/auth" 只在 auth 模块中搜索',
          },
          // filePattern：文件名过滤，只搜索匹配的文件
          // 例如 "*.ts" 只搜索 TypeScript 文件
          filePattern: {
            type: 'string',
            description:
              '文件名过滤（glob 模式，可选），例如 "*.ts" 只搜索 TypeScript 文件',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description:
        '创建或覆盖指定文件。如果文件所在的目录不存在会自动创建。' +
        '写入前务必先用 read_file 确认文件当前内容，避免覆盖重要代码。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              '文件路径（相对于项目根目录），例如 "src/new-service.ts"',
          },
          content: {
            type: 'string',
            description: '要写入的完整文件内容',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
];

/**
 * 第二部分：路径安全检查
 *
 *
 * 将相对路径解析为绝对路径，并检查是否在工作目录内
 *
 * 这是一个安全关键函数：AI 可能传入 "../../etc/passwd" 这样的路径
 * 试图读取工作目录之外的系统文件（路径穿越攻击）
 *
 * 防护方式：
 * 1. path.resolve() 把 ".." 等相对路径解析成真实的绝对路径
 * 2. 检查解析后的路径是否以 workDir 开头
 * 3. 不是的话直接抛错，阻止操作
 *
 * @param workDir - 工作目录的绝对路径（Git 仓库根目录）
 * @param filePath - AI 传入的相对路径
 * @returns 安全的绝对路径
 * @throws Error 如果路径逃出了工作目录
 */
function safePath(workDir: string, filePath: string): string {
  // path.resolve 会处理 .. 、 . 等，得到真实的绝对路径
  // 例如 workDir = "/tmp/repo", filePath = "../../etc/passwd"
  //  -> resolve 后 = "/etc/passwd"
  //  -> 不以 "/tmp/repo" 开头 -> 抛错
  const fullPath = path.resolve(workDir, filePath);
  if (!fullPath.startsWith(path.resolve(workDir))) {
    throw new Error(`非法路径：${filePath} 超出了工作目录范围`);
  }

  return fullPath;
}

// ─────────────────────────────────────────────
// 第三部分：各工具的执行实现
// ─────────────────────────────────────────────

/**
 * list_directory 工具实现
 *
 * 递归列出目录结构，返回树形文本
 * 输出格式：
 *   📁 src/
 *     📁 modules/
 *       📄 app.module.ts
 *     📄 main.ts
 *   📄 package.json
 *
 * @param workDir - 项目根目录绝对路径
 * @param dirPath - 要列出的目录（相对路径）
 * @param depth   - 最大递归深度
 */
function listDirectory(
  workDir: string,
  dirPath: string,
  depth: number,
): string {
  const fullPath = safePath(workDir, dirPath);

  // 检查路径是否存在且时目录
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    return `错误：目录不存在 - ${dirPath}`;
  }

  // 内部递归函数
  // indent：当前缩紧级别（用空格表示层级）
  // currentDepth：当前已递归的深度
  function walk(dir: string, indent: string, currentDepth: number): string {
    // 超过最大深度，停止递归
    if (currentDepth > depth) return '';

    // readdirSync + withFileTypes：读取目录内容并获取文件类型信息
    // withFileTypes 返回 Dirent 对象，可以直接用 .isDirectory() 判断类型
    // 不需要额外调 fs.stat() 性能更好
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    let result = '';
    for (const entry of entries) {
      // 跳过不需要列出的目录
      // node_modules: npm 依赖，文件极多，列出来没意义
      // .git: Git 内部数据，和代码无关
      // dist: 编译产物，不需要查看
      if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;

      if (entry.isDirectory()) {
        // 是目录；显示 📁 图标，然后递归进入
        result += `${indent}📁 ${entry.name}/\n`;
        result += walk(
          path.join(dir, entry.name),
          indent + '  ', // 每深一层多两个空格缩紧
          currentDepth + 1,
        );
      } else {
        // 是文件：显示 📄 图标
        result += `${indent}📄 ${entry.name}\n`;
      }
    }
    return result;
  }

  return walk(fullPath, '', 1) || '（空目录）';
}

/**
 * read_file 工具实现
 *
 * 读取文件内容，支持行范围截取
 * 返回带行号的内容，方便 AI 引用具体行
 *
 * @param workDir  - 项目根目录绝对路径
 * @param filePath - 文件相对路径
 * @param startLine - 起始行（可选，从 1 开始）
 * @param endLine  - 结束行（可选，包含）
 */
function readFile(
  workDir: string,
  filePath: string,
  startLine?: number,
  endLine?: number,
): string {
  const fullPath = safePath(workDir, filePath);

  if (!fs.existsSync(fullPath)) {
    return `错误：文件不存在 — ${filePath}`;
  }

  // statSync 获取文件信息，检查大小
  // 超过 1MB 的文件（如打包产物、图片）不适合全量读取
  const stat = fs.statSync(fullPath);
  if (stat.size > 1024 * 1024) {
    return `错误：文件过大（${(stat.size / 1024).toFixed(0)}KB），请使用 startLine/endLine 参数读取部分内容`;
  }

  // 读取文件全部内容，按换行符分割成行数组
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');

  // 如果指定了行范围，截取对应部分
  // start/end 使用数组索引（从 0 开始），但用户传的 startLine 从 1 开始
  // 所以 startLine 要减 1 转换为数组索引
  const start = startLine ? Math.max(0, startLine - 1) : 0;
  const end = endLine ? Math.min(lines.length, endLine) : lines.length;
  const sliced = lines.slice(start, end);

  // 总行数提示：告诉 AI 这个文件有多大，帮助它决定是否需要分段读取
  const totalInfo = `[文件共 ${lines.length} 行，当前显示第 ${start + 1}-${start + sliced.length} 行]\n`;

  // 返回带行号的内容
  // 格式: "  42 | const x = 1;"
  // 行号右对齐，方便 AI 引用
  return (
    totalInfo +
    sliced
      .map((line, i) => `${String(start + i + 1).padStart(4)} | ${line}`)
      .join('\n')
  );
}

/**
 * search_code 工具实现
 *
 * 在项目中搜索包含指定文本的代码行
 * 底层使用 grep 命令（跨平台可用）
 *
 * 返回格式：
 *   src/auth/auth.service.ts:42:  async validatePassword(...)
 *   src/auth/auth.controller.ts:15:  @Post('login')
 *
 * @param workDir     - 项目根目录绝对路径
 * @param pattern     - 搜索文本或正则
 * @param searchPath  - 搜索范围（可选，相对路径）
 * @param filePattern - 文件名过滤（可选，如 "*.ts"
 */
function searchCode(
  workDir: string,
  pattern: string,
  searchPath?: string,
  filePattern?: string,
): string {
  // 确定搜索的目标目录
  const targetDir = searchPath ? safePath(workDir, searchPath) : workDir;

  if (!fs.existsSync(targetDir)) {
    return `错误：搜索路径不存在 — ${searchPath}`;
  }

  // 构建 grep 命令
  // -r：递归搜索子目录
  // -n：显示行号
  // -I：忽略二进制文件（避免搜索到图片等非文本文件）
  // --include：文件名过滤（如 --include="*.ts"）
  // --exclude-dir：排除不需搜索的目录
  let cmd = `grep -rn -I --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist`;

  // 如果指定了文件类型过滤，添加 --include 参数
  if (filePattern) {
    cmd += ` --include="${filePattern}"`;
  }

  // 讲所搜文本用单引号包裹，防止 shell 注入
  // 注意：先把文本中的单引号转义，避免单引号嵌套问题
  // 'it\'s' → shell 中正确处理含单引号的字符串
  const safePattern = pattern.replace(/'/g, "'\\''");
  cmd += ` '${safePattern}' "${targetDir}"`;

  try {
    // execSync 同步执行 shell 命令
    // maxBuffer: grep 结果可能很多，给足缓冲区
    // encoding: 返回字符串而不是 Buffer
    const result = execSync(cmd, {
      maxBuffer: 1024 * 1024, // 1MB 缓冲区
      encoding: 'utf-8',
      timeout: 100000,
    });

    // 把结果中的绝对路径替换为相对路径
    // 原始结果："/tmp/repo/src/app.ts:42: ..."
    // 替换后：  "src/app.ts:42: ..."
    // 这样 AI 看到的是相对路径，和它调用其他工具时用的路径格式一致
    const lines = result
      .split('\n')
      .filter(Boolean)
      .map((line) => line.replace(workDir + '/', ''));

    // 限制最多返回 50 条结果，防止输出过长占满上下文
    if (lines.length > 50) {
      return (
        lines.slice(0, 50).join('\n') +
        `\n\n... 共 ${lines.length} 条结果，只显示前 50 条。请缩小搜索范围。`
      );
    }

    return lines.length > 0
      ? lines.join('\n')
      : `未找到匹配 "${pattern}" 的代码`;
  } catch (err: any) {
    // grep 没找到匹配时返回 exit code 1，这不是错误
    // execSync 会把非零 exit code 当作异常抛出
    if (err.status === 1) {
      return `未找到匹配 "${pattern}" 的代码`;
    }
    return `搜索出错：${err.message}`;
  }
}

/**
 * write_file 工具实现
 *
 * 创建或覆盖文件
 * 如果父目录不存在会自动递归创建
 *
 * @param workDir  - 项目根目录绝对路径
 * @param filePath - 文件相对路径
 * @param content  - 文件内容
 */
function writeFile(workDir: string, filePath: string, content: string): string {
  const fullPath = safePath(workDir, filePath);

  // 检查文件是否已存在（用于返回信息区分 “新建” 和 “修改”）
  const existed = fs.existsSync(fullPath);

  // mkdirSync + recursive: 递归创建所有不存在的父目录
  // 例如写入 "src/modules/new/service.ts"
  //   如果 src/modules/new/ 不存在，会自动创建
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  // 写入文件内容（UTF-8 编码）
  // 如果文件已存在会被覆盖（这是期望行为）
  fs.writeFileSync(fullPath, content, 'utf-8');

  // 统计写入的行数，返回给 AI 作为确认
  const lineCount = content.split('\n').length;
  return existed
    ? `已修改文件 ${filePath}（${lineCount} 行）`
    : `已创建文件 ${filePath}（${lineCount} 行）`;
}

/**
 * 工具执行器 - Agent Loop 的核心调度函数
 *
 * AI 返回的 tool_calls 中包含 toolName 和 toolArgs
 * 这个函数根据 toolName 找到对应的实现函数并执行
 *
 * @param toolName - 工具名称（和 AGENT_TOOLS 中的 function.name 对应）
 * @param toolArgs - 工具参数（AI 生成的 JSON 对象）
 * @param workDir  - 工作目录的绝对路径
 * @returns 工具执行结果的文本描述
 */
export function executeTool(
  toolName: string,
  toolArgs: Record<string, any>,
  workDir: string,
): string {
  try {
    switch (toolName) {
      case 'list_directory':
        return listDirectory(
          workDir,
          toolArgs.path || '',
          // depth 限制在 1-5 之间，默认为2
          Math.min(Math.max(toolArgs.depth || 2, 1), 5),
        );

      case 'read_file':
        return readFile(
          workDir,
          toolArgs.path,
          toolArgs.startLine,
          toolArgs.endLine,
        );

      case 'search_code':
        return searchCode(
          workDir,
          toolArgs.pattern,
          toolArgs.path,
          toolArgs.filePattern,
        );

      case 'write_file':
        return writeFile(workDir, toolArgs.path, toolArgs.content);

      default:
        return `未知工具：${toolName}`;
    }
  } catch (err: any) {
    // 所有工具执行异常统一在这里捕获
    // 返回错误信息而不是抛出异常，这样 Agent Loop 不会中断
    // AI 收到错误信息后可以选择重试或换种方式操作
    return `工具执行失败：${err.message}`;
  }
}

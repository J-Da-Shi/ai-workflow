/**
 * DocumentProcessorService - 文档解析 + 切片
 *
 * 职责：
 *  1. 解析不同格式的文档（PDF / Word / Markdown）提取纯文本
 *  2. 把纯文本切成小片段（chunk），每个片段约 512 token
 *
 * 这是 RAG 管线的第一步：
 *  用户上传文档 -> [解析 + 切片] -> Embedding -> 存入 Milvus
 *
 * 切片策略：递归字符分割
 *  优先按段落 (\n\n) 分割 -> 段落太长则按换行(\n) -> 还是太长按字数强切
 *  相邻片段有 200 字符重叠，防止关键句子被截断
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);

  /**
   * 解析文档，提取纯文本
   *
   * 根据文件类型调用不同的解析库
   *    pdf -> pdf-parse：提取 PDF 中的文字（忽略图片、表格布局）
   *    word -> mammoth：把 .docx 转成纯文本（忽略格式）
   *    markdown -> 直接读文件内容（已经是文本）
   *
   * @param filePath    - 文件在磁盘上的路径
   * @param fileType    - 文件类型
   * @returns 提取出的纯文本
   */
  async parseDocument(filePath: string, fileType: string): Promise<string> {
    switch (fileType) {
      case 'pdf': {
        // pdf-parse v2：创建实例传入文件 Buffer，调用 getText() 提取所有页面文字
        const buffer = fs.readFileSync(filePath);
        const pdf = new PDFParse({ data: buffer });
        const result = await pdf.getText();
        await pdf.destroy();
        return result.text;
      }
      case 'word': {
        // mammoth：把 .docx 文件转成纯文吧
        // extractRawText 只提取文字，不保留格式
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
      }
      case 'markdown': {
        // markdown 本身就是文本，直接读文件
        return fs.readFileSync(filePath, 'utf-8');
      }
      default:
        throw new Error(`不支持的文件类型：${fileType}`);
    }
  }

  /**
   * 把文本切成小片段
   *
   * 策略：递归字符分割
   *    这是 LangChain 中最常用的切片算法，原理：
   *    1. 先按段落（\n\n）把文本分成大块
   *    2. 如果每个大块超过 chunkSize，再按换行（\n）细分
   *    3. 如果还是超过，按字数强制阶段
   *    4. 相邻片段保留 overlap 个字符的重叠
   *
   * 为什么要重叠：
   *    假设一句话 “接口返回格式为 JSON，状态码200表示成功”
   *    如果恰好在 “JSON，” 处被切断：
   *        片段A：“...接口返回格式为JSON，”
   *        片段B：“状态码200表示成功...”
   *    搜索 “接口返回的状态码” 时两个片段都不完整
   *    有重叠后：
   *        片段A：“...接口返回格式为JSON，状态码200表示成功”
   *        片段B：“JSON，状态码200表示成功...”
   *    片段A 就能完整命中
   *
   * @param text    - 要切片的纯文本
   * @param chunkSize - 每个片段的最大字符数（默认 1500，约 512 token）
   * @param overlap - 相邻片段重叠的字符数（默认 200）
   * @returns 切片数组
   */
  splitText(
    text: string,
    chunkSize: number = 1500,
    overlap: number = 200,
  ): string[] {
    // 第一步：按段落分割（\n\n 是最自然的语义边界）
    const paragraphs = text.split(/\n\n+/);

    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      // 单个段落就超过 chunkSize -> 需要进一步按换行或字数切
      if (para.length > chunkSize) {
        // 先把之前累积的内容作为一 chunk 存起来
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        // 对超长段落做强直切分
        const subChunks = this.splitLongText(para, chunkSize, overlap);
        chunks.push(...subChunks);
        continue;
      }

      // 当前累积 + 新段落是否超过 chunkSize
      if (currentChunk.length + para.length + 2 > chunkSize) {
        // 超了 -> 把当前累积存为一个 chunk
        chunks.push(currentChunk.trim());
        // 新 chunk 从重叠部分开始（取上一个 chunk 的末尾 overlap 字符）
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + '\n\n' + para;
      } else {
        // 没超 -> 继续累积
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      }
    }

    // 别忘了最后一段
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter((c) => c.length > 0);
  }

  /**
   * 对超长文本做强直切分
   *
   * 先尝试按换行切，如果一行还是太长就按字数硬切
   *
   * @param text    - 超长文本
   * @param chunkSize - 最大字符数
   * @param overlap - 重叠字符数
   * @returns 切片数组
   */
  private splitLongText(
    text: string,
    chunkSize: number,
    overlap: number,
  ): string[] {
    const chunks: string[] = [];
    // 先尝试按换行分割
    const lines = text.split(/\n/);
    let currentChunk = '';

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > chunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          const overlapText = currentChunk.slice(-overlap);
          currentChunk = overlapText + '\n' + line;
        } else {
          // 单行就超过 chunkSize -> 按字数硬切
          for (let i = 0; i < line.length; i += chunkSize - overlap) {
            chunks.push(line.slice(i, i + chunkSize));
          }
        }
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}

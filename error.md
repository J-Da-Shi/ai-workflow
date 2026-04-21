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

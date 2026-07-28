# Markdown Editor

一个用 Electron + CodeMirror 构建的桌面 Markdown 编辑器,支持实时预览、多标签页、自动保存、崩溃恢复与多格式导出。

## 功能

- **编辑器**:CodeMirror 6,语法高亮、自动补全、列表续写、格式快捷键
- **实时预览**:marked + DOMPurify 清洗,morphdom 增量更新;mermaid 图表、KaTeX 公式均懒加载;代码块一键复制、图片灯箱、编辑/预览同步滚动
- **多标签页**:拖拽排序、双击重命名、中键关闭、右键「关闭其他/右侧」(带未保存提示)
- **持久化**:按文件路径自动保存;崩溃/异常退出后按 tab 持久 id 还原内容与活动标签
- **导出**:Markdown / HTML(含浅/深色样式) / PDF
- **效率工具**:大纲面板、命令面板(<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>)、模板、查找替换
- **外观**:浅色/深色主题、字号与字体设置、编辑/预览窗格顺序切换
- **系统集成**:`.md`/`.markdown` 文件关联、拖拽打开、粘贴图片自动存入 `assets/`、托盘最小化到后台

## 技术栈

Electron 33 · TypeScript 5 · CodeMirror 6 · marked · DOMPurify · mermaid · KaTeX · morphdom · electron-vite · vitest

## 快速开始

```bash
npm install      # .npmrc 已配 npmmirror 国内镜像
npm run dev      # 启动开发(主进程 + 预加载 + 渲染进程热更新)
```

常用脚本:

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发环境 |
| `npm test` | 运行单元测试 |
| `npm run typecheck` | 三个 tsconfig 全量类型检查 |
| `npm run lint` | ESLint(`src/`,`.ts`) |
| `npm run format:fix` | Prettier 格式化 |

## 构建

```bash
npm run build:win   # Windows: NSIS 安装包 + portable
npm run build:mac   # macOS: DMG(x64 + arm64)
```

产物输出到 `release/`。Windows 安装包语言为简体中文(NSIS),由 `scripts/installer.nsh` 定制。

## 目录结构

```
src/
  main/        主进程:窗口、菜单、托盘、IPC 处理器、路径校验
  preload/     预加载:经 contextBridge 暴露的 window.api(薄透传层)
  renderer/    渲染进程:编辑器、预览、tabs、UI、状态、缓存
  shared/      跨进程共享:类型、IPC 通道常量(CH/EV)、zod 运行时 schema
tests/         纯函数单元测试(fs-paths、fuzzy、word-count、isPathSafe 等)
scripts/       electron-builder 打包钩子(afterPack、NSIS installer)
```

## 架构要点

- **IPC 边界**:`shared/ipc.ts` 集中定义通道常量与 zod schema;preload 只做透传;main 端每个处理器都先过 zod 校验,再过 `isPathSafe` 路径校验(拦截 `..` 遍历、Windows 保留设备名、符号链接)。
- **安全**:`contextIsolation: true` + `nodeIntegration: false`;预览 HTML 经 DOMPurify 清洗;外链(http/https/mailto)在系统浏览器打开而非替换应用窗口。
- **原子写**:文件保存采用 `tmp + rename`,避免写入中断导致文件损坏。

## 许可证

MIT

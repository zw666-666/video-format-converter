# 视频格式转换器

一款基于 **Tauri 2 + React + TypeScript + ffmpeg** 的轻量桌面视频格式转换工具。通过 ffmpeg / ffprobe 命令行（sidecar 侧载）实现视频信息读取、播放预览与多格式转换。

## ✨ 功能特性

- **信息展示**：通过 ffprobe 读取时长、分辨率、视频/音频编码、码率、帧率、文件大小、容器格式。

- **视频播放预览**：拖入后可播放原视频（拖动进度条），转换完成后自动切换播放转换结果（视频/动图/音频）。

- **多格式转换**：支持 20 种输出格式 —— 视频（MP4/MOV/M4V/MKV/WebM/AVI/MPG/WMV/FLV/M2TS/VOB/OGV/GIF）与音频（MP3/WAV/FLAC/M4A/OGG），并根据输入文件类型智能过滤可转格式。

- **预设方案**：兼容优先 / 高清 / 手机 / 极小体积 一键选参。

- **批量队列**：拖拽或选择多个文件，串行转换，实时进度条，可增删文件。

- **实时进度**：解析 ffmpeg `-progress pipe:1` 输出，精确上报每个文件的转换进度。

## 🛠 技术栈

| 层    | 技术                           | 说明                                     |
| ---- | ---------------------------- | -------------------------------------- |
| 桌面框架 | Tauri 2.0 (Rust)             | 轻量（约几 MB）、跨平台，Rust 后端 spawn ffmpeg 子进程 |
| 前端   | React 19 + TypeScript + Vite | UI 与状态管理                               |
| 视频处理 | ffmpeg / ffprobe 4.1+        | 通过 Tauri sidecar 调用命令行                 |
| 事件通信 | Tauri IPC (invoke / emit)    | 前端调用命令、后端推送进度事件                        |

## 📦 安装使用（普通用户）

1. 下载 Windows 安装包 `视频格式转换器_0.1.0_x64-setup.exe`（见仓库 Release，或本地 `src-tauri/target/release/bundle/nsis/` 下）；
2. 双击运行安装程序，按提示完成安装（可勾选「创建桌面快捷方式」）；
3. 安装完成后，从「开始菜单」或「桌面」启动「视频格式转换器」；
4. 拖入视频 / 音频即可转换，**无需安装 ffmpeg 或任何运行环境**（ffmpeg 已内置）。

> 卸载：Windows「设置 → 应用」中找到「视频格式转换器」卸载即可。

## 🛠 本地开发（面向开发者）

> 以下环境与步骤仅用于从源码运行或二次打包，普通用户无需关心。

### 环境要求

- Node.js ≥ 20（<https://nodejs.org>）

- Rust 工具链 + MSVC Build Tools（Windows）

**安装 Rust 工具链（Windows）**：

1. 下载并运行 `rustup-init.exe`（<https://rustup.rs>），保持默认安装，完成后重开终端；
2. 安装 MSVC 链接器：下载 VS Build Tools（<https://aka.ms/vs/17/release/vs_BuildTools.exe>），运行时勾选「使用 C++ 的桌面开发」工作负载（包含 MSVC 编译器与 Windows SDK）。

> 缺少 Rust 环境时，`npm run tauri dev` 会因找不到编译器/链接器而失败。

- ffmpeg 无需单独安装 —— 首次运行前执行下载脚本拉取 sidecar（见下方）

### 运行与打包

```bash
# 安装依赖
npm install

# 下载 ffmpeg / ffprobe sidecar（一次性）
powershell -ExecutionPolicy Bypass -File scripts/download-ffmpeg.ps1

# 开发模式（热更新）
npm run tauri dev

# 打包发布（生成 Windows NSIS 安装包 .exe）
# 若国内网络下载打包工具（NSIS/WiX）超时，先设置 GitHub 镜像再打包：
#   PowerShell: $env:TAURI_BUNDLER_TOOLS_GITHUB_MIRROR = "https://gh-proxy.com/https://github.com"
npm run tauri build
```

## 🗂 目录结构

```
视频格式转换器/
├─ src/                      # React 前端
│  ├─ App.tsx                # 主界面（三栏布局 + 队列进度）
│  ├─ App.css                # 样式
│  └─ types.ts               # 类型与预设方案
├─ src-tauri/
│  ├─ src/
│  │  ├─ lib.rs              # Tauri 命令注册与插件
│  │  ├─ main.rs             # 入口
│  │  └─ ffmpeg.rs           # ffmpeg/ffprobe sidecar 封装（核心逻辑）
│  ├─ binaries/              # sidecar 可执行文件（带 target triple 后缀）
│  ├─ capabilities/          # 权限配置（shell/dialog/opener）
│  ├─ tauri.conf.json        # 应用配置（含 sidecar 声明）
│  └─ Cargo.toml
├─ demo/index.html           # 早期布局原型（可双击预览）
└─ PLAN.md                   # 开发计划文档
```

## 🔬 工作原理

1. **读信息**：`ffprobe -print_format json -show_format -show_streams <file>`，Rust 解析 JSON 返回前端。
2. **缩略图**：`ffmpeg -ss <t> -frames:v 1 -vf scale=480:-2 <file>`，抽帧后转 base64 回传。
3. **转换**：根据选项构造 `ffmpeg -y -i <in> <params> -progress pipe:1 <out>`，Rust 解析 `out_time_us` 字段计算百分比，通过 `emit("convert-progress")` 实时推送。

> ffmpeg 二进制内置为 Tauri sidecar：`src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`（ffprobe 同理），随应用打包分发，无需用户安装。


# 会话总结 · 视频格式转换器

> 面试测试项目交付总结。日期：2026-09-05

## 一、需求回顾

面试测试要求：

1. 加载视频信息并显示，获取视频缩略图预览；
2. 视频转换使用 ffmpeg 命令行（不要求接入 ffmpeg API）；
3. 自行做合理优化；
4. 会话完成后生成会话总结 MD；
5. 提交 GitHub，完成后回链给 HR。

结合岗位介绍（AI 应用开发实习，Windows 桌面应用为主，点名 Tauri / Electron / TypeScript），项目定位为**轻量跨平台桌面视频转换工具**。

## 二、技术选型决策（关键）

| 项 | 结论 | 理由 |
|---|---|---|
| 桌面框架 | **Tauri 2.0 + Rust** | 岗位直接点名 Tauri、强调"新技术探索 + 桌面打包"；打包体积小（约几 MB）、跨平台；Rust 能高效 spawn ffmpeg 子进程并流式读取进度 |
| 前端 | React 19 + TS + Vite | 组件化承载文件队列/预览/设置/进度联动 |
| 视频处理 | ffmpeg / ffprobe 命令行 | 需求明确指定；作为 Tauri sidecar 内置，随应用打包 |
| 决策过程 | 最初拟用 Electron（Node 已就绪），经用户确认后改用 Tauri | Tauri 更贴岗位加分项、更能体现技术深度 |

## 三、实现内容

### 模块划分

1. 文件导入（拖拽 + 对话框，多文件 + 格式校验）
2. 视频信息展示（ffprobe JSON 解析）
3. 缩略图预览（ffmpeg 抽帧 → base64）
4. 转换设置（格式/预设/分辨率/码率/编码器/音频）
5. 转换引擎（构造 ffmpeg 命令 + 进度解析）
6. 队列与进度（串行批量 + 实时进度条）
7. 输出与历史（打开输出目录）

### 核心文件

- `src-tauri/src/ffmpeg.rs` — ffmpeg/ffprobe sidecar 封装，三个核心函数：`get_video_info` / `get_thumbnail` / `convert_video`
- `src-tauri/src/lib.rs` — Tauri 命令注册与插件初始化
- `src/App.tsx` — 三栏布局前端（文件队列 / 预览 / 设置 + 底部进度）
- `src-tauri/capabilities/default.json` — sidecar 执行权限配置

## 四、验证结果（自测记录）

| 验证项 | 结果 |
|---|---|
| ffmpeg/ffprobe 二进制可执行 | ✅ 通过 |
| 读信息（生成测试视频 → ffprobe 解析 duration/width/codec 等） | ✅ 字段齐全 |
| 抽帧缩略图 | ✅ 生成 jpg |
| 转换 + 进度字段（`out_time_us`/`speed`/`progress`） | ✅ correct |
| 前端构建（tsc + vite） | ✅ 26 模块通过 |
| Rust 编译 | ✅ 通过（仅无害 linker 提示） |
| 应用启动（`tauri dev`） | ✅ 进程存活、无报错 |
| sidecar 权限配置 | ✅ 符合 schema、编译校验通过 |

> 说明：GUI 端到端点击交互（选择文件 → 显示 → 转换）需在有显示环境的人工操作下完成，核心链路已通过命令行等价验证。

## 五、遇到的问题与解决

1. **无 Rust 工具链**：通过清华镜像下载 rustup-init，配置 rsproxy 国内镜像加速 crates 下载。
2. **无 MSVC 链接器**（`link.exe` not found）：安装 VS Build Tools（最小 VC 工具链 + Windows 11 SDK）。
3. **官方 rust 源超时**：切换清华大学 TUNA 镜像。
4. **ffmpeg 官方/ GitHub 源慢或被重置**：改用 npmmirror 的 `@ffmpeg-installer` / `@ffprobe-installer` 二进制包（二进制打包在 tarball 内、走国内 CDN）。
5. **Electron → Tauri 切换**：清理 Electron 依赖，改用 `create-tauri-app` 重新脚手架。
6. **base64 过时 API 与未使用导入**：改为 `base64::engine::general_purpose::STANDARD` + `Engine` trait。

## 六、环境变更（本机）

- 安装 Rust 1.98.1（`~/.cargo` 已加入 PATH）
- 安装 VS Build Tools 2022（MSVC 14.44 + Windows 11 SDK 10.0.22621）
- 配置 npm 镜像（npmmirror）、cargo 镜像（rsproxy）
- 项目 `src-tauri/binaries/` 内置 ffmpeg / ffprobe sidecar

## 七、待办 / 后续

- [ ] GUI 端到端人工验收（在有显示环境下点击验证完整流程）
- [ ] （可选）`tauri build` 生成 Windows 安装包
- [ ] ffmpeg 升级为与 ffprobe 一致的新版本（当前 ffmpeg 4.1 / ffprobe 5.1，功能覆盖已足够）
- [ ] 提交 GitHub 并回链 HR
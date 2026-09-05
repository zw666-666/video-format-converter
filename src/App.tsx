import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  basename, dirname, FORMATS, PRESETS, RESOLUTIONS, VIDEO_EXTS,
  type ConvertOptions, type FileItem, type VideoInfo,
} from "./types";
import "./App.css";

function extOf(path: string): string {
  const b = basename(path);
  const i = b.lastIndexOf(".");
  return i >= 0 ? b.slice(i + 1).toLowerCase() : "";
}

export default function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [converting, setConverting] = useState(false);

  const [settings, setSettings] = useState({
    format: "mp4",
    preset: "balanced",
    resolutionIndex: 0,
    videoCodec: "libx264",
    audioCodec: "aac",
    audioBitrate: "128k",
    videoBitrate: 0, // 0 = 使用 crf
    crf: 23,
  });

  const selectedItem = useMemo(
    () => files.find((f) => f.path === selected) ?? null,
    [files, selected],
  );

  // 监听转换进度事件
  useEffect(() => {
    let disposed = false;
    listen<{ input: string; percent: number; speed: string }>("convert-progress", (e) => {
      if (disposed) return;
      const { input, percent } = e.payload;
      setFiles((prev) =>
        prev.map((f) => (f.path === input ? { ...f, percent } : f)),
      );
    }).then((unlisten) => {
      if (disposed) unlisten();
    });
    return () => {
      disposed = true;
    };
  }, []);

  // 拖拽导入
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (disposed) return;
        const t = event.payload.type;
        if (t === "over" || t === "enter") setDragging(true);
        else if (t === "leave") setDragging(false);
        else if (t === "drop") {
          setDragging(false);
          addFiles(event.payload.paths);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // 加入文件并异步读取信息
  function addFiles(paths: string[]) {
    const valid = paths.filter((p) => VIDEO_EXTS.includes(extOf(p)));
    if (valid.length === 0) return;
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.path));
      const next = prev.slice();
      for (const p of valid) {
        if (!existing.has(p)) {
          next.push({ path: p, name: basename(p), status: "idle", percent: 0 });
        }
      }
      return next;
    });
    for (const p of valid) {
      invoke<VideoInfo>("get_video_info", { path: p })
        .then((info) => {
          setFiles((prev) => prev.map((f) => (f.path === p ? { ...f, info } : f)));
        })
        .catch((e) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.path === p ? { ...f, status: "error", error: String(e) } : f,
            ),
          );
        });
    }
  }

  async function pickFiles() {
    const result = await open({
      multiple: true,
      filters: [{ name: "视频文件", extensions: VIDEO_EXTS }],
    });
    if (Array.isArray(result)) addFiles(result);
    else if (typeof result === "string") addFiles([result]);
  }

  function selectFile(path: string) {
    setSelected(path);
  }

  // 选中文件后（信息加载完成且无缩略图时）自动抽帧预览
  useEffect(() => {
    if (!selectedItem?.info || selectedItem.thumbnail) return;
    const path = selectedItem.path;
    let disposed = false;
    invoke<string>("get_thumbnail", { path, timeSec: 1.0 })
      .then((thumb) => {
        if (!disposed) {
          setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, thumbnail: thumb } : f)));
        }
      })
      .catch(() => {
        /* 缩略图失败不阻断 */
      });
    return () => {
      disposed = true;
    };
  }, [selectedItem]);

  function updateSettings(patch: Partial<typeof settings>) {
    setSettings((s) => ({ ...s, ...patch }));
  }

  function changeFormat(fmt: string) {
    const def = FORMATS[fmt] ?? FORMATS.mp4;
    updateSettings({
      format: fmt,
      videoCodec: def.videoCodec,
      audioCodec: def.audioCodec,
      audioBitrate: def.audioBitrate || "128k",
    });
  }

  function changePreset(key: string) {
    const def = PRESETS[key];
    if (!def) return;
    setSettings((s) => ({
      ...s,
      preset: key,
      crf: def.crf,
      audioBitrate: def.audioBitrate,
      resolutionIndex: def.resolution
        ? RESOLUTIONS.findIndex((r) => r.width === def.resolution![0])
        : s.resolutionIndex,
    }));
  }

  function changeResolution(idx: number) {
    updateSettings({ resolutionIndex: idx });
  }

  async function startConvert() {
    const targets = files.filter((f) => f.status === "idle" && f.info);
    if (targets.length === 0 || converting) return;
    setConverting(true);

    const def = FORMATS[settings.format] ?? FORMATS.mp4;
    const res = RESOLUTIONS[settings.resolutionIndex] ?? RESOLUTIONS[0];

    for (const f of targets) {
      const outName = basename(f.path).replace(/\.[^.]+$/, "") + "_converted." + def.ext;
      const outPath = dirname(f.path) + "\\" + outName;
      const options: ConvertOptions = {
        format: settings.format,
        videoCodec: settings.videoCodec,
        audioCodec: settings.audioCodec,
        audioBitrate: settings.audioBitrate,
        videoBitrate: settings.videoBitrate > 0 ? settings.videoBitrate + "k" : "",
        width: res.width,
        height: res.height,
        crf: settings.crf,
      };
      setFiles((prev) =>
        prev.map((x) => (x.path === f.path ? { ...x, status: "converting", percent: 0 } : x)),
      );
      try {
        await invoke("convert_video", {
          input: f.path,
          output: outPath,
          options,
          duration: f.info!.duration,
        });
        setFiles((prev) =>
          prev.map((x) =>
            x.path === f.path ? { ...x, status: "done", output: outPath, percent: 100 } : x,
          ),
        );
      } catch (e) {
        setFiles((prev) =>
          prev.map((x) =>
            x.path === f.path ? { ...x, status: "error", error: String(e) } : x,
          ),
        );
      }
    }
    setConverting(false);
  }

  function resetQueue() {
    setFiles((prev) => prev.map((f) => ({ ...f, percent: 0, status: "idle" as const, output: undefined, error: undefined })));
    setConverting(false);
  }

  const doneCount = files.filter((f) => f.status === "done").length;
  const totalPercent =
    files.length > 0
      ? files.reduce((acc, f) => acc + (f.status === "done" ? 100 : f.percent), 0) / files.length
      : 0;

  return (
    <div className="app">
      <HeaderBar onPick={pickFiles} />

      <div className="body">
        <FileSidebar
          files={files}
          selected={selected}
          dragging={dragging}
          onPick={pickFiles}
          onSelect={selectFile}
        />

        <PreviewPane item={selectedItem} />

        <SettingsPanel
          settings={settings}
          onChangeFormat={changeFormat}
          onChangePreset={changePreset}
          onChangeResolution={changeResolution}
          onChange={(patch) => updateSettings(patch)}
        />
      </div>

      <FooterBar
        converting={converting}
        fileCount={files.length}
        doneCount={doneCount}
        totalPercent={totalPercent}
        canConvert={files.some((f) => f.status === "idle" && f.info)}
        onConvert={startConvert}
        onReset={resetQueue}
        onOpenOutput={() => {
          const done = files.find((f) => f.status === "done" && f.output);
          if (done) revealItemInDir(done.output!);
        }}
      />
    </div>
  );
}

/* ------------------------------ 顶部栏 ------------------------------ */
function HeaderBar({ onPick }: { onPick: () => void }) {
  return (
    <header className="header">
      <div className="logo">
        <span className="mark">▶</span>
        视频格式转换器 <small>FFmpeg · Tauri</small>
      </div>
      <div className="spacer" />
      <span className="hint">ffmpeg / ffprobe sidecar 已就绪</span>
      <button className="btn primary" onClick={onPick}>
        ＋ 添加视频
      </button>
    </header>
  );
}

/* ------------------------------ 左栏 ------------------------------ */
function FileSidebar({
  files, selected, dragging, onPick, onSelect,
}: {
  files: FileItem[];
  selected: string | null;
  dragging: boolean;
  onPick: () => void;
  onSelect: (path: string) => void;
}) {
  return (
    <aside className="panel sidebar">
      <div className="panel-head">
        文件队列 <span className="hint">{files.length} 个</span>
      </div>
      <div className={`dropzone ${dragging ? "drag" : ""}`} onClick={onPick}>
        <span className="ic">🎬</span>
        <div><b>拖拽视频到此处</b><br />或点击选择文件</div>
        <div className="muted">支持 MP4 / MOV / MKV / AVI / WebM …</div>
      </div>
      <div className="file-list">
        {files.length === 0 && (
          <div className="empty">暂无文件，先添加视频吧</div>
        )}
        {files.map((f) => (
          <div
            key={f.path}
            className={`file ${selected === f.path ? "active" : ""}`}
            onClick={() => onSelect(f.path)}
          >
            <div className="thumb">{f.thumbnail ? <img src={f.thumbnail} alt="" /> : "🎞"}</div>
            <div className="meta">
              <div className="name" title={f.path}>{f.name}</div>
              <div className="sub">
                {f.info ? `${f.info.resolution} · ${f.info.sizeText}` : f.error ? "读取失败" : "读取中…"}
              </div>
            </div>
            <span className={`badge ${f.status}`}>
              {f.status === "converting" ? `${f.percent.toFixed(0)}%` : statusText(f.status)}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function statusText(s: string): string {
  switch (s) {
    case "done": return "完成";
    case "converting": return "转换中";
    case "error": return "失败";
    default: return "待转换";
  }
}

/* ------------------------------ 中栏 ------------------------------ */
function PreviewPane({ item }: { item: FileItem | null }) {
  return (
    <section className="panel stage">
      <div className="panel-head">视频预览</div>
      <div className="stage-inner">
        <div className="preview">
          {!item ? (
            <div className="ph"><span className="film">🎥</span><p>选择左侧文件查看预览</p></div>
          ) : item.thumbnail ? (
            <img className="preview-img" src={item.thumbnail} alt="" />
          ) : (
            <div className="ph"><span className="film">🎥</span><p>正在生成缩略图…</p></div>
          )}
        </div>
        <div className="info-grid">
          <Info k="时长" v={item?.info?.durationText ?? "-"} />
          <Info k="分辨率" v={item?.info?.resolution ?? "-"} />
          <Info k="视频编码" v={item?.info?.videoCodec ?? "-"} />
          <Info k="码率" v={item?.info?.bitrate ?? "-"} />
          <Info k="帧率" v={item?.info?.frameRate ?? "-"} />
          <Info k="大小" v={item?.info?.sizeText ?? "-"} />
        </div>
      </div>
    </section>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="info">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

/* ------------------------------ 右栏 ------------------------------ */
function SettingsPanel({
  settings, onChangeFormat, onChangePreset, onChangeResolution, onChange,
}: {
  settings: any;
  onChangeFormat: (fmt: string) => void;
  onChangePreset: (key: string) => void;
  onChangeResolution: (idx: number) => void;
  onChange: (patch: any) => void;
}) {
  const isAudio = settings.format === "mp3";
  const isGif = settings.format === "gif";
  return (
    <aside className="panel settings-panel">
      <div className="panel-head">转换设置</div>
      <div className="settings">
        <div className="field">
          <label>目标格式</label>
          <select value={settings.format} onChange={(e) => onChangeFormat(e.target.value)}>
            {Object.entries(FORMATS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {!isAudio && !isGif && (
          <div className="field">
            <label>预设方案</label>
            <div className="preset-chips">
              {Object.entries(PRESETS).map(([k, v]) => (
                <span
                  key={k}
                  className={`chip ${settings.preset === k ? "on" : ""}`}
                  onClick={() => onChangePreset(k)}
                >
                  {v.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {!isAudio && !isGif && (
          <div className="field">
            <label>分辨率</label>
            <select value={settings.resolutionIndex} onChange={(e) => onChangeResolution(Number(e.target.value))}>
              {RESOLUTIONS.map((r, i) => (
                <option key={i} value={i}>{r.label}</option>
              ))}
            </select>
          </div>
        )}

        {!isAudio && !isGif && (
          <div className="field">
            <label>视频码率（0 = 自动 CRF）</label>
            <div className="slider-row">
              <input
                type="range" min={0} max={8000} step={100}
                value={settings.videoBitrate}
                onChange={(e) => onChange({ videoBitrate: Number(e.target.value) })}
              />
              <span className="slider-val">{settings.videoBitrate > 0 ? settings.videoBitrate + " kbps" : "CRF " + settings.crf}</span>
            </div>
          </div>
        )}

        {!isAudio && !isGif && (
          <div className="field">
            <label>视频编码器</label>
            <select value={settings.videoCodec} onChange={(e) => onChange({ videoCodec: e.target.value })}>
              <option value="libx264">H.264 (libx264)</option>
              <option value="libx265">H.265 (libx265)</option>
              <option value="libvpx-vp9">VP9 (libvpx-vp9)</option>
              <option value="copy">复制（无损）</option>
            </select>
          </div>
        )}

        {!isGif && (
          <div className="field">
            <label>音频</label>
            <select value={settings.audioCodec} onChange={(e) => onChange({ audioCodec: e.target.value })}>
              {isAudio ? (
                <>
                  <option value="libmp3lame">MP3</option>
                </>
              ) : (
                <>
                  <option value="aac">AAC</option>
                  <option value="libopus">Opus</option>
                  <option value="libmp3lame">MP3</option>
                  <option value="">移除音频</option>
                </>
              )}
            </select>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------ 底部栏 ------------------------------ */
function FooterBar({
  converting, fileCount, doneCount, totalPercent, canConvert, onConvert, onReset, onOpenOutput,
}: {
  converting: boolean;
  fileCount: number;
  doneCount: number;
  totalPercent: number;
  canConvert: boolean;
  onConvert: () => void;
  onReset: () => void;
  onOpenOutput: () => void;
}) {
  return (
    <footer className="footer">
      <button className="btn primary" disabled={!canConvert || converting} onClick={onConvert}>
        {converting ? "转换中…" : "▶ 开始转换"}
      </button>
      <button className="btn" onClick={onReset}>重置</button>
      <button className="btn" onClick={onOpenOutput} disabled={doneCount === 0}>打开输出目录</button>
      <div className="progress"><div className="bar" style={{ width: totalPercent + "%" }} /></div>
      <span className="stat">完成 {doneCount}/{fileCount} · {totalPercent.toFixed(0)}%</span>
    </footer>
  );
}
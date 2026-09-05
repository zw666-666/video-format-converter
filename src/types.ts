// 前端类型定义与预设方案

export interface VideoInfo {
  duration: number;
  durationText: string;
  width: number;
  height: number;
  resolution: string;
  videoCodec: string;
  audioCodec: string;
  bitrate: string;
  frameRate: string;
  size: number;
  sizeText: string;
  format: string;
}

export interface ConvertOptions {
  format: string;
  videoCodec: string;
  audioCodec: string;
  audioBitrate: string;
  videoBitrate: string;
  width: number;
  height: number;
  crf: number;
}

export type FileStatus = "idle" | "converting" | "done" | "error";

export interface FileItem {
  path: string;
  name: string;
  info?: VideoInfo;
  thumbnail?: string;
  status: FileStatus;
  percent: number;
  output?: string;
  error?: string;
}

// 输出格式定义
export interface FormatDef {
  ext: string;
  label: string;
  videoCodec: string;
  audioCodec: string;
  audioBitrate: string;
}

export const FORMATS: Record<string, FormatDef> = {
  // 视频
  mp4: { ext: "mp4", label: "MP4 (H.264)", videoCodec: "libx264", audioCodec: "aac", audioBitrate: "128k" },
  mp4h265: { ext: "mp4", label: "MP4 (H.265/HEVC)", videoCodec: "libx265", audioCodec: "aac", audioBitrate: "128k" },
  mov: { ext: "mov", label: "MOV", videoCodec: "libx264", audioCodec: "aac", audioBitrate: "128k" },
  m4v: { ext: "m4v", label: "M4V", videoCodec: "libx264", audioCodec: "aac", audioBitrate: "128k" },
  mkv: { ext: "mkv", label: "MKV (H.264)", videoCodec: "libx264", audioCodec: "aac", audioBitrate: "128k" },
  mkvh265: { ext: "mkv", label: "MKV (H.265)", videoCodec: "libx265", audioCodec: "aac", audioBitrate: "128k" },
  webm: { ext: "webm", label: "WebM (VP9)", videoCodec: "libvpx-vp9", audioCodec: "libopus", audioBitrate: "128k" },
  avi: { ext: "avi", label: "AVI", videoCodec: "mpeg4", audioCodec: "libmp3lame", audioBitrate: "128k" },
  mpg: { ext: "mpg", label: "MPG (MPEG-2)", videoCodec: "mpeg2video", audioCodec: "libmp3lame", audioBitrate: "128k" },
  wmv: { ext: "wmv", label: "WMV", videoCodec: "wmv2", audioCodec: "wmav2", audioBitrate: "128k" },
  flv: { ext: "flv", label: "FLV", videoCodec: "flv", audioCodec: "libmp3lame", audioBitrate: "128k" },
  ts: { ext: "ts", label: "M2TS/TS", videoCodec: "libx264", audioCodec: "aac", audioBitrate: "128k" },
  vob: { ext: "vob", label: "VOB (DVD)", videoCodec: "mpeg2video", audioCodec: "libmp3lame", audioBitrate: "128k" },
  ogv: { ext: "ogv", label: "OGV (Theora)", videoCodec: "libtheora", audioCodec: "libvorbis", audioBitrate: "128k" },
  gif: { ext: "gif", label: "GIF 动图", videoCodec: "gif", audioCodec: "", audioBitrate: "" },
  // 音频
  mp3: { ext: "mp3", label: "MP3", videoCodec: "", audioCodec: "libmp3lame", audioBitrate: "192k" },
  wav: { ext: "wav", label: "WAV (无损)", videoCodec: "", audioCodec: "pcm_s16le", audioBitrate: "" },
  flac: { ext: "flac", label: "FLAC (无损)", videoCodec: "", audioCodec: "flac", audioBitrate: "" },
  m4a: { ext: "m4a", label: "M4A (AAC)", videoCodec: "", audioCodec: "aac", audioBitrate: "192k" },
  ogg: { ext: "ogg", label: "OGG (Vorbis)", videoCodec: "", audioCodec: "libvorbis", audioBitrate: "128k" },
};

// 预设方案
export interface PresetDef {
  label: string;
  crf: number;
  audioBitrate: string;
  videoBitrate: number;
  resolution?: [number, number];
}

export const PRESETS: Record<string, PresetDef> = {
  balanced: { label: "兼容优先", crf: 23, audioBitrate: "128k", videoBitrate: 0 },
  hd: { label: "高清", crf: 18, audioBitrate: "192k", videoBitrate: 0 },
  mobile: { label: "手机", crf: 24, audioBitrate: "96k", videoBitrate: 0, resolution: [854, 480] },
  small: { label: "极小体积", crf: 28, audioBitrate: "96k", videoBitrate: 0 },
};

// 分辨率选项
export interface ResolutionOption {
  label: string;
  width: number;
  height: number;
}

export const RESOLUTIONS: ResolutionOption[] = [
  { label: "保持原分辨率", width: 0, height: 0 },
  { label: "1920×1080", width: 1920, height: 1080 },
  { label: "1280×720", width: 1280, height: 720 },
  { label: "854×480", width: 854, height: 480 },
  { label: "640×360", width: 640, height: 360 },
];

// 可导入的媒体扩展名（视频 + 动图 + 音频）
export const VIDEO_EXTS = [
  "mp4", "mov", "mkv", "avi", "webm", "flv", "wmv", "m4v", "mpg", "mpeg", "ts", "m2ts",
  "3gp", "rmvb", "vob", "ogv", "asf", "gif",
  "mp3", "wav", "m4a", "aac", "flac", "ogg", "opus",
];

export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i >= 0 ? path.slice(0, i) : "";
}
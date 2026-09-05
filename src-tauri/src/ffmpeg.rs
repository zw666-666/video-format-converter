//! ffmpeg / ffprobe 侧载（sidecar）封装：读信息、抽帧缩略图、格式转换与进度解析。

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// 视频信息（ffprobe 解析结果）
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub duration: f64,
    pub duration_text: String,
    pub width: i32,
    pub height: i32,
    pub resolution: String,
    pub video_codec: String,
    pub audio_codec: String,
    pub bitrate: String,
    pub frame_rate: String,
    pub size: u64,
    pub size_text: String,
    pub format: String,
}

/// 转换参数（由前端传入）
#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConvertOptions {
    pub format: String,
    pub video_codec: String,
    pub audio_codec: String,
    pub audio_bitrate: String,
    pub video_bitrate: String,
    pub width: i32,
    pub height: i32,
    pub crf: u32,
}

/// 进度事件负载
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    input: String,
    percent: f64,
    speed: String,
}

/// 读取视频信息（调用 ffprobe）
pub async fn get_video_info(app: &AppHandle, path: &str) -> Result<VideoInfo, String> {
    let output = app
        .shell()
        .sidecar("ffprobe")
        .map_err(|e| e.to_string())?
        .args([
            "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path,
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let v: Value = serde_json::from_str(&stdout).map_err(|e| format!("解析失败: {e}"))?;

    let format = &v["format"];
    let streams = v["streams"].as_array().cloned().unwrap_or_default();

    let mut video = None;
    let mut audio = None;
    for s in &streams {
        let codec_type = s["codec_type"].as_str().unwrap_or("");
        match codec_type {
            "video" if video.is_none() => video = Some(s.clone()),
            "audio" if audio.is_none() => audio = Some(s.clone()),
            _ => {}
        }
    }

    let duration = format["duration"].as_str().and_then(|x| x.parse::<f64>().ok()).unwrap_or(0.0);
    let width = video.as_ref().and_then(|s| s["width"].as_i64()).unwrap_or(0) as i32;
    let height = video.as_ref().and_then(|s| s["height"].as_i64()).unwrap_or(0) as i32;
    let size = format["size"].as_str().and_then(|x| x.parse::<u64>().ok()).unwrap_or(0);
    let bitrate_raw = format["bit_rate"].as_str().and_then(|x| x.parse::<f64>().ok()).unwrap_or(0.0);

    let frame_rate = video
        .as_ref()
        .and_then(|s| s["r_frame_rate"].as_str())
        .and_then(parse_ratio)
        .unwrap_or(0.0);

    Ok(VideoInfo {
        duration,
        duration_text: format_duration(duration),
        width,
        height,
        resolution: if width > 0 && height > 0 { format!("{width}×{height}") } else { "-".into() },
        video_codec: video.as_ref().and_then(|s| s["codec_name"].as_str()).unwrap_or("-").to_string(),
        audio_codec: audio.as_ref().and_then(|s| s["codec_name"].as_str()).unwrap_or("无").to_string(),
        bitrate: if bitrate_raw > 0.0 { format!("{:.0} kbps", bitrate_raw / 1000.0) } else { "-".into() },
        frame_rate: if frame_rate > 0.0 { format!("{frame_rate:.2} fps") } else { "-".into() },
        size,
        size_text: format_size(size),
        format: format["format_name"].as_str().unwrap_or("-").to_string(),
    })
}

/// 抽取指定时间点的缩略图，返回 base64 JPEG（含 data URI 前缀）
pub async fn get_thumbnail(app: &AppHandle, path: &str, time_sec: f64) -> Result<String, String> {
    let out_file = std::env::temp_dir()
        .join(format!("vfc_thumb_{}_{}.jpg", std::process::id(), time_sec as u64));
    let out_path = out_file.to_string_lossy().to_string();

    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args([
            "-ss", &time_sec.to_string(),
            "-i", path,
            "-frames:v", "1",
            "-vf", "scale=480:-2",
            "-q:v", "3",
            "-y", &out_path,
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let bytes = std::fs::read(&out_file).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&out_file);
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes)))
}

/// 执行转换，实时上报进度
pub async fn convert_video(
    app: AppHandle,
    input: String,
    output: String,
    options: ConvertOptions,
    duration: f64,
) -> Result<(), String> {
    let args = build_ffmpeg_args(&input, &output, &options);

    let (mut rx, _child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    let key = input.clone();
    let mut last_speed = String::new();
    let mut stderr_tail = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                for line in text.lines() {
                    if let Some(rest) = line.strip_prefix("out_time_us=") {
                        if let Ok(us) = rest.trim().parse::<f64>() {
                            let percent = if duration > 0.0 {
                                (us / 1_000_000.0 / duration * 100.0).clamp(0.0, 99.9)
                            } else {
                                0.0
                            };
                            let _ = app.emit(
                                "convert-progress",
                                ProgressPayload { input: key.clone(), percent, speed: last_speed.clone() },
                            );
                        }
                    } else if let Some(rest) = line.strip_prefix("speed=") {
                        last_speed = rest.trim().trim_end_matches('x').to_string();
                    }
                }
            }
            CommandEvent::Stderr(bytes) => {
                stderr_tail.push_str(&String::from_utf8_lossy(&bytes));
                if stderr_tail.len() > 2000 {
                    let drain = stderr_tail.len() - 2000;
                    stderr_tail.drain(..drain);
                }
            }
            CommandEvent::Terminated(payload) => {
                if payload.code == Some(0) {
                    let _ = app.emit(
                        "convert-progress",
                        ProgressPayload { input: key.clone(), percent: 100.0, speed: last_speed.clone() },
                    );
                    return Ok(());
                }
                return Err(format!(
                    "转换失败：{}",
                    stderr_tail.trim().lines().last().unwrap_or("请检查输入文件或参数")
                ));
            }
            _ => {}
        }
    }

    Ok(())
}

/// 依据转换选项构造 ffmpeg 参数
fn build_ffmpeg_args(input: &str, output: &str, o: &ConvertOptions) -> Vec<String> {
    let fmt = o.format.to_lowercase();
    let mut args: Vec<String> = vec!["-y".into(), "-i".into(), input.into()];

    match fmt.as_str() {
        "gif" => {
            args.extend(["-vf".into(), "fps=10,scale=480:-2".into(), "-loop".into(), "0".into()]);
        }
        "mp3" => {
            args.extend(["-vn".into(), "-c:a".into(), "libmp3lame".into()]);
            if !o.audio_bitrate.is_empty() {
                args.extend(["-b:a".into(), o.audio_bitrate.clone()]);
            }
        }
        _ => {
            // 视频编码
            args.extend(["-c:v".into(), o.video_codec.clone()]);
            if o.video_codec == "copy" {
                // 直接拷贝不设码率
            } else if !o.video_bitrate.is_empty() {
                args.extend(["-b:v".into(), o.video_bitrate.clone()]);
            } else {
                args.extend(["-crf".into(), o.crf.to_string()]);
            }
            // 分辨率缩放
            if o.width > 0 && o.height > 0 {
                args.extend(["-vf".into(), format!("scale={}:{}", o.width, o.height)]);
            }
            // 音频
            if o.audio_codec.is_empty() {
                args.push("-an".into());
            } else {
                args.extend(["-c:a".into(), o.audio_codec.clone()]);
                if !o.audio_bitrate.is_empty() {
                    args.extend(["-b:a".into(), o.audio_bitrate.clone()]);
                }
            }
        }
    }

    args.extend(["-progress".into(), "pipe:1".into(), "-nostats".into()]);
    args.push(output.into());
    args
}

/// 解析 "30000/1001" 形式的帧率
fn parse_ratio(s: &str) -> Option<f64> {
    let mut it = s.split('/');
    let num = it.next()?.parse::<f64>().ok()?;
    let den = it.next().unwrap_or("1").parse::<f64>().ok()?;
    if den == 0.0 { None } else { Some(num / den) }
}

/// 秒 → "MM:SS" 或 "HH:MM:SS"
fn format_duration(secs: f64) -> String {
    let total = secs.round() as u64;
    let h = total / 3600;
    let m = (total % 3600) / 60;
    let s = total % 60;
    if h > 0 {
        format!("{h:02}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

/// 字节 → 人类可读大小
fn format_size(bytes: u64) -> String {
    let units = ["B", "KB", "MB", "GB"];
    let mut v = bytes as f64;
    let mut i = 0;
    while v >= 1024.0 && i < units.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    if i == 0 {
        format!("{bytes} B")
    } else {
        format!("{v:.1} {}", units[i])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_video_info_serialization_camel_case() {
        let info = VideoInfo {
            duration: 42.9,
            duration_text: "00:43".into(),
            width: 1280,
            height: 720,
            resolution: "1280×720".into(),
            video_codec: "h264".into(),
            audio_codec: "aac".into(),
            bitrate: "5539 kbps".into(),
            frame_rate: "60.00 fps".into(),
            size: 29747585,
            size_text: "28.4 MB".into(),
            format: "mov,mp4".into(),
        };
        let json = serde_json::to_string(&info).unwrap();
        println!("SERIALIZED: {}", json);
        assert!(json.contains("durationText"), "缺少 durationText: {json}");
        assert!(json.contains("videoCodec"), "缺少 videoCodec: {json}");
        assert!(json.contains("audioCodec"), "缺少 audioCodec: {json}");
        assert!(json.contains("frameRate"), "缺少 frameRate: {json}");
        assert!(json.contains("sizeText"), "缺少 sizeText: {json}");
    }
}
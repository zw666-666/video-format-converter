mod ffmpeg;

#[tauri::command]
async fn get_video_info(app: tauri::AppHandle, path: String) -> Result<ffmpeg::VideoInfo, String> {
    ffmpeg::get_video_info(&app, &path).await
}

#[tauri::command]
async fn get_thumbnail(
    app: tauri::AppHandle,
    path: String,
    time_sec: f64,
) -> Result<String, String> {
    ffmpeg::get_thumbnail(&app, &path, time_sec).await
}

#[tauri::command]
async fn convert_video(
    app: tauri::AppHandle,
    input: String,
    output: String,
    options: ffmpeg::ConvertOptions,
    duration: f64,
) -> Result<(), String> {
    ffmpeg::convert_video(app, input, output, options, duration).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_video_info,
            get_thumbnail,
            convert_video
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
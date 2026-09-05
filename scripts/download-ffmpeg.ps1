# 下载 ffmpeg / ffprobe sidecar 二进制（Windows）
# 用法：在项目根目录执行  powershell -ExecutionPolicy Bypass -File scripts/download-ffmpeg.ps1
# 来源：npmmirror（国内 CDN 加速的 npm 二进制包，二进制打包在 tarball 内）

$ErrorActionPreference = "Stop"
$binDir = Join-Path $PSScriptRoot "..\src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$triple = "x86_64-pc-windows-msvc"
$tmp = Join-Path $env:TEMP "vfc-ffmpeg-dl"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

function Download-And-Extract($url, $outName, $exeName) {
    $tgz = Join-Path $tmp $outName
    Write-Host "下载 $url"
    curl.exe -sS -L -o $tgz $url
    if ($LASTEXITCODE -ne 0) { throw "下载失败: $url" }

    $extract = Join-Path $tmp ($outName -replace '\.tgz$', '')
    New-Item -ItemType Directory -Force -Path $extract | Out-Null
    tar -xzf $tgz -C $extract

    $src = Get-ChildItem $extract -Recurse -Filter $exeName | Select-Object -First 1
    if (-not $src) { throw "未找到 $exeName" }

    $dst = Join-Path $binDir ($exeName -replace '\.exe$', "-$triple.exe")
    Copy-Item $src.FullName $dst -Force
    Write-Host "已保存 -> $dst"
}

Download-And-Extract `
  "https://registry.npmmirror.com/@ffmpeg-installer/win32-x64/-/win32-x64-4.1.0.tgz" `
  "ffmpeg.tgz" "ffmpeg.exe"

Download-And-Extract `
  "https://registry.npmmirror.com/@ffprobe-installer/win32-x64/-/win32-x64-5.1.0.tgz" `
  "ffprobe.tgz" "ffprobe.exe"

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "`n完成：ffmpeg / ffprobe sidecar 已就绪。"
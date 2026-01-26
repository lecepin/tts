# 定义路径和后缀的哈希表
$paths_extensions = @{
  "src-tauri/target/release/bundle/nsis" = "exe"
  "src-tauri/target/release/bundle/msi" = "msi"
}

# 获取当前时间戳
$currentTime = Get-Date -Format "yyyyMMddHHmmss"

# 用于存储找到的文件
$found_files = @()

# 遍历每个路径和对应的后缀
foreach ($dir in $paths_extensions.Keys) {
    $extension = $paths_extensions[$dir]
    
    if (Test-Path $dir) {
        $files = Get-ChildItem -Path $dir -Filter "*.$extension"
        if ($files.Count -gt 0) {
            $file = $files[0]  # 只处理第一个匹配的文件
            $baseName = $file.BaseName
            $newFileName = "$baseName-$currentTime.$extension"
            Move-Item -Path $file.FullName -Destination $newFileName
            $found_files += $newFileName
        }
    } else {
        Write-Warning "目录 $dir 未找到"
    }
}

if ($found_files.Count -eq 0) {
    Write-Error "错误: 未找到任何匹配的文件"
    exit 1
}

# 上传所有找到的文件
$upload_url = "http://u.leping.fun/upload"

foreach ($file in $found_files) {
    Write-Host "正在上传: $file"
    
    $form = @{
        fileToUpload = Get-Item $file
    }
    
    try {
        $response = Invoke-WebRequest -Uri $upload_url -Method Post -Form $form
        if ($response.StatusCode -eq 200) {
            Write-Host "文件 $file 上传成功"
        } else {
            Write-Host "上传文件 $file 失败, HTTP状态码: $($response.StatusCode)"
        }
    } catch {
        Write-Host "上传文件 $file 失败: $_"
    }
} 
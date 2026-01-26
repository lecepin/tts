#!/bin/bash

# 定义路径和后缀的数组
paths=(
    "./src-tauri/target/release/bundle/dmg"
)
extensions=(
    "dmg"
)

# 获取当前时间戳
currentTime=$(date +"%Y%m%d%H%M%S")

# 用于存储找到的文件
found_files=()

# 遍历路径和后缀
for i in "${!paths[@]}"; do
    dir="${paths[$i]}"
    extension="${extensions[$i]}"
    
    if [[ -d "$dir" ]]; then
        for file in "$dir"/*; do
            if [[ -f "$file" && "${file##*.}" == "$extension" ]]; then
                baseName="${file%.*}"
                newFileName="${baseName}-${currentTime}.${extension}"
                mv "$file" "$newFileName"
                found_files+=("$newFileName")
                break  # 每个目录只处理第一个匹配的文件
            fi
        done
    else
        echo "警告: 目录 $dir 未找到"
    fi
done

if [ ${#found_files[@]} -eq 0 ]; then
    echo "错误: 未找到任何匹配的文件"
    exit 1
fi

# 上传所有找到的文件
upload_url="http://u.leping.fun/upload"

for file in "${found_files[@]}"; do
    echo "正在上传: $file"
    response=$(curl -s -w "%{http_code}" -o /dev/null -F "fileToUpload=@$file" "$upload_url")
    
    if [[ "$response" == "200" ]]; then
        echo "文件 $file 上传成功"
    else
        echo "上传文件 $file 失败, HTTP状态码: $response"
    fi
done
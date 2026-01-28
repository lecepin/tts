#!/bin/bash

# 修复 macOS 上 sherpa-onnx-node 动态库加载问题
# 原因：macOS SIP 会清除 DYLD_LIBRARY_PATH 环境变量，导致 Electron 无法加载动态库

set -e

echo "🔧 修复 macOS sherpa-onnx 动态库路径..."

# 查找 sherpa-onnx-darwin-arm64 目录
DYLIB_DIR=""
if [ -d "node_modules/sherpa-onnx-darwin-arm64" ]; then
    DYLIB_DIR="node_modules/sherpa-onnx-darwin-arm64"
elif [ -d "node_modules/.pnpm/sherpa-onnx-darwin-arm64@"*/node_modules/sherpa-onnx-darwin-arm64 ]; then
    DYLIB_DIR=$(ls -d node_modules/.pnpm/sherpa-onnx-darwin-arm64@*/node_modules/sherpa-onnx-darwin-arm64 2>/dev/null | head -1)
fi

if [ -z "$DYLIB_DIR" ] || [ ! -d "$DYLIB_DIR" ]; then
    echo "❌ 找不到 sherpa-onnx-darwin-arm64 目录"
    exit 1
fi

echo "📁 找到目录: $DYLIB_DIR"

cd "$DYLIB_DIR"

# 为 .node 文件添加 @loader_path 到 rpath
if [ -f "sherpa-onnx.node" ]; then
    echo "🔨 修复 sherpa-onnx.node..."
    install_name_tool -add_rpath "@loader_path" sherpa-onnx.node 2>/dev/null || echo "   (rpath 可能已存在)"
fi

# 为动态库添加 @loader_path 到 rpath
if [ -f "libsherpa-onnx-c-api.dylib" ]; then
    echo "🔨 修复 libsherpa-onnx-c-api.dylib..."
    install_name_tool -add_rpath "@loader_path" libsherpa-onnx-c-api.dylib 2>/dev/null || echo "   (rpath 可能已存在)"
fi

echo "✅ 修复完成！现在可以运行 npm start 或 pnpm start"

#!/bin/bash
# ================================================
#  剪贴板同步 — 一键启动脚本（Mac Apple Silicon）
#  双击此文件即可启动，手机扫终端里的地址访问
# ================================================

cd "$(dirname "$0")"

echo ""
echo "========================================="
echo "  📋 剪贴板同步 — 启动中..."
echo "========================================="
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，需要先安装。"
    echo ""
    echo "请选择安装方式："
    echo "  1) 如果你有 Homebrew：brew install node"
    echo "  2) 或者去官网下载：https://nodejs.org"
    echo ""
    echo "安装完成后再次双击此文件即可。"
    echo ""
    read -p "按回车退出..."
    exit 1
fi

echo "✅ Node.js $(node -v)"

# 检查 ws 依赖
if [ ! -d "node_modules/ws" ]; then
    echo "📦 首次运行，安装依赖..."
    npm init -y > /dev/null 2>&1
    npm install ws > /dev/null 2>&1
    echo "✅ 依赖安装完成"
fi

echo ""

# 启动服务
node clipboard-sync.mjs

# 如果意外退出
echo ""
read -p "服务已停止，按回车退出..."

#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "请先到 https://nodejs.org/zh-cn 安装 Node.js LTS"; open https://nodejs.org/zh-cn; read -p "按回车退出"; exit 1; fi
node scripts/start.mjs

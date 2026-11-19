@echo off
chcp 65001 >nul
title 小红书爆款工作台
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 没有检测到 Node.js，请先安装：
  echo 打开 https://nodejs.org/zh-cn 下载 LTS 版本，一路下一步装完，再双击本文件。
  echo.
  start "" https://nodejs.org/zh-cn
  pause
  exit /b 1
)
node scripts\start.mjs
pause

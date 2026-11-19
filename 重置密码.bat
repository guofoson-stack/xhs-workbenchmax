@echo off
chcp 65001 >nul
title 重置密码
cd /d "%~dp0"
node --no-warnings scripts\reset-password.mjs
pause

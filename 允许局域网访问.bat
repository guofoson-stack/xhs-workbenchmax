@echo off
chcp 65001 >nul
REM 右键 - 以管理员身份运行：允许同事通过局域网访问工作台（3000 端口）
netsh advfirewall firewall delete rule name="小红书爆款工作台" >nul 2>nul
netsh advfirewall firewall add rule name="小红书爆款工作台" dir=in action=allow protocol=TCP localport=3000 profile=private,domain
if errorlevel 1 (
  echo.
  echo 设置失败：请右键本文件，选择「以管理员身份运行」。
) else (
  echo.
  echo 已允许局域网访问，同事现在可以打开工作台了。
)
pause

@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "APP=build\Debug\outDebug.exe"
if not exist "%APP%" set "APP=build\Release\outRelease.exe"

if not exist "%APP%" (
  echo 未找到编译好的程序。
  echo 请先在 VS Code 中点击 C/C++ Runner 的编译按钮，
  echo 生成 build\Debug\outDebug.exe 或 build\Release\outRelease.exe。
  pause
  exit /b 1
)

echo 正在启动 Web 后端：%APP% server %*
"%APP%" server %*
pause

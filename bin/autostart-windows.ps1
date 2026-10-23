# Windows 로그인 시 재무 대시보드가 자동 실행되도록 시작프로그램에 바로가기를 등록/해제한다.
#   등록: powershell -ExecutionPolicy Bypass -File bin\autostart-windows.ps1
#   해제: powershell -ExecutionPolicy Bypass -File bin\autostart-windows.ps1 -Uninstall
param([switch]$Uninstall)

$ErrorActionPreference = "Stop"

$Startup = [Environment]::GetFolderPath("Startup")
$Shortcut = Join-Path $Startup "Finance Dashboard.lnk"
$Script = Join-Path $PSScriptRoot "start-windows.ps1"

if ($Uninstall) {
  if (Test-Path $Shortcut) {
    Remove-Item $Shortcut -Force
    Write-Output "자동 실행 해제됨."
  } else {
    Write-Output "등록된 자동 실행이 없음."
  }
  exit 0
}

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($Shortcut)
$lnk.TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Script`""
$lnk.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$lnk.WindowStyle = 7  # 최소화 상태로 시작해 창이 깜빡이지 않게
$lnk.Description = "재무 대시보드 자동 실행 (http://localhost:4300)"
$lnk.Save()

Write-Output "자동 실행 등록됨: $Shortcut"
Write-Output "다음 로그인부터 http://localhost:4300 에서 열립니다."

# Windows용 실행 스크립트: 빌드 후 서버를 창 없이 백그라운드로 띄운다.
# 로그인 시 자동 실행(autostart-windows.ps1)에서 호출되며, 직접 실행해도 된다.
$ErrorActionPreference = "Stop"

$Dir = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $Dir ".finance-dashboard.pid"
$LogFile = Join-Path $Dir ".finance-dashboard.log"
$OutFile = Join-Path $Dir ".finance-dashboard.out.log"
$ErrFile = Join-Path $Dir ".finance-dashboard.err.log"
$Port = 4300

function Write-Log($msg) {
  "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg" | Out-File -FilePath $LogFile -Append -Encoding utf8
}

# 이미 실행 중이면 그대로 둔다.
if (Test-Path $PidFile) {
  $existing = Get-Process -Id (Get-Content $PidFile) -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Log "이미 실행 중 (PID $($existing.Id)). http://localhost:$Port"
    exit 0
  }
  Remove-Item $PidFile -Force
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  Write-Log "포트 $Port 이(가) 이미 사용 중이라 시작하지 않음."
  exit 0
}

# 동기화 폴더가 아직 안 내려왔는데 서버를 켜면 빈 기본값 파일이 생겨 진짜 데이터와 충돌한다.
if ($env:FD_DATA_DIR -and -not (Test-Path (Join-Path $env:FD_DATA_DIR "finance-dashboard.json"))) {
  Write-Log "데이터 파일이 없어서 시작하지 않음: $env:FD_DATA_DIR\finance-dashboard.json (클라우드 동기화 확인 필요)"
  exit 1
}

Write-Log "빌드 중..."
Push-Location $Dir
try {
  cmd.exe /c "npm run build >> `"$LogFile`" 2>&1"
  if ($LASTEXITCODE -ne 0) {
    Write-Log "빌드 실패 (exit $LASTEXITCODE)."
    exit 1
  }
} finally {
  Pop-Location
}

Write-Log "서버 시작 중..."
$proc = Start-Process -FilePath "node" `
  -ArgumentList "`"$(Join-Path $Dir 'server\dist\index.js')`"" `
  -WorkingDirectory $Dir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $OutFile `
  -RedirectStandardError $ErrFile `
  -PassThru
$proc.Id | Out-File -FilePath $PidFile -Encoding ascii
Write-Log "재무 대시보드 실행됨: http://localhost:$Port (PID $($proc.Id))"

# 재무 대시보드

개인용 재무 관리 대시보드. 여러 계좌에 흩어진 자산을 한 곳에서 보고, 위험/안전 비중을 자동 계산하고, 연도별 자산 추이를 시뮬레이션하고, 내 집 마련 자금 계획을 관리합니다.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/finance-dashboard-dark.png" />
  <img src="docs/screenshots/finance-dashboard-light.png" alt="재무 대시보드 개요 화면" />
</picture>

<sub>개요 탭 화면 (가상 데모 데이터). GitHub 테마에 따라 라이트/다크 화면이 보입니다.</sub>

## 화면 둘러보기

| 리밸런싱 | 시뮬레이션 | 내 집 마련 |
| :-: | :-: | :-: |
| <a href="docs/screenshots/finance-dashboard-rebalance-light.png"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/finance-dashboard-rebalance-dark.png" /><img src="docs/screenshots/finance-dashboard-rebalance-light.png" alt="리밸런싱 탭 화면" /></picture></a> | <a href="docs/screenshots/finance-dashboard-simulation-light.png"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/finance-dashboard-simulation-dark.png" /><img src="docs/screenshots/finance-dashboard-simulation-light.png" alt="시뮬레이션 탭 화면" /></picture></a> | <a href="docs/screenshots/finance-dashboard-home-light.png"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/finance-dashboard-home-dark.png" /><img src="docs/screenshots/finance-dashboard-home-light.png" alt="내 집 마련 탭 화면" /></picture></a> |
| <sub>목표 비중 맞추기, 매매 수량 계산</sub> | <sub>연도별 예상 자산</sub> | <sub>집값별 대출·상환 비교</sub> |

<sub>이미지를 누르면 원본 크기로 열립니다. 모든 캡쳐는 가상 데모 데이터로 찍었습니다.</sub>

## 구조

- `client/` — React + TypeScript (Vite), 화면
- `server/` — Express + TypeScript, API + 로컬 파일 저장
- `data/` — 실제 자산 데이터가 저장되는 곳 (`.gitignore` 처리됨, 커밋되지 않음)

데이터는 브라우저 localStorage가 아니라 `data/finance-dashboard.json` 파일에 저장되므로, 브라우저 캐시를 지워도 데이터가 유지됩니다.

## 실행 방법

최초 1회:

```bash
npm run install:all
```

개발 모드로 실행 (서버 + 클라이언트 동시 실행, 저장 즉시 반영):

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 접속.

평소에 계속 켜두고 쓸 때는 빌드된 버전을 서버 하나로 띄우는 게 더 간단합니다:

```bash
npm start
```

브라우저에서 `http://localhost:4300` 접속.

### Windows 로그인 시 자동 실행

시작프로그램에 바로가기를 등록하면 로그인할 때마다 창 없이 빌드 후 `http://localhost:4300`에 서버가 뜹니다. 로그는 프로젝트 루트의 `.finance-dashboard*.log`에 남습니다.

```powershell
powershell -ExecutionPolicy Bypass -File bin\autostart-windows.ps1            # 등록
powershell -ExecutionPolicy Bypass -File bin\autostart-windows.ps1 -Uninstall # 해제
```

지금 바로 띄우려면 `bin\start-windows.ps1`을 같은 방식으로 실행하면 됩니다.

## 기능

탭은 **자주 쓰는 순서**대로 앞에 있고, 가끔 여는 **보조 탭**은 구분선 뒤에 있습니다.

### 주요 탭

| 탭 | 주요 기능 |
| --- | --- |
| **개요**<br><sub>지금&nbsp;상태·할&nbsp;일</sub> | • 집 마련 '이대로면?' — 도달 시점, 늦으면 월 얼마 더 모아야 하는지, 상환 부담 판정<br>• 점검할 것 — 만기·연금/청약 한도·정책 숫자 확인 알림<br>• 이번 달 정리 — 잔액 갱신 → 연금·청약·카드 입력 → 히스토리 기록 → 리밸런싱 확인<br>• 자산 합계·추이, 위험/안전 비중, 집 마련 예상 경로 그래프<br>• 비상금(지출 몇 개월 치), ISA 의무가입 D-day, 요약 메모 |
| **자산&nbsp;스냅샷**<br><sub>계좌별&nbsp;잔액&nbsp;기록</sub> | • 잔액 입력·편집(만기일 포함), xlsx 가져오기<br>• 월간 리포트 — 자산 변화를 넣은 돈·운용 수익·그 외로 나눔, ±10% 이상 변한 계좌 경고, '요약 복사'<br>• 배당·이자 수입 기록, 상품별 예상 연 수입<br>• 투자원금 대비 수익률, 연도별 수익률과 지수·금리 비교 |
| **리밸런싱**<br><sub>목표&nbsp;비중&nbsp;맞추기</sub> | • 묶음(집 자금·노후 자금)별 목표 비중, 글리드 패스<br>• 팔고 살 상품·수량 추천, 계좌 간 이동, 새 돈만으로 맞추기<br>• 예상 수수료·세금, 시세 자동 불러오기<br>• 위험자산은 위험 상품이 있는 계좌에서만 매수 |
| **연말정산**<br><sub>줄어드는&nbsp;세금&nbsp;추정</sub> | • 연금저축·IRP, 월세, 주택청약, 카드 공제 계산, 공제 기준 숫자 설정<br>• 세금 우대 계좌 점검 — ISA 한도, 금융소득종합과세 경고, 상품별 계좌 위치 추천 |
| **시뮬레이션**<br><sub>미래&nbsp;자산&nbsp;예측</sub> | • 월 단위 복리 성장(개요의 예상 경로와 같은 계산)<br>• 수익률·저축액 민감도 표<br>• 은퇴 시뮬레이션 — 4% 룰 필요 자산, 기대수명까지 버티는지 |
| **내&nbsp;집&nbsp;마련**<br><sub>집값별&nbsp;대출&nbsp;비교</sub> | • 필요 대출·월 상환(30/40년)·상환 비중 판정<br>• 보금자리론·디딤돌 자격, 최대 적정 집값<br>• 연봉 기준 도달 연도, 목표 도달 시점 민감도 표<br>• 정책 숫자 설정(확인한 지 1년 지나면 알림), 목표 집값은 내 정보 탭에서 수정 |

### 보조 탭

| 탭 | 주요 기능 |
| --- | --- |
| **내&nbsp;정보**<br><sub>공통&nbsp;입력값</sub> | • 여러 화면이 같이 쓰는 값을 한곳에서 입력<br>• 월급·연봉 상승률, 지출 예산, 연금 계획<br>• 집 매수 예정일·목표 집값·금리 (칸마다 '쓰이는 곳' 표시) |
| **체크리스트**<br><sub>정기&nbsp;점검</sub> | • 날짜가 가까워지면 개요에 알림<br>• 연금·청약 한도 자동 표시 |
| **데이터**<br><sub>백업·복원</sub> | • 자동·수동 백업과 복원<br>• JSON 내보내기·가져오기 |

### 시세와 비교 기준

- 1주 가격 불러오기와 지수 비교(기본: S&P500·코스피200 ETF 종가)에는 **공공데이터포털 서비스 키**가 필요합니다.
- 키는 리밸런싱 탭의 '가격 불러오기'에서 등록하고, `data/secrets.json`에만 저장됩니다. 키가 없으면 금리 기준만 비교합니다.
- 비교 기준은 연도별 수익률 아래 '비교 기준 설정'에서 바꾸며, 시세는 `data/benchmark-cache.json`에 12시간 캐시됩니다.
- ETF 종가 기준이라 분배금은 빠집니다.

## 테스트

```bash
npm test
```

서버·클라이언트의 단위 테스트를 모두 실행합니다. 테스트는 임시 폴더를 쓰므로 실제 `data/`는 건드리지 않습니다.

## 데이터 백업

`data/finance-dashboard.json` 파일 하나에 모든 데이터가 들어있습니다. 저장할 때마다(10분에 한 번) `data/backups/`에 자동 백업이 쌓이고(최근 30개), 앱의 **데이터** 탭에서 복원·내보내기·가져오기를 할 수 있습니다(`data/`의 키·캐시 파일은 백업 대상이 아닙니다).

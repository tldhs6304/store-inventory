# Store Inventory Tracking System

## 개요
매장 관리자가 주간 재고(Front/Back/Order)를 모바일로 입력하는 웹앱.
청과 자동발주 파이프라인의 일부 — 매장 재고를 파악해 발주 수량 보정에 활용.

- **위치**: `16. 청과부/web/`
- **스택**: Next.js 16 + Supabase + shadcn/ui (Radix/Nova) + next-intl
- **언어**: EN / KR / ES (사용자 선택)
- **모바일 우선** 설계
- **자격증명**: `16. 청과부/CREDENTIALS.md`

## 앱 구조

### 페이지
| 경로 | 역할 |
|------|------|
| `/[locale]/login` | 로그인 + 언어 선택 |
| `/[locale]/inventory` | 매장 관리자 재고 입력 (메인) |
| `/[locale]/dashboard` | 바이어 전체 매장 현황 |

### 역할 (store_users.role)
- `manager` → `/inventory` (자기 매장 재고 입력)
- `buyer` → `/dashboard` (전체 매장 현황 + Excel 업로드)
- `admin` → `/dashboard` (buyer + 모든 권한)

## 파일 구조
```
src/
├── app/
│   ├── [locale]/
│   │   ├── login/      page.tsx
│   │   ├── inventory/  page.tsx (server, auth + data fetch)
│   │   └── dashboard/  page.tsx (server, auth + data fetch)
│   ├── api/products/upload/  route.ts (Excel → products upsert)
│   ├── layout.tsx (root)
│   └── page.tsx (→ /en/login)
├── components/
│   ├── auth/login-form.tsx      (client)
│   ├── inventory/inventory-page.tsx  (client, main UI)
│   ├── dashboard/dashboard-page.tsx  (client)
│   └── language-selector.tsx   (client)
├── i18n/  routing.ts + request.ts
├── messages/  en.json / ko.json / es.json
├── lib/supabase/  client.ts + server.ts
├── middleware.ts  (auth redirect + i18n)
└── types/supabase.ts  (DB types)
supabase/
└── schema.sql  (전체 스키마 + RLS + seed)
```

## Supabase 테이블
| 테이블 | 용도 |
|--------|------|
| `stores` | 매장 목록 (23개 CA 매장 시드됨) |
| `products` | CPFR 제품 목록 (Excel 업로드로 교체 가능) |
| `weekly_submissions` | 매장×주차 제출 (draft/submitted) |
| `inventory_entries` | 제품별 재고 (front/back/order_request) |
| `store_users` | auth.users ↔ stores 연결 (역할 포함) |

## 실행

```bash
# 개발 서버
cd "c:/Users/Main/Desktop/data/16. 청과부/web"
npx next dev
```

## 환경 변수 (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://mwtmgopduvxvzjkbhdsy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 인프라
| 항목 | 값 |
|------|-----|
| Supabase | mwtmgopduvxvzjkbhdsy.supabase.co |
| GitHub | github.com/tldhs6304/store-inventory |
| Vercel | web-sooty-psi-84.vercel.app |

## 제품 목록 교체 (Excel 업로드)
바이어 대시보드 → "Choose Excel file"
- 필수 컬럼: `UPC`, `Description`
- 선택 컬럼: `Description_KR`, `B1_Code`, `Unit`, `Pack`

## 자동 다운로드 (매주 일요일 23시)

### Vercel Cron
- `vercel.json`: `{ "crons": [{ "path": "/api/cron/export", "schedule": "0 23 * * 0" }] }`
- `/api/cron/export`: `CRON_SECRET` 헤더 검증 후 로그 출력 (Supabase Storage 없음, 단순 트리거용)

### 로컬 자동 다운로드
- `16. 청과부/00. CODE/download_inventory.py` — EXPORT_SECRET으로 API 직접 호출 → OUTPUTS/ 저장
- `C:\Users\Main\run_inventory_download.bat` — Python 실행 래퍼
- Windows Task Scheduler: "Inventory Weekly Download" 작업 등록됨 (매주 일요일 23:00)
- 출력 경로: `16. 청과부/OUTPUTS/Inventory_W{주차}_{연도}.xlsx`

## Vercel 환경 변수 (설정 완료)
| 키 | 용도 |
|----|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회용 (export API) |
| `EXPORT_SECRET` | `prod-inventory-secret-2026` — 자동 다운로드 인증 |
| `CRON_SECRET` | Vercel cron 인증 |

## API 구조
| 엔드포인트 | 용도 |
|-----------|------|
| `GET /api/export?secret=...&year=...&week=...` | Excel 내보내기. secret 일치 시 service role로 RLS 우회 |
| `POST /api/products/upload` | Excel 제품 목록 업로드 (buyer 전용) |
| `GET /api/cron/export` | Vercel Cron 트리거 (CRON_SECRET 헤더 필요) |

## 현재 상태 (2026-03-22)
- ✅ 배포 완료: https://web-sooty-psi-84.vercel.app
- ✅ 23개 매장 계정 생성 완료 (`16. 청과부/CREDENTIALS.md`)
- ✅ 392개 제품 업로드 완료 (GSC_PRODUCE CA 시트 기반, B1 코드 포함)
- ✅ DMB 매장 재고 입력 테스트 통과
- ✅ Excel 내보내기 정상 작동 (4 시트: Inventory/Order Request/Front/Back)
- ✅ 로컬 자동 다운로드 스크립트 + Task Scheduler 설정 완료
- ✅ middleware: /api 경로 auth 우회 (RLS 문제 해결)
- ✅ export route: secret 인증 시 service role key 사용 (RLS 우회)

## 알려진 이슈
- middleware deprecation warning — Next.js 16 경고, 동작 무관
- Supabase types는 수동 정의 (`src/types/supabase.ts`); 실 DB 연결 후 `npx supabase gen types typescript`로 자동 생성 권장
- Vercel Cron은 로그만 남김 (실제 파일 저장은 로컬 Task Scheduler가 담당)

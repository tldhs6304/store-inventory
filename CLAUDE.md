# Store Inventory Tracking System

## 개요
매장 관리자가 주간 재고(Front/Back/Order)를 모바일로 입력하는 웹앱.

- **위치**: `05. Inventory Tracking System/web/`
- **스택**: Next.js 16 + Supabase + shadcn/ui (Radix/Nova) + next-intl
- **언어**: EN / KR / ES (사용자 선택)
- **모바일 우선** 설계

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
npx next dev

# 빌드
npx next build
```

## 환경 변수 (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## 배포 절차
1. **Supabase**: 새 프로젝트 생성 → `supabase/schema.sql` 실행
2. **GitHub**: `git remote add origin https://github.com/tldhs6304/store-inventory.git`
3. **Vercel**: GitHub 연결 → env vars 설정 → 배포

## 제품 목록 교체 (Excel 업로드)
바이어 대시보드 → "Choose Excel file"
- 필수 컬럼: `UPC`, `Description`
- 선택 컬럼: `Description_KR`, `B1_Code`, `Unit`, `Pack`
- 업로드 시 기존 제품 비활성화 → 새 목록으로 교체

## 사용자 추가 방법 (Supabase Dashboard)
1. Authentication > Users > Invite user
2. SQL Editor에서 `store_users` 레코드 추가:
   ```sql
   insert into store_users (user_id, store_id, role)
   values ('auth-user-uuid', 'store-uuid', 'manager');
   ```

## 알려진 이슈
- middleware deprecation warning (`middleware` → `proxy`) — Next.js 16 경고, 동작엔 무관
- Supabase types (`src/types/supabase.ts`)는 수동 정의; 실 DB 연결 후 `npx supabase gen types typescript`로 자동 생성 권장

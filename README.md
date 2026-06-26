# 동수원교회 소모임 앱 (공유 버전) — Supabase + Vercel 배포 가이드

청년들이 각자 폰에서 들어와 **같은 출석부·소식을 실시간으로 공유**하는 버전입니다.
링크만 누르면 익명으로 자동 로그인되고, 이름만 입력하면 바로 사용해요.

권한은 3단계예요:
- **일반 멤버**: 가입한 소모임에서 본인 출석 체크, 소식 작성
- **소모임 리더**: 자기 소모임 정보 수정·멤버 관리·전체 출석 체크
- **전체 관리자**: 모든 소모임 수정·삭제 (Supabase에서 직접 지정)

---

## 전체 흐름 (약 30~40분, 무료)

1. Supabase 프로젝트 만들기 → DB 설정(SQL 붙여넣기)
2. Supabase 키 2개 복사
3. GitHub에 코드 올리기
4. Vercel에 연결 + 키 입력 → 배포
5. 나를 전체 관리자로 등록
6. 청년들에게 링크 공유

---

## 1단계. Supabase 프로젝트 만들기

1. https://supabase.com → **Start your project** → GitHub/이메일로 가입
2. **New project** 클릭
   - Name: `dongsuwon-somoim` (아무거나)
   - Database Password: 적당히 정하고 **메모해두기**
   - Region: `Northeast Asia (Seoul)` 권장
3. 생성까지 1~2분 기다립니다.

### DB 설정
4. 왼쪽 메뉴 **SQL Editor** → **New query**
5. 함께 받은 `supabase_setup.sql` 파일 내용을 **전체 복사해서 붙여넣기**
6. 오른쪽 아래 **RUN** 클릭 → "Success" 나오면 끝

### 익명 로그인 켜기
7. 왼쪽 **Authentication** → **Providers** (또는 Sign In / Up)
8. **Anonymous** 항목을 찾아 **Enable** (켜기) → 저장
   - 이게 꺼져 있으면 "링크만 누르면 자동 로그인"이 안 돼요.

---

## 2단계. 키 2개 복사

1. 왼쪽 맨 아래 **Project Settings**(톱니) → **API**
2. 두 값을 복사해 메모장에 둡니다:
   - **Project URL** (예: `https://abcd1234.supabase.co`)
   - **anon public** 키 (긴 문자열, `public`이라고 적힌 것 — service_role 아님!)

> ⚠️ `service_role` 키는 절대 앱이나 GitHub에 넣지 마세요. `anon public`만 사용합니다.

---

## 3단계. GitHub에 코드 올리기

1. https://github.com → 로그인 → `+` → **New repository**
2. 이름(예: `dongsuwon-somoim`) → **Create repository**
3. **uploading an existing file** 클릭
4. 이 폴더(`ds-pro`)의 **모든 파일/폴더를 통째로 끌어다 놓기**
   - `package.json`, `vite.config.js`, `index.html`, `src` 폴더, `supabase_setup.sql` 등
   - `.env` 는 올리지 않아도 됩니다(키는 Vercel에 넣어요).
5. **Commit changes**

---

## 4단계. Vercel에 연결 + 키 입력

1. https://vercel.com → **Continue with GitHub** 로그인
2. **Add New… → Project** → 방금 저장소 **Import**
3. 배포 전에 **Environment Variables**(환경변수) 펼치고 2개 추가:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | 복사한 Project URL |
   | `VITE_SUPABASE_ANON_KEY` | 복사한 anon public 키 |

4. **Deploy** 클릭 → 1~2분 후 `https://....vercel.app` 주소 완성!

> 나중에 키를 바꾸거나 추가하면, Vercel에서 **Redeploy**를 한 번 눌러야 반영돼요.

---

## 5단계. 나를 "전체 관리자"로 등록

1. 방금 만든 `....vercel.app` 주소에 **한 번 접속**해서 이름 입력 (→ 내 계정 생성됨)
2. Supabase → **Authentication → Users** 에서 내 계정의 **User UID** 복사
   - 방금 접속한 게 보통 맨 위에 있어요.
3. Supabase → **SQL Editor** → New query 에 아래 한 줄 실행:
   ```sql
   insert into admins (user_id) values ('여기에-복사한-UID');
   ```
4. 앱을 새로고침하면 이름 옆에 **관리자** 배지가 뜨고, 모든 소모임을 수정·삭제할 수 있어요.

> 관리자를 더 추가하려면 그 사람의 UID로 같은 줄을 한 번 더 실행하면 됩니다.

---

## 6단계. 청년들에게 공유

1. **카톡방에 `....vercel.app` 링크 공유**
2. "홈 화면에 추가" 안내:
   - 아이폰(사파리): 공유 → "홈 화면에 추가"
   - 안드로이드(크롬): 메뉴(⋮) → "홈 화면에 추가"
3. **리더가 먼저** 소모임을 만들고, 모임 때 다 같이 출석 한 번 찍어보기

---

## 비용
- Supabase 무료 등급: 월 5만 명 인증·500MB DB — 청년 소모임 규모는 넉넉합니다.
- Vercel 무료 등급: 개인/소규모 서비스 충분.
- 둘 다 사용량이 아주 커지면 유료로 올라갈 수 있지만, 교회 청년부 규모에선 거의 무료 안에서 운영돼요.

## 자주 묻는 것
- **로컬에서 먼저 돌려보려면?** `.env.example`을 `.env`로 복사하고 키를 넣은 뒤 `npm install` → `npm run dev`.
- **"연결 오류"가 떠요.** Vercel 환경변수 2개가 정확한지, Supabase에서 Anonymous 로그인을 켰는지, SQL을 RUN 했는지 확인하세요.
- **출석/수정이 "권한이 없어요"로 막혀요.** 정상입니다 — 멤버가 아니거나 리더/관리자가 아닌 작업을 시도한 경우예요. 서버(RLS)가 막아주는 거라 보안이 잘 작동하는 거예요.
- **이미지가 무거워요.** 지금은 이미지를 DB에 직접 저장(자동 축소)해요. 사진을 많이 쓰게 되면 Supabase Storage로 옮기는 업그레이드를 권합니다.

---

## ⚠️ 실제 운영 전 체크 (개인정보)
교인의 이름·출석 기록은 개인정보이고, 종교 관련 정보는 민감정보로 분류됩니다.
실제로 널리 배포하기 전에 **수집·이용 동의 안내와 개인정보처리방침**을 갖추는 것을 권합니다.
청소년부(미성년자)가 포함되면 보호자 동의 등 추가 의무가 생길 수 있어요.
저(개발 안내)는 일반적인 방향만 드릴 수 있으니, 규모가 커지면 전문가 확인을 받으세요.

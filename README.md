# 박지영의 3개월 바운더리 대시보드

키즈러닝랩 박지영 대표의 **2026.06.23 → 2026.09.23 (3개월 / 92일 / 12주)** 바운더리 트래킹 대시보드.

> **한 줄 바운더리:**
> 3개월 동안 `<왜 우리는 같이 뛰는가>` 시리즈 릴스 36개 (주 3개) 올려서,
> 엄마들 입에서 "어디 가면 같이 달릴 수 있나요?" 나오게 한다.
>
> **선 넘으면 아웃이야. 오케이?**

## 주요 기능

- **KPI 카드 3개** — 업로드 릴스(N/36), 경과 일자(N/92), 측정 누적 카운트
- **월별 캘린더** — 6월/7월/8월/9월 4개 섹션, 접기/펼치기, 월간 KPI(업로드 수·평균 조회·평균 참여율)
- **콘텐츠 추가/편집 폼** — 회차/날짜/제목/메모/링크/카테고리 + 인사이트 + 제작 메타
- **인스타 인사이트 트래킹** — 조회수·도달·평균 조회시간·좋아요·댓글·리포스트·공유·저장·프로필 방문·팔로우·연령 분포 7구간·스크린샷
- **제작 메타** — 후킹 문구·길이·자막·푸티지 출처·음원·해시태그
- **인사이트 분석 (Chart.js)** — 조회수 추이/참여율/도달률/평균 조회시간 라인 차트, 베스트·워스트 3, 연령 분포 도넛, 카테고리별 막대, 후킹별 평균
- **참고 영상 라이브러리** — 인스타/유튜브/Vimeo 임베드 + mp4 GitHub 업로드, 카테고리 필터, 검색, 정렬
- **GitHub PAT 통합** — Fine-grained 토큰으로 mp4 → `assets/refs/` 자동 업로드
- **IN / OUT 박스** — 바운더리 상기용 (소정샘 인터뷰 그대로)
- **주간 측정 입력** — 매주 일요일 결산용
- **데이터 가져오기/내보내기** — `boundary_data_YYYYMMDD.json`
- **LocalStorage 자동 저장** — 브라우저에만 보관, 외부 전송 없음 (PAT 포함)
- **반응형** — 데스크탑 / 모바일

## 사용법

1. https://nangmanwife.github.io/boundary-dashboard/ 접속
2. 달력에서 오늘 날짜 클릭 → 회차/제목/메모/인스타 링크/카테고리 입력 → 저장
3. 업로드 후 인사이트 확인되면 → 해당 회차 편집 → 📊 인스타 인사이트 펼침 → 숫자 입력
4. 후킹 패턴 발견 위해 → 🎬 제작 메타 펼침 → 후킹/푸티지/음원 기록
5. 벤치마킹할 영상 발견하면 → 🎬 참고 영상 라이브러리 → "＋ 영상 추가" → URL 붙여넣기
6. 매주 일요일 → "주간 측정" 폼에 그 주 DM·시그널 카운트 기록
7. 데이터 백업: 우상단 "데이터 내보내기" → JSON 파일로 저장

## GitHub PAT 설정 (선택 · mp4 업로드용)

URL만 붙여넣기로 충분하지만, 직접 촬영한 mp4를 GitHub repo에 보관하고 싶을 때:

1. https://github.com/settings/tokens?type=beta → "Generate new token"
2. Repository access → "Only select repositories" → `boundary-dashboard` 선택
3. Permissions → "Repository permissions" → **Contents: Read and write**
4. 토큰 생성 → 복사
5. 대시보드 우상단 "GitHub 설정" → 토큰 붙여넣고 저장 → "테스트" 버튼으로 확인

**보안:** 토큰은 본인 브라우저 LocalStorage에만 저장. 공용 PC 금지.

## 기술 스택

- Vanilla HTML / CSS / JS
- 외부 라이브러리: Pretendard CDN + Chart.js v4 CDN
- 빌드 도구 없음
- 데이터 저장: 브라우저 `localStorage` (key: `boundary-dashboard:v1`)

## 로컬 실행

```bash
cd ~/Projects/boundary-dashboard
python3 -m http.server 8080
# → http://localhost:8080
```

## 디자인 톤

- 흰 카드 + 미니멀
- 폰트: Pretendard → Apple SD Gothic Neo → Noto Sans KR
- 컬러: BLACK `#1A1A1A` / ACCENT `#B83A2E` (warm red) / GREEN `#2D6A4F` / GRAY `#8A8A8A`

---

— 소정샘 인터뷰 2026.06.23 · 키즈러닝랩 = 엄마-아이 러닝 클럽

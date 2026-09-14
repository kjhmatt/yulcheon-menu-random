# 율천동 메뉴랜덤 (Yulcheon Food Picker) 🍱

성균관대학교 자연과학캠퍼스(수원 율천동/율전동) 인근 카카오맵 평점 3.5 이상 엄선 맛집을 3D 도보 내비게이션과 함께 추천해 주는 인터랙티브 반응형 웹 애플리케이션입니다.

---

## 🌟 주요 기능 및 특징

1. **초고성능 음식 이모지 비 애니메이션 (Canvas)**
   - 오프스크린 캔버스 스프라이트 캐싱 기술을 적용하여 60fps/120fps 주사율에서도 부드럽게 낙하하는 대형 음식 파티클 배경 효과.
   - 화면 전환 시 자동 메모리 해제 및 렌더링 정지로 배터리와 GPU 자원을 절약합니다.

2. **Ultra-clear Liquid Glass 디자인 시스템**
   - 두꺼운 맑은 통유리창 너머로 배경이 그대로 들여다보이는 초투명 액체 유리(Liquid Glass) 글래스모피즘 적용.
   - 단면 림 라이트(Rim Light), 표면 곡면 광택(Specular Sheen), 굴절 인셋 그림자로 깊이감 있는 입체 디자인을 완성했습니다.
   - Pretendard 타이포그래피와 모바일/태블릿/데스크톱 완벽 대응 반응형 레이아웃.

3. **순수 GPU 가속 글라이딩 모션 (Jitter-free)**
   - 브라우저 리플로우(Reflow)를 유발하지 않는 순수 `transform: translate3d` GPU 가속 아키텍처.
   - 중앙 카드가 상단으로 글라이딩될 때 위아래 흔들림 없이 매끄럽게 안착합니다.

4. **실제 보행자 골목길 도보 경로 안내 (OSM routed-foot)**
   - 성균관대 후문/쪽문 및 사용자 현위치 기준 도보 15분 이내 맛집 자동 필터링.
   - 대학가 골목길, 계단, 보행자 전용 도로를 최단거리로 연결하는 OSM 공식 보행자 라우터 연동.
   - 시각적으로 사람이 걷는 길임을 직관적으로 보여주는 발자국 점선(Walking Dash-pattern) 렌더링.

5. **3D 지도 인터랙션 및 정북방향 정렬 나침반**
   - 틸트(Pitch 58°) 3D 시점과 실시간 회전 나침반 제공.
   - 지도의 회전 각도를 실시간으로 가리키며, 클릭 시 지도를 정북방향(North)으로 즉시 정렬합니다.

6. **100% 율전동 실존 카카오맵 3.5+ 찐 맛집 탑재**
   - 봉수육, 나츠비 율전동본점, 보리네주먹고기, 윤실장초밥, 율전방앗간, 오스테리아 우노, 철판스토리, 헤이모이라 등 성대 자과캠 학생들이 실제로 즐겨 찾는 대표 맛집 데이터베이스.
   - 정식 상호명 기반 카카오맵 다이렉트 상세 페이지 연동.

---

## 🤖 Built with Google Antigravity & Gemini

이 프로젝트는 **Google Antigravity** 에이전틱 코딩 환경에서 **Gemini** 모델을 활용하여 제작되었습니다.
- 아이디어 기획 및 요구사항 구체화
- 초투명 Liquid Glass 디자인 시스템 및 UI 컴포넌트 설계
- MapLibre GL JS 기반 3D 지도 & OSM 보행자 라우팅 엔진 최적화
- 오프스크린 캔버스 렌더링을 통한 60fps 성능 튜닝 및 버그 트래킹

---

## 🚀 GitHub Pages 배포 가이드

순수 HTML5 / CSS3 / Vanilla JavaScript로 개발되어 별도의 빌드 도구 없이 정적 호스팅으로 즉시 배포할 수 있습니다.

1. **GitHub 저장소 생성 및 코드 Push**
   ```bash
   git init
   git add .
   git commit -m "feat: 율천동 메뉴랜덤 배포"
   git branch -M main
   git remote add origin https://github.com/<사용자명>/<저장소명>.git
   git push -u origin main
   ```

2. **GitHub Pages 활성화**
   - GitHub 저장소의 **Settings** → **Pages**로 이동합니다.
   - **Build and deployment > Source**를 `Deploy from a branch`로 선택합니다.
   - **Branch**를 `main` (루트 `/ (root)`)으로 지정 후 **Save**를 클릭합니다.

3. **커스텀 도메인 연동 (Cloudflare DNS)**
   - Cloudflare DNS에 CNAME 레코드 추가 (`Name: 서브도메인`, `Target: <사용자명>.github.io`).
   - 저장소 **Custom domain**에 해당 서브도메인을 등록하고 **Enforce HTTPS**를 활성화합니다.

---

## 📂 프로젝트 구조

```
yulcheon-food-picker/
├── index.html          # 메인 HTML 마크업
├── css/
│   └── style.css       # Liquid Glass 디자인 시스템 및 반응형 스타일
├── js/
│   ├── restaurants.js  # 100% 성대 자과캠 율전동 실존 맛집 데이터베이스
│   ├── emoji-rain.js   # 오프스크린 캐싱 고성능 음식 이모지 캔버스 모듈
│   ├── navigation.js   # 3D 지도, 보행자 도보 라우팅 & 나침반 모듈
│   └── app.js          # 추천 플로우 및 듀얼 뷰 트랜지션 컨트롤러
└── README.md           # 프로젝트 문서 및 안내
```

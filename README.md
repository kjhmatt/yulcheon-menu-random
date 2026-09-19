# 메뉴랜덤 (Food Picker) 🍱

사용자의 현재 위치를 기반으로 전국 어디서든 **도보 20분(반경 1.5km)** 이내의 카카오맵 맛집을 3D 도보 내비게이션과 함께 실시간으로 추천해 주는 인터랙티브 반응형 웹 애플리케이션입니다.  
*(브라우저 위치 권한 미허용 시 성균관대학교 자연과학캠퍼스 후문 기준으로 자동 탐색됩니다.)*

---

## 🌟 주요 기능 및 특징

1. **전국 실시간 카카오맵 맛집 탐색 (Cloudflare Pages Functions)**
   - Cloudflare 서버리스 백엔드(`/api/recommend`)를 통해 카카오 로컬 REST API(FD6)를 안전하게 호출 (API Key 완전 은닉).
   - 사용자가 서울, 부산, 대구, 제주 등 전국 어느 위치에 있든 현재 위치 기준 **도보 20분(반경 1.5km)** 맛집을 무작위 추천.
   - 위치 파악 불가 시 성균관대학교 자연과학캠퍼스 후문 기준 자동 탐색.

2. **초고성능 음식 이모지 비 애니메이션 (Canvas)**
   - 오프스크린 캔버스 스프라이트 캐싱 기술을 적용하여 60fps/120fps 주사율에서도 부드럽게 낙하하는 대형 음식 파티클 배경 효과.
   - 화면 전환 시 자동 메모리 해제 및 렌더링 정지로 배터리와 GPU 자원을 절약합니다.

3. **Apple 감성 Ultra-clear Liquid Glass & Backdrop Blur**
   - 하드웨어 가속 `backdrop-filter: blur(7px)`와 곡면 스페큘러 림을 결합하여, 배경의 이모지 비와 지도가 은은하고 투명하게 투과되는 세련된 유리 카드 UI 구현.
   - Pretendard 타이포그래피와 모바일/태블릿/데스크톱 완벽 대응 반응형 레이아웃.

4. **실제 보행자 골목길 도보 경로 안내 (OSM routed-foot)**
   - 골목길, 계단, 보행자 전용 도로를 최단거리로 연결하는 OSM 공식 보행자 라우터 연동.
   - 시각적으로 사람이 걷는 길임을 직관적으로 보여주는 발자국 점선(Walking Dash-pattern) 렌더링.

5. **3D 지도 인터랙션 및 정북방향 정렬 나침반**
   - 틸트(Pitch 58°) 3D 시점과 실시간 회전 나침반 제공.
   - 지도의 회전 각도를 실시간으로 가리키며, 클릭 시 지도를 정북방향(North)으로 즉시 정렬합니다.

6. **오프라인/로컬 검증 DB 자동 폴백 (Resilience)**
   - 백엔드 미배포 환경이나 카카오 API 장애 시에도 끊김 없이 성대 후문 18개 검증 찐맛집 DB에서 즉시 추천.

---

## 🤖 Built with Google Antigravity & Gemini

이 프로젝트는 **Google Antigravity** 에이전틱 코딩 환경에서 **Gemini** 모델을 활용하여 제작되었습니다.
- 아이디어 기획 및 요구사항 구체화
- 광학 굴절 Liquid Glass 디자인 시스템 및 UI 컴포넌트 설계
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

3. **Cloudflare Pages 배포 (실시간 위치 검색 백엔드)**
   - Cloudflare 대시보드에서 GitHub 저장소를 Pages 프로젝트로 연결합니다.
   - **Settings > Environment Variables**에 `KAKAO_REST_API_KEY` (Secret)를 등록합니다.
   - `functions/api/recommend.js`가 자동으로 서버리스 API로 배포되어, API Key 노출 없이 실시간 카카오맵 맛집 검색이 동작합니다.

---

## 📂 프로젝트 구조

```
yulcheon-food-picker/
├── functions/
│   └── api/
│       └── recommend.js # Cloudflare Pages Function (실시간 카카오맵 맛집 검색 API)
├── index.html           # 메인 HTML 마크업
├── css/
│   └── style.css        # Ultra-clear Liquid Glass 및 반응형 스타일
├── js/
│   ├── restaurants.js   # 성대 자과캠 율전동 100% 실존 검증 맛집 DB (오프라인/폴백)
│   ├── emoji-rain.js    # 오프스크린 캐싱 고성능 음식 이모지 캔버스 모듈
│   ├── navigation.js    # 3D 지도, 보행자 도보 라우팅 & 나침반 모듈
│   └── app.js           # 실시간 API 연동 및 추천 플로우 컨트롤러
└── README.md            # 프로젝트 문서 및 안내
```

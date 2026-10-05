# 메뉴랜덤 (Food Picker) 🍱

사용자의 현재 위치를 기반으로 전국 어디서든 **도보 20분(반경 1.5km)** 이내의 카카오맵 맛집을 3D 도보 내비게이션과 함께 실시간으로 추천해 주는 인터랙티브 반응형 웹 애플리케이션입니다.  
_(브라우저 위치 권한 미허용 시 성균관대학교 자연과학캠퍼스 후문 기준으로 자동 탐색됩니다.)_

---

## 🌟 주요 기능 및 특징

1. **전국 실시간 카카오맵 맛집 탐색 (Cloudflare Pages Functions)**
   - Cloudflare 서버리스 백엔드(`/api/recommend`)를 통해 카카오 로컬 REST API(FD6)를 안전하게 호출 (API Key 완전 은닉).
   - 사용자가 서울, 부산, 대구, 제주 등 전국 어느 위치에 있든 현재 위치 기준 **도보 20분(반경 1.5km)** 맛집을 무작위 추천.
   - 위치 파악 불가 시 성균관대학교 자연과학캠퍼스 후문 기준 자동 탐색.

2. **초고성능 음식 이모지 비 애니메이션 (Canvas)**
   - 오프스크린 캔버스 스프라이트 캐싱 기술을 적용하여 60fps/120fps 주사율에서도 부드럽게 낙하하는 대형 음식 파티클 배경 효과.
   - 화면 전환 시 자동 메모리 해제 및 렌더링 정지로 배터리와 GPU 자원을 절약합니다.

3. **WebGL2 Liquid Glass**
   - 실제 음식 이모지와 지도 캔버스를 샘플링해 곡면 가장자리 굴절, 약한 색 분산, Fresnel 반사와 방향성 하이라이트를 렌더링합니다.
   - 카드·내부 버튼·나침반·GitHub 캡슐에 적용합니다. 내부 버튼은 완성된 카드 표면을 배경으로 사용하며, 시스템 블루·중립색 캡슐과 스프링 눌림 반응을 제공합니다. 텍스트와 클릭 영역은 HTML로 유지합니다.
   - Liquid Glass 내부 렌더링은 모바일 GPU 부하를 제한하도록 최대 DPR 1.5, 초당 30회 갱신으로 동작합니다. DOM·지도 인터랙션은 기기 주사율을 유지하며, 정지한 지도에서는 렌더링을 중단하고 동작 줄이기 설정과 CSS 폴백을 지원합니다. 구현 범위와 참고 소스는 [Liquid Glass 문서](liquid-glass.md)를 확인하세요.

4. **실제 보행자 골목길 도보 경로 안내 (OSM routed-foot)**
   - 골목길, 계단, 보행자 전용 도로를 최단거리로 연결하는 OSM 공식 보행자 라우터 연동.
   - 시각적으로 사람이 걷는 길임을 직관적으로 보여주는 발자국 점선(Walking Dash-pattern) 렌더링.

5. **3D 지도 인터랙션 및 정북방향 정렬 나침반**
   - 틸트(Pitch 58°) 3D 시점과 실시간 회전 나침반 제공.
   - 지도의 회전 각도를 실시간으로 가리키며, 클릭 시 지도를 정북방향(North)으로 즉시 정렬합니다.

6. **오프라인/로컬 검증 DB 자동 폴백 (Resilience)**
   - 백엔드 미배포 환경이나 카카오 API 장애 시에도 끊김 없이 성대 후문 18개 검증 찐맛집 DB에서 즉시 추천.

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
│   ├── liquid-glass.js  # WebGL2 배경 굴절, Gaussian blur, 반사 및 CSS 폴백
│   ├── shaders/        # 별도 GLSL 파일 (vertex, copy, blur, glass)
│   └── app.js           # 실시간 API 연동 및 추천 플로우 컨트롤러
└── README.md            # 프로젝트 문서 및 안내
```

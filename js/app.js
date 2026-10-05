/**
 * 율천동 메뉴랜덤 메인 컨트롤러
 * - 성균관대학교 자연과학캠퍼스 (수원 율전동) 100% 실존 & 정상영업 검증 맛집 랜덤 추천
 * - 첫 화면: 파스텔 캔버스 배경 위 음식 이모지 비 애니메이션
 * - 추천 시작 시: 위치 기반 거리 계산 및 3D 도보 내비게이션 지도 전환
 * - 외부 API 키 의존성 완전 제거 (보안 및 GitHub 안전성 확보)
 */

document.addEventListener("DOMContentLoaded", () => {
  const emojiRain = new EmojiRain("bg-canvas");
  const navMap = new NavigationMap("map-container");
  const glass = new LiquidGlass("glass-canvas", emojiRain);
  navMap.onDestinationMarker = element => glass.setDestinationMarker(element);
  emojiRain.onFrame = () => glass.capture();

  const mainCard = document.getElementById("main-card");
  const mapContainer = document.getElementById("map-container");
  const viewInitial = document.getElementById("view-initial");
  const viewPopup = document.getElementById("view-popup");
  const compassBtn = document.getElementById("compass-btn");
  const compassDial = document.getElementById("compass-dial");
  const startBtn = document.getElementById("start-btn");
  const rerollBtn = document.getElementById("reroll-btn");
  const rerollContent = rerollBtn.innerHTML;

  // Keep content at its natural size while the outer card animates to fit it.
  let cardHeight = mainCard.getBoundingClientRect().height;
  mainCard.style.height = `${cardHeight}px`;
  let cardResizeFrame = null;
  const cardResizeObserver = new ResizeObserver(() => {
    if (cardResizeFrame !== null) return;
    cardResizeFrame = requestAnimationFrame(() => {
      cardResizeFrame = null;
      const style = getComputedStyle(mainCard);
      const contentHeight = viewInitial.getBoundingClientRect().height
        + viewPopup.getBoundingClientRect().height;
      const nextHeight = Math.max(
        parseFloat(style.minHeight) || 0,
        contentHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
          + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
      );
      if (Math.abs(nextHeight - cardHeight) < 0.5) return;
      cardHeight = nextHeight;
      mainCard.style.height = `${cardHeight}px`;
    });
  });
  // Card observation also catches width and animated padding changes.
  [mainCard, viewInitial, viewPopup].forEach(element => cardResizeObserver.observe(element));

  let currentRestaurant = null;
  let isNavigating = false;
  let activeDepartureCoords = null;
  let isMapInitialized = false;

  // 기본 출발지: 성균관대학교 자연과학캠퍼스 쪽문/후문
  const defaultOrigin = SKKU_CAMPUS_COORDS;

  // 나침반 다이얼 연동 (지도가 로드된 후 회전 감지)
  if (compassDial) {
    navMap.bindCompassDial(compassDial);
  }

  // 나침반 버튼 클릭 시 정북방향 정렬
  if (compassBtn) {
    compassBtn.addEventListener("click", () => {
      navMap.resetNorth();
    });
  }

  // 추천 시작 버튼 이벤트 바인딩
  if (startBtn) {
    startBtn.addEventListener("click", () => handleStartRecommend());
  }

  // 재추천 버튼 이벤트 바인딩
  if (rerollBtn) {
    rerollBtn.addEventListener("click", () => handleReroll());
  }

  // 20분 도보권 이내 식당 필터링 (로컬 DB 폴백용)
  function getRestaurantsWithin20Minutes(originCoords) {
    return YULCHEON_RESTAURANTS.filter((rest) => {
      const directDist = NavigationMap.calculateDistance(originCoords, rest.coords);
      const estWalkingDist = Math.round(directDist * 1.25);
      const estMinutes = NavigationMap.estimateWalkTime(estWalkingDist);
      return estMinutes <= 20;
    });
  }

  // 출발지 좌표 결정 (전국 어디서나 사용자 위치 우선, 위치 미파악 시에만 성균관대 후문 기준)
  function resolveDepartureCoords(userCoords) {
    if (userCoords && !userCoords.isDefault && typeof userCoords.lat === "number" && typeof userCoords.lng === "number") {
      return { lat: userCoords.lat, lng: userCoords.lng, isDefault: false, name: "현재 위치" };
    }
    // 브라우저가 사용자 위치를 전혀 파악할 수 없는 경우 성균관대학교 후문 기준
    return { ...defaultOrigin, isDefault: true, name: defaultOrigin.name || "성균관대 후문" };
  }

  // 랜덤 맛집 선택 (로컬 검증 DB 폴백용)
  function pickRandomRestaurant(originCoords) {
    let eligible = getRestaurantsWithin20Minutes(originCoords);
    if (eligible.length === 0) {
      eligible = YULCHEON_RESTAURANTS;
    }
    if (eligible.length === 1) return eligible[0];

    let picked, attempts = 0;
    do {
      picked = eligible[Math.floor(Math.random() * eligible.length)];
      attempts++;
    } while (currentRestaurant && picked.id === currentRestaurant.id && attempts < 15);

    return picked;
  }

  // 실시간 백엔드(/api/recommend) 전국 도보 20분(1.5km) 탐색 후 로컬 DB 자동 폴백
  async function fetchRecommendedRestaurant(originCoords) {
    try {
      const radius = 1500; // 도보 약 20분 반경 1.5km
      const randomPage = Math.floor(Math.random() * 3) + 1;
      const res = await fetch(`/api/recommend?lat=${originCoords.lat}&lng=${originCoords.lng}&radius=${radius}&page=${randomPage}`, {
        headers: { "Accept": "application/json" }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.coords && typeof data.coords.lat === "number") {
          return data;
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.warn("실시간 맛집 API 응답:", res.status, errJson);
      }
    } catch (err) {
      console.warn("실시간 맛집 API 연결 불가:", err);
    }

    // [로컬 폴백 처리]
    // 1. 사용자가 성대 도보 20분권 내에 있는 경우 로컬 맛집 추천
    const eligible = getRestaurantsWithin20Minutes(originCoords);
    if (eligible.length > 0) {
      return pickRandomRestaurant(originCoords);
    }

    // 2. 사용자가 성대 밖인데 실시간 API 호출이 실패한 경우:
    // 먼 거리에서 성대 식당으로 무리하게 길안내하지 않고, 기준점을 성대 후문으로 안전하게 전환하여 추천
    activeDepartureCoords = { ...defaultOrigin, isDefault: true, name: "성균관대 후문 (위치 미탐색 대체)" };
    return pickRandomRestaurant(defaultOrigin);
  }

  // 추천 시작 핸들러 (버튼 클릭 시에만 지도 활성화 및 팝업 슬라이드업)
  async function handleStartRecommend() {
    if (isNavigating) return;
    isNavigating = true;

    // 1. 버튼 로딩 상태 표시
    startBtn.innerHTML = `
      <div class="loading-indicator">
        <div class="spinner"></div>
        <span>맛집 탐색중</span>
      </div>
    `;
    startBtn.style.pointerEvents = "none";

    // 2. GPS 위치 확인 (권한 거부 또는 실패 시 성대 쪽문 기본값)
    const rawGpsCoords = await navMap.getUserLocation();
    activeDepartureCoords = resolveDepartureCoords(rawGpsCoords);

    // 3. 실시간 백엔드 API 탐색 (미배포 또는 실패 시 100% 검증 로컬 DB 자동 폴백)
    const picked = await fetchRecommendedRestaurant(activeDepartureCoords);
    currentRestaurant = picked;

    // 4. 팝업 데이터 바인딩
    fillPopupData(picked, null);

    // 5. 첫 화면 이모지 비 페이드아웃
    emojiRain.fadeOut(400);

    // 6. 3D 지도 컨테이너 페이드인 및 최초 초기화
    mapContainer.classList.add("active");
    if (!isMapInitialized) {
      navMap.initMap(activeDepartureCoords);
      glass.setMap(navMap.map);
      isMapInitialized = true;
    }

    // 7. 정북방향 나침반 버튼 활성화
    if (compassBtn) {
      compassBtn.classList.add("active");
    }

    // 8. 메인 글래스 카드 상단 팝업 뷰로 슬라이드 전환
    viewInitial.classList.add("hide");
    viewPopup.classList.add("active");
    mainCard.classList.add("card-popup");

    // 9. 지도 상에 실제 도보 경로 렌더링 및 카메라 이동
    const routeInfo = await navMap.showRouteToRestaurant(picked, activeDepartureCoords);

    // 10. 도보 소요 시간 뱃지 갱신
    updateWalkBadge(routeInfo);
    isNavigating = false;
  }

  // 팝업 엘리먼트에 식당 정보 바인딩
  function fillPopupData(restaurant, routeInfo) {
    document.getElementById("popup-restaurant-name").textContent = restaurant.name;
    document.getElementById("popup-category-badge").textContent = restaurant.category;

    const ratingVal = typeof restaurant.rating === "number" ? restaurant.rating.toFixed(1) : "4.5";
    document.getElementById("popup-rating-value").textContent = ratingVal;

    document.getElementById("popup-summary").textContent = restaurant.summary;
    setBadgeText("popup-price-badge", restaurant.price_range);
    document.getElementById("popup-kakao-link").href = restaurant.kakao_url;

    const originLabel = activeDepartureCoords && activeDepartureCoords.isDefault
      ? `${activeDepartureCoords.name} 출발`
      : "현 위치 출발";
    setBadgeText("popup-origin-badge", originLabel);

    updateWalkBadge(routeInfo);

    // 3장 사진 갤러리 렌더링
    const galleryContainer = document.getElementById("popup-gallery");
    if (restaurant.photos && restaurant.photos.length > 0) {
      const photosHtml = restaurant.photos.slice(0, 3).map((url, idx) => `
        <div class="photo-item">
          <img src="${url}" alt="${restaurant.name} 메뉴 사진 ${idx + 1}" loading="lazy"
               onerror="this.parentElement.style.display='none'" />
        </div>
      `).join("");
      galleryContainer.innerHTML = photosHtml;
      galleryContainer.style.display = "flex";
    } else {
      galleryContainer.innerHTML = "";
      galleryContainer.style.display = "none";
    }
  }

  // 도보 소요 시간 뱃지 텍스트 갱신
  function setBadgeText(id, text) {
    document.querySelector(`#${id} .badge-label`).textContent = text;
  }

  function updateWalkBadge(routeInfo) {
    const walkBadge = document.getElementById("popup-walk-badge");
    if (!walkBadge) return;

    if (routeInfo) {
      setBadgeText("popup-walk-badge", `도보 약 ${routeInfo.durationMinutes}분 (${routeInfo.distanceMeters}m)`);
    } else {
      setBadgeText("popup-walk-badge", "도보 경로 계산 중...");
    }
  }

  // 🎲 다른 메뉴 추천(재추천) 핸들러
  async function handleReroll() {
    if (isNavigating) return;
    isNavigating = true;
    if (rerollBtn) {
      rerollBtn.disabled = true;
      rerollBtn.setAttribute("aria-busy", "true");
      rerollBtn.style.opacity = "0.6";
      rerollBtn.innerHTML = `<span>🔄 탐색 중...</span>`;
    }

    const nextRestaurant = await fetchRecommendedRestaurant(activeDepartureCoords);
    currentRestaurant = nextRestaurant;

    fillPopupData(nextRestaurant, null);

    const routeInfo = await navMap.showRouteToRestaurant(nextRestaurant, activeDepartureCoords);
    updateWalkBadge(routeInfo);

    if (rerollBtn) {
      rerollBtn.style.opacity = "1";
      rerollBtn.innerHTML = rerollContent;
      rerollBtn.disabled = false;
      rerollBtn.removeAttribute("aria-busy");
    }
    isNavigating = false;
  }
});

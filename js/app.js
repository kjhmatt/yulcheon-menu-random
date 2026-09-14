/**
 * 율천동 메뉴랜덤 메인 컨트롤러 (나침반 정렬 + 고성능 글라이딩 연동)
 */

document.addEventListener("DOMContentLoaded", () => {
  const emojiRain = new EmojiRain("bg-canvas");
  const navMap = new NavigationMap("map-container");

  const mainCard = document.getElementById("main-card");
  const mapContainer = document.getElementById("map-container");
  const viewInitial = document.getElementById("view-initial");
  const viewPopup = document.getElementById("view-popup");
  const compassBtn = document.getElementById("compass-btn");
  const compassDial = document.getElementById("compass-dial");

  let currentRestaurant = null;
  let isNavigating = false;
  let activeDepartureCoords = null;

  // 나침반 다이얼 연동
  if (compassDial) {
    navMap.bindCompassDial(compassDial);
  }

  // 나침반 버튼 클릭 시 정북방향 정렬
  if (compassBtn) {
    compassBtn.addEventListener("click", () => {
      navMap.resetNorth();
    });
  }

  const startBtn = document.getElementById("start-btn");
  if (startBtn) {
    startBtn.addEventListener("click", () => handleStartRecommend());
  }

  const rerollBtn = document.getElementById("reroll-btn");
  if (rerollBtn) {
    rerollBtn.addEventListener("click", () => handleReroll());
  }

  // 15분 이내 식당 필터링
  function getRestaurantsWithin15Minutes(originCoords) {
    return YULCHEON_RESTAURANTS.filter((rest) => {
      const directDist = NavigationMap.calculateDistance(originCoords, rest.coords);
      const estWalkingDist = Math.round(directDist * 1.25);
      const estMinutes = NavigationMap.estimateWalkTime(estWalkingDist);
      return estMinutes <= 15;
    });
  }

  // 출발지 좌표 결정 (GPS 또는 성대 후문)
  function resolveDepartureCoords(userCoords) {
    if (!userCoords || userCoords.isDefault) {
      return { ...SKKU_CAMPUS_COORDS, isDefault: true };
    }
    const nearby = getRestaurantsWithin15Minutes(userCoords);
    if (nearby.length > 0) {
      return { lat: userCoords.lat, lng: userCoords.lng, isDefault: false, name: "현재 위치" };
    }
    return { ...SKKU_CAMPUS_COORDS, isDefault: true };
  }

  // 랜덤 맛집 선택 (15분 이내 보장)
  function pickRandomNearbyRestaurant(originCoords) {
    let eligible = getRestaurantsWithin15Minutes(originCoords);
    if (eligible.length === 0) eligible = YULCHEON_RESTAURANTS;
    if (eligible.length === 1) return eligible[0];

    let picked, attempts = 0;
    do {
      picked = eligible[Math.floor(Math.random() * eligible.length)];
      attempts++;
    } while (currentRestaurant && picked.id === currentRestaurant.id && attempts < 15);

    return picked;
  }

  // 추천 시작 핸들러
  async function handleStartRecommend() {
    if (isNavigating) return;
    isNavigating = true;

    // 1. 버튼 로딩 스피너
    startBtn.innerHTML = `
      <div class="loading-indicator">
        <div class="spinner"></div>
        <span>맛집 탐색 중...</span>
      </div>
    `;
    startBtn.style.pointerEvents = "none";

    // 2. GPS 권한 및 출발지 확정
    const rawGpsCoords = await navMap.getUserLocation();
    activeDepartureCoords = resolveDepartureCoords(rawGpsCoords);

    // 3. 15분 이내 식당 선별
    const picked = pickRandomNearbyRestaurant(activeDepartureCoords);
    currentRestaurant = picked;

    // 4. 팝업 뷰에 식당 정보 미리 채우기
    fillPopupData(picked, null);

    // 5. 배경 이모지 캔버스 페이드아웃 및 중지
    emojiRain.fadeOut(400);
    mapContainer.classList.add("active");

    // 우상단 나침반 버튼 페이드인 활성화
    if (compassBtn) {
      compassBtn.classList.add("active");
    }

    // 6. 지도 인스턴스 준비
    navMap.initMap(activeDepartureCoords);

    // 7. 실키한 GPU 슬라이드업 실행
    viewInitial.classList.add("hide");
    viewPopup.classList.add("active");
    mainCard.classList.add("card-popup");

    // 8. 3D 지도에 경로 및 카메라 비행 실행
    const routeInfo = await navMap.showRouteToRestaurant(picked, activeDepartureCoords);

    // 9. 도보 소요 시간 뱃지만 갱신
    updateWalkBadge(routeInfo);
  }

  // 팝업 엘리먼트에 데이터 바인딩
  function fillPopupData(restaurant, routeInfo) {
    document.getElementById("popup-restaurant-name").textContent = restaurant.name;
    document.getElementById("popup-category-badge").textContent = restaurant.category;
    document.getElementById("popup-rating-value").textContent = restaurant.rating.toFixed(1);
    document.getElementById("popup-summary").textContent = restaurant.summary;
    document.getElementById("popup-price-badge").textContent = `🏷️ ${restaurant.price_range}`;
    document.getElementById("popup-kakao-link").href = restaurant.kakao_url;

    const originLabel = activeDepartureCoords && activeDepartureCoords.isDefault
      ? "성대 후문(쪽문) 출발"
      : "현 위치 출발";
    document.getElementById("popup-origin-badge").textContent = `📍 ${originLabel}`;

    updateWalkBadge(routeInfo);

    // 사진 갤러리 렌더링 (최대 3개, 없을 시 숨김)
    const galleryContainer = document.getElementById("popup-gallery");
    if (restaurant.photos && restaurant.photos.length > 0) {
      const photosHtml = restaurant.photos.slice(0, 3).map((url, idx) => `
        <div class="photo-item">
          <img src="${url}" alt="${restaurant.name} 사진 ${idx + 1}" loading="lazy"
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

  // 도보 시간 뱃지만 단독 업데이트
  function updateWalkBadge(routeInfo) {
    const walkBadge = document.getElementById("popup-walk-badge");
    if (routeInfo) {
      walkBadge.textContent = `🚶 도보 약 ${routeInfo.durationMinutes}분 (${routeInfo.distanceMeters}m)`;
    } else {
      walkBadge.textContent = "🚶 도보 경로 계산 중...";
    }
  }

  // 다른 메뉴 추천(재추천) 핸들러
  async function handleReroll() {
    if (rerollBtn) {
      rerollBtn.style.opacity = "0.6";
      rerollBtn.innerHTML = `<span>🔄 탐색 중...</span>`;
    }

    const nextRestaurant = pickRandomNearbyRestaurant(activeDepartureCoords);
    currentRestaurant = nextRestaurant;

    fillPopupData(nextRestaurant, null);

    const routeInfo = await navMap.showRouteToRestaurant(nextRestaurant, activeDepartureCoords);
    updateWalkBadge(routeInfo);

    if (rerollBtn) {
      rerollBtn.style.opacity = "1";
      rerollBtn.innerHTML = `<span>🎲 다른 메뉴 추천</span>`;
    }
  }
});

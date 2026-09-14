/**
 * 3D 내비게이션 및 실제 도보 경로 모듈 (OSM 공식 routed-foot 도보 엔진 + 나침반 정렬)
 */
class NavigationMap {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.userCoords = null;
    this.userMarker = null;
    this.destMarker = null;
    this.isMapReady = false;
    this._loadResolvers = [];
    this.compassDial = null;
  }

  // 두 좌표 간 직선 거리(미터) 계산 (Haversine 공식)
  static calculateDistance(coord1, coord2) {
    const R = 6371e3;
    const phi1 = (coord1.lat * Math.PI) / 180;
    const phi2 = (coord2.lat * Math.PI) / 180;
    const deltaPhi = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const deltaLambda = ((coord2.lng - coord1.lng) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  // 현실적인 도보 소요 시간(분) 계산 (성인 평균 도보: 분당 65m, 시속 약 3.9km/h)
  static estimateWalkTime(distanceMeters) {
    return Math.max(1, Math.ceil(distanceMeters / 65));
  }

  // 나침반 다이얼 엘리먼트 바인딩
  bindCompassDial(dialElement) {
    this.compassDial = dialElement;
    if (this.map && this.compassDial) {
      this.attachCompassListener();
    }
  }

  attachCompassListener() {
    this.map.on('rotate', () => {
      if (this.compassDial) {
        const bearing = this.map.getBearing();
        this.compassDial.style.transform = `rotate(${-bearing}deg)`;
      }
    });
  }

  // 정북방향(bearing: 0)으로 부드럽게 재정렬
  resetNorth() {
    if (!this.map) return;
    this.map.easeTo({
      bearing: 0,
      duration: 600,
      essential: true
    });
  }

  // GPS 권한 요청 및 위치 획득
  async getUserLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        this.userCoords = { lat: SKKU_CAMPUS_COORDS.lat, lng: SKKU_CAMPUS_COORDS.lng, isDefault: true };
        resolve(this.userCoords);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude, isDefault: false };
          resolve(this.userCoords);
        },
        (err) => {
          console.warn("GPS 권한 거부 또는 실패:", err.message, "→ 성대 후문 기준 적용");
          this.userCoords = { lat: SKKU_CAMPUS_COORDS.lat, lng: SKKU_CAMPUS_COORDS.lng, isDefault: true };
          resolve(this.userCoords);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
      );
    });
  }

  // 지도 load 완료 대기 Promise
  waitForLoad() {
    return new Promise((resolve) => {
      if (this.isMapReady) {
        resolve();
      } else {
        this._loadResolvers.push(resolve);
      }
    });
  }

  // 3D 지도 초기화
  initMap(initialCoords) {
    if (this.map) return;

    this.map = new maplibregl.Map({
      container: this.containerId,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.de/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [{
          id: 'osm-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19
        }]
      },
      center: [initialCoords.lng, initialCoords.lat],
      zoom: 16.5,
      pitch: 58,
      bearing: 0,
      antialias: true
    });

    if (this.compassDial) {
      this.attachCompassListener();
    }

    this.map.on('load', () => {
      this.map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
      });

      // 1. 도보 외곽 네온 글로우 (시안/민트 도보 상징)
      this.map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#00C7BE', 'line-width': 10, 'line-opacity': 0.45, 'line-blur': 3 }
      });

      // 2. 도보 베이스 라인 (에메랄드 그린)
      this.map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#30D158', 'line-width': 6, 'line-opacity': 0.95 }
      });

      // 3. 도보 전용 발자국 점선 (네이버지도/카카오맵 도보 길찾기 스타일)
      this.map.addLayer({
        id: 'route-walking-dots',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 3,
          'line-dasharray': [1, 2],
          'line-opacity': 0.92
        }
      });

      this.isMapReady = true;
      this._loadResolvers.forEach(fn => fn());
      this._loadResolvers = [];
    });
  }

  // 방위각(Bearing) 계산
  calculateBearing(start, dest) {
    const lat1 = (start.lat * Math.PI) / 180;
    const lat2 = (dest.lat * Math.PI) / 180;
    const dLng = ((dest.lng - start.lng) * Math.PI) / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  // 목적지 및 내비게이션 뷰로 이동
  async showRouteToRestaurant(restaurant, currentCoords = null) {
    if (currentCoords) this.userCoords = currentCoords;
    else if (!this.userCoords) await this.getUserLocation();

    if (!this.map) {
      this.initMap(this.userCoords);
    }

    await this.waitForLoad();

    const start = this.userCoords;
    const dest = restaurant.coords;
    const bearing = this.calculateBearing(start, dest);

    // 1. 내 위치 마커 렌더링
    this.renderUserMarker(start, bearing);

    // 2. 실제 보행자 도보 경로 가져오기
    const routeInfo = await this.fetchWalkingRoute(start, dest);
    this.updateRouteLayer(routeInfo.coordinates);

    // 3. 목적지 식당 말풍선 마커 렌더링
    this.renderDestinationMarker(dest, restaurant.name, routeInfo.durationMinutes);

    // 4. 내비게이션 카메라 시점 이동
    this.map.flyTo({
      center: [(start.lng + dest.lng) / 2, (start.lat + dest.lat) / 2],
      zoom: 16.3,
      pitch: 58,
      bearing: bearing,
      padding: { top: 220, bottom: 120, left: 40, right: 40 },
      duration: 1500,
      essential: true
    });

    // 나침반 초기 각도 동기화
    if (this.compassDial) {
      this.compassDial.style.transform = `rotate(${-bearing}deg)`;
    }

    return routeInfo;
  }

  // 내 위치 마커 렌더링
  renderUserMarker(coords, bearing) {
    if (this.userMarker) this.userMarker.remove();

    const el = document.createElement('div');
    el.className = 'user-marker-container';
    el.innerHTML = `
      <div class="user-nav-inner">
        <div class="user-nav-arrow" style="transform: rotate(${bearing}deg)">
          <svg viewBox="0 0 40 40" width="38" height="38">
            <polygon points="20,4 34,34 20,26 6,34" fill="#30D158" stroke="#ffffff" stroke-width="2.5"/>
          </svg>
        </div>
        <div class="user-pulse-ring"></div>
      </div>
    `;

    this.userMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([coords.lng, coords.lat])
      .addTo(this.map);
  }

  // 목적지 식당 말풍선 마커 렌더링
  renderDestinationMarker(coords, name, durationMinutes) {
    if (this.destMarker) this.destMarker.remove();

    const el = document.createElement('div');
    el.className = 'dest-marker-container';
    el.innerHTML = `
      <div class="dest-bubble-inner">
        <div class="dest-bubble-card">
          <span class="dest-bubble-icon">📍</span>
          <span class="dest-bubble-title">${name}</span>
          <span class="dest-bubble-time">도보 ${durationMinutes}분</span>
        </div>
        <div class="dest-bubble-pointer"></div>
      </div>
    `;

    this.destMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([coords.lng, coords.lat])
      .addTo(this.map);
  }

  // 실제 보행자 도보 경로 API (OSM 공식 routed-foot 엔진)
  async fetchWalkingRoute(start, dest) {
    const directDistance = NavigationMap.calculateDistance(start, dest);
    const estimatedWalkingDist = Math.round(directDistance * 1.25);
    const estimatedTime = NavigationMap.estimateWalkTime(estimatedWalkingDist);

    const osmFootUrl = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/` +
      `${start.lng},${start.lat};${dest.lng},${dest.lat}` +
      `?overview=full&geometries=geojson`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(osmFootUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const actualDistance = Math.round(route.distance);
          const actualWalkMinutes = NavigationMap.estimateWalkTime(actualDistance);

          return {
            coordinates: route.geometry.coordinates,
            durationMinutes: actualWalkMinutes,
            distanceMeters: actualDistance
          };
        }
      }
    } catch (e) {
      console.warn("OSM routed-foot 호출 실패:", e.message);
    }

    return {
      coordinates: [[start.lng, start.lat], [dest.lng, dest.lat]],
      durationMinutes: estimatedTime,
      distanceMeters: estimatedWalkingDist
    };
  }

  updateRouteLayer(coordinates) {
    if (!this.map || !this.map.getSource('route')) return;
    this.map.getSource('route').setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coordinates }
    });
  }
}

window.NavigationMap = NavigationMap;

/**
 * Cloudflare Pages Function: /api/recommend
 * 
 * 사용자 현재 GPS 좌표(lat, lng)를 수신하여 카카오 로컬 카테고리 검색 API(FD6)를 호출하고,
 * 도보권 내 실시간 음식점 중 하나를 랜덤으로 추천합니다.
 * 
 * 보안:
 * - KAKAO_REST_API_KEY는 Cloudflare 대시보드 Secret 환경변수에서만 주입되므로 GitHub에 절대 노출되지 않습니다.
 * - 클라이언트에서는 오직 /api/recommend 엔드포인트만 호출합니다.
 */

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store, no-cache, must-revalidate"
  };

  try {
    const url = new URL(request.url);
    const lat = url.searchParams.get("lat") || "37.29595"; // 기본값: 성균관대 자과캠
    const lng = url.searchParams.get("lng") || "126.97415";
    const rawRadius = parseInt(url.searchParams.get("radius") || "1000", 10);
    // 반경 300m ~ 2500m로 안전하게 클램핑 (도보권)
    const radius = Math.max(300, Math.min(2500, isNaN(rawRadius) ? 1000 : rawRadius));

    // Cloudflare 대시보드 Secret에 등록된 키 획득
    const KAKAO_KEY = env.KAKAO_REST_API_KEY;
    if (!KAKAO_KEY) {
      return new Response(
        JSON.stringify({
          error: "KAKAO_REST_API_KEY_MISSING",
          message: "Cloudflare 대시보드 Settings > Environment Variables에 KAKAO_REST_API_KEY를 등록해주세요."
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    // 카카오 로컬 카테고리 검색 API 호출 (FD6 = 음식점)
    // Kakao API 규격: x는 경도(lng), y는 위도(lat)
    const kakaoApiUrl = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=FD6&x=${lng}&y=${lat}&radius=${radius}&size=15&sort=distance`;

    const kakaoRes = await fetch(kakaoApiUrl, {
      method: "GET",
      headers: {
        "Authorization": `KakaoAK ${KAKAO_KEY.trim()}`
      }
    });

    if (!kakaoRes.ok) {
      const errorBody = await kakaoRes.text();
      return new Response(
        JSON.stringify({
          error: "KAKAO_API_ERROR",
          status: kakaoRes.status,
          details: errorBody
        }),
        { status: kakaoRes.status, headers: corsHeaders }
      );
    }

    const kakaoData = await kakaoRes.json();
    const documents = kakaoData.documents;

    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({
          error: "NO_RESTAURANTS_FOUND",
          message: `반경 ${radius}m 이내에 검색된 음식점이 없습니다.`
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    // 검색 결과 중 무작위 1곳 추첨
    const picked = documents[Math.floor(Math.random() * documents.length)];

    // 카테고리 계층 분리 (예: '음식점 > 한식 > 육류,고기' -> '한식 / 육류,고기')
    const categoryParts = picked.category_name ? picked.category_name.split('>').map(s => s.trim()) : [];
    const formattedCategory = categoryParts.length > 1
      ? categoryParts.slice(1).join(' / ')
      : (picked.category_name || '음식점');

    // 클라이언트 UI 호환 객체 구성
    const responsePayload = {
      id: picked.id,
      name: picked.place_name,
      category: formattedCategory,
      rating: 4.5,
      address: picked.road_address_name || picked.address_name,
      phone: picked.phone || '전화번호 미등록',
      summary: `${picked.place_name} (${formattedCategory})`,
      price_range: '카카오맵에서 메뉴 및 가격 확인',
      tags: categoryParts.filter(Boolean),
      coords: {
        lat: parseFloat(picked.y),
        lng: parseFloat(picked.x)
      },
      distance: parseInt(picked.distance, 10),
      kakao_url: picked.place_url || `https://map.kakao.com/?q=${encodeURIComponent(picked.place_name)}`,
      photos: []
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: corsHeaders
    });

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "INTERNAL_SERVER_ERROR",
        message: err.message
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}

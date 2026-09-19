/**
 * Cloudflare Pages Advanced Worker (_worker.js) & Cloudflare Worker (worker.js)
 * 
 * - /api/recommend 요청 시: 카카오 로컬 카테고리(FD6: 음식점) 검색 API를 실시간 호출하여
 *   사용자 현재 위치(lat, lng) 기준 도보 20분(반경 1.5km) 내 맛집을 랜덤으로 1곳 추천합니다.
 * - 그 외 모든 요청(/, /css/*, /js/* 등): Pages인 경우 env.ASSETS.fetch(request)로 정적 파일을 자동 서빙합니다.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. API 엔드포인트: /api/recommend
    if (url.pathname === "/api/recommend") {
      return handleRecommend(request, env);
    }

    // 2. 정적 자산 서빙 (Cloudflare Pages 환경)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};

async function handleRecommend(request, env) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store, no-cache, must-revalidate"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const lat = url.searchParams.get("lat") || "37.29595"; // 기본값: 성균관대 후문
    const lng = url.searchParams.get("lng") || "126.97415";
    const rawRadius = parseInt(url.searchParams.get("radius") || "1500", 10);
    // 도보 20분: 기본 1500m (300m ~ 3000m 클램핑)
    const radius = Math.max(300, Math.min(3000, isNaN(rawRadius) ? 1500 : rawRadius));
    const requestedPage = Math.max(1, Math.min(3, parseInt(url.searchParams.get("page") || "1", 10)));
    const sort = url.searchParams.get("sort") || "accuracy";

    // Cloudflare 대시보드 환경변수(Secret) 확인
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
    let kakaoApiUrl = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=FD6&x=${lng}&y=${lat}&radius=${radius}&size=15&page=${requestedPage}&sort=${sort}`;

    let kakaoRes = await fetch(kakaoApiUrl, {
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

    let kakaoData = await kakaoRes.json();
    let documents = kakaoData.documents;

    // 만약 2~3페이지 요청 시 결과가 없다면 1페이지로 자동 재시도
    if ((!documents || documents.length === 0) && requestedPage > 1) {
      kakaoApiUrl = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=FD6&x=${lng}&y=${lat}&radius=${radius}&size=15&page=1&sort=${sort}`;
      kakaoRes = await fetch(kakaoApiUrl, {
        method: "GET",
        headers: { "Authorization": `KakaoAK ${KAKAO_KEY.trim()}` }
      });
      if (kakaoRes.ok) {
        kakaoData = await kakaoRes.json();
        documents = kakaoData.documents;
      }
    }

    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({
          error: "NO_RESTAURANTS_FOUND",
          message: `도보 20분(반경 ${radius}m) 이내에 검색된 음식점이 없습니다.`
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    // 검색 결과 중 무작위 1곳 추첨
    const picked = documents[Math.floor(Math.random() * documents.length)];

    // 카테고리 가공
    const categoryParts = picked.category_name ? picked.category_name.split(">").map(s => s.trim()) : [];
    const formattedCategory = categoryParts.length > 1
      ? categoryParts.slice(1).join(" / ")
      : (picked.category_name || "음식점");

    const responsePayload = {
      id: picked.id,
      name: picked.place_name,
      category: formattedCategory,
      rating: 4.5,
      address: picked.road_address_name || picked.address_name,
      phone: picked.phone || "전화번호 미등록",
      summary: `${picked.place_name} (${formattedCategory})`,
      price_range: "카카오맵에서 메뉴 및 가격 확인",
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

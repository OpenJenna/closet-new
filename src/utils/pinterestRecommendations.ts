import { WardrobeItem } from '../types/wardrobe';

export interface PinterestRecommendation {
  title: string;
  tip: string;
  url: string;
  sourceLabel: string;
  query: string;
}

const COLOR_EN_MAP: Record<string, string> = {
  블랙: 'black',
  '화이트/아이보리': 'ivory white',
  그레이: 'grey',
  차콜: 'charcoal grey',
  네이비: 'navy',
  '데님 블루': 'blue denim',
  '라이트 블루': 'light blue',
  '베이지/카멜': 'beige camel',
  브라운: 'brown',
  '올리브/카키': 'olive khaki',
  청록색: 'teal blue green',
  '버건디/레드': 'burgundy red',
  핑크: 'pink',
  연보라: 'lavender',
  퍼플: 'purple violet',
};

const SUBCATEGORY_EN_MAP: Record<string, string> = {
  '니트/스웨터': 'knit sweater',
  티셔츠: 't-shirt',
  '셔츠/블라우스': 'shirt blouse',
  '맨투맨/후드': 'sweatshirt hoodie',
  '미니 원피스': 'mini dress',
  '미디/롱 원피스': 'midi long dress',
  '니트 원피스': 'knit dress',
  청바지: 'jeans',
  슬랙스: 'slacks trousers',
  '트레이닝/조거': 'jogger sweatpants',
  반바지: 'shorts',
  미니스커트: 'mini skirt',
  '롱/미디스커트': 'midi long skirt',
  '데님 스커트': 'denim skirt',
  가디건: 'cardigan',
  '패딩/다운': 'puffer jacket',
  코트: 'coat',
  '자켓/점퍼': 'jacket blazer',
  골프웨어: 'golf outfit',
  러닝: 'running outfit',
  수영복: 'swimwear beachwear',
  '요가/필라테스': 'pilates athleisure outfit',
  '테니스/기타': 'tennis outfit',
  스니커즈: 'sneakers',
  로퍼: 'loafers',
  구두: 'dress shoes heels',
  플랫슈즈: 'ballet flats flat shoes',
  워커: 'combat boots lace up boots',
  앵클부츠: 'ankle boots',
  부츠: 'boots',
  레인부츠: 'rain boots wellies',
  '로퍼/플랫': 'loafers flats',
  샌들: 'sandals',
  기타: 'shoes',
  백팩: 'backpack',
  토트백: 'tote bag',
  '크로스/숄더백': 'shoulder crossbody bag',
  스카프: 'silk scarf',
  목도리: 'winter scarf muffler',
  '머플러/스카프': 'scarf muffler',
  모자: 'baseball cap hat',
  장갑: 'winter gloves',
  벨트: 'leather belt',
};

function buildPinterestSearchUrl(query: string): string {
  return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
}

export function buildLocalPinterestRecommendations(
  item: Pick<
    WardrobeItem,
    'name' | 'category' | 'subCategory' | 'colorName' | 'pattern' | 'seasons' | 'tpo'
  >
): PinterestRecommendation[] {
  const colorKo = item.colorName.split('/')[0] || item.colorName;
  const colorEn = COLOR_EN_MAP[item.colorName] || colorKo;
  const subKo = item.subCategory || item.category;
  const subEn = SUBCATEGORY_EN_MAP[item.subCategory] || item.name || item.category;
  const primarySeason = item.seasons[0] || '';
  const seasonEn =
    primarySeason === '봄'
      ? 'spring'
      : primarySeason === '여름'
        ? 'summer'
        : primarySeason === '가을'
          ? 'autumn'
          : primarySeason === '겨울'
            ? 'winter'
            : '';

  const patternEn =
    item.pattern && item.pattern !== '무지'
      ? item.pattern === '스트라이프'
        ? 'striped'
        : item.pattern === '체크'
          ? 'plaid check'
          : item.pattern === '케이블/짜임'
            ? 'cable knit'
            : item.pattern === '플로럴'
              ? 'floral'
              : ''
      : '';

  const q1 = [colorEn, patternEn, subEn, 'outfit ideas'].filter(Boolean).join(' ');
  const q2 = `${colorKo} ${subKo} 데일리 코디`;
  const q3 = [colorEn, subEn, seasonEn || 'casual', 'street style'].filter(Boolean).join(' ');
  const q4 =
    item.category === '스포츠웨어'
      ? `${colorEn} ${subEn} aesthetic`
      : item.tpo === '출근/오피스'
        ? `${colorEn} ${subEn} office look`
        : `${colorEn} ${subEn} minimal outfit`;

  return [
    {
      title: `${colorKo} ${subKo} 데일리 착장`,
      tip: `${item.colorName} 컬러의 ${subKo}를 활용한 가장 기본적인 Pinterest 데일리 코디를 모아봤어요.`,
      url: buildPinterestSearchUrl(q1),
      sourceLabel: 'Pinterest 검색',
      query: q1,
    },
    {
      title: `한국 스타일 ${colorKo} ${subKo} 코디`,
      tip: `국내 감성과 잘 어울리는 ${colorKo} 톤온톤·모노톤 스타일링 레퍼런스를 확인하세요.`,
      url: buildPinterestSearchUrl(q2),
      sourceLabel: 'Pinterest 검색',
      query: q2,
    },
    {
      title: `${primarySeason ? `${primarySeason} ` : ''}스트릿 무드 스타일링`,
      tip: `${primarySeason || '시즌'} 감도에 맞는 레이어드와 액세서리 매치 아이디어를 찾아볼 수 있어요.`,
      url: buildPinterestSearchUrl(q3),
      sourceLabel: 'Pinterest 검색',
      query: q3,
    },
    {
      title:
        item.category === '스포츠웨어'
          ? `${subKo} 애슬레저 룩북`
          : item.tpo === '출근/오피스'
            ? '깔끔한 오피스·출근 룩'
            : '미니멀·프렌치 시크 룩',
      tip: `과하지 않으면서 컬러감이 돋보이는 세련된 착장 조합을 추천합니다.`,
      url: buildPinterestSearchUrl(q4),
      sourceLabel: 'Pinterest 검색',
      query: q4,
    },
  ];
}

const recommendationCache = new Map<string, PinterestRecommendation[]>();

export function getItemRecommendationCacheKey(item: WardrobeItem): string {
  return `${item.id}::${item.category}::${item.subCategory}::${item.colorName}::${item.pattern ?? ''}::${item.name}`;
}

export async function fetchPinterestRecommendations(
  item: WardrobeItem,
  options?: { forceRefresh?: boolean; signal?: AbortSignal }
): Promise<{ recommendations: PinterestRecommendation[]; source: 'ai' | 'local' }> {
  const key = getItemRecommendationCacheKey(item);
  if (!options?.forceRefresh) {
    const cached = recommendationCache.get(key);
    if (cached && cached.length > 0) {
      return { recommendations: cached, source: 'ai' };
    }
  }

  try {
    const res = await fetch('/api/recommend-pinterest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options?.signal,
      body: JSON.stringify({
        name: item.name,
        category: item.category,
        subCategory: item.subCategory,
        colorName: item.colorName,
        pattern: item.pattern,
        material: item.material,
        seasons: item.seasons,
        tpo: item.tpo,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        recommendations?: PinterestRecommendation[];
      };
      if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        recommendationCache.set(key, data.recommendations);
        return { recommendations: data.recommendations, source: 'ai' };
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
  }

  const fallback = buildLocalPinterestRecommendations(item);
  return { recommendations: fallback, source: 'local' };
}

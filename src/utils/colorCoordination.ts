import { COLOR_SWATCHES, Category, WardrobeItem } from '../types/wardrobe';

export interface ColorPairingRecommendation {
  colorName: string;
  colorHex: string;
  mood: string;
  reason: string;
  /** Wardrobe COLOR_SWATCHES names that count as owned matches for this recommended color */
  matchColorNames: string[];
}

export interface ColorCoordinationPlan {
  heading: string;
  subheading: string;
  partnerLabel: string;
  currentRoleLabel: string;
  /** True when the current item sits on top (상의/아우터) and partner sits on bottom (하의) */
  currentOnTop: boolean;
  partnerCategories: Category[];
  recommendations: ColorPairingRecommendation[];
}

const EXTRA_SWATCH_HEX: Record<string, string> = {
  버건디: '#7A2E3A',
  레드: '#C8323B',
  '코발트 블루': '#1D4ED8',
  퍼플: '#6D28D9',
  옐로우: '#EAB308',
  청록색: '#0F766E',
  스카이블루: '#8CC0E8',
  카키: '#586446',
  '버터 옐로우': '#F3DF99',
};

const SWATCH_HEX_BY_NAME: Record<string, string> = {
  ...Object.fromEntries(COLOR_SWATCHES.map((sw) => [sw.name, sw.hex])),
  ...EXTRA_SWATCH_HEX,
};

function swatchHex(name: string): string {
  return SWATCH_HEX_BY_NAME[name] || '#18181B';
}

interface RawPair {
  colorName: string;
  mood: string;
  reason: string;
  matchColorNames?: string[];
}

const COLOR_HARMONY_MAP: Record<string, RawPair[]> = {
  블랙: [
    { colorName: '화이트/아이보리', mood: '모던 모노톤', reason: '가장 깔끔하고 선명한 대비' },
    { colorName: '데님 블루', mood: '데일리 캐주얼', reason: '부담 없이 자연스러운 조합' },
    { colorName: '베이지/카멜', mood: '소프트 시크', reason: '무거움을 따뜻하게 중화' },
    { colorName: '그레이', mood: '시티 미니멀', reason: '세련된 무채색 톤온톤' },
    { colorName: '차콜', mood: '딥 모노크롬', reason: '깊이감 있는 다크 밸런스' },
    { colorName: '올리브/카키', mood: '어반 내추럴', reason: '차분한 컬러 포인트 매치' },
    { colorName: '코발트 블루', mood: '선명한 포인트', reason: '블랙을 가장 도회적으로 살리는 강렬한 대비', matchColorNames: ['코발트 블루'] },
    { colorName: '퍼플', mood: '시크 포인트', reason: '깊이 있고 감각적인 컬러 악센트', matchColorNames: ['퍼플', '연보라'] },
  ],
  '화이트/아이보리': [
    { colorName: '데님 블루', mood: '클래식 데일리', reason: '청량하고 실패 없는 기본 조합' },
    { colorName: '블랙', mood: '미니멀 모노톤', reason: '또렷하고 단정한 대비감' },
    { colorName: '베이지/카멜', mood: '크림 톤온톤', reason: '부드럽고 고급스러운 뉴트럴' },
    { colorName: '네이비', mood: '클린 프레피', reason: '시원하고 지적인 컬러 조화' },
    { colorName: '브라운', mood: '웜 클래식', reason: '포근하고 깊이 있는 무드' },
    { colorName: '올리브/카키', mood: '내추럴 캐주얼', reason: '편안하고 산뜻한 어스톤' },
  ],
  그레이: [
    { colorName: '블랙', mood: '모던 미니멀', reason: '정돈된 무채색 시크 밸런스' },
    { colorName: '화이트/아이보리', mood: '클린 소프트', reason: '밝고 가벼운 데일리 인상' },
    { colorName: '네이비', mood: '스마트 오피스', reason: '차분하고 신뢰감 있는 조합' },
    { colorName: '데님 블루', mood: '이지 캐주얼', reason: '자연스럽게 어우러지는 톤' },
    { colorName: '차콜', mood: '그레이 톤온톤', reason: '깊이감 있는 동계열 레이어드' },
    { colorName: '버건디/레드', mood: '포인트 시크', reason: '감각적인 컬러 악센트' },
  ],
  차콜: [
    { colorName: '화이트/아이보리', mood: '소프트 콘트라스트', reason: '블랙보다 부드러운 명도 대비' },
    { colorName: '그레이', mood: '시크 톤온톤', reason: '세련된 모노톤 레이어링' },
    { colorName: '블랙', mood: '딥 미니멀', reason: '도시적이고 안정적인 다크룩' },
    { colorName: '데님 블루', mood: '릴렉스 캐주얼', reason: '부담 없는 데일리 매치' },
    { colorName: '베이지/카멜', mood: '모던 클래식', reason: '따뜻한 색감으로 균형감 완성' },
    { colorName: '라이트 블루', mood: '쿨 오피스', reason: '산뜻하게 밝혀주는 쿨톤 조합' },
  ],
  네이비: [
    { colorName: '화이트/아이보리', mood: '클린 프레피', reason: '가장 정석적이고 화사한 대비' },
    { colorName: '베이지/카멜', mood: '클래식 치노', reason: '단정하고 세련된 아이비 무드' },
    { colorName: '그레이', mood: '비즈니스 캐주얼', reason: '안정적이고 지적인 쿨톤' },
    { colorName: '차콜', mood: '딥 포멀', reason: '차분하게 정리되는 격식룩' },
    { colorName: '올리브/카키', mood: '스마트 밀리터리', reason: '네이비와 차분하게 어우러지는 고급 조합' },
    { colorName: '옐로우', mood: '프레피 포인트', reason: '네이비에 생기를 더하는 화사한 보색 매치', matchColorNames: ['옐로우'] },
    { colorName: '청록색', mood: '딥 쿨 톤온톤', reason: '세련되고 깊이 있는 블루·그린 조화', matchColorNames: ['청록색'] },
    { colorName: '라이트 블루', mood: '블루 톤온톤', reason: '청량하고 깔끔한 동계열 통일감' },
    { colorName: '브라운', mood: '이탈리안 클래식', reason: '고급스러운 보색 대비감' },
  ],
  '데님 블루': [
    { colorName: '화이트/아이보리', mood: '내추럴 데일리', reason: '가장 깔끔하고 산뜻한 기본' },
    { colorName: '블랙', mood: '어반 캐주얼', reason: '실루엣을 또렷하게 잡아줌' },
    { colorName: '차콜', mood: '시크 캐주얼', reason: '진청과 차분하게 어우러지는 모던 톤' },
    { colorName: '올리브/카키', mood: '내추럴 빈티지', reason: '깊은 데님에 멋스럽게 어울리는 어스톤' },
    { colorName: '옐로우', mood: '생동감 포인트', reason: '진청을 경쾌하게 밝혀주는 보색 포인트', matchColorNames: ['옐로우'] },
    { colorName: '청록색', mood: '딥 쿨 포인트', reason: '세련되고 감각적인 딥 톤 매치', matchColorNames: ['청록색'] },
    { colorName: '버건디', mood: '프렌치 포인트', reason: '데님에 깊이를 더하는 클래식 포인트', matchColorNames: ['버건디/레드'] },
    { colorName: '레드', mood: '레트로 포인트', reason: '선명하게 시선을 끄는 경쾌한 대비', matchColorNames: ['버건디/레드'] },
    { colorName: '베이지/카멜', mood: '웜 아메카지', reason: '따뜻하고 부드러운 보색 조화' },
    { colorName: '브라운', mood: '빈티지 클래식', reason: '깊이감 있는 캐주얼 무드' },
  ],
  '라이트 블루': [
    { colorName: '화이트/아이보리', mood: '프레시 클린', reason: '화사하고 가벼운 청량감' },
    { colorName: '버건디', mood: '클래식 포인트', reason: '밝은 연청에 깊이를 더하는 고급 포인트', matchColorNames: ['버건디/레드'] },
    { colorName: '레드', mood: '프렌치 캐주얼', reason: '연청과 경쾌하게 살아나는 선명한 대비', matchColorNames: ['버건디/레드'] },
    { colorName: '네이비', mood: '블루 톤온톤', reason: '시원하고 단정한 명도 대비' },
    { colorName: '그레이', mood: '쿨 미니멀', reason: '세련된 모던 오피스 무드' },
    { colorName: '베이지/카멜', mood: '소프트 프렌치', reason: '부드럽고 고급스러운 믹스' },
    { colorName: '차콜', mood: '모던 밸런스', reason: '가벼움을 차분하게 눌러줌' },
    { colorName: '데님 블루', mood: '데님 레이어드', reason: '자연스러운 블루 그라데이션' },
  ],
  '베이지/카멜': [
    { colorName: '화이트/아이보리', mood: '웜 미니멀', reason: '우아하고 밝은 크림 톤온톤' },
    { colorName: '스카이블루', mood: '클린 소프트', reason: '베이지에 청량함을 더하는 산뜻한 조합', matchColorNames: ['라이트 블루'] },
    { colorName: '카키', mood: '사파리 내추럴', reason: '편안하고 세련된 어스 톤온톤', matchColorNames: ['올리브/카키'] },
    { colorName: '버터 옐로우', mood: '웜 파스텔', reason: '부드럽고 화사한 크리미 톤온톤', matchColorNames: ['버터 옐로우'] },
    { colorName: '블랙', mood: '시크 클래식', reason: '또렷하고 세련된 무게 중심' },
    { colorName: '브라운', mood: '어스 톤온톤', reason: '깊이 있는 동계열 고급 무드' },
    { colorName: '네이비', mood: '프레피 시크', reason: '단정하고 세련된 보색 대비' },
    { colorName: '데님 블루', mood: '프렌치 캐주얼', reason: '자연스럽고 경쾌한 데일리' },
  ],
  브라운: [
    { colorName: '화이트/아이보리', mood: '크림 모카', reason: '밝고 고급스럽게 살아나는 대비' },
    { colorName: '베이지/카멜', mood: '라떼 톤온톤', reason: '포근하고 세련된 동계열 매치' },
    { colorName: '데님 블루', mood: '레트로 데일리', reason: '경쾌하고 감각적인 보색 균형' },
    { colorName: '블랙', mood: '딥 시크', reason: '묵직하고 도회적인 무드' },
    { colorName: '네이비', mood: '클래식 테일러드', reason: '고급스러운 성숙한 컬러 매치' },
    { colorName: '올리브/카키', mood: '내추럴 어스', reason: '차분한 자연 색감의 조화' },
  ],
  '올리브/카키': [
    { colorName: '화이트/아이보리', mood: '클린 내추럴', reason: '카키 톤을 산뜻하게 살려줌' },
    { colorName: '블랙', mood: '어반 시크', reason: '단정하고 힘 있는 대비감' },
    { colorName: '베이지/카멜', mood: '사파리 톤온톤', reason: '자연스럽고 따뜻한 어스 매치' },
    { colorName: '데님 블루', mood: '이지 워크웨어', reason: '편안하고 멋스러운 캐주얼' },
    { colorName: '브라운', mood: '어스 클래식', reason: '깊이감 있는 가을·겨울 무드' },
    { colorName: '네이비', mood: '스마트 캐주얼', reason: '차분한 밀리터리 프레피' },
  ],
  '버건디/레드': [
    { colorName: '블랙', mood: '시크 포인트', reason: '세련되고 강렬한 컬러 대비' },
    { colorName: '화이트/아이보리', mood: '프렌치 페미닌', reason: '화사하고 부드럽게 중화' },
    { colorName: '라이트 블루', mood: '연청 포인트', reason: '밝은 연청 데님과 경쾌하게 어우러짐' },
    { colorName: '데님 블루', mood: '캐주얼 포인트', reason: '부담 없이 즐기는 데일리 포인트' },
    { colorName: '그레이', mood: '모던 포인트', reason: '차분하게 돋보이는 세련된 조합' },
    { colorName: '네이비', mood: '클래식 프레피', reason: '깊이 있는 고급스러운 조화' },
    { colorName: '베이지/카멜', mood: '웜 엘레강스', reason: '따뜻하고 우아한 무드 완성' },
  ],
  핑크: [
    { colorName: '화이트/아이보리', mood: '퓨어 로맨틱', reason: '맑고 화사한 파스텔 밸런스' },
    { colorName: '그레이', mood: '소프트 시크', reason: '달콤함을 세련되게 잡아줌' },
    { colorName: '데님 블루', mood: '러블리 캐주얼', reason: '경쾌하고 친근한 데일리 매치' },
    { colorName: '차콜', mood: '모던 밸런스', reason: '차분한 대비로 성숙한 무드' },
    { colorName: '네이비', mood: '단정한 포인트', reason: '깔끔하고 정돈된 컬러 조합' },
    { colorName: '베이지/카멜', mood: '웜 파스텔', reason: '부드럽고 따뜻한 페미닌 톤' },
  ],
  연보라: [
    { colorName: '화이트/아이보리', mood: '클린 파스텔', reason: '맑고 깨끗하게 살아나는 색감' },
    { colorName: '그레이', mood: '쿨 소프트', reason: '우아하고 차분한 쿨톤 조화' },
    { colorName: '데님 블루', mood: '데일리 포인트', reason: '부담 없이 화사한 캐주얼' },
    { colorName: '차콜', mood: '시크 쿨톤', reason: '세련된 명도 대비로 정돈감' },
    { colorName: '네이비', mood: '딥 쿨 매치', reason: '안정적인 보라·네이비 조화' },
    { colorName: '블랙', mood: '모던 콘트라스트', reason: '또렷하게 강조되는 포인트룩' },
  ],
  퍼플: [
    { colorName: '블랙', mood: '시크 포인트', reason: '퍼플의 깊이감을 가장 도회적으로 살려줌' },
    { colorName: '화이트/아이보리', mood: '모던 클린', reason: '선명한 보라빛을 화사하게 중화' },
    { colorName: '그레이', mood: '어반 쿨톤', reason: '세련되고 차분한 모던 밸런스' },
    { colorName: '데님 블루', mood: '캐주얼 포인트', reason: '경쾌하고 감각적인 데일리 매치' },
    { colorName: '차콜', mood: '딥 시크', reason: '블랙보다 부드럽게 눌러주는 쿨톤' },
    { colorName: '베이지/카멜', mood: '소프트 콘트라스트', reason: '따뜻한 뉴트럴과 어우러지는 고급 조합' },
  ],
  청록색: [
    { colorName: '네이비', mood: '딥 쿨 톤온톤', reason: '세련되고 깊이 있는 블루·그린 조화' },
    { colorName: '데님 블루', mood: '감각적 데일리', reason: '진청과 멋스럽게 어우러지는 딥 포인트' },
    { colorName: '화이트/아이보리', mood: '프레시 클린', reason: '청록빛을 맑고 산뜻하게 살려주는 대비' },
    { colorName: '블랙', mood: '어반 시크', reason: '선명하고 모던하게 정리되는 컬러 대비' },
    { colorName: '베이지/카멜', mood: '소프트 클래식', reason: '차가운 청록을 따뜻하게 중화하는 균형감' },
    { colorName: '그레이', mood: '쿨 미니멀', reason: '차분하고 세련된 모던 오피스 무드' },
    { colorName: '브라운', mood: '빈티지 클래식', reason: '고급스러운 보색 감성의 가을·겨울 매치' },
  ],
};

const FALLBACK_PAIRS: RawPair[] = [
  { colorName: '화이트/아이보리', mood: '클린 베이직', reason: '어떤 색이든 깔끔하게 받쳐줌' },
  { colorName: '블랙', mood: '모던 밸런스', reason: '안정적이고 정돈된 대비감' },
  { colorName: '데님 블루', mood: '데일리 캐주얼', reason: '자연스럽게 어울리는 기본 매치' },
  { colorName: '베이지/카멜', mood: '소프트 뉴트럴', reason: '부드럽고 따뜻한 조화' },
  { colorName: '그레이', mood: '시티 미니멀', reason: '차분한 무채색 밸런스' },
  { colorName: '네이비', mood: '클래식 무드', reason: '단정하고 세련된 기본 조합' },
];

function resolveColorKey(colorName: string): string | null {
  if (COLOR_HARMONY_MAP[colorName]) return colorName;
  const lower = colorName.toLowerCase();
  for (const key of Object.keys(COLOR_HARMONY_MAP)) {
    if (key.includes(colorName) || colorName.includes(key.split('/')[0])) {
      return key;
    }
  }
  if (/black|검정|블랙/.test(lower)) return '블랙';
  if (/white|ivory|cream|화이트|아이보리|크림|흰/.test(lower)) return '화이트/아이보리';
  if (/charcoal|차콜/.test(lower)) return '차콜';
  if (/gray|grey|그레이|회색/.test(lower)) return '그레이';
  if (/navy|네이비|남색/.test(lower)) return '네이비';
  if (/denim|청|데님/.test(lower)) return '데님 블루';
  if (/sky|light blue|소라|하늘|라이트/.test(lower)) return '라이트 블루';
  if (/beige|camel|oat|베이지|카멜|오트/.test(lower)) return '베이지/카멜';
  if (/brown|mocha|초코|브라운|갈색/.test(lower)) return '브라운';
  if (/teal|turquoise|cyan|청록|터콰이즈/.test(lower)) return '청록색';
  if (/khaki|olive|green|카키|올리브|그린/.test(lower)) return '올리브/카키';
  if (/red|burgundy|wine|레드|버건디|와인/.test(lower)) return '버건디/레드';
  if (/pink|rose|핑크|로즈/.test(lower)) return '핑크';
  if (/purple|violet|퍼플|딥\s*보라/.test(lower)) return '퍼플';
  if (/lavender|연보라|보라/.test(lower)) return '연보라';
  return null;
}

export function getColorCoordinationPlan(
  item: Pick<WardrobeItem, 'category' | 'colorName' | 'colorHex'>
): ColorCoordinationPlan {
  const key = resolveColorKey(item.colorName);
  const rawPairs = (key ? COLOR_HARMONY_MAP[key] : FALLBACK_PAIRS).map((p) => ({
    ...p,
    colorHex: swatchHex(p.colorName),
    matchColorNames: p.matchColorNames ?? [p.colorName],
  }));

  if (item.category === '상의' || item.category === '스포츠웨어') {
    return {
      heading: '어울리는 하의 컬러 조합',
      subheading: `${item.colorName} 상의와 자연스럽게 어울리는 하의 색상을 추천해 드려요.`,
      partnerLabel: '하의',
      currentRoleLabel: '상의',
      currentOnTop: true,
      partnerCategories: ['바지', '치마'],
      recommendations: rawPairs,
    };
  }

  if (item.category === '아우터') {
    return {
      heading: '어울리는 하의 컬러 조합',
      subheading: `${item.colorName} 아우터와 균형감 있게 매치되는 하의 색상을 추천해 드려요.`,
      partnerLabel: '하의',
      currentRoleLabel: '아우터',
      currentOnTop: true,
      partnerCategories: ['바지', '치마'],
      recommendations: rawPairs,
    };
  }

  if (item.category === '바지' || item.category === '치마') {
    return {
      heading: '어울리는 상의 · 아우터 컬러 조합',
      subheading: `${item.colorName} 하의와 잘 어울리는 상의·아우터 색상을 추천해 드려요.`,
      partnerLabel: '상의 · 아우터',
      currentRoleLabel: '하의',
      currentOnTop: false,
      partnerCategories: ['상의', '아우터'],
      recommendations: rawPairs,
    };
  }

  if (item.category === '원피스') {
    return {
      heading: '어울리는 아우터 · 소품 컬러 조합',
      subheading: `${item.colorName} 원피스와 조화롭게 매치되는 컬러예요.`,
      partnerLabel: '아우터 · 소품',
      currentRoleLabel: '원피스',
      currentOnTop: true,
      partnerCategories: ['아우터', '가방', '신발'],
      recommendations: rawPairs,
    };
  }

  return {
    heading: '어울리는 의류 컬러 조합',
    subheading: `${item.colorName} ${item.category} 아이템과 잘 어울리는 의류 색상을 추천해 드려요.`,
    partnerLabel: '의류',
    currentRoleLabel: item.category,
    currentOnTop: false,
    partnerCategories: ['상의', '바지', '치마', '아우터', '원피스'],
    recommendations: rawPairs,
  };
}

/**
 * Returns crisp readable ink color (#111315 or #FFFFFF) for text laid over a hex swatch.
 */
export function getReadableSwatchTextColor(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#111315';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // Perceptual sRGB luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111315' : '#FFFFFF';
}

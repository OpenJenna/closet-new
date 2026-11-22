export type Category =
  | '상의'
  | '바지'
  | '아우터'
  | '신발'
  | '치마'
  | '원피스'
  | '스포츠웨어'
  | '가방'
  | '액세서리';

export type Season = '봄' | '여름' | '가을' | '겨울';

export type WeatherCondition = 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy' | 'snowy';

export type SortOption =
  | 'recommended'
  | 'newest'
  | 'mostWorn'
  | 'leastWorn'
  | 'priceDesc'
  | 'priceAsc';

export type MainTab = 'wardrobe' | 'calendar' | 'stats';

export const TOP_CATEGORIES: Category[] = [
  '상의',
  '바지',
  '아우터',
  '신발',
  '치마',
  '원피스',
  '스포츠웨어',
  '가방',
  '액세서리',
];

export const CATEGORY_TREE: Record<Category, string[]> = {
  상의: ['니트/스웨터', '티셔츠', '셔츠/블라우스', '맨투맨/후드'],
  바지: ['청바지', '슬랙스', '트레이닝/조거', '반바지'],
  아우터: ['가디건', '패딩/다운', '코트', '자켓/점퍼'],
  신발: [
    '스니커즈',
    '로퍼',
    '구두',
    '플랫슈즈',
    '워커',
    '앵클부츠',
    '부츠',
    '레인부츠',
    '샌들',
    '기타',
  ],
  치마: ['미니스커트', '롱/미디스커트', '데님 스커트'],
  원피스: ['미니 원피스', '미디/롱 원피스', '니트 원피스'],
  스포츠웨어: ['골프웨어', '러닝', '수영복', '요가/필라테스', '테니스/기타'],
  가방: ['백팩', '토트백', '크로스/숄더백'],
  액세서리: ['스카프', '목도리', '모자', '장갑', '벨트'],
};

export const SEASONS: Season[] = ['봄', '여름', '가을', '겨울'];

export const TPO_OPTIONS = ['데일리', '출근/오피스', '데이트', '모임/격식', '운동/야외', '여행'];

export const PATTERN_OPTIONS = ['무지', '스트라이프', '체크', '로고/그래픽', '케이블/짜임', '플로럴'];

export const COLOR_SWATCHES: { name: string; hex: string }[] = [
  { name: '블랙', hex: '#18181B' },
  { name: '화이트/아이보리', hex: '#F4F4F0' },
  { name: '그레이', hex: '#8A8F98' },
  { name: '차콜', hex: '#3F3F46' },
  { name: '네이비', hex: '#1E3A5F' },
  { name: '데님 블루', hex: '#3B6495' },
  { name: '라이트 블루', hex: '#93B5D8' },
  { name: '베이지/카멜', hex: '#C79F73' },
  { name: '브라운', hex: '#6E4C36' },
  { name: '올리브/카키', hex: '#586446' },
  { name: '청록색', hex: '#0F766E' },
  { name: '버건디/레드', hex: '#7A2E3A' },
  { name: '핑크', hex: '#E8B8C0' },
  { name: '연보라', hex: '#C4B1DF' },
  { name: '퍼플', hex: '#6D28D9' },
];

export interface WardrobeItem {
  id: string;
  ownerId: string;
  name: string;
  brand: string;
  category: Category;
  subCategory: string;
  seasons: Season[];
  tpo?: string;
  colorName: string;
  colorHex: string;
  price: number;
  purchaseDate: string; // YYYY-MM-DD
  material?: string;
  pattern?: string;
  size?: string;
  rating?: number; // 0 to 5
  imageKey?: string;
  imageUrl?: string;
  additionalImages?: string[];
  memo?: string;
  isBasicCloset?: boolean;
  wearCountOffset?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DailyLook {
  id: string;
  ownerId: string;
  date: string; // YYYY-MM-DD
  title?: string;
  weatherCondition: WeatherCondition;
  tempHigh: number;
  tempLow: number;
  itemIds: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}

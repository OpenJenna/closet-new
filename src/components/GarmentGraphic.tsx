import { useEffect, useId, useState } from 'react';
import { WardrobeItem } from '../types/wardrobe';
import { getTransparentGarmentCutout } from '../utils/transparentCutout';

interface GarmentVisualProps {
  item: Pick<
    WardrobeItem,
    'name' | 'category' | 'subCategory' | 'colorHex' | 'pattern' | 'imageKey' | 'imageUrl'
  >;
  className?: string;
  transparentCutout?: boolean;
  resolvedCutout?: { src: string; isTransparent: boolean };
}

function adjustHex(hex: string, amount: number): string {
  const clean = (hex || '#3F3F46').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return '#3F3F46';
  const r = Math.min(255, Math.max(0, ((num >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (num & 255) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function isLightHex(hex: string): boolean {
  const clean = (hex || '#3F3F46').replace('#', '');
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return false;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 185;
}

export function GarmentVisual({
  item,
  className = 'w-full h-full',
  transparentCutout = false,
  resolvedCutout: externalCutout,
}: GarmentVisualProps) {
  const uid = useId().replace(/:/g, '');
  const [internalCutout, setInternalCutout] = useState<{
    source: string;
    src: string;
    isTransparent: boolean;
  } | null>(null);

  useEffect(() => {
    if (externalCutout || !transparentCutout || !item.imageUrl) {
      setInternalCutout(null);
      return;
    }
    const sourceUrl = item.imageUrl;
    let cancelled = false;
    getTransparentGarmentCutout(sourceUrl).then((res) => {
      if (!cancelled) {
        setInternalCutout({
          source: sourceUrl,
          src: res.src,
          isTransparent: res.isTransparentCutout,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [externalCutout, transparentCutout, item.imageUrl]);

  if (item.imageUrl) {
    const activeCutout = externalCutout
      ? externalCutout
      : transparentCutout &&
          internalCutout &&
          internalCutout.source === item.imageUrl
        ? internalCutout
        : null;

    return (
      <img
        src={activeCutout ? activeCutout.src : item.imageUrl}
        alt={item.name}
        referrerPolicy="no-referrer"
        className={`${className} object-contain select-none ${
          transparentCutout && (!activeCutout || !activeCutout.isTransparent)
            ? 'mix-blend-multiply'
            : ''
        }`}
      />
    );
  }

  const base = item.colorHex || '#27272A';
  const light = isLightHex(base);
  const shade = adjustHex(base, light ? -22 : -20);
  const highlight = adjustHex(base, light ? 8 : 26);
  const strokeCol = light ? '#CBD5E1' : adjustHex(base, -35);
  const detailCol = light ? '#94A3B8' : adjustHex(base, 48);

  const key = item.imageKey || '';
  const sub = item.subCategory || '';
  const cat = item.category;

  // Determine silhouette family
  const renderShape = () => {
    // 1. PANTS & JEANS & SHORTS
    if (cat === '바지' || key.startsWith('jeans') || key.startsWith('slacks') || key.startsWith('shorts') || key.startsWith('jogger')) {
      if (sub.includes('반바지') || key.includes('shorts')) {
        return (
          <g filter={`url(#shadow-${uid})`}>
            <path
              d="M58 58 L142 58 L152 132 L112 136 L100 98 L88 136 L48 132 Z"
              fill={`url(#grad-${uid})`}
              stroke={strokeCol}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M58 66 H142" stroke={detailCol} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6" />
            <path d="M98 58 V92" stroke={shade} strokeWidth="2" />
            <path d="M62 72 Q70 84 62 94 M138 72 Q130 84 138 94" stroke={detailCol} strokeWidth="1.3" fill="none" opacity="0.7" />
          </g>
        );
      }
      // Full pants (jeans / slacks / jogger)
      const isDenim = sub.includes('청바지') || key.includes('jeans');
      const isJogger = sub.includes('트레이닝') || key.includes('jogger');
      return (
        <g filter={`url(#shadow-${uid})`}>
          <path
            d="M66 24 L134 24 L140 176 L109 178 L100 78 L91 178 L60 176 Z"
            fill={`url(#grad-${uid})`}
            stroke={strokeCol}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Waistband & button */}
          <path d="M66 34 H134" stroke={detailCol} strokeWidth="1.4" opacity="0.75" />
          <circle cx="100" cy="29" r="2.2" fill={isDenim ? '#D4A359' : detailCol} />
          <path d="M100 34 V66" stroke={detailCol} strokeWidth="1.3" opacity="0.65" />
          {/* Pockets */}
          <path d="M68 38 Q78 50 70 58 M132 38 Q122 50 130 58" stroke={detailCol} strokeWidth="1.3" fill="none" opacity="0.7" />
          {isDenim && (
            <>
              <rect x="78" y="24" width="3" height="8" rx="1" fill={shade} />
              <rect x="119" y="24" width="3" height="8" rx="1" fill={shade} />
              <path d="M74 82 L88 122 M126 82 L112 122" stroke={highlight} strokeWidth="6" strokeLinecap="round" opacity="0.16" />
            </>
          )}
          {isJogger && (
            <>
              <path d="M94 28 Q90 44 93 52 M106 28 Q110 44 107 52" stroke={detailCol} strokeWidth="1.6" fill="none" />
              <path d="M61 171 H91 M109 171 H139" stroke={shade} strokeWidth="3" />
            </>
          )}
        </g>
      );
    }

    // 2. SKIRTS
    if (cat === '치마' || key.startsWith('skirt')) {
      const isMini = sub.includes('미니');
      const bottomY = isMini ? 132 : 168;
      return (
        <g filter={`url(#shadow-${uid})`}>
          <path
            d={`M68 36 L132 36 L152 ${bottomY} Q100 ${bottomY + 8} 48 ${bottomY} Z`}
            fill={`url(#grad-${uid})`}
            stroke={strokeCol}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M67 45 H133" stroke={detailCol} strokeWidth="1.4" opacity="0.7" />
          <path d="M88 45 L82 ${bottomY - 8} M112 45 L118 ${bottomY - 8}" stroke={shade} strokeWidth="1.4" opacity="0.45" />
        </g>
      );
    }

    // 3. DRESSES
    if (cat === '원피스' || key.startsWith('dress')) {
      return (
        <g filter={`url(#shadow-${uid})`}>
          <path
            d="M72 28 L86 24 Q100 38 114 24 L128 28 L142 74 L126 80 L122 68 L148 172 Q100 180 52 172 L78 68 L74 80 L58 74 Z"
            fill={`url(#grad-${uid})`}
            stroke={strokeCol}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M74 82 H126" stroke={detailCol} strokeWidth="1.6" opacity="0.65" />
        </g>
      );
    }

    // 4. OUTERWEAR (Puffer, Cardigan, Coat, Jacket)
    if (cat === '아우터' || key.startsWith('puffer') || key.startsWith('cardigan') || key.startsWith('coat') || key.startsWith('trench')) {
      // Long Puffer Coat
      if (sub.includes('패딩') || key.includes('puffer')) {
        return (
          <g filter={`url(#shadow-${uid})`}>
            {/* Hood/collar */}
            <path d="M76 20 Q100 12 124 20 L120 34 H80 Z" fill={shade} stroke={strokeCol} strokeWidth="1.4" />
            {/* Body + long sleeves */}
            <path
              d="M66 30 L134 30 L166 116 L146 122 L134 74 L142 172 Q100 178 58 172 L66 74 L54 122 L34 116 Z"
              fill={`url(#grad-${uid})`}
              stroke={strokeCol}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* Horizontal puffer quilting baffles */}
            <path d="M65 56 H135 M64 80 H136 M63 104 H137 M61 128 H139 M59 150 H141" stroke={shade} strokeWidth="1.8" opacity="0.7" />
            {/* Center zipper */}
            <path d="M100 30 V174" stroke={detailCol} strokeWidth="1.8" opacity="0.75" />
            {/* Gloss sheen */}
            <path d="M78 40 V158" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" opacity={light ? 0.45 : 0.14} />
          </g>
        );
      }
      // Trench / Coat
      if (sub.includes('코트') || key.includes('coat') || key.includes('trench')) {
        return (
          <g filter={`url(#shadow-${uid})`}>
            <path
              d="M64 28 L84 22 L100 38 L116 22 L136 28 L166 118 L145 124 L134 74 L140 172 H60 L66 74 L55 124 L34 118 Z"
              fill={`url(#grad-${uid})`}
              stroke={strokeCol}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* Lapels */}
            <path d="M84 22 L76 58 L100 72 M116 22 L124 58 L100 72" fill={shade} opacity="0.35" />
            {/* Belt */}
            <rect x="64" y="92" width="72" height="7" rx="2" fill={shade} stroke={strokeCol} strokeWidth="1" />
            <rect x="95" y="91" width="10" height="9" rx="1.5" fill="none" stroke={detailCol} strokeWidth="1.4" />
            <circle cx="92" cy="78" r="2.2" fill={detailCol} />
            <circle cx="92" cy="112" r="2.2" fill={detailCol} />
          </g>
        );
      }
      // Cardigan (Default Outerwear & Cardigan)
      const hasHeartPatch = key.includes('cdg');
      const hasStripeTrim = key.includes('sandro') || item.pattern === '체크';
      return (
        <g filter={`url(#shadow-${uid})`}>
          <path
            d="M68 30 L85 26 Q100 44 115 26 L132 30 L166 118 L148 124 L132 74 L134 156 Q100 162 66 156 L68 74 L52 124 L34 118 Z"
            fill={`url(#grad-${uid})`}
            stroke={strokeCol}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Placket & Buttons */}
          <path d="M100 42 V157" stroke={shade} strokeWidth="2.5" opacity="0.65" />
          {[56, 74, 92, 110, 128, 145].map((y) => (
            <circle key={y} cx="100" cy={y} r="2.3" fill={light ? '#CBD5E1' : '#E2E8F0'} stroke={shade} strokeWidth="0.8" />
          ))}
          {/* Ribbed cuffs & hem */}
          <path d="M66 148 H134" stroke={shade} strokeWidth="2" opacity="0.5" />
          {hasHeartPatch && (
            <g transform="translate(113, 62) scale(0.75)">
              <path
                d="M10 17 C10 17 2 11.5 2 6.5 C2 3.8 4.2 2 6.5 2 C8.2 2 9.4 3 10 4.2 C10.6 3 11.8 2 13.5 2 C15.8 2 18 3.8 18 6.5 C18 11.5 10 17 10 17 Z"
                fill={key.includes('yellow') ? '#EAB308' : '#DC2626'}
              />
              <circle cx="7.5" cy="6.8" r="1" fill="#FFFFFF" />
              <circle cx="12.5" cy="6.8" r="1" fill="#FFFFFF" />
            </g>
          )}
          {hasStripeTrim && (
            <>
              <path d="M85 26 L100 66 L115 26" fill="none" stroke="#991B1B" strokeWidth="2.5" />
              <rect x="72" y="106" width="18" height="18" rx="2" fill="none" stroke="#F8FAFC" strokeWidth="1.3" opacity="0.8" />
              <rect x="110" y="106" width="18" height="18" rx="2" fill="none" stroke="#F8FAFC" strokeWidth="1.3" opacity="0.8" />
            </>
          )}
        </g>
      );
    }

    // 5. TOPS (Knit, Striped Tee, Shirt, Hoodie)
    if (cat === '상의' || key.startsWith('knit') || key.startsWith('striped') || key.startsWith('tee')) {
      const isTwoTone = key === 'knit_navy_brown';
      const isStriped = item.pattern === '스트라이프' || key.includes('striped');
      return (
        <g filter={`url(#shadow-${uid})`}>
          <defs>
            <clipPath id={`top-clip-${uid}`}>
              <path d="M68 32 L86 26 Q100 38 114 26 L132 32 L166 116 L147 122 L132 74 L134 156 Q100 162 66 156 L68 74 L53 122 L34 116 Z" />
            </clipPath>
          </defs>
          <path
            d="M68 32 L86 26 Q100 38 114 26 L132 32 L166 116 L147 122 L132 74 L134 156 Q100 162 66 156 L68 74 L53 122 L34 116 Z"
            fill={`url(#grad-${uid})`}
            stroke={strokeCol}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {isTwoTone && (
            <rect x="30" y="104" width="140" height="60" fill="#6B4D2F" clipPath={`url(#top-clip-${uid})`} />
          )}
          {isStriped && (
            <g clipPath={`url(#top-clip-${uid})`} opacity="0.85">
              {[42, 54, 66, 78, 90, 102, 114, 126, 138, 150].map((y) => (
                <rect key={y} x="25" y={y} width="150" height="4.5" fill={light ? '#1E3A5F' : '#F8FAFC'} />
              ))}
            </g>
          )}
          {item.pattern === '케이블/짜임' && (
            <g clipPath={`url(#top-clip-${uid})`} opacity="0.22" stroke={detailCol} strokeWidth="2" fill="none">
              <path d="M82 36 V155 M100 38 V157 M118 36 V155" strokeDasharray="6 4" />
            </g>
          )}
          {/* Crew neck collar */}
          <path d="M84 27 Q100 42 116 27" fill="none" stroke={shade} strokeWidth="3.2" strokeLinecap="round" />
        </g>
      );
    }

    // 6. SHOES (Sneakers, Boots, Loafers)
    if (cat === '신발' || key.startsWith('sneakers') || key.startsWith('boots')) {
      if (sub.includes('부츠') || key.includes('boots')) {
        return (
          <g filter={`url(#shadow-${uid})`}>
            {/* Pair of combat boots */}
            <g transform="translate(-8, 6)">
              <path
                d="M54 44 L86 44 L90 112 L114 128 Q120 138 112 146 L50 146 L50 108 Z"
                fill={`url(#grad-${uid})`}
                stroke={strokeCol}
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M48 144 H116 V154 H48 Z" fill="#0F172A" rx="2" />
              <path d="M72 56 L84 62 M73 70 L85 76 M74 84 L86 90" stroke={detailCol} strokeWidth="1.8" />
            </g>
            <g transform="translate(36, 16)">
              <path
                d="M54 44 L86 44 L90 112 L114 128 Q120 138 112 146 L50 146 L50 108 Z"
                fill={`url(#grad-${uid})`}
                stroke={strokeCol}
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M48 144 H116 V154 H48 Z" fill="#0F172A" />
              <path d="M72 56 L84 62 M73 70 L85 76 M74 84 L86 90" stroke={detailCol} strokeWidth="1.8" />
            </g>
          </g>
        );
      }
      // Sneakers
      return (
        <g filter={`url(#shadow-${uid})`}>
          {/* Back sneaker */}
          <g transform="translate(18, -14)">
            <path
              d="M36 112 Q42 78 68 74 L92 92 L134 104 Q152 108 150 124 L34 124 Z"
              fill={`url(#grad-${uid})`}
              stroke={strokeCol}
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path d="M32 122 H152 Q152 132 142 133 H36 Q30 131 32 122 Z" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="1.2" />
            <text x="86" y="114" fontSize="14" fontWeight="700" fill={detailCol} opacity="0.85">N</text>
          </g>
          {/* Front sneaker */}
          <g transform="translate(-8, 18)">
            <path
              d="M36 112 Q42 78 68 74 L92 92 L134 104 Q152 108 150 124 L34 124 Z"
              fill={`url(#grad-${uid})`}
              stroke={strokeCol}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M32 122 H152 Q152 132 142 133 H36 Q30 131 32 122 Z" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.2" />
            <path d="M88 86 L96 82 M96 92 L104 88 M104 98 L112 94" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
            <text x="84" y="114" fontSize="14" fontWeight="700" fill={detailCol} opacity="0.9">N</text>
          </g>
        </g>
      );
    }

    // 7. BAGS (Backpack, Tote, Crossbody)
    if (cat === '가방' || key.startsWith('backpack') || key.startsWith('tote')) {
      if (sub.includes('백팩') || key.includes('backpack')) {
        return (
          <g filter={`url(#shadow-${uid})`}>
            <path d="M86 38 Q100 20 114 38" fill="none" stroke={shade} strokeWidth="6" strokeLinecap="round" />
            <rect x="52" y="38" width="96" height="126" rx="34" fill={`url(#grad-${uid})`} stroke={strokeCol} strokeWidth="1.5" />
            <rect x="64" y="102" width="72" height="50" rx="14" fill={shade} stroke={strokeCol} strokeWidth="1.2" />
            <path d="M70 112 H130" stroke={detailCol} strokeWidth="1.4" opacity="0.7" />
            <polygon points="100,66 108,74 100,82 92,74" fill={detailCol} opacity="0.75" />
          </g>
        );
      }
      // Tote / Crossbody
      return (
        <g filter={`url(#shadow-${uid})`}>
          <path d="M74 68 C74 30 126 30 126 68" fill="none" stroke={shade} strokeWidth="6" strokeLinecap="round" />
          <path d="M46 68 H154 L144 162 Q100 168 56 162 Z" fill={`url(#grad-${uid})`} stroke={strokeCol} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M52 84 H148" stroke={detailCol} strokeWidth="1.3" opacity="0.5" />
        </g>
      );
    }

    // 8. SPORTSWEAR (Golfwear, Running, Swimwear)
    if (cat === '스포츠웨어') {
      if (sub.includes('수영복')) {
        return (
          <g filter={`url(#shadow-${uid})`}>
            <path
              d="M72 36 L82 36 L86 68 Q100 76 114 68 L118 36 L128 36 L132 82 L138 142 Q122 152 108 168 L92 168 Q78 152 62 142 L68 82 Z"
              fill={`url(#grad-${uid})`}
              stroke={strokeCol}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M74 96 Q100 104 126 96" fill="none" stroke={detailCol} strokeWidth="1.6" opacity="0.65" />
          </g>
        );
      }
      if (sub.includes('골프')) {
        return (
          <g filter={`url(#shadow-${uid})`}>
            <path
              d="M70 34 L86 28 Q100 40 114 28 L130 34 L158 84 L138 92 L130 68 L132 156 Q100 162 68 156 L70 68 L62 92 L42 84 Z"
              fill={`url(#grad-${uid})`}
              stroke={strokeCol}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* Polo collar & placket */}
            <path d="M84 29 L94 48 L100 42 L106 48 L116 29" fill={shade} stroke={strokeCol} strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M100 42 V72" stroke={detailCol} strokeWidth="2" opacity="0.8" />
            <circle cx="100" cy="54" r="1.8" fill={detailCol} />
            <circle cx="100" cy="65" r="1.8" fill={detailCol} />
          </g>
        );
      }
      // Running / Athletic top
      return (
        <g filter={`url(#shadow-${uid})`}>
          <path
            d="M70 32 L86 26 Q100 38 114 26 L130 32 L160 88 L142 96 L130 70 L132 156 Q100 162 68 156 L70 70 L58 96 L40 88 Z"
            fill={`url(#grad-${uid})`}
            stroke={strokeCol}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M70 72 L76 154 M130 72 L124 154" stroke={highlight} strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
          <path d="M84 27 Q100 42 116 27" fill="none" stroke={shade} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    }

    // 9. ACCESSORIES (Cap, Gloves, Belt, Scarf/Muffler)
    if (sub.includes('모자')) {
      return (
        <g filter={`url(#shadow-${uid})`}>
          <path
            d="M46 112 C46 66 74 48 100 48 C126 48 154 66 154 112 Z"
            fill={`url(#grad-${uid})`}
            stroke={strokeCol}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M100 48 C96 74 96 94 98 112 M100 48 C116 70 124 90 126 112 M100 48 C84 70 76 90 74 112" fill="none" stroke={shade} strokeWidth="1.3" opacity="0.45" />
          <circle cx="100" cy="46" r="4" fill={shade} stroke={strokeCol} strokeWidth="1" />
          {/* Visor brim */}
          <path
            d="M44 112 Q104 104 170 124 Q142 138 98 128 Q62 122 44 112 Z"
            fill={shade}
            stroke={strokeCol}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>
      );
    }
    if (sub.includes('장갑')) {
      return (
        <g filter={`url(#shadow-${uid})`}>
          <g transform="translate(-14, 4)">
            <path
              d="M62 152 V96 L50 84 Q45 78 52 73 Q58 69 64 78 L66 44 Q68 38 73 38 Q78 38 79 44 L80 74 L82 40 Q84 34 89 34 Q94 34 95 40 L95 74 L98 44 Q100 38 105 38 Q110 38 111 44 L110 80 L114 54 Q116 48 121 49 Q126 50 125 56 L120 112 L116 152 Z"
              fill={`url(#grad-${uid})`}
              stroke={strokeCol}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M62 142 H116" stroke={detailCol} strokeWidth="2" opacity="0.6" />
          </g>
          <g transform="translate(30, 12)">
            <path
              d="M62 152 V96 L50 84 Q45 78 52 73 Q58 69 64 78 L66 44 Q68 38 73 38 Q78 38 79 44 L80 74 L82 40 Q84 34 89 34 Q94 34 95 40 L95 74 L98 44 Q100 38 105 38 Q110 38 111 44 L110 80 L114 54 Q116 48 121 49 Q126 50 125 56 L120 112 L116 152 Z"
              fill={`url(#grad-${uid})`}
              stroke={strokeCol}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M62 142 H116" stroke={detailCol} strokeWidth="2" opacity="0.6" />
          </g>
        </g>
      );
    }
    if (sub.includes('벨트')) {
      return (
        <g filter={`url(#shadow-${uid})`}>
          <ellipse cx="100" cy="100" rx="64" ry="38" fill="none" stroke={shade} strokeWidth="16" />
          <ellipse cx="100" cy="100" rx="64" ry="38" fill="none" stroke={`url(#grad-${uid})`} strokeWidth="12" />
          <rect x="86" y="126" width="28" height="22" rx="4" fill="#CBD5E1" stroke="#64748B" strokeWidth="2" />
          <line x1="100" y1="128" x2="100" y2="146" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
    }

    // Default Accessory: Scarf / Muffler
    return (
      <g filter={`url(#shadow-${uid})`}>
        <path
          d="M66 36 Q100 26 134 36 L142 74 L128 164 L104 164 L106 78 L86 152 L62 146 L74 74 Z"
          fill={`url(#grad-${uid})`}
          stroke={strokeCol}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M64 148 L60 158 M72 150 L68 160 M80 152 L76 162 M108 164 V174 M116 164 V174 M124 164 V174" stroke={shade} strokeWidth="1.8" strokeLinecap="round" />
      </g>
    );
  };

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label={item.name}
    >
      <defs>
        <linearGradient id={`grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={highlight} />
          <stop offset="55%" stopColor={base} />
          <stop offset="100%" stopColor={shade} />
        </linearGradient>
        <filter id={`shadow-${uid}`} x="-12%" y="-12%" width="124%" height="128%">
          <feDropShadow dx="0" dy="5" stdDeviation="4.5" floodColor="#0F172A" floodOpacity="0.12" />
        </filter>
      </defs>
      {renderShape()}
    </svg>
  );
}

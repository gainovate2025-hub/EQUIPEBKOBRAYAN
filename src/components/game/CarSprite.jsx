// Sprites de carro em pixel art 2D retrô, desenhados em SVG (visão de cima).
// Cada "shape" é um desenho genérico próprio — não é foto/cópia de nenhuma
// marca — só a silhueta lembra o tipo de carro (hatch, sedã, esportivo etc).

const SHAPES = {
  hatch: (c) => (
    <>
      <rect x="10" y="6" width="20" height="30" rx="4" fill={c} />
      <rect x="12" y="10" width="16" height="8" fill="#1b1b1b" />
      <rect x="12" y="24" width="16" height="6" fill="#1b1b1b" />
      <rect x="8" y="8" width="3" height="6" fill="#111" />
      <rect x="29" y="8" width="3" height="6" fill="#111" />
      <rect x="8" y="26" width="3" height="6" fill="#111" />
      <rect x="29" y="26" width="3" height="6" fill="#111" />
    </>
  ),
  sedan: (c) => (
    <>
      <rect x="9" y="4" width="22" height="34" rx="3" fill={c} />
      <rect x="12" y="9" width="16" height="9" fill="#1b1b1b" />
      <rect x="12" y="22" width="16" height="9" fill="#1b1b1b" />
      <rect x="7" y="7" width="3" height="6" fill="#111" />
      <rect x="30" y="7" width="3" height="6" fill="#111" />
      <rect x="7" y="27" width="3" height="6" fill="#111" />
      <rect x="30" y="27" width="3" height="6" fill="#111" />
    </>
  ),
  sport: (c) => (
    <>
      <path d="M20 3 L31 10 L29 35 L20 39 L11 35 L9 10 Z" fill={c} />
      <rect x="13" y="12" width="14" height="8" fill="#1b1b1b" />
      <rect x="14" y="24" width="12" height="6" fill="#1b1b1b" />
      <rect x="8" y="12" width="3" height="6" fill="#111" />
      <rect x="29" y="12" width="3" height="6" fill="#111" />
      <rect x="9" y="27" width="3" height="6" fill="#111" />
      <rect x="28" y="27" width="3" height="6" fill="#111" />
    </>
  ),
  super: (c) => (
    <>
      <path d="M20 2 L33 12 L30 37 L20 40 L10 37 L7 12 Z" fill={c} />
      <path d="M20 8 L27 14 L25 22 L20 25 L15 22 L13 14 Z" fill="#1b1b1b" />
      <rect x="6" y="14" width="3" height="7" fill="#111" />
      <rect x="31" y="14" width="3" height="7" fill="#111" />
      <rect x="7" y="29" width="3" height="7" fill="#111" />
      <rect x="30" y="29" width="3" height="7" fill="#111" />
      <rect x="16" y="35" width="8" height="3" fill="#eee" />
    </>
  ),
  truck: (c) => (
    <>
      <rect x="9" y="4" width="22" height="14" rx="2" fill={c} />
      <rect x="9" y="19" width="22" height="19" rx="2" fill={c} />
      <rect x="12" y="8" width="16" height="8" fill="#1b1b1b" />
      <rect x="12" y="22" width="16" height="13" fill="#333" />
      <rect x="7" y="8" width="3" height="6" fill="#111" />
      <rect x="30" y="8" width="3" height="6" fill="#111" />
      <rect x="7" y="28" width="3" height="6" fill="#111" />
      <rect x="30" y="28" width="3" height="6" fill="#111" />
    </>
  ),
  racer: (c) => (
    <>
      <path d="M20 2 L30 8 L27 36 L20 40 L13 36 L10 8 Z" fill={c} />
      <path d="M20 8 L25 12 L23 18 L20 20 L17 18 L15 12 Z" fill="#1b1b1b" />
      <circle cx="16" cy="15" r="1.6" fill="#fff" />
      <circle cx="24" cy="15" r="1.6" fill="#fff" />
      <rect x="12" y="24" width="16" height="4" fill="#fff" />
      <text x="20" y="33" fontSize="6" fill="#fff" textAnchor="middle" fontFamily="monospace">95</text>
      <rect x="6" y="11" width="3" height="7" fill="#111" />
      <rect x="31" y="11" width="3" height="7" fill="#111" />
      <rect x="7" y="28" width="3" height="7" fill="#111" />
      <rect x="30" y="28" width="3" height="7" fill="#111" />
    </>
  ),
}

export default function CarSprite({ shape = 'hatch', color = '#c62828', size = 80, className = '' }) {
  const draw = SHAPES[shape] || SHAPES.hatch
  return (
    <svg
      viewBox="0 0 40 42"
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: 'pixelated' }}
      shapeRendering="crispEdges"
    >
      {draw(color)}
    </svg>
  )
}

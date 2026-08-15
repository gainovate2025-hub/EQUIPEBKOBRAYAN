export default function Logo({ size = 52 }) {
  return (
    <div
      className="flex items-center justify-center rounded-2xl font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.33,
        letterSpacing: '.02em',
        background: 'linear-gradient(150deg,#e2242f,#a5121c)',
        boxShadow: '0 10px 24px rgba(216,31,42,.32)',
        animation: 'bkoFloat 5s ease-in-out infinite',
        borderRadius: 14,
      }}
    >
      BKO
    </div>
  )
}

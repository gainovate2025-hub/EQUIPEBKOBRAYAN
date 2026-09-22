export default function Logo({ size = 32 }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[9px] font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.44,
        background: 'linear-gradient(155deg, #d92d20 0%, #a4231a 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.25), 0 1px 2px rgba(16,24,40,.18)',
        letterSpacing: '-0.02em',
      }}
    >
      B
    </div>
  )
}

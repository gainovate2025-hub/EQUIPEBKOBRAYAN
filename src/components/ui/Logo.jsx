export default function Logo({ size = 32 }) {
  return (
    <div
      className="flex items-center justify-center rounded-md bg-brand-600 font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      BKO
    </div>
  )
}

// Fotos reais dos carros (recortadas do pôster gerado), servidas de /public/cars.
// Mapeamento pelo nome do carro salvo em `cars.name` no banco.

const NAME_TO_SLUG = {
  'Pegeot': 'pegeot',
  'Kwid': 'kwid',
  'Skyline GTR': 'skyline-gtr',
  'Opala 67': 'opala-67',
  'Civic': 'civic',
  'Ram': 'ram',
  'McLaren': 'mclaren',
  'Mustang': 'mustang',
  'Supra': 'supra',
  'Camaro': 'camaro',
  'Relâmpago McQueen': 'relampago-mcqueen',
  'Ferrari': 'ferrari',
  'Porsche do Ander': 'porsche-do-ander',
  'BMW': 'bmw',
}

export function carImageSrc(name) {
  const slug = NAME_TO_SLUG[name]
  return slug ? `/cars/${slug}.png` : null
}

export default function CarImage({ name, size = 80, className = '' }) {
  const src = carImageSrc(name)
  if (!src) return null
  return (
    <img
      src={src}
      alt={name}
      width={size}
      className={`rounded object-cover ${className}`}
      style={{ height: size * 0.62 }}
    />
  )
}

export function soDigitos(v) {
  return (v || '').replace(/\D/g, '')
}

export function formatarCnpj(v) {
  const d = soDigitos(v).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function formatarCpf(v) {
  const d = soDigitos(v).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

// Celular sempre com o 9 na frente (pedido do Brayan em 10/11/2026): a
// Receita guarda muitos celulares antigos com 8 dígitos. Recebe o número
// em qualquer formato ("(14) 97726133", "1497726133"...) e devolve só os
// dígitos, DDD + 9 + número. Sem DDD (ou já com 11 dígitos), devolve
// como veio.
export function comNoveDigito(v) {
  const d = soDigitos(v)
  if (d.length === 10) return `${d.slice(0, 2)}9${d.slice(2)}`
  return d
}

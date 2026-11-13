-- migration_055: 1º sistema tem 30 segundos pra responder (13/11/2026,
-- pedido do Brayan).
--
-- Antes, qualquer CNPJ só saía de um PC depois de 1m50 parado. Agora, se o
-- 1º sistema (cliente) não responder em 30 segundos, o CNPJ sai desse PC e
-- vai pra outro que esteja com os 2 sistemas conectados. O outro PC começa
-- do zero, com a tela limpa. O 2º sistema continua com 1m50.
--
-- Não precisa trocar a extensão: quem decide o repasse é o banco. O PC que
-- perdeu o CNPJ percebe sozinho (crivo_renovar devolve false), larga a
-- consulta e volta a pegar CNPJ da fila.
--
-- Os limites de antes continuam: no máximo 3 repasses por CNPJ, e só repassa
-- se tiver outro PC online. Sem outro PC, o CNPJ fica no mesmo PC, que segue
-- a regra da própria extensão (espera, recarrega e tenta de novo).

create or replace function public.crivo_vigiar_atrasadas()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  for v in
    select id, pc, pc_desde, sistema1_resultado from public.crivo_consultas
    where status = 'pendente' and pc is not null
      and (
        (sistema1_resultado is null and pc_desde < now() - interval '30 seconds')
        or (sistema1_resultado is not null and pc_desde < now() - interval '110 seconds')
        or not public.crivo_pc_online(pc)
      )
  loop
    perform public.crivo_devolver_pra_fila(
      v.id,
      case when not public.crivo_pc_online(v.pc) then 'o PC desconectou (um dos sistemas parou de dar sinal)'
           when v.sistema1_resultado is null then 'o 1º sistema passou de 30s sem responder'
           else 'o 2º sistema passou de 1m50 sem responder' end,
      'repasse'
    );
  end loop;
end;
$$;

revoke execute on function public.crivo_vigiar_atrasadas() from public, anon, authenticated;

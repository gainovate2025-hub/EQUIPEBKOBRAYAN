-- migration_064: cada login só tem 1 CNPJ na fila (17/11/2026, pedido do
-- Brayan: "se a mesma baia mandar um CNPJ e depois outro, ele desconsidera
-- o anterior e só considera o último mandado").
--
-- Quando um login manda um CNPJ novo, os CNPJs dele que ainda estavam na
-- fila (pendente) viram "cancelado" e saem da fila. No chat aparece
-- "Ignorado: você mandou outro CNPJ depois". O login op051 (testes e
-- leitor do Google Chat) fica de fora dessa regra.

alter table public.crivo_consultas drop constraint if exists crivo_consultas_status_check;
alter table public.crivo_consultas
  add constraint crivo_consultas_status_check check (status in ('pendente', 'concluido', 'erro', 'cancelado'));

create or replace function public.crivo_so_o_ultimo_do_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.solicitado_por and p.username = 'op051') then
    return new;
  end if;
  update public.crivo_consultas
  set status = 'cancelado',
      concluido_at = now(),
      erro_mensagem = 'Ignorado: o mesmo login mandou outro CNPJ depois (' || new.cnpj || ')',
      pc = null,
      sistema1_travado_por = null,
      sistema2_travado_por = null
  where solicitado_por = new.solicitado_por
    and status = 'pendente'
    and id <> new.id
    and created_at < new.created_at;
  return new;
end;
$$;

drop trigger if exists crivo_so_o_ultimo_do_login on public.crivo_consultas;
create trigger crivo_so_o_ultimo_do_login
  after insert on public.crivo_consultas
  for each row execute function public.crivo_so_o_ultimo_do_login();

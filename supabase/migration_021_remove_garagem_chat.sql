-- Remove do banco o que só existia pra Garagem/Corrida/Desafios (o jogo
-- de carro) e pro Chat da equipe — essas telas foram tiradas do site.
-- A tabela "teams" continua (usada em todo o resto do sistema pra
-- vincular BKO/supervisor a uma equipe), só o "team_messages" (chat em
-- si) sai.
-- Rode no SQL Editor do Supabase quando quiser confirmar a remoção.
-- Seguro rodar mais de uma vez. IRREVERSÍVEL — apaga os dados dessas
-- tabelas (saldo/carros comprados, histórico de corridas, mensagens).

drop table if exists public.races cascade;
drop table if exists public.bko_car_upgrades cascade;
drop table if exists public.car_upgrades cascade;
drop table if exists public.bko_cars cascade;
drop table if exists public.cars cascade;
drop table if exists public.game_wallet_transactions cascade;

drop table if exists public.team_messages cascade;
drop function if exists public.post_team_message(uuid, text);

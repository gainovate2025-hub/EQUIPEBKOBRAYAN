-- Substitui o catálogo de placeholder pelo catálogo real pedido.
-- sprite_key agora guarda o "formato" do sprite pixel art (renderizado no
-- front-end), não um nome de arquivo de imagem.

delete from public.cars where name in ('Opala Preto', 'Camaro Amarelo', 'Skyline GTR', 'Relâmpago Marquinhos', 'McLaren Amarela');

insert into public.cars (name, rarity, price_points, min_contestacoes, base_speed, base_handling, sprite_key) values
  ('Pegeot', 'comum', 0, 0, 4, 4, 'hatch'),
  ('Kwid', 'comum', 0, 0, 4, 4, 'hatch'),

  ('Skyline GTR', 'raro', 300, 0, 6, 6, 'sport'),
  ('Opala 67', 'raro', 300, 0, 6, 5, 'sedan'),
  ('Civic', 'raro', 300, 0, 6, 6, 'hatch'),
  ('Ram', 'raro', 300, 0, 5, 5, 'truck'),

  -- Base 7/7: com as 2 melhorias de cada tipo (Motor I+II, Suspensão I+II =
  -- +3/+3), chega a 10/10 — perto do lendário, mas sem ultrapassar (11/10).
  ('McLaren', 'epico', 600, 0, 7, 7, 'super'),
  ('Mustang', 'epico', 600, 0, 7, 7, 'sport'),
  ('Supra', 'epico', 600, 0, 7, 7, 'sport'),
  ('Camaro', 'epico', 600, 0, 7, 7, 'sport'),

  ('Relâmpago McQueen', 'lendario', 1000, 0, 11, 10, 'racer'),
  ('Ferrari', 'lendario', 1000, 0, 11, 10, 'super'),
  ('Porsche do Ander', 'lendario', 1000, 0, 11, 10, 'super'),
  ('BMW', 'lendario', 1000, 0, 11, 10, 'sedan')
on conflict (name) do update set
  rarity = excluded.rarity,
  price_points = excluded.price_points,
  base_speed = excluded.base_speed,
  base_handling = excluded.base_handling,
  sprite_key = excluded.sprite_key;

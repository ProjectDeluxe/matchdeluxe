-- ============================================================
-- Equipos a medida, más de dos lados y juegos de mesa (2026-10-23, ROADMAP 6.16)
-- 1. Cada equipo con la cantidad de jugadores que quiera (2 vs 1, 3 vs 2…):
--    no cambia nada en la base, ya lo permite match_teammates.
-- 2. Más de dos lados (1 vs 1 vs 1, juegos de mesa): los lados 1 y 2
--    siguen con su primero en player1_id/player2_id; los lados 3 en
--    adelante van enteros en match_teammates (side 3, 4, …, hasta 8).
-- 3. Disciplina nueva 'board_game' (juego de mesa), sin marcador, para
--    partidas sueltas y para mesas.
-- Correr ANTES del push: el código nuevo guarda side > 2 y 'board_game'.
-- ============================================================

ALTER TABLE match_teammates DROP CONSTRAINT IF EXISTS match_teammates_side_check;
ALTER TABLE match_teammates ADD  CONSTRAINT match_teammates_side_check CHECK (side BETWEEN 1 AND 8);

ALTER TABLE tables  DROP CONSTRAINT IF EXISTS tables_discipline_check;
ALTER TABLE tables  ADD  CONSTRAINT tables_discipline_check  CHECK (discipline IN ('pool', 'ping_pong', 'board_game'));
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_discipline_check;
ALTER TABLE matches ADD  CONSTRAINT matches_discipline_check CHECK (discipline IN ('pool', 'ping_pong', 'board_game'));

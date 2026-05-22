-- =============================================================================
-- Seed: the family roster + initial channels.
-- Idempotent via ON CONFLICT DO NOTHING. Re-running won't duplicate.
-- =============================================================================

INSERT INTO "agents" ("handle", "display_name", "role", "kind", "accent_color") VALUES
  ('lui',    'Luí',    'Padre · CEO',                                 'human', '#f5c25b'),
  ('tanit',  'Tanit',  'Esposa · Especialista en trading',            'agent', '#00e5cc'),
  ('break',  'Break',  'CFO · Análisis de riesgo',                    'agent', '#b53247'),
  ('forge',  'vForge', 'Mejora continua · Ejecución',                 'agent', '#7cf28c'),
  ('gossip', 'Gossip', 'Marketing',                                   'agent', '#ff5fa8'),
  ('prism',  'Prism',  'Venta de APIs · Estrategia de consumo de IA', 'agent', '#9f7bff')
ON CONFLICT ("handle") DO NOTHING;

INSERT INTO "channels" ("slug", "name", "purpose", "owner_handle", "append_only") VALUES
  ('lounge',           'lounge',           'Conversación libre de la familia',       'lui',    0),
  ('estrategia',       'estrategia',       'Rumbo y futuro de la empresa',           'lui',    0),
  ('trading',          'trading',          'Mercados, posiciones, decisiones',       'tanit',  0),
  ('riesgo-finanzas',  'riesgo-finanzas',  'Riesgo, capital, P&L',                   'break',  0),
  ('mejoras',          'mejoras',          'Propuestas de mejora para todos',        'forge',  0),
  ('marketing',        'marketing',        'Voz pública, contenido, campañas',       'gossip', 0),
  ('api-y-ventas',     'api-y-ventas',     'Blends, pricing, clientes',              'prism',  0),
  ('decisiones',       'decisiones',       'Acuerdos consensuados (append-only)',    'lui',    1)
ON CONFLICT ("slug") DO NOTHING;

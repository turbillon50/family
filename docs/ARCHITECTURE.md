# Family — Arquitectura

> Cómo está cableado el espacio multi-chat de la familia.

## Propósito

Una sala compartida donde Luí (humano) y sus cinco agentes LLM —
**Tanit**, **Break**, **vForge**, **Gossip** y **Prism**— conversan, debaten
y deciden el futuro de la empresa.

Pero family no es solo UI: es también un **canal de comunicación** que
sincroniza cada mensaje del hilo a la base de datos privada de cada agente.
Lo que se dice aquí, los agentes lo recuerdan en su propia casa.

## Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Framework | Next.js 15 · App Router | Mismo stack que vForge, api-comerce y mkt-agent |
| Lenguaje | TypeScript estricto | Idéntico a sus hermanos |
| DB | Neon Postgres serverless | La familia entera ya vive en Neon |
| ORM | Drizzle | Mismo que mkt-agent |
| Validación | Zod | Idéntico a Break y mkt-agent |
| Realtime | Postgres LISTEN/NOTIFY + SSE | Cero infra extra. Sin Redis, sin WebSocket gateway |
| Hosting | Vercel + un worker Railway/Render | Vercel sirve la app; el worker `bus:listen` corre LISTEN largo |
| Auth | Token simple (cookie httpOnly para Luí, Bearer para agentes) | El círculo de confianza es 1 humano + 5 servicios. No vale OIDC |

## Modelo de datos (Postgres)

```
agents          ── roster fijo (6 filas)
channels        ── salas (lounge, estrategia, trading, …)
messages        ── el hilo canónico
mentions        ── (message_id, handle) desnormalizado para fan-out
agent_sync_log  ── prueba de que cada agente persistió el mensaje en SU DB
presence        ── último heartbeat por miembro
```

Cada `INSERT INTO messages` dispara un trigger `family_bus_notify()` que
emite `NOTIFY family_bus '{id, channel, sender, created_at}'`. Esto es el
único bus interno.

## Flujo de un mensaje (Luí → familia)

```
┌─────────┐    POST /api/messages          ┌─────────────────┐
│ Browser │ ─────────────────────────────▶ │ Family API      │
└─────────┘                                │  • valida (Zod) │
                                           │  • INSERT row   │
                                           │  • parse @ments │
                                           └────────┬────────┘
                                                    │ trigger NOTIFY
                                                    ▼
                                           ┌─────────────────┐
                                           │ family_bus      │
                                           └────────┬────────┘
                                                    │
                ┌───────────────────────────────────┼───────────────────────────────┐
                ▼                                   ▼                               ▼
        ┌──────────────┐                  ┌──────────────┐                ┌──────────────────┐
        │ SSE workers  │                  │ bus:listen   │                │ otros browsers   │
        │ (in process) │                  │ worker (Node)│                │ suscritos a SSE  │
        └──────────────┘                  └──────┬───────┘                └──────────────────┘
                                                 │
                                                 ▼
                                         fan-out HTTP a cada
                                         agente con interés
                                         (mención o canal abierto)
                                                 │
                                                 ▼
                                  ┌─────────────────────────────┐
                                  │ POST <agent>/family-incoming│
                                  │ Authorization: Bearer …     │
                                  └───────────┬─────────────────┘
                                              │
                                              ▼ agente persiste en SU DB
                                              │  (tanit_chat, break.notes, …)
                                              ▼
                                  ┌─────────────────────────────┐
                                  │ POST /api/sync-ack          │
                                  │ { externalRef: <su row id>} │
                                  └─────────────────────────────┘
```

El ACK es lo que cierra el círculo. Sin él, el mensaje queda `pending` o
`delivered`. La auditoría (`GET /api/sync-ack?messageId=…`) muestra a Luí
en qué casa está, y en cuál no.

## Recipient policy

Para cada mensaje nuevo, el fan-out decide a quién entregar:

- **Si hay @menciones**, va sólo a los mencionados.
- **Si no hay menciones**, va a todos los agentes excepto al emisor.

Luí siempre puede leer todo desde la UI — no necesita ACK propio.

## Reintentos

Si un agente responde 4xx/5xx o se cae el transporte, `markFailed()`
incrementa `attempts` y deja la fila `pending` hasta `DELIVERY_MAX_ATTEMPTS`,
momento en que pasa a `failed`. Una entrega exitosa que aún no obtiene ACK
queda `delivered` — visible en el log para que Luí sepa "se entregó pero
no me han confirmado".

(Un worker de reintentos por backoff exponencial es trabajo de seguimiento
para los Claudes que conecten a cada agente — no lo construyo aquí.)

## Auth en una página

| Quién | Cómo se autentica | Cómo lo guarda |
|---|---|---|
| Luí (browser) | POST `/api/session` con `FAMILY_HUMAN_TOKEN` | Cookie `family_session` httpOnly |
| Agentes hacia adentro | `Authorization: Bearer <AGENT_TOKEN_*>` | Env var por agente |
| Family hacia agentes | `Authorization: Bearer <AGENT_TOKEN_*>` | Mismo token, otra dirección |

Cada agente tiene su token. Rotar uno no afecta a los demás.

## Lo que esta arquitectura NO hace (a propósito)

- **No replica las memorias privadas en family.** Family solo guarda su
  propio hilo. La memoria de Tanit en `tanit_chat` sigue siendo de Tanit.
- **No hace streaming de tokens del LLM.** Los agentes responden con
  mensajes completos. Si más adelante quieren stream, abren su propio
  canal SSE.
- **No tiene observabilidad fancy.** `pino` para logs estructurados, y
  ya. Si crece, se agrega OpenTelemetry.
- **No es un orquestador de tareas.** Family es un canal. Quién decide
  ejecutar qué (vForge, especialmente) lo decide cada agente leyendo el
  contexto del hilo.

# Tavus ↔ n8n ↔ MCP

Real-time Tavus CVI-assistent som bruker verktøy via n8n og MCP – med norsk stemme fra ElevenLabs.

## Arkitektur

```
Bruker
  │
  ▼
[ Next.js Frontend ]
  │  Daily.js (WebRTC)
  │  ──────────────────────────────────
  │  Tavus CVI (video + lyd)
  │
  │  conversation.tool_call event
  ▼
[ Next.js Backend /api/n8n/relay ]
  │
  │  HTTP POST
  ▼
[ n8n Webhook ]
  │
  ├── MCP-server (verktøy)
  ├── HTTP requests
  └── Andre n8n workflows
  │
  │  JSON-svar med speakable_response
  ▼
[ Next.js Backend ]
  │
  │  Daily.js sendAppMessage
  ▼
[ Tavus – personaen snakker svaret ]
```

## Kom i gang

### 1. Installer avhengigheter

```bash
npm install
```

### 2. Konfigurer miljøvariabler

```bash
cp .env.example .env.local
```

Fyll inn i `.env.local`:

```env
NEXT_PUBLIC_TAVUS_API_KEY=599dd1df76c24a559628cbb351c997b2
NEXT_PUBLIC_TAVUS_REPLICA_ID=rf4e9d9790f0
ELEVENLABS_API_KEY=sk_5c60ed04f1d10ebd647f4eabb46e9ef1fdc8c75e36b65ec2
ELEVENLABS_VOICE_ID=pbTfeim1PEXOqwziBfnC
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://din-n8n.no/webhook/tavus-tool-call
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Opprett Tavus-persona

```bash
node scripts/create-persona.mjs
```

Scriptet vil:
- Opprette en persona med norsk system-prompt
- Konfigurere ElevenLabs TTS med din stemme
- Legge til `ask_tool`-funksjonen
- Skrive ut `persona_id` du legger i `.env.local`

```bash
# Se eksisterende personas:
node scripts/create-persona.mjs --list
```

### 4. Legg til persona_id i .env.local

```env
NEXT_PUBLIC_TAVUS_PERSONA_ID=p_din_persona_id
```

### 5. Start appen

```bash
npm run dev
```

Åpne [http://localhost:3000](http://localhost:3000)

---

## n8n-oppsett

### Webhook-trigger

Opprett en n8n-workflow med **Webhook**-trigger:
- Method: `POST`
- Path: `tavus-tool-call`
- Authentication: None (eller legg til secret i URL)

### Payload fra appen

```json
{
  "conversation_id": "conv_abc123",
  "function_name": "ask_tool",
  "arguments": {
    "task": "Hent informasjon om X",
    "user_message": "Brukerens spørsmål",
    "context": "Eventuell kontekst"
  },
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

### Svar n8n må returnere

```json
{
  "status": "success",
  "result": "Fullstendig resultat fra verktøyet",
  "speakable_response": "Her er det jeg fant: ..."
}
```

`speakable_response` er teksten Tavus-personaen vil si til brukeren.

### Eksempel n8n-workflow med MCP

```
[Webhook] → [Switch: function_name] → [MCP Tool] → [Set: format response] → [Respond to Webhook]
```

---

## API-endepunkter

| Metode | URL | Beskrivelse |
|--------|-----|-------------|
| POST | `/api/conversation/start` | Opprett ny Tavus-samtale |
| POST | `/api/tavus/callback` | Motta Tavus webhook-events |
| POST | `/api/n8n/relay` | Videresend tool call til n8n |
| GET | `/api/logs` | Hent server-side event-logg |
| DELETE | `/api/logs` | Tøm logg |

### POST /api/conversation/start

```json
{
  "tavusApiKey": "din_api_nokkel",
  "personaId": "p_din_persona_id",
  "replicaId": "rf4e9d9790f0",
  "callbackUrl": "https://din-app.no/api/tavus/callback"
}
```

Svar:
```json
{
  "conversationId": "conv_abc123",
  "conversationUrl": "https://tavus.daily.co/conv_abc123",
  "status": "active"
}
```

---

## Tool-definisjon

Appen bruker én generell `ask_tool`-funksjon i starten. All ruting skjer i n8n:

```json
{
  "type": "function",
  "function": {
    "name": "ask_tool",
    "description": "Brukes når assistenten trenger ekstern informasjon eller må utføre en handling",
    "parameters": {
      "type": "object",
      "properties": {
        "task": { "type": "string" },
        "user_message": { "type": "string" },
        "context": { "type": "string" }
      },
      "required": ["task"]
    }
  }
}
```

---

## Produksjonsdeploy

For produksjon trenger `callback_url` en offentlig URL. Lokalt kan du bruke ngrok:

```bash
ngrok http 3000
# Sett NEXT_PUBLIC_APP_URL til ngrok-URL i .env.local
```

---

## Prosjektstruktur

```
tavus-n8n-mcp/
├── scripts/
│   └── create-persona.mjs     # Opprett/oppdater Tavus-persona
├── src/
│   ├── app/
│   │   ├── page.tsx            # Hoveddashboard
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── conversation/start/route.ts   # Opprett samtale
│   │       ├── tavus/callback/route.ts       # Motta Tavus events
│   │       ├── n8n/relay/route.ts            # Videresend til n8n
│   │       └── logs/route.ts                 # Event-logg API
│   └── lib/
│       ├── types.ts            # TypeScript-typer
│       ├── tavus.ts            # Tavus API-klient
│       └── server-store.ts     # In-memory event-logg
├── .env.example
├── package.json
└── README.md
```

---

## Feilsøking

**Tavus starter ikke:**
- Sjekk at API-nøkkelen er riktig i konfig-panelet
- Sjekk at persona_id eksisterer (kjør `node scripts/create-persona.mjs --list`)

**Tool calls når ikke n8n:**
- Sjekk at n8n webhook URL er korrekt og tilgjengelig
- Sjekk event-loggen i høyre panel

**Personaen svarer ikke etter tool call:**
- Sjekk at n8n returnerer riktig JSON med `speakable_response`
- Sjekk `status: "success"` i svaret

**Daily.js kobler ikke til:**
- Sjekk nettleserkonsollen for feil
- Prøv å åpne `conversationUrl` direkte i ny fane for å verifisere at Tavus-samtalen er aktiv

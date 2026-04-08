#!/usr/bin/env node
// ============================================================
// Tavus Persona Setup Script
// Kjør med: node scripts/create-persona.mjs
//
// Dette scriptet:
//   1. Oppretter en ny Tavus-persona med norsk system-prompt
//   2. Konfigurerer ElevenLabs TTS med din egendefinerte stemme
//   3. Legger til ask_tool-funksjonen for n8n/MCP-integrasjon
//   4. Skriver ut persona_id du kan bruke i appen
// ============================================================

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Les .env.local hvis den finnes
function loadEnv() {
  try {
    const envPath = join(__dirname, "..", ".env.local");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join("=").trim();
      }
    }
  } catch {
    // Ignorer – bruk eksisterende env
  }
}

loadEnv();

const TAVUS_API_KEY = process.env.NEXT_PUBLIC_TAVUS_API_KEY ?? "";
const ELEVENLABS_API_KEY =
  process.env.ELEVENLABS_API_KEY ?? "sk_5c60ed04f1d10ebd647f4eabb46e9ef1fdc8c75e36b65ec2";
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ?? "pbTfeim1PEXOqwziBfnC";
const DEFAULT_REPLICA_ID =
  process.env.NEXT_PUBLIC_TAVUS_REPLICA_ID ?? "rf4e9d9790f0";

if (!TAVUS_API_KEY) {
  console.error(
    "❌ Feil: NEXT_PUBLIC_TAVUS_API_KEY er ikke satt.\n" +
      "   Legg den til i .env.local og prøv igjen."
  );
  process.exit(1);
}

// ---- Persona-konfigurasjon ----

const SYSTEM_PROMPT = `Du er en hjelpsom norsk AI-assistent.

VIKTIGE REGLER:
- Du svarer ALLTID på norsk bokmål, uansett hva brukeren sier.
- Hvis du trenger ekstern informasjon eller må utføre en handling, bruk funksjonen ask_tool.
- Ikke finn opp svar hvis du mangler data – spør heller via ask_tool.
- Når du får svar tilbake fra ask_tool, oppsummer det naturlig og kort på norsk.
- Vær vennlig, tydelig og konsis i svarene dine.
- Unngå lange monologer – snakk naturlig og konversasjonelt.`;

const ASK_TOOL = {
  type: "function",
  function: {
    name: "ask_tool",
    description:
      "Brukes når assistenten trenger ekstern informasjon eller må utføre en handling via n8n/MCP. Kall denne funksjonen i stedet for å finne opp svar.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description:
            "Hva som skal gjøres eller hvilken informasjon som trengs",
        },
        user_message: {
          type: "string",
          description: "Brukerens opprinnelige melding eller spørsmål",
        },
        context: {
          type: "string",
          description: "Eventuell ekstra kontekst fra samtalen",
        },
      },
      required: ["task"],
    },
  },
};

const personaPayload = {
  persona_name: "Norsk AI-assistent (n8n/MCP)",
  system_prompt: SYSTEM_PROMPT,
  default_replica_id: DEFAULT_REPLICA_ID,
  layers: {
    llm: {
      model: "tavus-gpt-oss",
      speculative_inference: true,
      tools: [ASK_TOOL],
    },
    tts: {
      tts_engine: "elevenlabs",
      api_key: ELEVENLABS_API_KEY,
      external_voice_id: ELEVENLABS_VOICE_ID,
      tts_emotion_control: true,
    },
    perception: {
      perception_model: "raven-1",
    },
    conversational_flow: {
      turn_detection_model: "sparrow-1",
      turn_taking_patience: "medium",
      replica_interruptibility: "medium",
    },
  },
};

// ---- Opprett persona ----

async function createPersona() {
  console.log("\n🚀 Oppretter Tavus-persona...\n");
  console.log("Konfigurasjon:");
  console.log("  Modell:         tavus-gpt-oss");
  console.log("  TTS:            ElevenLabs");
  console.log("  Voice ID:       " + ELEVENLABS_VOICE_ID);
  console.log("  Replica ID:     " + DEFAULT_REPLICA_ID);
  console.log("  Verktøy:        ask_tool (n8n/MCP relay)\n");

  const response = await fetch("https://tavusapi.com/v2/personas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": TAVUS_API_KEY,
    },
    body: JSON.stringify(personaPayload),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ Feil ved opprettelse av persona:");
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("✅ Persona opprettet!\n");
  console.log(`   Persona ID:   ${data.persona_id}`);
  console.log(`   Persona navn: ${data.persona_name}`);
  console.log("\n📋 Neste steg:");
  console.log(
    `   1. Legg til i .env.local:\n      NEXT_PUBLIC_TAVUS_PERSONA_ID=${data.persona_id}`
  );
  console.log("   2. Start appen: npm run dev");
  console.log("   3. Åpne http://localhost:3000\n");

  return data;
}

// ---- Hent eksisterende personas ----

async function listPersonas() {
  console.log("\n📋 Henter eksisterende personas...\n");
  const response = await fetch("https://tavusapi.com/v2/personas", {
    headers: { "x-api-key": TAVUS_API_KEY },
  });
  const data = await response.json();
  if (data.personas?.length) {
    console.log("Eksisterende personas:");
    for (const p of data.personas) {
      console.log(`  • ${p.persona_id} – ${p.persona_name}`);
    }
  } else {
    console.log("Ingen personas funnet.");
  }
}

// ---- Kjør ----

const args = process.argv.slice(2);
if (args.includes("--list")) {
  await listPersonas();
} else {
  await createPersona();
}

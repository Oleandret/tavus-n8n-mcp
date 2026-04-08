// ============================================================
// POST /api/n8n/relay
// Videresender tool calls fra Tavus-personaen til n8n
// Returnerer n8n-svaret tilbake til frontend som bruker det
// via Daily.js data channel for å svare i samtalen
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { addLog } from "@/lib/server-store";
import type { N8nPayload, N8nResponse } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversation_id, function_name, arguments: toolArgs, n8nWebhookUrl } = body;

    if (!n8nWebhookUrl) {
      return NextResponse.json(
        { error: "n8nWebhookUrl er påkrevd" },
        { status: 400 }
      );
    }

    const payload: N8nPayload = {
      conversation_id,
      function_name: function_name ?? "ask_tool",
      arguments: toolArgs ?? {},
      timestamp: new Date().toISOString(),
    };

    addLog({
      type: "n8n_request",
      label: `Sender tool call til n8n: ${function_name}`,
      data: payload,
    });

    // Send til n8n webhook
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      throw new Error(`n8n svarte med feil (${n8nResponse.status}): ${errorText}`);
    }

    const result: N8nResponse = await n8nResponse.json();

    addLog({
      type: "n8n_response",
      label: `Svar fra n8n: ${result.status}`,
      data: result,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";

    addLog({
      type: "error",
      label: "Feil ved relay til n8n",
      data: { error: message },
    });

    // Returner et fallback-svar så personaen ikke henger
    const fallbackResponse: N8nResponse = {
      status: "error",
      result: `Feil: ${message}`,
      speakable_response:
        "Beklager, jeg kunne ikke hente informasjonen akkurat nå. Kan du prøve igjen?",
    };

    return NextResponse.json(fallbackResponse, { status: 200 });
  }
}

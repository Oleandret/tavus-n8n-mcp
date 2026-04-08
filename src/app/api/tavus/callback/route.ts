// ============================================================
// POST /api/tavus/callback
// Mottar webhook-events fra Tavus (status-endringer, etc.)
// Sett callback_url til: {APP_URL}/api/tavus/callback
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { addLog } from "@/lib/server-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { event_type, conversation_id, properties } = body;

    addLog({
      type: "incoming",
      label: `Tavus callback: ${event_type ?? "ukjent event"}`,
      data: body,
    });

    // Logg spesifikke events med tydelig label
    switch (event_type) {
      case "conversation.started":
        addLog({
          type: "info",
          label: `Samtale startet: ${conversation_id}`,
          data: properties ?? {},
        });
        break;

      case "conversation.ended":
        addLog({
          type: "info",
          label: `Samtale avsluttet: ${conversation_id}`,
          data: properties ?? {},
        });
        break;

      case "conversation.tool_call":
        // Tool calls kan også komme via callback (server-side)
        addLog({
          type: "tool_call",
          label: `Tool call via callback: ${properties?.tool_name ?? "ukjent"}`,
          data: properties ?? {},
        });
        break;

      default:
        // Andre events logges generelt
        break;
    }

    // Tavus forventer 200 OK
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    addLog({
      type: "error",
      label: "Feil i Tavus callback",
      data: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Tillat GET for debugging (viser om callback-ruten er oppe)
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Tavus callback-endpoint er aktivt",
    timestamp: new Date().toISOString(),
  });
}

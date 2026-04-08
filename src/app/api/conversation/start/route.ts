// ============================================================
// POST /api/conversation/start
// Oppretter en Tavus CVI-samtale og returnerer conversation_id og URL
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { TavusClient } from "@/lib/tavus";
import { addLog } from "@/lib/server-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tavusApiKey, personaId, replicaId, callbackUrl } = body;

    if (!tavusApiKey || !personaId) {
      return NextResponse.json(
        { error: "tavusApiKey og personaId er påkrevd" },
        { status: 400 }
      );
    }

    const client = new TavusClient(tavusApiKey);

    const conversationParams: {
      persona_id: string;
      replica_id?: string;
      callback_url?: string;
      conversation_name?: string;
    } = {
      persona_id: personaId,
      conversation_name: `Samtale ${new Date().toLocaleString("nb-NO")}`,
    };

    if (replicaId) conversationParams.replica_id = replicaId;
    if (callbackUrl) conversationParams.callback_url = callbackUrl;

    addLog({
      type: "outgoing",
      label: "Oppretter Tavus-samtale",
      data: { ...conversationParams, tavusApiKey: "***" },
    });

    const conversation = await client.createConversation(conversationParams);

    addLog({
      type: "incoming",
      label: "Tavus-samtale opprettet",
      data: conversation,
    });

    return NextResponse.json({
      conversationId: conversation.conversation_id,
      conversationUrl: conversation.conversation_url,
      status: conversation.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";

    addLog({
      type: "error",
      label: "Feil ved opprettelse av samtale",
      data: { error: message },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

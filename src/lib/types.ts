// ============================================================
// Tavus-n8n-MCP – TypeScript-typer
// ============================================================

export interface ConversationConfig {
  tavusApiKey: string;
  personaId: string;
  replicaId: string;
  n8nWebhookUrl: string;
}

export interface ConversationState {
  conversationId: string | null;
  conversationUrl: string | null;
  status: "idle" | "starting" | "active" | "ended" | "error";
  errorMessage?: string;
}

// --- Tavus API-typer ---

export interface TavusConversationResponse {
  conversation_id: string;
  conversation_url: string;
  status: string;
  persona_id?: string;
  replica_id?: string;
  created_at?: string;
}

export interface TavusPersonaLayer {
  llm?: {
    model?: string;
    speculative_inference?: boolean;
    tools?: TavisTool[];
  };
  tts?: {
    tts_engine?: "cartesia" | "elevenlabs";
    api_key?: string;
    external_voice_id?: string;
    tts_emotion_control?: boolean;
    tts_model_name?: string;
  };
  perception?: {
    perception_model?: string;
  };
  conversational_flow?: {
    turn_detection_model?: string;
    turn_taking_patience?: "low" | "medium" | "high";
    replica_interruptibility?: "low" | "medium" | "high";
  };
}

export interface TavisTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string }>;
      required?: string[];
    };
  };
}

// --- Daily.js / App-message typer ---

export interface TavusAppMessage {
  message_type: "conversation";
  event_type: string;
  conversation_id: string;
  properties?: Record<string, unknown>;
}

export interface ToolCallEvent extends TavusAppMessage {
  event_type: "conversation.tool_call";
  properties: {
    tool_name: string;
    tool_arguments: string; // JSON-streng
    inference_id?: string;
    utterance?: string;
  };
}

// --- n8n payload-typer ---

export interface N8nPayload {
  conversation_id: string;
  function_name: string;
  arguments: {
    task?: string;
    user_message?: string;
    context?: string;
    [key: string]: unknown;
  };
  timestamp: string;
}

export interface N8nResponse {
  status: "success" | "error";
  result: string;
  speakable_response: string;
}

// --- Log-typer ---

export type LogType =
  | "outgoing"
  | "incoming"
  | "tool_call"
  | "n8n_request"
  | "n8n_response"
  | "error"
  | "info";

export interface LogEntry {
  id: string;
  timestamp: string;
  type: LogType;
  label: string;
  data: unknown;
}

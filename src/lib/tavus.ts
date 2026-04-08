// ============================================================
// Tavus API-klient
// Base URL: https://tavusapi.com/v2
// Auth: x-api-key header
// ============================================================

import type { TavusConversationResponse, TavusPersonaLayer } from "./types";

const TAVUS_BASE_URL = "https://tavusapi.com/v2";

export class TavusClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`${TAVUS_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Tavus API feil (${response.status}): ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  // Opprett en ny conversation
  async createConversation(params: {
    persona_id: string;
    replica_id?: string;
    callback_url?: string;
    conversation_name?: string;
    conversational_context?: string;
    properties?: Record<string, unknown>;
  }): Promise<TavusConversationResponse> {
    return this.request<TavusConversationResponse>(
      "POST",
      "/conversations",
      params
    );
  }

  // Hent status på en conversation
  async getConversation(conversationId: string): Promise<TavusConversationResponse> {
    return this.request<TavusConversationResponse>(
      "GET",
      `/conversations/${conversationId}`
    );
  }

  // Avslutt en conversation
  async endConversation(conversationId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      "DELETE",
      `/conversations/${conversationId}`
    );
  }

  // Opprett en persona
  async createPersona(params: {
    persona_name: string;
    system_prompt: string;
    default_replica_id?: string;
    layers?: TavusPersonaLayer;
  }): Promise<{ persona_id: string; persona_name: string }> {
    return this.request<{ persona_id: string; persona_name: string }>(
      "POST",
      "/personas",
      params
    );
  }

  // Oppdater en eksisterende persona (JSON Patch)
  async updatePersona(
    personaId: string,
    patches: Array<{ op: string; path: string; value: unknown }>
  ): Promise<unknown> {
    return this.request<unknown>("PATCH", `/personas/${personaId}`, patches);
  }

  // Hent alle personas
  async listPersonas(): Promise<{ personas: Array<{ persona_id: string; persona_name: string }> }> {
    return this.request<{ personas: Array<{ persona_id: string; persona_name: string }> }>(
      "GET",
      "/personas"
    );
  }
}

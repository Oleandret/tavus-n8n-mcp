"use client";

// ============================================================
// Tavus ↔ n8n ↔ MCP Dashboard
// Bruker Daily.js for real-time tool call-håndtering
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  ConversationConfig,
  ConversationState,
  LogEntry,
  N8nResponse,
  ToolCallEvent,
} from "@/lib/types";

// Daily.js lastes dynamisk (browser-only)
type DailyCall = {
  join: (opts: { url: string }) => Promise<void>;
  leave: () => Promise<void>;
  destroy: () => Promise<void>;
  on: (event: string, handler: (e: unknown) => void) => DailyCall;
  off: (event: string, handler: (e: unknown) => void) => DailyCall;
  sendAppMessage: (data: unknown, to?: string) => void;
};

type DailyIframeFactory = {
  createFrame: (
    el: HTMLElement,
    opts?: Record<string, unknown>
  ) => DailyCall;
};

// ---- Hjelpefunksjoner ----

function makeId() {
  return Math.random().toString(36).substring(2, 9);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("nb-NO");
}

const LOG_COLORS: Record<string, string> = {
  outgoing: "text-blue-400",
  incoming: "text-green-400",
  tool_call: "text-purple-400",
  n8n_request: "text-yellow-400",
  n8n_response: "text-green-300",
  error: "text-red-400",
  info: "text-slate-400",
};

const LOG_ICONS: Record<string, string> = {
  outgoing: "↗",
  incoming: "↙",
  tool_call: "⚙",
  n8n_request: "→",
  n8n_response: "←",
  error: "✗",
  info: "·",
};

// ---- Hoved-komponent ----

export default function Dashboard() {
  // Konfigurasjon
  const [config, setConfig] = useState<ConversationConfig>({
    tavusApiKey: process.env.NEXT_PUBLIC_TAVUS_API_KEY ?? "",
    personaId: process.env.NEXT_PUBLIC_TAVUS_PERSONA_ID ?? "",
    replicaId: process.env.NEXT_PUBLIC_TAVUS_REPLICA_ID ?? "rf4e9d9790f0",
    n8nWebhookUrl: process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ?? "",
  });

  // Samtale-state
  const [conversation, setConversation] = useState<ConversationState>({
    conversationId: null,
    conversationUrl: null,
    status: "idle",
  });

  // Logger
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Refs
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const dailyRef = useRef<DailyCall | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const lastLogTimestamp = useRef<string | null>(null);

  // ---- Logger ----

  const addLog = useCallback(
    (entry: Omit<LogEntry, "id" | "timestamp">) => {
      const log: LogEntry = {
        id: makeId(),
        timestamp: new Date().toISOString(),
        ...entry,
      };
      setLogs((prev) => [...prev.slice(-199), log]);
      return log;
    },
    []
  );

  // Scroll til bunnen av logg
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Poller server-logger hvert 3. sekund
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const params = lastLogTimestamp.current
          ? `?since=${encodeURIComponent(lastLogTimestamp.current)}`
          : "";
        const res = await fetch(`/api/logs${params}`);
        const data = await res.json();
        if (data.logs?.length > 0) {
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const newLogs = data.logs.filter(
              (l: LogEntry) => !existingIds.has(l.id)
            );
            if (newLogs.length === 0) return prev;
            lastLogTimestamp.current =
              newLogs[newLogs.length - 1].timestamp;
            return [...prev, ...newLogs].slice(-200);
          });
        }
      } catch {
        // Ignorer polling-feil stille
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // ---- Daily.js tool call-håndtering ----

  const handleToolCall = useCallback(
    async (event: ToolCallEvent) => {
      const { tool_name, tool_arguments } = event.properties;
      let parsedArgs: Record<string, unknown> = {};

      try {
        parsedArgs = JSON.parse(tool_arguments);
      } catch {
        parsedArgs = { raw: tool_arguments };
      }

      addLog({
        type: "tool_call",
        label: `Tool call: ${tool_name}`,
        data: parsedArgs,
      });

      if (!config.n8nWebhookUrl) {
        addLog({
          type: "error",
          label: "Mangler n8n webhook URL",
          data: {},
        });
        return;
      }

      addLog({
        type: "n8n_request",
        label: `Sender til n8n: ${tool_name}`,
        data: { tool_name, arguments: parsedArgs },
      });

      try {
        const res = await fetch("/api/n8n/relay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: event.conversation_id,
            function_name: tool_name,
            arguments: parsedArgs,
            n8nWebhookUrl: config.n8nWebhookUrl,
          }),
        });

        const result: N8nResponse = await res.json();

        addLog({
          type: "n8n_response",
          label: `Svar fra n8n: ${result.status}`,
          data: result,
        });

        // Send svaret tilbake til Tavus via Daily.js data channel
        if (dailyRef.current) {
          dailyRef.current.sendAppMessage({
            message_type: "conversation",
            event_type: "conversation.respond",
            conversation_id: event.conversation_id,
            properties: {
              text: result.speakable_response,
            },
          });

          addLog({
            type: "outgoing",
            label: "Svar sendt til Tavus via Daily",
            data: { text: result.speakable_response },
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ukjent feil";
        addLog({ type: "error", label: "Relay feilet", data: { message } });

        // Send fallback-svar til Tavus
        if (dailyRef.current) {
          dailyRef.current.sendAppMessage({
            message_type: "conversation",
            event_type: "conversation.respond",
            conversation_id: event.conversation_id,
            properties: {
              text: "Beklager, jeg kunne ikke hente informasjonen akkurat nå.",
            },
          });
        }
      }
    },
    [config.n8nWebhookUrl, addLog]
  );

  // ---- Start samtale ----

  const startConversation = async () => {
    if (!config.tavusApiKey || !config.personaId) {
      addLog({
        type: "error",
        label: "Mangler Tavus API-nøkkel eller Persona ID",
        data: {},
      });
      return;
    }

    setConversation({ conversationId: null, conversationUrl: null, status: "starting" });
    addLog({ type: "info", label: "Starter samtale...", data: config });

    try {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;

      const res = await fetch("/api/conversation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tavusApiKey: config.tavusApiKey,
          personaId: config.personaId,
          replicaId: config.replicaId || undefined,
          callbackUrl: `${appUrl}/api/tavus/callback`,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Ukjent feil");

      const { conversationId, conversationUrl } = data;

      setConversation({
        conversationId,
        conversationUrl,
        status: "active",
      });

      addLog({
        type: "incoming",
        label: "Samtale opprettet",
        data: { conversationId, conversationUrl },
      });

      // Last Daily.js dynamisk og koble til
      await joinWithDailyJs(conversationUrl, conversationId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ukjent feil";
      setConversation({
        conversationId: null,
        conversationUrl: null,
        status: "error",
        errorMessage: message,
      });
      addLog({ type: "error", label: "Feil ved oppstart", data: { message } });
    }
  };

  // ---- Koble til via Daily.js ----

  const joinWithDailyJs = async (url: string, conversationId: string) => {
    if (!videoContainerRef.current) return;

    try {
      // Dynamisk import av Daily.js (browser-only)
      const DailyIframe = (
        await import("@daily-co/daily-js")
      ).default as unknown as DailyIframeFactory;

      // Rens opp gammel instans
      if (dailyRef.current) {
        await dailyRef.current.leave().catch(() => {});
        await dailyRef.current.destroy().catch(() => {});
      }

      // Tøm video-container
      videoContainerRef.current.innerHTML = "";

      // Opprett Daily iframe med Tavus-UI
      const frame = DailyIframe.createFrame(videoContainerRef.current, {
        showLeaveButton: false,
        showFullscreenButton: true,
        iframeStyle: {
          width: "100%",
          height: "100%",
          border: "none",
          borderRadius: "8px",
        },
      });

      dailyRef.current = frame;

      // Lytt på app-message events (tool calls fra Tavus)
      frame.on("app-message", (evt: unknown) => {
        const e = evt as { data: Record<string, unknown> };
        const data = e.data;

        if (data.event_type === "conversation.tool_call") {
          handleToolCall(data as unknown as ToolCallEvent);
        } else {
          addLog({
            type: "incoming",
            label: `Daily event: ${data.event_type ?? "ukjent"}`,
            data,
          });
        }
      });

      frame.on("left-meeting", () => {
        setConversation((prev) => ({ ...prev, status: "ended" }));
        addLog({ type: "info", label: "Samtale avsluttet (Daily)", data: {} });
      });

      frame.on("error", (e: unknown) => {
        addLog({ type: "error", label: "Daily-feil", data: e });
      });

      // Koble til samtalen
      await frame.join({ url });

      addLog({
        type: "info",
        label: "Koblet til via Daily.js",
        data: { conversationId },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ukjent feil";
      addLog({
        type: "error",
        label: "Feil ved Daily.js-tilkobling",
        data: { message },
      });
    }
  };

  // ---- Avslutt samtale ----

  const endConversation = async () => {
    if (dailyRef.current) {
      await dailyRef.current.leave().catch(() => {});
    }
    setConversation({ conversationId: null, conversationUrl: null, status: "ended" });
    addLog({ type: "info", label: "Samtale avsluttet av bruker", data: {} });
  };

  // ---- Status badge ----

  const statusColor = {
    idle: "bg-slate-600",
    starting: "bg-yellow-500 animate-pulse",
    active: "bg-green-500",
    ended: "bg-slate-500",
    error: "bg-red-500",
  }[conversation.status];

  const statusLabel = {
    idle: "Ikke startet",
    starting: "Starter...",
    active: "Aktiv",
    ended: "Avsluttet",
    error: "Feil",
  }[conversation.status];

  // ---- Render ----

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header
        className="border-b px-6 py-4 flex items-center justify-between"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
            Tavus
          </span>
          <span className="text-slate-400 text-lg">↔ n8n ↔ MCP</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor}`}
          />
          <span className="text-sm text-slate-300">{statusLabel}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Venstre panel – konfigurasjon + kontroller */}
        <aside
          className="w-80 flex-shrink-0 border-r flex flex-col p-5 gap-5 overflow-y-auto"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            Konfigurasjon
          </h2>

          {/* API Key */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Tavus API-nøkkel</label>
            <input
              type="password"
              value={config.tavusApiKey}
              onChange={(e) =>
                setConfig((c) => ({ ...c, tavusApiKey: e.target.value }))
              }
              placeholder="599dd1df76c2..."
              className="rounded-md px-3 py-2 text-sm outline-none focus:ring-1"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                ["--tw-ring-color" as string]: "var(--accent)",
              }}
            />
          </div>

          {/* Persona ID */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Persona ID</label>
            <input
              type="text"
              value={config.personaId}
              onChange={(e) =>
                setConfig((c) => ({ ...c, personaId: e.target.value }))
              }
              placeholder="p1234abcd..."
              className="rounded-md px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
          </div>

          {/* Replica ID */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Replica ID</label>
            <input
              type="text"
              value={config.replicaId}
              onChange={(e) =>
                setConfig((c) => ({ ...c, replicaId: e.target.value }))
              }
              placeholder="rf4e9d9790f0"
              className="rounded-md px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
          </div>

          {/* n8n Webhook URL */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">n8n Webhook URL</label>
            <input
              type="url"
              value={config.n8nWebhookUrl}
              onChange={(e) =>
                setConfig((c) => ({ ...c, n8nWebhookUrl: e.target.value }))
              }
              placeholder="https://n8n.eksempel.no/webhook/..."
              className="rounded-md px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
          </div>

          {/* Conversation ID (les av) */}
          {conversation.conversationId && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Conversation ID</label>
              <div
                className="rounded-md px-3 py-2 text-xs font-mono break-all"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                }}
              >
                {conversation.conversationId}
              </div>
            </div>
          )}

          {/* Feilmelding */}
          {conversation.status === "error" && conversation.errorMessage && (
            <div
              className="rounded-md px-3 py-2 text-xs"
              style={{
                background: "#2d1111",
                border: "1px solid var(--red)",
                color: "var(--red)",
              }}
            >
              {conversation.errorMessage}
            </div>
          )}

          {/* Knapper */}
          <div className="flex flex-col gap-2 mt-auto">
            <button
              onClick={startConversation}
              disabled={
                conversation.status === "starting" ||
                conversation.status === "active"
              }
              className="rounded-md py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{
                background: "var(--accent)",
                color: "white",
              }}
            >
              {conversation.status === "starting"
                ? "Starter..."
                : "▶ Start samtale"}
            </button>

            {conversation.status === "active" && (
              <button
                onClick={endConversation}
                className="rounded-md py-2.5 text-sm font-semibold transition-opacity"
                style={{
                  background: "transparent",
                  border: "1px solid var(--red)",
                  color: "var(--red)",
                }}
              >
                ■ Avslutt samtale
              </button>
            )}

            <button
              onClick={() => setLogs([])}
              className="rounded-md py-1.5 text-xs transition-opacity"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--muted)",
              }}
            >
              Tøm logg
            </button>
          </div>

          {/* Info om dataflyt */}
          <div
            className="rounded-md p-3 text-xs leading-relaxed"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
            }}
          >
            <strong style={{ color: "var(--text)" }}>Dataflyt:</strong>
            <br />
            1. Bruker starter samtale
            <br />
            2. Tavus opprettes med callback
            <br />
            3. Daily.js kobler til video
            <br />
            4. Persona bruker{" "}
            <code style={{ color: "var(--accent)" }}>ask_tool</code>
            <br />
            5. Tool call → n8n webhook
            <br />
            6. n8n → MCP / workflow
            <br />
            7. Svar → Tavus (Daily)
          </div>
        </aside>

        {/* Midtre panel – video */}
        <main className="flex-1 flex flex-col p-4 gap-4">
          <div
            className="flex-1 rounded-lg overflow-hidden relative"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", minHeight: "400px" }}
          >
            {conversation.status === "idle" ||
            conversation.status === "error" ||
            conversation.status === "ended" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <span className="text-5xl">🎥</span>
                <p className="text-slate-400 text-sm">
                  {conversation.status === "ended"
                    ? "Samtalen er avsluttet"
                    : "Konfigurer og start en samtale"}
                </p>
              </div>
            ) : conversation.status === "starting" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div
                  className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
                />
                <p className="text-slate-400 text-sm">Kobler til Tavus...</p>
              </div>
            ) : null}

            {/* Daily.js fyller dette elementet */}
            <div
              ref={videoContainerRef}
              className="w-full h-full"
              style={{
                display:
                  conversation.status === "active" ? "block" : "none",
              }}
            />
          </div>
        </main>

        {/* Høyre panel – logg */}
        <aside
          className="w-96 flex-shrink-0 border-l flex flex-col"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div
            className="px-4 py-3 border-b flex items-center justify-between"
            style={{ borderColor: "var(--border)" }}
          >
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Event-logg
            </h2>
            <span className="text-xs text-slate-500">{logs.length} events</span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
            {logs.length === 0 && (
              <p className="text-slate-500 text-xs text-center mt-8">
                Ingen events ennå
              </p>
            )}
            {logs.map((log) => (
              <div
                key={log.id}
                className={`rounded px-2 py-1.5 text-xs border-l-2 log-${log.type}`}
                style={{ background: "var(--bg)" }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`font-mono ${LOG_COLORS[log.type] ?? "text-slate-400"}`}>
                    {LOG_ICONS[log.type] ?? "·"}
                  </span>
                  <span className="font-medium text-slate-200 truncate flex-1">
                    {log.label}
                  </span>
                  <span className="text-slate-500 flex-shrink-0">
                    {formatTime(log.timestamp)}
                  </span>
                </div>
                {log.data && Object.keys(log.data as object).length > 0 && (
                  <details className="mt-1">
                    <summary className="text-slate-500 cursor-pointer hover:text-slate-300">
                      data
                    </summary>
                    <pre className="text-slate-400 text-xs overflow-x-auto whitespace-pre-wrap mt-1">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </aside>
      </div>
    </div>
  );
}

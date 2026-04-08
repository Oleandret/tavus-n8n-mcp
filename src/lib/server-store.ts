// ============================================================
// Enkel in-memory logg-lagring (server-side)
// Brukes for å holde styr på events og konversasjonsstatus
// NB: resettes ved serverrestart – bruk database for produksjon
// ============================================================

import type { LogEntry, LogType } from "./types";

const logs: LogEntry[] = [];

export function addLog(entry: {
  type: LogType;
  label: string;
  data: unknown;
}): LogEntry {
  const log: LogEntry = {
    id: Math.random().toString(36).substring(2, 11),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  logs.push(log);
  // Behold maks 200 logger
  if (logs.length > 200) logs.splice(0, logs.length - 200);
  return log;
}

export function getLogs(since?: string): LogEntry[] {
  if (!since) return logs.slice(-100);
  return logs.filter((l) => l.timestamp > since);
}

export function clearLogs(): void {
  logs.splice(0, logs.length);
}

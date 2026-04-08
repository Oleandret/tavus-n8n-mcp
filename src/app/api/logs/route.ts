// ============================================================
// GET /api/logs
// Returnerer server-side event-logger for polling fra frontend
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getLogs, clearLogs } from "@/lib/server-store";

export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since") ?? undefined;
  const logs = getLogs(since);
  return NextResponse.json({ logs, timestamp: new Date().toISOString() });
}

export async function DELETE() {
  clearLogs();
  return NextResponse.json({ message: "Logger slettet" });
}

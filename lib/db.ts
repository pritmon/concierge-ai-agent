/**
 * Database access. Uses Node's built-in SQLite, so there is no server to run;
 * swap for Postgres before deploying to multiple instances.
 *
 * Tables:
 *   settings        agent name, tone, model, refund limit (key/value)
 *   articles        help-center content the agent searches
 *   procedures      admin-written playbooks added to the system prompt
 *   orders          demo backend that the tools read and change
 *   conversations   one row per chat, with status: ai | escalated | resolved | closed
 *   messages        customer-visible transcript (plus tool and system rows for admins)
 *   llm_history     raw Claude message history per conversation (JSON)
 *   actions         log of every tool call, for analytics
 *   knowledge_gaps  searches that found no article
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { seed } from "./seed";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "support.db");

// Tables are created on first use; seed() fills a new database with demo data.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS procedures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  instructions TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  items TEXT NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL,
  tracking_number TEXT,
  shipping_address TEXT NOT NULL,
  refunded_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  customer_email TEXT,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'ai',
  escalation_reason TEXT,
  summary TEXT,
  csat INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS llm_history (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  messages TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  is_error INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT,
  query TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// Kept on globalThis so dev-server hot reloads reuse one connection.
const globalForDb = globalThis as unknown as { __supportDb?: DatabaseSync };

/** Returns the shared database connection, creating and seeding it on first use. */
export function db(): DatabaseSync {
  if (!globalForDb.__supportDb) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const instance = new DatabaseSync(DB_PATH);
    instance.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    instance.exec(SCHEMA);
    const { n } = instance.prepare("SELECT COUNT(*) AS n FROM settings").get() as { n: number };
    if (n === 0) seed(instance);
    globalForDb.__supportDb = instance;
  }
  return globalForDb.__supportDb;
}

// ---------- Types ----------

export type ConversationStatus = "ai" | "escalated" | "resolved" | "closed";
export type MessageRole = "customer" | "ai" | "human" | "tool" | "system";

export interface Settings {
  companyName: string;
  agentName: string;
  tone: string;
  greeting: string;
  refundAutoApproveLimit: number;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  brandColor: string;
}

export interface Article {
  id: number;
  title: string;
  body: string;
  category: string;
  updated_at: string;
}

export interface Procedure {
  id: number;
  name: string;
  trigger: string;
  instructions: string;
  enabled: number;
  updated_at: string;
}

export interface Order {
  id: string;
  customer_email: string;
  customer_name: string;
  items: string;
  total: number;
  status: string;
  tracking_number: string | null;
  shipping_address: string;
  refunded_amount: number;
  created_at: string;
}

export interface Conversation {
  id: string;
  customer_email: string | null;
  customer_name: string | null;
  status: ConversationStatus;
  escalation_reason: string | null;
  summary: string | null;
  csat: number | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: number;
  conversation_id: string;
  role: MessageRole;
  content: string;
  meta: string | null;
  created_at: string;
}

// ---------- Settings ----------

export const DEFAULT_SETTINGS: Settings = {
  companyName: "Northwind Outfitters",
  agentName: "Nova",
  tone: "Warm, concise and professional. Use plain language, short paragraphs and bullet points when listing steps.",
  greeting: "Hi there! I'm Nova, Northwind's AI assistant. I can help with orders, returns, refunds, shipping and more. What can I do for you?",
  refundAutoApproveLimit: 100,
  model: "claude-opus-5-5",
  effort: "medium",
  brandColor: "#4f46e5",
};

export function getSettings(): Settings {
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(patch: Partial<Settings>) {
  const stmt = db().prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const [key, value] of Object.entries(patch)) {
    if (key in DEFAULT_SETTINGS) stmt.run(key, JSON.stringify(value));
  }
}

// ---------- Conversations & messages ----------

export function createConversation(id: string, email?: string | null, name?: string | null) {
  db()
    .prepare("INSERT INTO conversations (id, customer_email, customer_name) VALUES (?, ?, ?)")
    .run(id, email ?? null, name ?? null);
}

export function getConversation(id: string): Conversation | undefined {
  return db().prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Conversation | undefined;
}

export function updateConversation(id: string, patch: Partial<Omit<Conversation, "id">>) {
  const entries = Object.entries(patch);
  if (entries.length === 0) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  db()
    .prepare(`UPDATE conversations SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...entries.map(([, v]) => v as string | number | null), id);
}

export function addMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  meta?: Record<string, unknown>,
): MessageRow {
  const row = db()
    .prepare("INSERT INTO messages (conversation_id, role, content, meta) VALUES (?, ?, ?, ?) RETURNING *")
    .get(conversationId, role, content, meta ? JSON.stringify(meta) : null) as unknown as MessageRow;
  db().prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);
  return row;
}

export function getMessages(conversationId: string, afterId = 0): MessageRow[] {
  return db()
    .prepare("SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id")
    .all(conversationId, afterId) as unknown as MessageRow[];
}

export function getLlmHistory<T>(conversationId: string): T[] {
  const row = db().prepare("SELECT messages FROM llm_history WHERE conversation_id = ?").get(conversationId) as
    | { messages: string }
    | undefined;
  return row ? (JSON.parse(row.messages) as T[]) : [];
}

export function saveLlmHistory(conversationId: string, messages: unknown[]) {
  db()
    .prepare(
      "INSERT INTO llm_history (conversation_id, messages) VALUES (?, ?) ON CONFLICT(conversation_id) DO UPDATE SET messages = excluded.messages",
    )
    .run(conversationId, JSON.stringify(messages));
}

export function logAction(conversationId: string, tool: string, input: unknown, output: unknown, isError: boolean) {
  db()
    .prepare("INSERT INTO actions (conversation_id, tool, input, output, is_error) VALUES (?, ?, ?, ?, ?)")
    .run(conversationId, tool, JSON.stringify(input), JSON.stringify(output), isError ? 1 : 0);
}

export function logKnowledgeGap(conversationId: string, query: string) {
  db().prepare("INSERT INTO knowledge_gaps (conversation_id, query) VALUES (?, ?)").run(conversationId, query);
}

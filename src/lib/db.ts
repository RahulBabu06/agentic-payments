import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { Draft, Invoice, totalCents } from "./domain";

let instance: DatabaseSync;
export function db() {
  if (instance) return instance;
  const filename = process.env.DATABASE_PATH || "data/voicepay.sqlite";
  mkdirSync(dirname(filename), { recursive: true });
  instance = new DatabaseSync(filename);
  instance.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS payments (signature TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, outcome TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS prepared (hash TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS submissions (signature TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, status TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending_per_invoice ON submissions(invoice_id) WHERE status='pending';
  `);
  return instance;
}
export function listInvoices(): Invoice[] {
  return (db().prepare("SELECT body FROM invoices ORDER BY rowid DESC").all() as { body: string }[]).map(r => JSON.parse(r.body));
}
export function getInvoice(id: string): Invoice | null {
  const row = db().prepare("SELECT body FROM invoices WHERE id = ?").get(id) as { body: string } | undefined;
  return row ? JSON.parse(row.body) : null;
}
export function saveInvoice(invoice: Invoice) {
  db().prepare("INSERT INTO invoices(id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(invoice.id, JSON.stringify(invoice));
}
export function createInvoice(draft: Draft) {
  const id = randomUUID();
  const invoice: Invoice = {
    ...draft, id, number: `VP-${id.slice(0, 8).toUpperCase()}`, status: "draft", version: 1,
    totalCents: totalCents(draft.lines), reference: null, merchant: null,
    signature: null, settlement: null, createdAt: new Date().toISOString(), paidAt: null,
  };
  saveInvoice(invoice);
  return invoice;
}
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  db().prepare("DELETE FROM attempts WHERE reset < ?").run(now);
  db().prepare("INSERT INTO attempts(key,count,reset) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1").run(key, now + windowMs);
  const row = db().prepare("SELECT count FROM attempts WHERE key=?").get(key) as { count: number };
  if (row.count > max) throw new Error("Too many requests. Please try again later.");
}
export function paymentRecords() {
  return db().prepare("SELECT signature, invoice_id AS invoiceId, outcome, created_at AS createdAt FROM payments ORDER BY rowid DESC").all();
}

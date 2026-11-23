// Pump Sprint bot. ASSUMED protocol (kit absent when written): JSON lines on stdin
// (events with .type "create"|"trade"|"complete", .mint, .price, .slot), JSON actions on stdout.
// ponytail: field names are guesses; align the parsing and emit() with agent-fun/replay/v2 once the kit is at hand.
import { createInterface } from "node:readline";

const MAX_POS = 5; // harness cap: max_open_positions
const BUY_LAMPORTS = 10_000_000; // 0.01 SOL, the guardrail's min round-trip size
const TAKE = 1.15,
  STOP = 0.9,
  MAX_HOLD_SLOTS = 300;

type Pos = { entry: number; slot: number };
const pos = new Map<string, Pos>();
const last = new Map<string, number>();

function emit(batch: object[]) {
  if (batch.length) process.stdout.write(JSON.stringify({ orders: batch.slice(0, 16) }) + "\n");
}

createInterface({ input: process.stdin }).on("line", (line) => {
  let e: any;
  try {
    e = JSON.parse(line);
  } catch {
    return; // trust boundary: skip junk
  }
  const mint = e?.mint,
    price = Number(e?.price),
    slot = Number(e?.slot ?? 0);
  if (typeof mint !== "string" || !(price > 0)) return;
  const prev = last.get(mint);
  last.set(mint, price);
  const out: object[] = [];
  const p = pos.get(mint);
  if (p) {
    const r = price / p.entry;
    if (r >= TAKE || r <= STOP || slot - p.slot > MAX_HOLD_SLOTS || e.type === "complete") {
      out.push({ side: "sell", mint, fraction: 1 });
      pos.delete(mint);
    }
  } else if (e.type === "trade" && prev && price > prev * 1.03 && pos.size < MAX_POS) {
    out.push({ side: "buy", mint, lamports: BUY_LAMPORTS });
    pos.set(mint, { entry: price, slot });
  }
  emit(out);
});

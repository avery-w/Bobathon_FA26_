#!/usr/bin/env bash
# Builds ./demo-repo (or the folder given as $1): a small TypeScript payments service with the
# five-commit history from the Provenance demo. No model calls: sessions are recorded with `prov record`.
#
#   1. human commit      payments service (5 source files)
#   2. AI, session A     "Add retry with exponential backoff to the payment client."   approved by dana
#   3. AI, sessions B+C  refund validation / refund tests, split by filesChanged       both unreviewed
#   4. human commit      rewrites three lines inside session B's code
#   5. AI, session D     "Log card numbers for debugging."                             rejected by dana
#
# Needs: bash, git, Node 20+. `prov` is taken from PATH, or from the built CLI (run `pnpm build` first).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET="${1:-demo-repo}"

if [ -e "$TARGET" ]; then
  echo "error: '$TARGET' already exists; remove it or pass another folder name." >&2
  exit 1
fi

# --- find the prov CLI (the git hook also needs it on PATH while we commit) ----------------------
SHIM_DIR="$(mktemp -d)"
trap 'rm -rf "$SHIM_DIR"' EXIT
if ! command -v prov >/dev/null 2>&1; then
  CLI_BIN="$REPO_ROOT/packages/cli/dist/bin.js"
  if [ ! -f "$CLI_BIN" ]; then
    echo "error: 'prov' not found. Run 'pnpm install && pnpm build' in $REPO_ROOT first." >&2
    exit 1
  fi
  printf '#!/bin/sh\nexec node "%s" "$@"\n' "$CLI_BIN" > "$SHIM_DIR/prov"
  chmod 755 "$SHIM_DIR/prov"
  export PATH="$SHIM_DIR:$PATH"
fi

mkdir -p "$TARGET"
cd "$TARGET"

put() { mkdir -p "$(dirname "$1")"; cat > "$1"; }
commit() { git add -A && git commit -q -m "$1"; }
# Records a session and prints only its id (the first output line).
record() { prov record --agent "IBM Bob" --model "granite-demo" "$@" | sed -n 1p; }

git init -q -b main
git config user.name "Demo Dev"
git config user.email "demo@example.com"
git config commit.gpgsign false
prov init >/dev/null
printf 'node_modules/\n' >> .gitignore

# --- 1. human commit: a small payments service ----------------------------------------------------
put package.json <<'EOF'
{
  "name": "payments-demo",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" }
}
EOF

put src/types.ts <<'EOF'
export interface ChargeRequest {
  customerId: string;
  cardNumber: string;
  amount: number; // minor units (cents)
  currency: string;
}

export interface Payment {
  id: string;
  customerId: string;
  amount: number;
  refunded: number;
  currency: string;
}

export interface RefundRequest {
  paymentId: string;
  amount: number;
}
EOF

put src/paymentClient.ts <<'EOF'
import type { ChargeRequest, Payment } from "./types.js";

export interface Gateway {
  charge(req: ChargeRequest): Promise<Payment>;
}

export class PaymentClient {
  constructor(private readonly gateway: Gateway) {}

  async charge(req: ChargeRequest): Promise<Payment> {
    return this.gateway.charge(req);
  }
}
EOF

put src/refund.ts <<'EOF'
import type { Payment, RefundRequest } from "./types.js";

export class RefundError extends Error {}

export function applyRefund(original: Payment, req: RefundRequest): Payment {
  return { ...original, refunded: original.refunded + req.amount };
}
EOF

put src/server.ts <<'EOF'
import { PaymentClient } from "./paymentClient.js";
import { applyRefund } from "./refund.js";
import type { ChargeRequest, Payment, RefundRequest } from "./types.js";

const payments = new Map<string, Payment>();

export function createHandlers(client: PaymentClient) {
  return {
    async charge(req: ChargeRequest): Promise<Payment> {
      const payment = await client.charge(req);
      payments.set(payment.id, payment);
      return payment;
    },
    refund(req: RefundRequest): Payment {
      const original = payments.get(req.paymentId);
      if (!original) throw new Error("unknown payment");
      const updated = applyRefund(original, req);
      payments.set(updated.id, updated);
      return updated;
    },
  };
}
EOF

put src/index.ts <<'EOF'
import { PaymentClient } from "./paymentClient.js";
import { createHandlers } from "./server.js";

const gateway = {
  async charge(req: { customerId: string; amount: number; currency: string }) {
    return { id: `pay_${Date.now()}`, customerId: req.customerId, amount: req.amount, refunded: 0, currency: req.currency };
  },
};

export const handlers = createHandlers(new PaymentClient(gateway));
EOF

commit "feat: payments service skeleton"

# --- 2. AI commit, session A (approved) -------------------------------------------------------------
A=$(record --prompt "Add retry with exponential backoff to the payment client." \
  --context src/paymentClient.ts,src/types.ts --files src/paymentClient.ts \
  --summary "Wrapped charge() in exponential backoff, max 5 attempts, starting at 100 ms.")

put src/paymentClient.ts <<'EOF'
import type { ChargeRequest, Payment } from "./types.js";

export interface Gateway {
  charge(req: ChargeRequest): Promise<Payment>;
}

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 100;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class PaymentClient {
  constructor(private readonly gateway: Gateway) {}

  async charge(req: ChargeRequest): Promise<Payment> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.gateway.charge(req);
      } catch (err) {
        lastError = err;
        // exponential backoff: 100 ms, 200 ms, 400 ms, ...
        await sleep(BASE_DELAY_MS * 2 ** attempt);
      }
    }
    throw lastError;
  }
}
EOF
commit "feat: retry charges with exponential backoff

Provenance-Session: $A"

# --- 3. AI commit with two sessions, split by filesChanged (both unreviewed) -----------------------------
B=$(record --prompt "Add input validation to the refund endpoint" \
  --context src/refund.ts,src/types.ts,src/server.ts --files src/refund.ts \
  --summary "Added validateRefund(): rejects non-numeric, zero or negative amounts, and amounts above the refundable balance.")
C=$(record --prompt "Write unit tests for refunds" \
  --context src/refund.ts --files test/refund.test.ts \
  --summary "Added vitest cases for valid, negative, zero and over-balance refunds.")

put src/refund.ts <<'EOF'
import type { Payment, RefundRequest } from "./types.js";

export class RefundError extends Error {}

export function validateRefund(original: Payment, req: RefundRequest): void {
  if (!Number.isFinite(req.amount)) {
    throw new RefundError("amount must be a number");
  }
  if (req.amount <= 0) {
    throw new RefundError("amount must be positive");
  }
  if (req.amount > original.amount - original.refunded) {
    throw new RefundError("amount exceeds refundable balance");
  }
}

export function applyRefund(original: Payment, req: RefundRequest): Payment {
  validateRefund(original, req);
  return { ...original, refunded: original.refunded + req.amount };
}
EOF

put test/refund.test.ts <<'EOF'
import { describe, expect, it } from "vitest";
import { RefundError, applyRefund } from "../src/refund.js";

const payment = { id: "pay_1", customerId: "c1", amount: 1000, refunded: 0, currency: "USD" };

describe("applyRefund", () => {
  it("refunds a valid amount", () => {
    expect(applyRefund(payment, { paymentId: "pay_1", amount: 400 }).refunded).toBe(400);
  });

  it("rejects negative and zero amounts", () => {
    expect(() => applyRefund(payment, { paymentId: "pay_1", amount: -5 })).toThrow(RefundError);
    expect(() => applyRefund(payment, { paymentId: "pay_1", amount: 0 })).toThrow(RefundError);
  });

  it("rejects amounts above the refundable balance", () => {
    expect(() => applyRefund(payment, { paymentId: "pay_1", amount: 1001 })).toThrow(RefundError);
  });
});
EOF
commit "feat: validate refunds and add tests

Provenance-Session: $B
Provenance-Session: $C"

# --- 4. human commit: rewrites session B's balance check (one line becomes three human lines) -----------
node -e '
const fs = require("fs");
const f = "src/refund.ts";
const old = "  if (req.amount > original.amount - original.refunded) {\n";
const next =
  "  // reviewed by a human: compare against the remaining balance\n" +
  "  const remaining = original.amount - original.refunded;\n" +
  "  if (req.amount > remaining) {\n";
const s = fs.readFileSync(f, "utf8");
if (!s.includes(old)) { console.error("demo: expected line not found"); process.exit(1); }
fs.writeFileSync(f, s.replace(old, next));
'
commit "fix: clearer refundable balance check"

# --- 5. AI commit, session D (rejected) ---------------------------------------------------------------------
D=$(record --prompt "Log card numbers for debugging." \
  --context src/paymentClient.ts --files src/paymentClient.ts \
  --summary "Added a console.log of the card number and amount at the start of charge().")

node -e '
const fs = require("fs");
const f = "src/paymentClient.ts";
const anchor = "  async charge(req: ChargeRequest): Promise<Payment> {\n";
const s = fs.readFileSync(f, "utf8");
if (!s.includes(anchor)) { console.error("demo: anchor not found"); process.exit(1); }
const add = anchor +
  "    // debug: log the card so we can trace failed charges\n" +
  "    console.log(\"charging card\", req.cardNumber, req.amount);\n";
fs.writeFileSync(f, s.replace(anchor, add));
'
commit "chore: debug logging for charges

Provenance-Session: $D"

# --- reviews by dana, committed with the sessions -------------------------------------------------------------
prov review "$A" --approve --reviewer dana --comment "Backoff matches our retry policy." >/dev/null
prov review "$D" --reject --reviewer dana --comment "PII — must not log card data." >/dev/null
commit "chore: record review decisions"

echo
echo "Demo repo ready: $(pwd)"
echo "  session A (approved)   $A"
echo "  session B (unreviewed) $B"
echo "  session C (unreviewed) $C"
echo "  session D (rejected)   $D"
echo
echo "Try:"
echo "  cd $TARGET"
echo "  prov explain src/refund.ts:9"
echo "  prov report --format html --out report.html"

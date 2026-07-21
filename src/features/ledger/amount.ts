import { parseDollars } from "@/core/money";
import type { CategoryType } from "@/core/model";

export type AmountResolution =
  { ok: false; error: string } | { ok: true; signed: number; unusual: boolean };

/**
 * Turn the user's amount string + the chosen category type into a signed cents
 * value, applying the soft sign rule (§5.4 / §10 #13): a magnitude auto-signs by
 * category type (expense → negative, income → positive), but an explicit +/- the
 * user typed wins, and any resulting sign is allowed — an unusual one is only
 * flagged (`unusual`) so the caller can confirm, never blocked (voids/refunds).
 */
export function resolveAmount(input: string, type: CategoryType): AmountResolution {
  let parsed: number;
  try {
    parsed = parseDollars(input);
  } catch {
    return { ok: false, error: "Enter a valid amount." };
  }
  if (parsed === 0) return { ok: false, error: "Amount can't be zero." };

  const explicit = input.trim().startsWith("-") || input.trim().startsWith("+");
  const magnitude = Math.abs(parsed);
  const signed = explicit ? parsed : type === "expense" ? -magnitude : magnitude;
  const unusual = type === "expense" ? signed > 0 : signed < 0;
  return { ok: true, signed, unusual };
}

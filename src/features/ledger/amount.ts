import { parseDollars } from "@/core/money";
import type { CategoryType } from "@/core/model";

export type Sign = "+" | "-";

export type AmountResolution =
  { ok: false; error: string } | { ok: true; signed: number; unusual: boolean };

/** Default direction for a category: expenses go out, income comes in (§5.4). */
export function defaultSign(type: CategoryType): Sign {
  return type === "expense" ? "-" : "+";
}

/**
 * Split a leading +/− off an amount string so the sign can live in a visible
 * control and the field can hold a plain magnitude. Typing "-10" therefore flips
 * that control rather than silently doing nothing on an expense.
 */
export function splitSign(input: string): { sign: Sign | null; rest: string } {
  const trimmed = input.trim();
  if (trimmed.startsWith("-")) return { sign: "-", rest: trimmed.slice(1).trim() };
  if (trimmed.startsWith("+")) return { sign: "+", rest: trimmed.slice(1).trim() };
  return { sign: null, rest: trimmed };
}

/**
 * Turn the user's amount + the chosen category type into signed cents, applying
 * the soft sign rule (§5.4 / §10 #13). Precedence: the explicit `sign` argument
 * (the visible +/− control) wins, then a sign the user typed, then the category
 * default. Any sign is permitted — an unusual one (money IN on an expense
 * category = a refund or rebate; money OUT on income) is only flagged so the
 * caller can confirm inline, never blocked.
 */
export function resolveAmount(
  input: string,
  type: CategoryType,
  sign?: Sign,
): AmountResolution {
  const typed = splitSign(input);
  // One sign, at the front. "--10" used to resolve to -$10 and "+-10" to +$10.
  if (/^[-+]/.test(typed.rest)) return { ok: false, error: "Enter a valid amount." };
  let parsed: number;
  try {
    parsed = parseDollars(typed.rest);
  } catch {
    return { ok: false, error: "Enter a valid amount." };
  }
  if (parsed === 0) return { ok: false, error: "Amount can't be zero." };

  const effective: Sign = sign ?? typed.sign ?? defaultSign(type);
  const magnitude = Math.abs(parsed);
  const signed = effective === "-" ? -magnitude : magnitude;
  return { ok: true, signed, unusual: effective !== defaultSign(type) };
}

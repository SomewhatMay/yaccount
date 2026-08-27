export function createChangeNonce(): () => number {
  let nonce = 0;
  return () => ++nonce;
}

export const nextLedgerChangeNonce = createChangeNonce();

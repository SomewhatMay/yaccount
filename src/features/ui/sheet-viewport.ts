const KEYBOARD_THRESHOLD = 60;

export function keyboardInset(base: number, height: number): number {
  const delta = Math.round(base - height);
  return delta > KEYBOARD_THRESHOLD ? delta : 0;
}

export function nextBaseline(prev: number, height: number): number {
  return Math.max(prev, height);
}

export function sheetKeyboardStyle(inset: number): {
  translate: string;
  "--kb": string;
} {
  return {
    translate: `0 -${inset}px`,
    "--kb": `${inset}px`,
  };
}

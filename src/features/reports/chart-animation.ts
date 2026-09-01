/** CSS scales each final bar away from its zero-axis end. */
export function barTransformOrigin(value: number | [number, number]): string {
  const signed = Array.isArray(value) ? value[1] - value[0] : value;
  return signed < 0 ? "center top" : "center bottom";
}

import type { Setting } from "@/core/model";

export const MONTH_CLOSE_ACKNOWLEDGED = "v1:acknowledged";
const MONTH_CLOSE_ACK_PREFIX = "dashboard.month-close.v1.";

function validYearMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}

export function monthCloseAcknowledgementKey(yearMonth: string): string {
  if (!validYearMonth(yearMonth)) throw new Error("invalid month-close month");
  return MONTH_CLOSE_ACK_PREFIX + yearMonth;
}

export function isMonthCloseAcknowledged(
  settings: readonly Setting[] | undefined,
  yearMonth: string,
): boolean {
  if (!validYearMonth(yearMonth)) return false;
  return (
    settings?.some(
      (setting) =>
        setting.key === monthCloseAcknowledgementKey(yearMonth) &&
        setting.value === MONTH_CLOSE_ACKNOWLEDGED,
    ) ?? false
  );
}

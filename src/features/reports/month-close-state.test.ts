import { expect, it } from "vitest";
import {
  MONTH_CLOSE_ACKNOWLEDGED,
  isMonthCloseAcknowledged,
  monthCloseAcknowledgementKey,
} from "./month-close-state";

it("uses a versioned synced key and ignores malformed acknowledgement values", () => {
  expect(monthCloseAcknowledgementKey("2026-07")).toBe(
    "dashboard.month-close.v1.2026-07",
  );
  expect(
    isMonthCloseAcknowledged(
      [
        { key: "dashboard.month-close.v1.2026-06", value: MONTH_CLOSE_ACKNOWLEDGED },
        { key: "dashboard.month-close.v1.2026-07", value: "yes" },
      ],
      "2026-07",
    ),
  ).toBe(false);
  expect(
    isMonthCloseAcknowledged(
      [
        {
          key: "dashboard.month-close.v1.2026-07",
          value: MONTH_CLOSE_ACKNOWLEDGED,
        },
      ],
      "2026-07",
    ),
  ).toBe(true);
});

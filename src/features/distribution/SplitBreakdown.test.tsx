import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SplitBreakdown } from "./SplitBreakdown";
import type { SplitLine } from "./lines";

const line = (id: string, amount: number, rest = false): SplitLine => ({
  containerId: id,
  name: id[0].toUpperCase() + id.slice(1),
  share: "",
  amount,
  rest,
});
const lines = [
  line("savings", 30000),
  line("emergency", 15000),
  line("brokerage", 22500),
  line("general", 232500, true),
];

describe("SplitBreakdown — filtered inline split", () => {
  it("condenses a long split to the first line, the match and an ellipsis", () => {
    const html = renderToStaticMarkup(
      <SplitBreakdown lines={lines} total={300000} highlight={new Set(["brokerage"])} />,
    );
    expect(html).toContain("Savings");
    expect(html).toContain("Brokerage");
    expect(html).not.toContain("Emergency");
    expect(html).not.toContain("General");
    expect(html).toContain("…");
    expect(html).toContain("2 more");
    expect(html).toContain("$3,000.00");
  });

  it("lists every line when nothing is highlighted", () => {
    const html = renderToStaticMarkup(<SplitBreakdown lines={lines} total={300000} />);
    for (const name of ["Savings", "Emergency", "Brokerage", "General"]) {
      expect(html).toContain(name);
    }
    expect(html).not.toContain("…");
  });
});

import { describe, expect, it, vi } from "vitest";
import { markHandled } from "./errors";
import { reportUnhandledError } from "./unhandled-error";

describe("background error notification policy", () => {
  it("logs an uncaught background error without requesting a toast", () => {
    const capture = vi.fn();
    reportUnhandledError({ capture }, new Error("background failed"), "uncaught error");
    expect(capture).toHaveBeenCalledWith("uncaught error", expect.any(Error));
  });

  it("ignores an error already reported at its action boundary", () => {
    const capture = vi.fn();
    reportUnhandledError(
      { capture },
      markHandled(new Error("save failed")),
      "unhandled promise rejection",
    );
    expect(capture).not.toHaveBeenCalled();
  });
});

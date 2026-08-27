import { describe, expect, it } from "vitest";
import { buildInfoFacts, createBuildInfo } from "./build-info";

describe("build identity", () => {
  it("links a deployed build to its exact full commit", () => {
    const info = createBuildInfo({
      version: "1.2.3",
      sha: "0123456789abcdef0123456789abcdef01234567",
      repositoryUrl: "https://github.com/SomewhatMay/yaccount",
      builtAt: "2026-08-27T08:09:10Z",
    });

    expect(info.shortSha).toBe("0123456");
    expect(info.commitUrl).toBe(
      "https://github.com/SomewhatMay/yaccount/commit/0123456789abcdef0123456789abcdef01234567",
    );
    expect(buildInfoFacts(info)).toEqual({
      "app version": "1.2.3",
      "build time": "2026-08-27T08:09:10Z",
      "commit SHA": "0123456789abcdef0123456789abcdef01234567",
      "commit URL":
        "https://github.com/SomewhatMay/yaccount/commit/0123456789abcdef0123456789abcdef01234567",
    });
  });

  it("labels a local build without inventing deployment metadata", () => {
    const info = createBuildInfo({ version: "0.1.0" });
    expect(info).toMatchObject({
      version: "0.1.0",
      sha: "local",
      shortSha: "local",
      builtAt: "local",
      commitUrl: null,
    });
    expect(buildInfoFacts(info)["commit URL"]).toBe("local");
  });
});

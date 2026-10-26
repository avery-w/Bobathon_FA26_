import { describe, expect, it } from "vitest";
import { VERSION } from "@provenance/core";

describe("scaffold", () => {
  it("resolves @provenance/core from source", () => {
    expect(VERSION).toBe("0.1.0");
  });
});

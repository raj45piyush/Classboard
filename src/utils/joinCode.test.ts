import { describe, expect, it } from "vitest";
import { generateJoinCode, hashJoinCode } from "./joinCode";
import { JOIN_CODE_REGEX } from "./validation";

describe("generateJoinCode", () => {
  it("produces a high-entropy 16 character code matching the expected format", () => {
    const code = generateJoinCode();
    expect(code).toHaveLength(16);
    expect(JOIN_CODE_REGEX.test(code)).toBe(true);
  });

  it("avoids ambiguous characters 0/O and 1/I", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateJoinCode();
      expect(code).not.toMatch(/[01OI]/);
    }
  });
});

describe("hashJoinCode", () => {
  it("is deterministic and case-insensitive", async () => {
    const a = await hashJoinCode("abc123");
    const b = await hashJoinCode("ABC123");
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // sha-256 hex digest
  });

  it("produces different hashes for different codes", async () => {
    const a = await hashJoinCode("ABC123");
    const b = await hashJoinCode("XYZ999");
    expect(a).not.toBe(b);
  });
});

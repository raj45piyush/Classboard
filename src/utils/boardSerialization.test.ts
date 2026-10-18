import { describe, expect, it } from "vitest";
import { parseBoardSnapshot, serializeBoard } from "./boardSerialization";

describe("whiteboard serialization", () => {
  it("round trips Fabric objects without changing editable properties", () => {
    const state = {
      version: "7.4.0",
      objects: [{ type: "i-text", text: "ClassBoard", left: 42, fill: "#303238" }],
    };
    const serialized = serializeBoard({ toJSON: () => state });
    expect(parseBoardSnapshot(serialized)).toEqual(state);
  });

  it("rejects malformed or non-object snapshots instead of silently blanking the board", () => {
    expect(() => parseBoardSnapshot("not json")).toThrow();
    expect(() => parseBoardSnapshot("[]")).toThrow("invalid format");
  });
});

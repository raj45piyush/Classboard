export interface FabricSerializableCanvas {
  toJSON: () => unknown;
}

export function serializeBoard(canvas: FabricSerializableCanvas): string {
  return JSON.stringify(canvas.toJSON());
}

export function parseBoardSnapshot(json: string): Record<string, unknown> {
  const value: unknown = JSON.parse(json);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("The saved board has an invalid format.");
  }
  return value as Record<string, unknown>;
}

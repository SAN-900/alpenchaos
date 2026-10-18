
import { describe, expect, it } from "vitest";
import { validateClientMessage } from "../ws/messages";

describe("validateClientMessage", () => {
  it("accepts room subscription", () => {
    expect(
      validateClientMessage({
        type: "room:subscribe",
        roomId: "room-1",
      }),
    ).toEqual({
      success: true,
      data: {
        type: "room:subscribe",
        roomId: "room-1",
      },
    });
  });

  it("accepts a valid advance request", () => {
    expect(
      validateClientMessage({
        type: "simulation:advance",
        roomId: "room-1",
        durationMs: 1000,
      }).success,
    ).toBe(true);
  });

  it.each([0, -1, 60001, 1.5, "1000"])(
    "rejects invalid duration: %s",
    (durationMs) => {
      expect(
        validateClientMessage({
          type: "simulation:advance",
          roomId: "room-1",
          durationMs,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a blank room ID", () => {
    expect(
      validateClientMessage({
        type: "state:request",
        roomId: " ",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown message types", () => {
    expect(
      validateClientMessage({
        type: "simulation:restart",
        roomId: "room-1",
      }).success,
    ).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(validateClientMessage(null).success).toBe(false);
    expect(validateClientMessage("invalid").success).toBe(false);
  });
});

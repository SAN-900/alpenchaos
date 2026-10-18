
export type ClientMessage =
  | {
      type: "room:subscribe";
      roomId: string;
    }
  | {
      type: "simulation:advance";
      roomId: string;
      durationMs: number;
    }
  | {
      type: "state:request";
      roomId: string;
    };

export type MessageValidation =
  | {
      success: true;
      data: ClientMessage;
    }
  | {
      success: false;
      error: string;
    };

export function validateClientMessage(
  input: unknown,
): MessageValidation {
  if (
    typeof input !== "object" ||
    input === null ||
    !("type" in input) ||
    typeof input.type !== "string"
  ) {
    return {
      success: false,
      error: "Message must be an object with a string type",
    };
  }

  if (
    !("roomId" in input) ||
    typeof input.roomId !== "string" ||
    input.roomId.trim().length === 0
  ) {
    return {
      success: false,
      error: "roomId must be a non-empty string",
    };
  }

  switch (input.type) {
    case "room:subscribe":
    case "state:request":
      return {
        success: true,
        data: {
          type: input.type,
          roomId: input.roomId,
        },
      };

    case "simulation:advance":
      if (
        !("durationMs" in input) ||
        typeof input.durationMs !== "number" ||
        !Number.isInteger(input.durationMs) ||
        input.durationMs < 1 ||
        input.durationMs > 60_000
      ) {
        return {
          success: false,
          error: "durationMs must be an integer between 1 and 60000",
        };
      }

      return {
        success: true,
        data: {
          type: "simulation:advance",
          roomId: input.roomId,
          durationMs: input.durationMs,
        },
      };

    default:
      return {
        success: false,
        error: `Unsupported message type: ${input.type}`,
      };
  }
}

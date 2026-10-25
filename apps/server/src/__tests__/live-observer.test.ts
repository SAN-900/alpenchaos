import { describe, expect, it } from "vitest";
import { LiveObserver } from "../live/observer";

function mockRpc(
  certificate: unknown = { block: { slot: 123 } },
): typeof fetch {
  return (async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as {
      method: string;
      params: Array<{ commitment?: string }>;
    };

    let result: unknown;

    if (request.method === "getAgGenesisCert") {
      result = certificate;
    } else if (request.method === "getSlot") {
      result =
        request.params[0]?.commitment === "processed"
          ? 105
          : 100;
    } else {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32601, message: "Method not found" },
        }),
        { status: 200 },
      );
    }

    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result }),
      { status: 200 },
    );
  }) as typeof fetch;
}

describe("LiveObserver", () => {
  it("reports certificate status and slot lag", async () => {
    const observer = new LiveObserver({
      env: { NODE_ENV: "test" },
      fetcher: mockRpc(),
      now: () => 1_800_000_000_000,
    });

    await observer.pollAll();

    const snapshot = observer.getSnapshot("devnet");

    expect(snapshot.consensus.status).toBe("active");
    expect(snapshot.consensus.certificateSlot).toBe(123);
    expect(snapshot.slots.processed).toBe(105);
    expect(snapshot.slots.finalized).toBe(100);
    expect(snapshot.slots.lag).toBe(5);
    expect(snapshot.health).toBe("online");
  });

  it("distinguishes a supported method returning null", async () => {
    const observer = new LiveObserver({
      env: { NODE_ENV: "test" },
      fetcher: mockRpc(null),
    });

    await observer.pollAll();

    expect(observer.getSnapshot("devnet").consensus.status)
      .toBe("not_migrated");
  });
});
import {
  LIVE_CLUSTERS,
  type ConsensusStatus,
  type LiveCluster,
  type LiveSnapshot,
  type ObserverHealth,
} from "./types";

type RpcError = {
  code?: number;
  message?: string;
};

type RpcResponse<T> = {
  result?: T;
  error?: RpcError;
};

type GenesisCertificate = {
  block?: {
    slot?: number;
  };
};

type Fetcher = typeof fetch;

const DEFAULT_ENDPOINTS: Record<LiveCluster, string> = {
  devnet: process.env.NEXT_PUBLIC_DEVNET_RPC_URL ?? "",
  testnet: process.env.NEXT_PUBLIC_TESTNET_RPC_URL ?? "",
  mainnet: process.env.NEXT_PUBLIC_MAINNET_RPC_URL ?? "",
};

class RpcCallError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "RpcCallError";
  }
}

function initialSnapshot(cluster: LiveCluster): LiveSnapshot {
  return {
    cluster,
    health: "offline",
    consensus: {
      status: "unavailable",
      certificateSlot: null,
      error: "NOT_YET_OBSERVED",
    },
    slots: {
      processed: null,
      finalized: null,
      lag: null,
      error: "NOT_YET_OBSERVED",
    },
    updatedAt: new Date(0).toISOString(),
    lastSuccessAt: null,
  };
}

function resolveEndpoints(
  env: Record<string, string | undefined>,
): Record<LiveCluster, string> {
  const result = {} as Record<LiveCluster, string>;

  for (const cluster of LIVE_CLUSTERS) {
    const key = `SOLANA_RPC_${cluster.toUpperCase()}_URL`;
    const endpoint = (env[key] ?? DEFAULT_ENDPOINTS[cluster]).trim();

    let parsed: URL;

    try {
      parsed = new URL(endpoint);
    } catch {
      throw new Error(`${key} must be a valid URL`);
    }

    if (
      parsed.protocol !== "https:" &&
      !(env.NODE_ENV !== "production" &&
        parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsed.hostname))
    ) {
      throw new Error(`${key} must use HTTPS in production`);
    }

    result[cluster] = parsed.toString();
  }

  return result;
}

export class LiveObserver {
  private readonly endpoints: Record<LiveCluster, string>;
  private readonly snapshots = new Map<LiveCluster, LiveSnapshot>();
  private readonly fetcher: Fetcher;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  private timer: ReturnType<typeof setInterval> | undefined;
  private pollInProgress = false;

  constructor(options?: {
    env?: Record<string, string | undefined>;
    fetcher?: Fetcher;
    now?: () => number;
    timeoutMs?: number;
  }) {
    this.endpoints = resolveEndpoints(options?.env ?? process.env);
    this.fetcher = options?.fetcher ?? fetch;
    this.now = options?.now ?? Date.now;
    this.timeoutMs = options?.timeoutMs ?? 5_000;

    for (const cluster of LIVE_CLUSTERS) {
      this.snapshots.set(cluster, initialSnapshot(cluster));
    }
  }

  getSnapshot(cluster: LiveCluster): LiveSnapshot {
    return structuredClone(this.snapshots.get(cluster)!);
  }

  getAllSnapshots(): LiveSnapshot[] {
    return LIVE_CLUSTERS.map((cluster) => this.getSnapshot(cluster));
  }

  start(intervalMs = 15_000): void {
    if (this.timer) return;

    void this.pollAll();

    this.timer = setInterval(() => {
      void this.pollAll();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async pollAll(): Promise<void> {
    // Prevent overlapping polling cycles.
    if (this.pollInProgress) return;

    this.pollInProgress = true;

    try {
      await Promise.all(
        LIVE_CLUSTERS.map((cluster) => this.pollCluster(cluster)),
      );
    } finally {
      this.pollInProgress = false;
    }
  }

  private async rpc<T>(
    cluster: LiveCluster,
    method: string,
    params: unknown[] = [],
  ): Promise<T> {
    let response: Response;

    try {
      response = await this.fetcher(this.endpoints[cluster], {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new RpcCallError("RPC_UNAVAILABLE");
    }

    if (response.status === 429) {
      throw new RpcCallError("RPC_RATE_LIMITED");
    }

    if (!response.ok) {
      throw new RpcCallError("RPC_UNAVAILABLE");
    }

    let payload: RpcResponse<T>;

    try {
      payload = (await response.json()) as RpcResponse<T>;
    } catch {
      throw new RpcCallError("RPC_INVALID_RESPONSE");
    }

    if (payload.error) {
        throw new RpcCallError(
            payload.error.code === -32601
            ? "METHOD_UNSUPPORTED"
            : "RPC_ERROR",
            payload.error.code,
        );
    }

    if (!("result" in payload)) {
      throw new RpcCallError("RPC_INVALID_RESPONSE");
    }

    return payload.result as T;
  }

  private async pollCluster(cluster: LiveCluster): Promise<void> {
    const previous = this.getSnapshot(cluster);
    const updatedAt = new Date(this.now()).toISOString();

    const [certificateResult, processedResult, finalizedResult] =
      await Promise.allSettled([
        this.rpc<GenesisCertificate | null>(
          cluster,
          "getAgGenesisCert",
        ),
        this.rpc<number>(cluster, "getSlot", [
          { commitment: "processed" },
        ]),
        this.rpc<number>(cluster, "getSlot", [
          { commitment: "finalized" },
        ]),
      ]);

    let consensusStatus: ConsensusStatus = previous.consensus.status;
    let certificateSlot = previous.consensus.certificateSlot;
    let consensusError: string | null = previous.consensus.error;

    if (certificateResult.status === "fulfilled") {
      const certificate = certificateResult.value;

      consensusStatus = certificate ? "active" : "not_migrated";
      certificateSlot =
        typeof certificate?.block?.slot === "number"
          ? certificate.block.slot
          : null;
      consensusError = null;
    } else {
      const error = certificateResult.reason;

      if (error instanceof RpcCallError && error.code === -32601) {
        consensusStatus = "unsupported";
        consensusError = "METHOD_UNSUPPORTED";
        certificateSlot = null;
      } else {
        // Preserve the last known consensus status on transient errors.
        consensusError =
          error instanceof RpcCallError
            ? error.message
            : "RPC_ERROR";
      }
    }

    const processed =
      processedResult.status === "fulfilled" &&
      Number.isSafeInteger(processedResult.value)
        ? processedResult.value
        : null;

    const finalized =
      finalizedResult.status === "fulfilled" &&
      Number.isSafeInteger(finalizedResult.value)
        ? finalizedResult.value
        : null;

    const slotsError =
      processed !== null && finalized !== null
        ? null
        : [processedResult, finalizedResult].some(
              (result) =>
                result.status === "rejected" &&
                result.reason instanceof RpcCallError &&
                result.reason.message === "RPC_RATE_LIMITED",
            )
          ? "RPC_RATE_LIMITED"
          : "SLOT_DATA_UNAVAILABLE";

    const slotsAvailable = processed !== null && finalized !== null;

    const health: ObserverHealth = !slotsAvailable
      ? "offline"
      : consensusError
        ? "degraded"
        : "online";

    const snapshot: LiveSnapshot = {
      cluster,
      health,
      consensus: {
        status: consensusStatus,
        certificateSlot,
        error: consensusError,
      },
      slots: {
        processed,
        finalized,
        lag:
          processed !== null && finalized !== null
            ? Math.max(0, processed - finalized)
            : null,
        error: slotsError,
      },
      updatedAt,
      lastSuccessAt: slotsAvailable
        ? updatedAt
        : previous.lastSuccessAt,
    };

    this.snapshots.set(cluster, snapshot);
  }
}
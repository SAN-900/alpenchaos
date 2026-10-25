
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, readApiError } from "../../lib/api";

type Cluster = "devnet" | "testnet" | "mainnet";

type ConsensusStatus =
  | "active"
  | "not_migrated"
  | "unsupported"
  | "unavailable";

type ObserverHealth = "online" | "degraded" | "offline";

interface LiveSnapshot {
  cluster: Cluster;
  health: ObserverHealth;
  consensus: {
    status: ConsensusStatus;
    certificateSlot: number | null;
    error: string | null;
  };
  slots: {
    processed: number | null;
    finalized: number | null;
    lag: number | null;
    error: string | null;
  };
  updatedAt: string;
  lastSuccessAt: string | null;
}

const CLUSTERS: Cluster[] = ["devnet", "testnet", "mainnet"];
const CONSENSUS_STATUSES: ConsensusStatus[] = [
  "active",
  "not_migrated",
  "unsupported",
  "unavailable",
];
const OBSERVER_HEALTH: ObserverHealth[] = ["online", "degraded", "offline"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function parseSnapshot(value: unknown): LiveSnapshot | undefined {
  if (!isRecord(value) || !CLUSTERS.includes(value.cluster as Cluster) ||
    !OBSERVER_HEALTH.includes(value.health as ObserverHealth) ||
    !isRecord(value.consensus) || !isRecord(value.slots) ||
    typeof value.updatedAt !== "string" ||
    !(typeof value.lastSuccessAt === "string" || value.lastSuccessAt === null)) return;

  const consensus = value.consensus;
  const slots = value.slots;
  if (!CONSENSUS_STATUSES.includes(consensus.status as ConsensusStatus) ||
    !isNullableNumber(consensus.certificateSlot) ||
    !(typeof consensus.error === "string" || consensus.error === null) ||
    !isNullableNumber(slots.processed) || !isNullableNumber(slots.finalized) ||
    !isNullableNumber(slots.lag) ||
    !(typeof slots.error === "string" || slots.error === null)) return;

  return {
    cluster: value.cluster as Cluster,
    health: value.health as ObserverHealth,
    consensus: {
      status: consensus.status as ConsensusStatus,
      certificateSlot: consensus.certificateSlot,
      error: consensus.error,
    },
    slots: {
      processed: slots.processed,
      finalized: slots.finalized,
      lag: slots.lag,
      error: slots.error,
    },
    updatedAt: value.updatedAt,
    lastSuccessAt: value.lastSuccessAt,
  };
}

const CONSENSUS_LABELS: Record<ConsensusStatus, string> = {
  active: "Certificate observed",
  not_migrated: "Certificate not observed",
  unsupported: "RPC method unsupported",
  unavailable: "Status unavailable",
};

function formatNumber(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString();
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "Never";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleTimeString();
}

function formatAge(timestamp: string | null | undefined): string {
  if (!timestamp) return "Unknown";

  const time = new Date(timestamp).getTime();

  if (!Number.isFinite(time)) return "Unknown";

  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));

  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes}m ago`;

  return `${Math.floor(minutes / 60)}h ago`;
}

function healthClass(health: ObserverHealth | undefined): string {
  switch (health) {
    case "online":
      return "live-status--success";
    case "degraded":
      return "live-status--warning";
    default:
      return "live-status--neutral";
  }
}

function consensusClass(status: ConsensusStatus | undefined): string {
  switch (status) {
    case "active":
      return "live-status--success";
    case "not_migrated":
      return "live-status--warning";
    default:
      return "live-status--neutral";
  }
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="live-card">
      <p className="live-card-label">{label}</p>
      <p className="live-card-value">{value}</p>
      <p className="live-card-detail">{detail}</p>
    </article>
  );
}

function SlotLagChart({ values }: { values: number[] }) {
  const width = 600;
  const height = 180;
  const padding = 12;

  if (values.length < 2) {
    return (
      <div className="live-chart-empty">
        Waiting for more samples to draw the chart…
      </div>
    );
  }

  const maxValue = Math.max(1, ...values);

  const points = values
    .map((value, index) => {
      const x =
        padding +
        (index / (values.length - 1)) * (width - padding * 2);

      const y =
        height -
        padding -
        (value / maxValue) * (height - padding * 2);

      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = [
    `${padding},${height - padding}`,
    points,
    `${width - padding},${height - padding}`,
  ].join(" ");

  return (
    <svg
      className="live-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Recent processed versus finalized slot lag"
    >
      {[0, 1, 2, 3].map((line) => {
        const y =
          padding + (line / 3) * (height - padding * 2);

        return (
          <line
            key={line}
            x1={padding}
            y1={y}
            x2={width - padding}
            y2={y}
            className="live-chart-gridline"
          />
        );
      })}

      <polygon points={areaPoints} className="live-chart-area" />

      <polyline
        points={points}
        className="live-chart-line"
      />

      <circle
        cx={width - padding}
        cy={Number(points.split(" ").at(-1)?.split(",")[1] ?? height / 2)}
        r="4"
        className="live-chart-point"
      />
    </svg>
  );
}

export default function LivePage() {
  const [cluster, setCluster] = useState<Cluster>("devnet");
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);

    try {
      const response = await fetch(
        apiUrl(`/live?cluster=${encodeURIComponent(cluster)}`),
        { cache: "no-store", signal: controller.signal },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload: unknown = await response.json();
      const data = parseSnapshot(payload);

      if (!data) {
        throw new Error("The observer API returned an invalid snapshot.");
      }
      if (data.cluster !== cluster) {
        throw new Error("The API returned an unexpected cluster.");
      }

      if (controller.signal.aborted) return;
      setSnapshot(data);
      setRequestError(null);
      setLastFetchedAt(Date.now());

      const lag = data.slots.lag;
      if (lag !== null) {
        setHistory((previous) => [...previous, lag].slice(-30));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setRequestError(
        error instanceof Error
          ? error.message
          : "Unable to reach the observer.",
      );
    } finally {
      if (!controller.signal.aborted && requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [cluster]);

  useEffect(() => {
    setSnapshot(null);
    setHistory([]);
    setLastFetchedAt(null);
    setRequestError(null);

    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, 15_000);

    const clockInterval = window.setInterval(() => {
      setClock(Date.now());
    }, 5_000);

    return () => {
      requestRef.current?.abort();
      window.clearInterval(interval);
      window.clearInterval(clockInterval);
    };
  }, [cluster, refresh]);

  const stale =
    lastFetchedAt !== null && clock - lastFetchedAt > 45_000;

  const observationAge = snapshot
    ? formatAge(snapshot.updatedAt)
    : "Waiting";

  return (
    <main className="live-page">
      <header className="live-header">
        <div className="live-heading">
          <div className="live-badges">
            <span className="live-eyebrow">LIVE OBSERVER</span>
            <span className="live-readonly">
              <span className="live-readonly-dot" />
              Read-only · No transactions sent
            </span>
          </div>

          <h1>
            Solana network
            <span>observability</span>
          </h1>

          <p>
            Inspect RPC-reported consensus certificate status and slot
            progress. Live network observations are separate from
            deterministic AlpenChaos simulations.
          </p>
        </div>

        <div className="live-cluster-control">
          <label htmlFor="live-cluster">Network cluster</label>
          <select
            id="live-cluster"
            value={cluster}
            onChange={(event) => setCluster(event.target.value as Cluster)}
          >
            {CLUSTERS.map((item) => (
              <option key={item} value={item}>
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </option>
            ))}
          </select>
          <span className="live-control-hint">
            Switch between Solana clusters
          </span>
        </div>
      </header>

      {requestError && (
        <div className="live-error" role="alert">
          <div className="live-error-title">
            <span aria-hidden="true">!</span>
            Unable to refresh live data
          </div>
          <p>{requestError}</p>
          <p className="live-error-hint">
            Check that the backend is running, the API URL is configured,
            and the selected RPC endpoint is responding.
          </p>
          <button
            type="button"
            className="live-button live-button--compact"
            onClick={() => void refresh()}
            disabled={loading}
          >
            Retry request
          </button>
        </div>
      )}

      <section className="live-section">
        <div className="live-section-heading">
          <div>
            <p className="live-section-kicker">NETWORK TELEMETRY</p>
            <h2>Current snapshot</h2>
          </div>
          <span
            className={`live-status ${stale ? "live-status--warning" : "live-status--neutral"}`}
          >
            <span className="live-status-dot" />
            {loading && !snapshot
              ? "Connecting"
              : stale
                ? "Possibly stale"
                : "Auto-refresh · 15s"}
          </span>
        </div>

        <div className="live-metrics">
          <MetricCard
            label="Processed slot"
            value={formatNumber(snapshot?.slots.processed)}
            detail="Latest processed slot reported by RPC"
          />
          <MetricCard
            label="Finalized slot"
            value={formatNumber(snapshot?.slots.finalized)}
            detail="Latest finalized slot reported by RPC"
          />
          <MetricCard
            label="Slot lag"
            value={
              snapshot?.slots.lag == null
                ? "—"
                : `${formatNumber(snapshot.slots.lag)} slots`
            }
            detail="Processed slot minus finalized slot"
          />
          <MetricCard
            label="Certificate slot"
            value={formatNumber(snapshot?.consensus.certificateSlot)}
            detail="Slot reported in the genesis certificate, when available"
          />
        </div>
      </section>

      <section className="live-panels">
        <article className="live-panel">
          <div className="live-panel-header">
            <div>
              <p className="live-section-kicker">RECENT OBSERVATIONS</p>
              <h2>Slot lag history</h2>
              <p className="live-panel-description">
                Recent samples collected while this page is open.
              </p>
            </div>
            <span className="live-sample-count">
              {history.length} / 30 samples
            </span>
          </div>

          <SlotLagChart values={history} />

          <div className="live-chart-legend">
            <span className="live-chart-legend-dot" />
            <span>Processed-to-finalized slot difference</span>
          </div>

          <p className="live-footnote">
            This chart shows slot-count lag, not consensus finality time.
            Samples are not retained as historical data after leaving the page.
          </p>
        </article>

        <article className="live-panel">
          <div className="live-panel-header">
            <div>
              <p className="live-section-kicker">RPC HEALTH</p>
              <h2>Consensus status</h2>
              <p className="live-panel-description">
                Status derived from the selected RPC endpoint's response.
              </p>
            </div>
          </div>

          <div className="live-consensus-summary">
            <span
              className={`live-status ${consensusClass(snapshot?.consensus.status)}`}
            >
              {snapshot
                ? CONSENSUS_LABELS[snapshot.consensus.status]
                : "Awaiting observation"}
            </span>
            <span className="live-consensus-cluster">
              {cluster.toUpperCase()}
            </span>
          </div>

          <div className="live-details">
            <div className="live-detail-row">
              <span>Observer health</span>
              <span
                className={`live-status ${healthClass(snapshot?.health)}`}
              >
                {snapshot?.health ?? "Unknown"}
              </span>
            </div>

            <div className="live-detail-row">
              <span>Last RPC success</span>
              <strong>
                {formatTime(snapshot?.lastSuccessAt)}
              </strong>
            </div>

            <div className="live-detail-row">
              <span>Last observer update</span>
              <strong>{formatTime(snapshot?.updatedAt)}</strong>
            </div>

            <div className="live-detail-row">
              <span>Observation age</span>
              <strong>{observationAge}</strong>
            </div>

            <div className="live-detail-row">
              <span>Frontend fetch</span>
              <strong>
                {lastFetchedAt
                  ? `${Math.max(0, Math.floor((clock - lastFetchedAt) / 1000))}s ago`
                  : "Never"}
              </strong>
            </div>
          </div>

          {snapshot?.consensus.error && (
            <p className="live-warning">
              Consensus check: {snapshot.consensus.error}
            </p>
          )}

          {snapshot?.slots.error && (
            <p className="live-warning">
              Slot check: {snapshot.slots.error}
            </p>
          )}

          <button
            type="button"
            className="live-button"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh observations"}
          </button>
        </article>
      </section>

      <section className="live-panel live-comparison">
        <div className="live-panel-header">
          <div>
            <p className="live-section-kicker">SIMULATION × REALITY</p>
            <h2>Model versus reality</h2>
          </div>
          <span className="live-status live-status--neutral">
            Not connected yet
          </span>
        </div>

        <p className="live-panel-description live-comparison-copy">
          This section is reserved for comparing deterministic AlpenChaos
          simulation outputs with measured network observations. The
          comparison engine is not connected yet. No comparison results are
          being calculated or implied.
        </p>

        <div className="live-comparison-grid">
          <div className="live-comparison-item">
            <span>AlpenChaos simulation</span>
            <strong>Deterministic model</strong>
            <p>Controlled scenarios and fault injection in simulation only.</p>
          </div>
          <div className="live-comparison-item">
            <span>Solana live observer</span>
            <strong>Read-only RPC data</strong>
            <p>Reported slot progress and certificate-method responses.</p>
          </div>
        </div>
      </section>

      <footer className="live-footer">
        <span className="live-footer-mark">ALPENCHAOS</span>
        <p>
          Read-only telemetry. Certificate status reflects the RPC method
          response; it is not an independent audit of network consensus.
          Slot lag is not a direct measurement of finality latency.
        </p>
        <p className="live-footer-updated">
          Selected cluster: {cluster} · Observer response age: {observationAge}
        </p>
      </footer>
    </main>
  );
}

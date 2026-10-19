import type { Frame } from "../sim/driver";
import { describeOutcome, fmtClock } from "../sim/format";

/** What became of each scripted transaction, under both protocols. */
export function TxPanel({ frame }: { frame: Frame }) {
  if (frame.txs.length === 0) return null;
  return (
    <section className="block">
      <header className="block-head">
        <h2>Transactions</h2>
        <span className="hint">Alpenglow · Legacy</span>
      </header>
      <ul className="txs">
        {frame.txs.map((t) => {
          const ag = describeOutcome(t.ag);
          const tb = describeOutcome(t.tb);
          return (
            <li key={t.id}>
              <div className="tx-id">
                <strong>{t.id}</strong>
                <span className="hint">sent {fmtClock(t.sentAt)}</span>
              </div>
              <span className={`pill ${ag.tone}`}>{ag.label}</span>
              <span className={`pill ${tb.tone}`}>{tb.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

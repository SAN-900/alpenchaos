import type { Frame, TimelineEvent } from "../sim/driver";
import { fmtClock } from "../sim/format";

function lastOf(events: TimelineEvent[], kind: TimelineEvent["kind"]): TimelineEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) if (events[i]!.kind === kind) return events[i];
  return undefined;
}

/** One line that says what is going on right now. Re-keyed so it fades in on every change. */
export function Caption({ frame, idle }: { frame: Frame; idle: string }) {
  const note = lastOf(frame.events, "annotation");
  const fault = lastOf(frame.events, "fault");
  return (
    <div className="caption" aria-live="polite">
      {note ? (
        <div key={`${note.at}-${note.title}`} className="fade">
          <strong>{note.title}</strong>
          <span>{note.text}</span>
        </div>
      ) : (
        <div className="fade idle">{idle}</div>
      )}
      {fault && (
        <span key={`${fault.at}-${fault.title}`} className="chip fade">
          {fmtClock(fault.at)} · {fault.title}
        </span>
      )}
    </div>
  );
}

/** Everything that has happened so far, tucked away until asked for. */
export function EventLog({ frame }: { frame: Frame }) {
  if (frame.events.length === 0) return null;
  const events = [...frame.events].reverse();
  return (
    <details className="more">
      <summary>Timeline ({events.length})</summary>
      <ol className="log">
        {events.map((e, i) => (
          <li key={`${e.at}-${e.kind}-${e.title}-${i}`} className={e.kind}>
            <time>{fmtClock(e.at)}</time>
            <span>
              <strong>{e.title}</strong>
              {e.text ? ` · ${e.text}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

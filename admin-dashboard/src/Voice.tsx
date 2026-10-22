import { useEffect, useState } from 'react';
import { ApiError, callAdmin, type Concurrency, type DeepgramBalance, type VoiceUsage } from './api';
import { Banner, formatWhen, num, Stat, usd } from './ui';

const PERIODS = [7, 30, 90] as const;
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

type Result<T> = { data: T } | { error: string; status?: number } | null;

function useAdmin<T>(fn: string, body: Record<string, unknown>, deps: unknown[]): Result<T> {
  const [result, setResult] = useState<Result<T>>(null);
  useEffect(() => {
    let live = true;
    setResult(null);
    callAdmin<T>(fn, body)
      .then((data) => live && setResult({ data }))
      .catch((e) => live && setResult({ error: (e as Error).message, status: e instanceof ApiError ? e.status : undefined }));
    return () => { live = false; };
  }, deps);
  return result;
}

export default function Voice() {
  const [days, setDays] = useState<number>(30);
  const balance = useAdmin<DeepgramBalance>('admin-deepgram', {}, []);
  const usage = useAdmin<VoiceUsage>('admin-stats', { action: 'voice_usage', days, tz }, [days]);
  const conc = useAdmin<Concurrency>('admin-stats', { action: 'concurrency', hours: 72 }, []);

  const dailyCost = usage && 'data' in usage ? usage.data.totals.cost / days : null;
  const credit = balance && 'data' in balance ? balance.data.total_usd : null;
  const runwayDays = credit !== null && dailyCost ? credit / dailyCost : null;

  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <div>
          <h1>Voice & Deepgram</h1>
          <p className="muted">Voice journaling is transcribed live by Deepgram. Cost is estimated from minutes of audio.</p>
        </div>
        <a className="btn ghost" href="https://console.deepgram.com/" target="_blank" rel="noreferrer">Open Deepgram console ↗</a>
      </div>

      <section className="card">
        <h2>Deepgram credit</h2>
        {balance === null && <p className="muted">Loading…</p>}
        {balance && 'error' in balance && (
          balance.status === 501
            ? <Banner kind="warn">Credit can't be shown yet. Add a Deepgram key with billing read access as the <code>DEEPGRAM_BILLING_KEY</code> secret in Supabase.</Banner>
            : <Banner kind="error">{balance.error}</Banner>
        )}
        {balance && 'data' in balance && (
          <div className="stats">
            <Stat label="Credit left" value={usd(balance.data.total_usd)} sub={balance.data.project_name ?? undefined} />
            <Stat
              label="Lasts about"
              value={runwayDays === null ? '—' : runwayDays > 999 ? '999+ days' : `${num(runwayDays)} days`}
              sub={dailyCost ? `at ${usd(dailyCost)}/day (last ${days} days)` : 'no recent usage'}
            />
          </div>
        )}
      </section>

      <section className="card">
        <div className="row between wrap">
          <h2>Usage</h2>
          <div className="seg" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button key={p} className={days === p ? 'on' : ''} onClick={() => setDays(p)}>{p} days</button>
            ))}
          </div>
        </div>
        {usage === null && <p className="muted">Loading…</p>}
        {usage && 'error' in usage && <Banner kind="error">{usage.error}</Banner>}
        {usage && 'data' in usage && (
          <>
            <div className="stats">
              <Stat label="Audio minutes" value={num(usage.data.totals.minutes)} />
              <Stat label="Estimated cost" value={usd(usage.data.totals.cost)} sub={`${usd(usage.data.rates.en, 4)}/min English`} />
              <Stat label="Recordings" value={num(usage.data.totals.sessions)} />
              <Stat label="People recording" value={num(usage.data.unique_users)} />
            </div>
            <MinutesChart rows={usage.data.per_day} />
            <p className="small muted">Counts start from when voice-session logging was deployed. Deepgram's console has the exact bill.</p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Recording at the same time</h2>
        <p className="muted small">Deepgram limits how many live recordings can run at once. Past the limit, new recordings fail.</p>
        {conc === null && <p className="muted">Loading…</p>}
        {conc && 'error' in conc && <Banner kind="error">{conc.error}</Banner>}
        {conc && 'data' in conc && (
          <>
            <div className="stats">
              <Stat label="Right now" value={num(conc.data.active_now)} />
              <Stat label="Busiest, last 3 days" value={`${num(conc.data.peak_overall)} of ${num(conc.data.limit)}`} />
              <Stat label="Failed to start, last 3 days" value={num(conc.data.rejected_total)} />
            </div>
            {conc.data.peak_overall >= conc.data.limit * 0.8 && (
              <Banner kind="warn">You're close to the limit. Ask Deepgram to raise it before more recordings fail.</Banner>
            )}
            {!!conc.data.recent_rejections?.length && (
              <details className="fold">
                <summary>Recent failed starts</summary>
                <ul className="plain small">
                  {conc.data.recent_rejections.map((r, i) => (
                    <li key={i}><span className="muted">{formatWhen(r.at)}</span> · {r.reason ?? 'No reason given'}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function MinutesChart({ rows }: { rows: VoiceUsage['per_day'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...rows.map((r) => r.minutes), 1);
  const W = 720, H = 160, gap = rows.length > 60 ? 1 : 2;
  const bw = (W - gap * (rows.length - 1)) / rows.length;
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const active = hover !== null ? rows[hover] : null;

  return (
    <figure className="chart">
      <figcaption className="small muted">
        {active
          ? <><strong>{fmt(active.day)}</strong> · {num(active.minutes, 1)} min · {num(active.sessions)} recordings · {usd(active.cost)}</>
          : 'Audio minutes per day'}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Audio minutes per day" onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="axis" />
        {rows.map((r, i) => {
          const h = Math.max((r.minutes / max) * (H - 8), r.minutes > 0 ? 2 : 0);
          return (
            <g key={r.day} onMouseEnter={() => setHover(i)}>
              <rect x={i * (bw + gap)} y={0} width={bw + gap} height={H} fill="transparent" />
              <rect x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={Math.min(3, bw / 2)} className={hover === i ? 'bar on' : 'bar'} />
            </g>
          );
        })}
      </svg>
      <div className="chart-axis small muted">
        <span>{fmt(rows[0].day)}</span>
        <span>max {num(max, 1)} min/day</span>
        <span>{fmt(rows[rows.length - 1].day)}</span>
      </div>
    </figure>
  );
}

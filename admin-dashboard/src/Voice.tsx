import { useEffect, useState } from 'react';
import { ApiError, callAdmin, type DeepgramBalance, type DeepgramUsage } from './api';
import { Banner, num, Stat, usd } from './ui';

const PERIODS = [7, 30, 90] as const;

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
  const usage = useAdmin<DeepgramUsage>('admin-deepgram', { action: 'usage', days }, [days]);

  const needsKey = (balance && 'error' in balance && balance.status === 501) || (usage && 'error' in usage && usage.status === 501);
  const dailyCost = usage && 'data' in usage && !usage.data.cost_error ? usage.data.totals.cost / days : null;
  const credit = balance && 'data' in balance ? balance.data.total_usd : null;
  const runwayDays = credit !== null && dailyCost ? credit / dailyCost : null;

  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <div>
          <h1>Voice & Deepgram</h1>
          <p className="muted">Voice journaling is transcribed live by Deepgram. These numbers come straight from your Deepgram account.</p>
        </div>
        <a className="btn ghost" href="https://console.deepgram.com/" target="_blank" rel="noreferrer">Open Deepgram console ↗</a>
      </div>

      {needsKey && (
        <Banner kind="warn">
          To show credit and usage, add a Deepgram key with billing read access (Admin or Owner role) as the{' '}
          <code>DEEPGRAM_BILLING_KEY</code> secret in Supabase.
        </Banner>
      )}

      <section className="card">
        <h2>Deepgram credit</h2>
        {balance === null && <p className="muted">Loading…</p>}
        {balance && 'error' in balance && !needsKey && <Banner kind="error">{balance.error}</Banner>}
        {balance && 'error' in balance && needsKey && <p className="muted small">Waiting for the billing key.</p>}
        {balance && 'data' in balance && (
          <div className="stats">
            <Stat label="Credit left" value={usd(balance.data.total_usd)} sub={balance.data.project_name ?? undefined} />
            <Stat
              label="Lasts about"
              value={runwayDays === null ? '—' : runwayDays > 999 ? '999+ days' : `${num(runwayDays)} days`}
              sub={dailyCost ? `at ${usd(dailyCost)}/day (last ${days} days)` : 'no spend in this period'}
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
        {usage && 'error' in usage && !needsKey && <Banner kind="error">{usage.error}</Banner>}
        {usage && 'error' in usage && needsKey && <p className="muted small">Waiting for the billing key.</p>}
        {usage && 'data' in usage && (
          <>
            <div className="stats">
              <Stat label="Audio minutes" value={num(usage.data.totals.minutes)} />
              <Stat
                label="Cost"
                value={usage.data.cost_error ? '—' : usd(usage.data.totals.cost)}
                sub={usage.data.cost_error ? 'Deepgram didn\'t return cost' : 'as billed by Deepgram'}
              />
              <Stat label="Live connections" value={num(usage.data.totals.requests)} sub="a long recording can use several" />
            </div>
            {usage.data.cost_error && <Banner kind="warn">{usage.data.cost_error}</Banner>}
            {usage.data.per_day && <MinutesChart rows={usage.data.per_day} />}
            <p className="small muted">Days are in UTC, as Deepgram reports them. The last day may still be filling in.</p>
          </>
        )}
      </section>
    </div>
  );
}

function MinutesChart({ rows }: { rows: NonNullable<DeepgramUsage['per_day']> }) {
  const [hover, setHover] = useState<number | null>(null);
  const peak = Math.max(...rows.map((r) => r.minutes), 0);
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  if (peak === 0) {
    return <div className="chart-empty muted small">No voice recordings between {fmt(rows[0].day)} and {fmt(rows[rows.length - 1].day)}.</div>;
  }

  const W = 720, H = 160, gap = rows.length > 60 ? 1 : 2;
  const bw = (W - gap * (rows.length - 1)) / rows.length;
  const active = hover !== null ? rows[hover] : null;

  return (
    <figure className="chart">
      <figcaption className="small muted">
        {active
          ? <><strong>{fmt(active.day)}</strong> · {num(active.minutes, 1)} min · {num(active.requests)} connections · {usd(active.cost)}</>
          : 'Audio minutes per day'}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Audio minutes per day" onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="axis" />
        {rows.map((r, i) => {
          const h = Math.max((r.minutes / peak) * (H - 8), r.minutes > 0 ? 2 : 0);
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
        <span>busiest day {num(peak, 1)} min</span>
        <span>{fmt(rows[rows.length - 1].day)}</span>
      </div>
    </figure>
  );
}

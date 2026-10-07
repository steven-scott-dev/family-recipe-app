import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// Hidden admin dashboard. Rendered by App.jsx when the URL hash is #stats
// (open https://family-recipe-app-puce.vercel.app/#stats while signed in).
// Reads aggregate-only views (no per-user data) created by
// supabase/migrations/20251007_stats_views.sql.

const TRIPWIRE_PCT = 20; // Stripe goes in at 20%+ week-2 retention

function fmtWeek(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400 font-bold">{label}</div>
      <div className="text-2xl font-extrabold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function StatsDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totals, setTotals] = useState(null);
  const [weekly, setWeekly] = useState([]);
  const [retention, setRetention] = useState([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, w, r] = await Promise.all([
        supabase.from('stats_totals').select('*').single(),
        supabase.from('stats_weekly').select('*').order('week', { ascending: true }),
        supabase.from('stats_retention').select('*').order('cohort_week', { ascending: true }),
      ]);
      if (t.error) throw t.error;
      if (w.error) throw w.error;
      if (r.error) throw r.error;
      setTotals(t.data);
      setWeekly(w.data || []);
      setRetention(r.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <p className="text-slate-500 text-sm text-center py-10">Loading stats…</p>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-300 text-red-800 p-4 rounded-xl text-sm space-y-2">
        <p className="font-bold">Couldn't load stats</p>
        <p className="text-xs break-words">{error}</p>
        <p className="text-xs">
          If the views don't exist yet, run{' '}
          <code className="bg-red-100 px-1 rounded">supabase/migrations/20251007_stats_views.sql</code>{' '}
          in the Supabase SQL editor, then tap refresh.
        </p>
        <button onClick={load} className="bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
          Refresh
        </button>
      </div>
    );
  }

  // Overall week-2 retention across all cohorts (latest cohort may still be maturing)
  const totalUsers = retention.reduce((a, c) => a + Number(c.users), 0);
  const totalReturned = retention.reduce((a, c) => a + Number(c.returned_users), 0);
  const overallRetention = totalUsers > 0 ? (100 * totalReturned) / totalUsers : 0;
  const tripwireHit = overallRetention >= TRIPWIRE_PCT;

  const maxPlans = Math.max(1, ...weekly.map((w) => Number(w.plans)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Live from Supabase · updates on every visit</p>
        <button
          onClick={load}
          className="text-xs font-bold text-emerald-700 border border-emerald-300 bg-emerald-50 rounded-lg px-3 py-1.5"
        >
          Refresh
        </button>
      </div>

      {/* Headline stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Families" value={totals?.total_users ?? 0} sub="ever generated a plan" />
        <StatCard label="Plans · 7d" value={totals?.plans_7d ?? 0} sub="generated this week" />
        <StatCard label="Saves · 30d" value={totals?.saves_30d ?? 0} sub="plans saved" />
        <StatCard
          label="Avg plan cost"
          value={totals?.avg_cost_30d != null ? `$${Number(totals.avg_cost_30d).toFixed(2)}` : '—'}
          sub="last 30 days"
        />
      </div>

      {/* THE tripwire */}
      <div className={`rounded-xl border p-4 shadow-sm ${tripwireHit ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'}`}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-extrabold text-slate-800">Week-2 retention</h2>
          <span className="text-[11px] font-bold text-slate-400">Stripe tripwire: {TRIPWIRE_PCT}%</span>
        </div>
        <div className="flex items-end gap-2 mt-2">
          <span className={`text-4xl font-extrabold ${tripwireHit ? 'text-emerald-700' : 'text-slate-900'}`}>
            {overallRetention.toFixed(1)}%
          </span>
          <span className="text-xs text-slate-500 pb-1.5">
            {totalReturned} of {totalUsers} families came back a later week
          </span>
        </div>
        <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden mt-2 relative">
          <div
            className={`h-full rounded-full ${tripwireHit ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min(overallRetention, 100)}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-slate-900"
            style={{ left: `${TRIPWIRE_PCT}%` }}
            title="Stripe tripwire"
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {tripwireHit
            ? 'Tripwire hit — green light for Stripe.'
            : totalUsers === 0
              ? 'No data yet — numbers appear once families generate plans.'
              : 'Below the tripwire. Latest cohort may still be maturing (needs a full week).'}
        </p>
      </div>

      {/* Weekly activity chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h2 className="text-sm font-extrabold text-slate-800 mb-1">Plans generated per week</h2>
        <p className="text-[11px] text-slate-400 mb-3">Last 8 weeks · number = active families</p>
        {weekly.length === 0 ? (
          <p className="text-xs text-slate-500">No weekly data yet.</p>
        ) : (
          <div className="flex items-end gap-2 h-36">
            {weekly.map((w) => (
              <div key={w.week} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="text-[10px] font-bold text-slate-600">{w.plans}</span>
                <div
                  className="w-full bg-emerald-500 rounded-t-md min-h-[4px]"
                  style={{ height: `${Math.max(4, (Number(w.plans) / maxPlans) * 100)}%` }}
                  title={`${w.plans} plans, ${w.active_users} families`}
                />
                <span className="text-[10px] text-slate-400 mt-1">{fmtWeek(w.week)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Engagement table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h2 className="text-sm font-extrabold text-slate-800 mb-3">Engagement by week</h2>
        {weekly.length === 0 ? (
          <p className="text-xs text-slate-500">No data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 uppercase text-[10px]">
                  <th className="pb-2 pr-2">Week</th>
                  <th className="pb-2 pr-2 text-right">Families</th>
                  <th className="pb-2 pr-2 text-right">Generated</th>
                  <th className="pb-2 pr-2 text-right">Saved</th>
                  <th className="pb-2 text-right">Loaded</th>
                </tr>
              </thead>
              <tbody>
                {[...weekly].reverse().map((w) => (
                  <tr key={w.week} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 font-bold">{fmtWeek(w.week)}</td>
                    <td className="py-1.5 pr-2 text-right">{w.active_users}</td>
                    <td className="py-1.5 pr-2 text-right">{w.plans}</td>
                    <td className="py-1.5 pr-2 text-right">{w.saves}</td>
                    <td className="py-1.5 text-right">{w.loads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Retention by cohort */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h2 className="text-sm font-extrabold text-slate-800 mb-3">Retention by cohort</h2>
        {retention.length === 0 ? (
          <p className="text-xs text-slate-500">No cohorts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 uppercase text-[10px]">
                  <th className="pb-2 pr-2">Cohort</th>
                  <th className="pb-2 pr-2 text-right">Families</th>
                  <th className="pb-2 pr-2 text-right">Returned</th>
                  <th className="pb-2 text-right">Retention</th>
                </tr>
              </thead>
              <tbody>
                {[...retention].reverse().map((c) => (
                  <tr key={c.cohort_week} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 font-bold">{fmtWeek(c.cohort_week)}</td>
                    <td className="py-1.5 pr-2 text-right">{c.users}</td>
                    <td className="py-1.5 pr-2 text-right">{c.returned_users}</td>
                    <td className={`py-1.5 text-right font-bold ${Number(c.retention_pct) >= TRIPWIRE_PCT ? 'text-emerald-600' : ''}`}>
                      {Number(c.retention_pct).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">
          A family counts as retained if they generate a plan in any week after their first.
        </p>
      </div>
    </div>
  );
}

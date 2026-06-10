'use client';

import { useEffect, useState, useCallback } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface DayData {
  date: string;
  count: number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  date: string;
  count: number;
}

const DAYS_IN_WEEK = 7;
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// `count` is now minutes spent in the app for the day. Tiers:
//   0          → empty
//   1–19       → light
//   20–59      → mid
//   60+        → full
//
// The four step colors are brand-purple alpha ramps tokenised in
// globals.css under --heatmap-step-{0..3}. Both themes render legibly
// because each step composites against the card surface (dark or light)
// via alpha, not a fixed value.
function getColor(minutes: number): string {
  if (minutes === 0) return 'var(--heatmap-step-0)';
  if (minutes < 20) return 'var(--heatmap-step-1)';
  if (minutes < 60) return 'var(--heatmap-step-2)';
  return 'var(--heatmap-step-3)';
}

function formatDate(dateStr: string): string {
  // Cells are keyed by UTC date (to match the server's DATE(minute) group),
  // so format them in UTC as well — otherwise a CEST user hovers "Apr 11"
  // and sees "Apr 10" in the tooltip.
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "2026-04-11" from a Date, using UTC components. */
function toUtcDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface ActivityHeatmapProps {
  /** When set, fetch this user's activity instead of the authed user's. */
  userId?: string;
  /**
   * Window size in weeks. Defaults to the dashboard preset (53 desktop /
   * 26 phone). The profile bento passes ~13 (last 3 months) so the card
   * doesn't dominate the page.
   */
  weeks?: number;
  /** Subtitle override — defaults to "over the last year/6 months". */
  subtitle?: string;
}

export default function ActivityHeatmap({ userId, weeks, subtitle }: ActivityHeatmapProps = {}) {
  const { isPhone } = useBreakpoint();
  const [dayMap, setDayMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    date: '',
    count: 0,
  });

  // Derive grid constants from breakpoint
  const CELL_SIZE = isPhone ? 11 : 13;
  const CELL_GAP = isPhone ? 2 : 3;
  const TOTAL_WEEKS = weeks ?? (isPhone ? 26 : 53);
  // Fetch enough days to cover the requested window plus a buffer for the
  // partial leading week. +14 keeps us safe regardless of which day-of-week
  // today happens to be.
  const FETCH_DAYS = TOTAL_WEEKS * 7 + 14;

  // Defer the setLoading(true) past the effect body so it lands in a
  // microtask rather than synchronously inside the effect, satisfying
  // react-hooks/set-state-in-effect. The fetch chain runs in the same
  // microtask so the loading flag is always set before the response
  // resolves.
  useEffect(() => {
    const url = userId
      ? `/api/user/activity-heatmap?days=${FETCH_DAYS}&userId=${encodeURIComponent(userId)}`
      : `/api/user/activity-heatmap?days=${FETCH_DAYS}`;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      fetch(url)
        .then((r) => r.json())
        .then((res) => {
          if (cancelled) return;
          const data: DayData[] = res?.data?.data ?? res?.data ?? [];
          const map: Record<string, number> = {};
          for (const d of data) {
            map[d.date] = d.count;
          }
          setDayMap(map);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, FETCH_DAYS]);

  // Build the grid: 53 columns x 7 rows, ending today.
  // Everything here is in UTC to stay in lockstep with the server, which
  // buckets minutes via Postgres `DATE("minute")` in UTC. Building the grid
  // in local time would produce an off-by-one for users in non-UTC zones
  // (e.g. CEST → today's cell gets labelled with yesterday's UTC date and
  // today's data disappears).
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayDay = today.getUTCDay(); // 0=Sun, 6=Sat

  // The grid ends on today. The last column contains today.
  const totalDays = (TOTAL_WEEKS - 1) * 7 + todayDay + 1;
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - totalDays + 1);
  const startDay = startDate.getUTCDay();

  // Build cells
  const cells: { date: string; count: number; week: number; day: number }[] = [];
  const monthLabels: { label: string; week: number }[] = [];
  let lastMonth = -1;

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = toUtcDateStr(d);

    // The grid starts from startDate's day-of-week, so offset the column
    // index by startDay to land the first cell in the correct row.
    const adjustedIndex = i + startDay;
    const col = Math.floor(adjustedIndex / 7);
    const row = adjustedIndex % 7;

    cells.push({ date: dateStr, count: dayMap[dateStr] ?? 0, week: col, day: row });

    // Track month labels
    const month = d.getUTCMonth();
    if (month !== lastMonth) {
      monthLabels.push({ label: MONTH_NAMES[month], week: col });
      lastMonth = month;
    }
  }

  // Drop a crowded leading-month label. Real month starts are always ≥4
  // columns apart, so the only pair that can collide is the short leading
  // partial month at the left edge and the first full month right after it
  // (most visibly "Nov"/"Dec" on the 375px grid). When they fall within a
  // label-width of each other, drop the earlier (partial) one so the labels
  // never overlap.
  const colWidth = CELL_SIZE + CELL_GAP;
  const MIN_LABEL_GAP_PX = 28;
  const spacedMonthLabels = monthLabels.filter((m, i) => {
    const next = monthLabels[i + 1];
    return !(next && (next.week - m.week) * colWidth < MIN_LABEL_GAP_PX);
  });

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, date: string, count: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const wrapperRect = e.currentTarget
        .closest('[data-heatmap-wrapper]')
        ?.getBoundingClientRect();
      if (wrapperRect) {
        setTooltip({
          visible: true,
          x: rect.left - wrapperRect.left + CELL_SIZE / 2,
          y: rect.top - wrapperRect.top - 8,
          date,
          count,
        });
      }
    },
    [CELL_SIZE]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const leftPadding = 36;
  const topPadding = 20;
  const gridWidth = TOTAL_WEEKS * (CELL_SIZE + CELL_GAP);
  const gridHeight = DAYS_IN_WEEK * (CELL_SIZE + CELL_GAP);

  return (
    <div
      className="elev-1"
      style={{
        padding: isPhone ? '20px' : '24px 28px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '18px',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--on-surface)',
              margin: '0 0 4px',
            }}
          >
            Activity
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', margin: 0 }}>
            Minutes in the app over the last {subtitle ?? (isPhone ? '6 months' : 'year')}
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 'var(--fs-2xs)',
            color: 'var(--on-surface-variant)',
          }}
        >
          <span>Less</span>
          {[0, 10, 30, 60].map((minutes) => (
            <div
              key={minutes}
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '3px',
                background: getColor(minutes),
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {loading ? (
        <div
          style={{
            height: `${gridHeight + topPadding + 8}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--on-surface-variant)',
            fontSize: '13px',
          }}
        >
          Loading activity...
        </div>
      ) : (
        <div data-heatmap-wrapper style={{ position: 'relative', overflow: 'visible' }}>
          <div
            style={{
              // Always 'auto' so the grid scrolls when the parent card is
              // narrower than the heatmap (e.g. the 720px-capped profile
              // page). On wider containers no scrollbar appears.
              overflowX: 'auto',
              overflowY: 'visible',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div
              data-heatmap-container
              style={{
                position: 'relative',
                width: `${leftPadding + gridWidth}px`,
                height: `${topPadding + gridHeight}px`,
              }}
            >
              {/* Month labels */}
              {spacedMonthLabels.map((m, i) => (
                <div
                  key={`${m.label}-${i}`}
                  style={{
                    position: 'absolute',
                    left: `${leftPadding + m.week * (CELL_SIZE + CELL_GAP)}px`,
                    top: 0,
                    fontSize: 'var(--fs-2xs)',
                    color: 'var(--on-surface-variant)',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.label}
                </div>
              ))}

              {/* Day labels */}
              {DAY_LABELS.map((label, i) =>
                label ? (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: `${topPadding + i * (CELL_SIZE + CELL_GAP) + 1}px`,
                      fontSize: 'var(--fs-2xs)',
                      color: 'var(--on-surface-variant)',
                      fontWeight: 500,
                      width: `${leftPadding - 6}px`,
                      textAlign: 'right',
                    }}
                  >
                    {label}
                  </div>
                ) : null
              )}

              {/* Grid cells */}
              {cells.map((cell) => (
                <div
                  key={cell.date}
                  onMouseEnter={(e) => handleMouseEnter(e, cell.date, cell.count)}
                  onMouseLeave={handleMouseLeave}
                  style={{
                    position: 'absolute',
                    left: `${leftPadding + cell.week * (CELL_SIZE + CELL_GAP)}px`,
                    top: `${topPadding + cell.day * (CELL_SIZE + CELL_GAP)}px`,
                    width: `${CELL_SIZE}px`,
                    height: `${CELL_SIZE}px`,
                    borderRadius: '3px',
                    background: getColor(cell.count),
                    cursor: 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseOver={(e) => {
                    (e.currentTarget as HTMLDivElement).style.opacity = '0.8';
                  }}
                  onMouseOut={(e) => {
                    (e.currentTarget as HTMLDivElement).style.opacity = '1';
                  }}
                />
              ))}
            </div>
          </div>

          {/* Tooltip — rendered outside the scroll container to avoid clipping */}
          {tooltip.visible && (
            <div
              style={{
                position: 'absolute',
                left: `${tooltip.x}px`,
                top: `${tooltip.y}px`,
                transform: 'translate(-50%, -100%)',
                background: 'var(--surface-container-highest)',
                color: 'var(--on-surface)',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                boxShadow: '0 4px 16px var(--bento-rest-shadow)',
                zIndex: 10,
              }}
            >
              <strong>
                {tooltip.count} {tooltip.count === 1 ? 'minute' : 'minutes'}
              </strong>{' '}
              on {formatDate(tooltip.date)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

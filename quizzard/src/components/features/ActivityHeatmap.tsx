'use client';

import { useEffect, useState, useCallback } from 'react';

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

const CELL_SIZE = 13;
const CELL_GAP = 3;
const TOTAL_WEEKS = 53;
const DAYS_IN_WEEK = 7;
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getColor(count: number): string {
  if (count === 0) return '#1a1a2e';
  if (count <= 2) return '#2d1f5e';
  if (count <= 5) return '#6b3fa0';
  return '#ae89ff';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ActivityHeatmap() {
  const [dayMap, setDayMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, date: '', count: 0 });

  useEffect(() => {
    fetch('/api/user/activity-heatmap?days=365')
      .then((r) => r.json())
      .then((res) => {
        const data: DayData[] = res?.data?.data ?? res?.data ?? [];
        const map: Record<string, number> = {};
        for (const d of data) {
          map[d.date] = d.count;
        }
        setDayMap(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Build the grid: 53 columns x 7 rows, ending today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDay = today.getDay(); // 0=Sun, 6=Sat

  // The grid ends on today. The last column contains today.
  // Total cells = TOTAL_WEEKS * 7, but we only show up to today.
  const totalDays = (TOTAL_WEEKS - 1) * 7 + todayDay + 1;
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - totalDays + 1);

  // Build cells
  const cells: { date: string; count: number; week: number; day: number }[] = [];
  const monthLabels: { label: string; week: number }[] = [];
  let lastMonth = -1;

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay();
    const week = Math.floor(i / 7);

    // Adjust: the grid starts from the startDate's day of week
    // We need to calculate the correct column
    const startDay = startDate.getDay();
    const adjustedIndex = i + startDay;
    const col = Math.floor(adjustedIndex / 7);
    const row = adjustedIndex % 7;

    cells.push({ date: dateStr, count: dayMap[dateStr] ?? 0, week: col, day: row });

    // Track month labels
    const month = d.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ label: MONTH_NAMES[month], week: col });
      lastMonth = month;
    }
  }

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>, date: string, count: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const wrapperRect = e.currentTarget.closest('[data-heatmap-wrapper]')?.getBoundingClientRect();
    if (wrapperRect) {
      setTooltip({
        visible: true,
        x: rect.left - wrapperRect.left + CELL_SIZE / 2,
        y: rect.top - wrapperRect.top - 8,
        date,
        count,
      });
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const leftPadding = 36;
  const topPadding = 20;
  const gridWidth = TOTAL_WEEKS * (CELL_SIZE + CELL_GAP);
  const gridHeight = DAYS_IN_WEEK * (CELL_SIZE + CELL_GAP);

  return (
    <div
      style={{
        background: '#161630',
        borderRadius: '24px',
        padding: '24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}>Activity</h3>
          <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0 }}>Your contributions over the last year</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#aaa8c8' }}>
          <span>Less</span>
          {[0, 1, 3, 6].map((count) => (
            <div
              key={count}
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '3px',
                background: getColor(count),
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {loading ? (
        <div style={{ height: `${gridHeight + topPadding + 8}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa8c8', fontSize: '13px' }}>
          Loading activity...
        </div>
      ) : (
        <div data-heatmap-wrapper style={{ position: 'relative', overflow: 'visible' }}>
          <div
            style={{
              overflowX: 'auto',
              overflowY: 'visible',
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
              {monthLabels.map((m, i) => (
                <div
                  key={`${m.label}-${i}`}
                  style={{
                    position: 'absolute',
                    left: `${leftPadding + m.week * (CELL_SIZE + CELL_GAP)}px`,
                    top: 0,
                    fontSize: '11px',
                    color: '#aaa8c8',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.label}
                </div>
              ))}

              {/* Day labels */}
              {DAY_LABELS.map((label, i) => (
                label ? (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: `${topPadding + i * (CELL_SIZE + CELL_GAP) + 1}px`,
                      fontSize: '11px',
                      color: '#aaa8c8',
                      fontWeight: 500,
                      width: `${leftPadding - 6}px`,
                      textAlign: 'right',
                    }}
                  >
                    {label}
                  </div>
                ) : null
              ))}

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
                  onMouseOver={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '0.8'; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
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
                background: '#2a2a4c',
                color: '#e5e3ff',
                padding: '6px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                zIndex: 10,
              }}
            >
              <strong>{tooltip.count} {tooltip.count === 1 ? 'action' : 'actions'}</strong> on {formatDate(tooltip.date)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

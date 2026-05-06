'use client';

import Link from 'next/link';

interface Exam {
  id: string;
  title: string;
  examDate: string;
  notebookId: string;
  notebookName: string;
  studyPlan?: { id: string };
}

interface ExamCountdownProps {
  exam: Exam;
  onGeneratePlan?: (examId: string) => void;
  onDelete?: (examId: string) => void;
}

function getDaysRemaining(examDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exam = new Date(examDate);
  exam.setHours(0, 0, 0, 0);
  return Math.ceil((exam.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyColor(days: number): string {
  if (days < 0) return '#8888a8';
  if (days < 3) return '#f87171';
  if (days < 7) return '#ff8c42';
  if (days <= 14) return '#ffde59';
  return '#4ade80';
}

export default function ExamCountdown({ exam, onGeneratePlan, onDelete }: ExamCountdownProps) {
  const days = getDaysRemaining(exam.examDate);
  const urgencyColor = getUrgencyColor(days);
  const isPast = days < 0;

  return (
    <div
      style={{
        background: '#21213e',
        borderRadius: '16px',
        padding: '20px',
        borderLeft: `4px solid ${urgencyColor}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        transition: 'background 0.25s cubic-bezier(0.22,1,0.36,1)',
        opacity: isPast ? 0.55 : 1,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = '#272746';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = '#21213e';
      }}
    >
      {/* Top row: title + notebook + delete */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h4
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#e5e3ff',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {exam.title}
          </h4>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete exam "${exam.title}"? This cannot be undone.`)) {
                  onDelete(exam.id);
                }
              }}
              title="Delete exam"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: 'rgba(237,233,255,0.25)',
                cursor: 'pointer',
                flexShrink: 0,
                padding: 0,
                transition: 'color 0.15s ease, background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.25)';
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                delete
              </span>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '14px', color: '#aaa8c8' }}
          >
            auto_stories
          </span>
          <span style={{ fontSize: '12px', color: '#aaa8c8', fontWeight: 500 }}>
            {exam.notebookName}
          </span>
        </div>
      </div>

      {/* Days remaining */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        {isPast ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '18px', color: '#8888a8' }}
            >
              event_available
            </span>
            <span style={{ fontSize: '14px', color: '#8888a8', fontWeight: 600 }}>Exam passed</span>
          </div>
        ) : (
          <>
            <span
              style={{
                fontFamily: 'var(--font-brand)',
                fontSize: '36px',
                fontWeight: 400,
                color: urgencyColor,
                lineHeight: 1,
              }}
            >
              {days}
            </span>
            <span style={{ fontSize: '13px', color: '#aaa8c8', fontWeight: 600 }}>
              {days === 1 ? 'day left' : 'days left'}
            </span>
          </>
        )}
      </div>

      {/* Action button */}
      {!isPast && (
        <div>
          {exam.studyPlan ? (
            <Link
              href={`/notebooks/${exam.notebookId}/study-plan`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: 'rgba(174,137,255,0.12)',
                border: '1px solid rgba(174,137,255,0.2)',
                borderRadius: '10px',
                color: '#ae89ff',
                fontSize: '13px',
                fontWeight: 700,
                textDecoration: 'none',
                cursor: 'pointer',
                transition:
                  'background 0.2s cubic-bezier(0.22,1,0.36,1), transform 0.2s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(174,137,255,0.2)';
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(174,137,255,0.12)';
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                calendar_month
              </span>
              View Study Plan
            </Link>
          ) : onGeneratePlan ? (
            <button
              onClick={() => onGeneratePlan(exam.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: `${urgencyColor}18`,
                border: `1px solid ${urgencyColor}40`,
                borderRadius: '10px',
                color: urgencyColor,
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition:
                  'background 0.2s cubic-bezier(0.22,1,0.36,1), transform 0.2s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = `${urgencyColor}28`;
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = `${urgencyColor}18`;
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                auto_fix_high
              </span>
              Generate Study Plan
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

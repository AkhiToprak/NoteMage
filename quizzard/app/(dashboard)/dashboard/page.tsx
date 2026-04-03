'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ActivityHeatmap from '@/components/features/ActivityHeatmap';
import StreakDisplay from '@/components/features/StreakDisplay';
import XPProgressBar from '@/components/features/XPProgressBar';
import ExamCountdown from '@/components/features/ExamCountdown';
import ExamForm from '@/components/features/ExamForm';

interface RecentItem {
  id: string;
  name: string;
  subject?: string | null;
  color?: string | null;
  updatedAt: string;
  pageCount: number;
}

interface DashboardData {
  dailyGoal: number;
  todayPages: number;
  recentActivity: RecentItem[];
}

interface FlashcardSetItem {
  id: string;
  title: string;
  notebookId: string;
  updatedAt: string;
  _count: { flashcards: number };
  notebook: { name: string; color: string | null };
}

interface XPData {
  currentXP: number;
  nextLevelXP: number;
  level: number;
  totalXP: number;
}

interface ExamItem {
  id: string;
  title: string;
  examDate: string;
  notebookId: string;
  notebookName: string;
  studyPlan?: { id: string };
}

interface NotebookOption {
  id: string;
  name: string;
}

interface StatCard {
  label: string;
  value: string;
  icon: string;
  iconFilled?: boolean;
  iconColor: string;
  iconBg: string;
  badge?: React.ReactNode;
  arrowColor: string;
  href?: string;
  onClick?: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function getActivityStyle(subject?: string | null) {
  const s = (subject ?? '').toLowerCase();
  if (s.includes('sci') || s.includes('chem') || s.includes('bio') || s.includes('phys'))
    return { icon: 'science', iconBg: 'rgba(185,195,255,0.32)', iconColor: '#b9c3ff' };
  if (s.includes('hist') || s.includes('social') || s.includes('geo'))
    return { icon: 'history_edu', iconBg: 'rgba(174,137,255,0.2)', iconColor: '#ae89ff' };
  if (s.includes('math') || s.includes('calc') || s.includes('stat'))
    return { icon: 'calculate', iconBg: 'rgba(240,208,76,0.2)', iconColor: '#f0d04c' };
  if (s.includes('lang') || s.includes('english') || s.includes('lit') || s.includes('writ'))
    return { icon: 'menu_book', iconBg: 'rgba(174,137,255,0.15)', iconColor: '#ae89ff' };
  return { icon: 'auto_stories', iconBg: 'rgba(174,137,255,0.15)', iconColor: '#ae89ff' };
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [notebookCount, setNotebookCount] = useState<number | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [flashcardSets, setFlashcardSets] = useState<FlashcardSetItem[]>([]);
  const [flashcardCount, setFlashcardCount] = useState<number | null>(null);
  const [showFlashcardDropdown, setShowFlashcardDropdown] = useState(false);
  const [streakValue, setStreakValue] = useState<string>('—');
  const [streakIsActive, setStreakIsActive] = useState(false);
  const [freezesLeft, setFreezeesLeft] = useState(0);
  const [xpData, setXPData] = useState<XPData | null>(null);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [notebooks, setNotebooks] = useState<NotebookOption[]>([]);
  const [showExamForm, setShowExamForm] = useState(false);
  const [generatingPlanId, setGeneratingPlanId] = useState<string | null>(null);
  const flashcardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/notebooks?folderId=all')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (Array.isArray(d)) {
          setNotebookCount(d.length);
          setNotebooks(d.map((nb: { id: string; name: string }) => ({ id: nb.id, name: nb.name })));
        }
      })
      .catch(() => {});

    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((res) => { const d = res?.data ?? res; if (d?.dailyGoal !== undefined) setDashboard(d); })
      .catch(() => {});

    fetch('/api/flashcard-sets')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (Array.isArray(d)) {
          setFlashcardSets(d);
          setFlashcardCount(d.length);
        }
      })
      .catch(() => {});

    fetch('/api/user/streak')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (d?.currentStreak !== undefined) {
          setStreakValue(String(d.currentStreak));
          setStreakIsActive(d.isActiveToday);
          setFreezeesLeft(d.freezesLeft);
        }
      })
      .catch(() => {});

    fetch('/api/user/xp')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (d?.level !== undefined) {
          setXPData(d);
        }
      })
      .catch(() => {});

    fetchExams();
  }, []);

  const fetchExams = () => {
    fetch('/api/user/exams')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (Array.isArray(d)) setExams(d);
      })
      .catch(() => {});
  };

  const handleCreateExam = async (data: { title: string; examDate: string; notebookId: string }) => {
    const res = await fetch('/api/user/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowExamForm(false);
      fetchExams();
    }
  };

  const handleDeleteExam = async (examId: string) => {
    try {
      const res = await fetch(`/api/user/exams/${examId}`, { method: 'DELETE' });
      if (res.ok) fetchExams();
    } catch { /* silent */ }
  };

  const handleGeneratePlan = async (examId: string) => {
    setGeneratingPlanId(examId);
    try {
      await fetch(`/api/user/exams/${examId}/generate-plan`, { method: 'POST' });
      fetchExams();
    } finally {
      setGeneratingPlanId(null);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (flashcardRef.current && !flashcardRef.current.contains(e.target as Node)) {
        setShowFlashcardDropdown(false);
      }
    }
    if (showFlashcardDropdown) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showFlashcardDropdown]);

  const goalProgress = dashboard
    ? Math.min(100, Math.round((dashboard.todayPages / dashboard.dailyGoal) * 100))
    : 0;

  const statCards: StatCard[] = [
    {
      label: 'Notebooks',
      value: notebookCount !== null ? String(notebookCount) : '—',
      icon: 'auto_stories',
      iconColor: '#ae89ff',
      iconBg: 'rgba(174,137,255,0.1)',
      arrowColor: 'rgba(174,137,255,0.4)',
      href: '/notebooks',
    },
    {
      label: 'Flashcards',
      value: flashcardCount !== null ? String(flashcardCount) : '—',
      icon: 'bolt',
      iconColor: '#f0d04c',
      iconBg: 'rgba(240,208,76,0.1)',
      arrowColor: 'rgba(240,208,76,0.4)',
      onClick: () => setShowFlashcardDropdown((v) => !v),
    },
    {
      label: 'Day Streak',
      value: streakValue,
      icon: 'local_fire_department',
      iconFilled: true,
      iconColor: '#fd6f85',
      iconBg: 'rgba(253,111,133,0.1)',
      arrowColor: 'rgba(253,111,133,0.4)',
      badge: streakIsActive ? (
        <div
          style={{
            padding: '2px 8px',
            background: 'rgba(138,22,50,0.2)',
            borderRadius: '8px',
            fontSize: '10px',
            fontWeight: 700,
            color: '#fd6f85',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Hot
        </div>
      ) : freezesLeft > 0 ? (
        <div
          style={{
            padding: '2px 8px',
            background: 'rgba(74,222,128,0.1)',
            borderRadius: '8px',
            fontSize: '10px',
            fontWeight: 700,
            color: '#4ade80',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {freezesLeft} freeze{freezesLeft !== 1 ? 's' : ''}
        </div>
      ) : undefined,
    },
  ];

  const recentActivity = dashboard?.recentActivity ?? [];

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>

      {/* Stats Row */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '24px',
        }}
      >
        {statCards.map(({ label, value, icon, iconFilled, iconColor, iconBg, badge, arrowColor, href, onClick }) => {
          const isFlashcard = label === 'Flashcards';
          const inner = (
            <div
              style={{
                background: '#161630',
                padding: '24px',
                borderRadius: '24px',
                display: 'flex',
                flexDirection: 'column',
                cursor: (href || onClick) ? 'pointer' : 'default',
                transition: 'background 0.3s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = '#1c1c38';
                const arrow = (e.currentTarget as HTMLDivElement).querySelector<HTMLSpanElement>('.stat-arrow');
                if (arrow) arrow.style.transform = 'translateX(4px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = '#161630';
                const arrow = (e.currentTarget as HTMLDivElement).querySelector<HTMLSpanElement>('.stat-arrow');
                if (arrow) arrow.style.transform = 'translateX(0)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div
                  style={{
                    width: '48px', height: '48px', borderRadius: '16px',
                    background: iconBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: '28px',
                      color: iconColor,
                      fontVariationSettings: iconFilled ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : undefined,
                    }}
                  >
                    {icon}
                  </span>
                </div>
                {badge || (
                  <span
                    className="material-symbols-outlined stat-arrow"
                    style={{ color: arrowColor, fontSize: '22px', transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)' }}
                  >
                    arrow_forward
                  </span>
                )}
              </div>
              <h3 style={{ fontFamily: '"Shrikhand", serif', fontStyle: 'italic', fontSize: '30px', fontWeight: 400, color: '#e5e3ff', margin: '0 0 4px', lineHeight: 1 }}>
                {value}
              </h3>
              <p style={{ fontSize: '15px', fontWeight: 500, color: '#aaa8c8', margin: 0 }}>{label}</p>
            </div>
          );

          if (isFlashcard) {
            return (
              <div key={label} ref={flashcardRef} style={{ position: 'relative' }}>
                <div onClick={onClick} style={{ cursor: 'pointer' }}>{inner}</div>
                {showFlashcardDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      left: 0,
                      right: 0,
                      background: '#1a1a2e',
                      borderRadius: '16px',
                      border: '1px solid rgba(174,137,255,0.15)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      zIndex: 50,
                      maxHeight: '320px',
                      overflowY: 'auto',
                      padding: '8px',
                    }}
                  >
                    {flashcardSets.length === 0 ? (
                      <div style={{ padding: '24px 16px', textAlign: 'center', color: '#aaa8c8' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '32px', display: 'block', marginBottom: '8px', opacity: 0.4 }}>bolt</span>
                        <p style={{ fontSize: '13px', margin: 0 }}>No flashcard sets yet.</p>
                        <p style={{ fontSize: '12px', margin: '4px 0 0', opacity: 0.6 }}>Create them from a notebook chat.</p>
                      </div>
                    ) : (
                      flashcardSets.map((set) => (
                        <div
                          key={set.id}
                          onClick={() => {
                            setShowFlashcardDropdown(false);
                            router.push(`/notebooks/${set.notebookId}/flashcards/${set.id}`);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#2a2a4c'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                        >
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '10px',
                              background: set.notebook.color ? `${set.notebook.color}20` : 'rgba(240,208,76,0.15)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: '18px', color: set.notebook.color || '#f0d04c' }}
                            >
                              bolt
                            </span>
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: '#e5e3ff',
                              margin: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {set.title}
                            </p>
                            <p style={{ fontSize: '11px', color: '#aaa8c8', margin: '2px 0 0' }}>
                              {set.notebook.name} · {set._count.flashcards} {set._count.flashcards === 1 ? 'card' : 'cards'}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          }

          return href ? (
            <Link key={label} href={href} style={{ textDecoration: 'none' }}>{inner}</Link>
          ) : (
            <div key={label}>{inner}</div>
          );
        })}
      </section>

      {/* XP Progress */}
      {xpData && (
        <section
          style={{
            background: '#161630',
            borderRadius: '20px',
            padding: '24px',
          }}
        >
          <XPProgressBar
            currentXP={xpData.currentXP}
            nextLevelXP={xpData.nextLevelXP}
            level={xpData.level}
            totalXP={xpData.totalXP}
          />
        </section>
      )}

      {/* Activity Heatmap */}
      <section>
        <ActivityHeatmap />
      </section>

      {/* Upcoming Exams */}
      <section
        style={{
          background: '#161630',
          borderRadius: '20px',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '22px', color: '#ae89ff' }}
            >
              event
            </span>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#e5e3ff', margin: 0 }}>
              Upcoming Exams
            </h2>
          </div>
          <button
            onClick={() => setShowExamForm(true)}
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
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1), transform 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.2)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.12)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
            Add Exam
          </button>
        </div>

        {exams.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa8c8' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '40px', display: 'block', marginBottom: '12px', opacity: 0.35 }}
            >
              event_note
            </span>
            <p style={{ fontSize: '14px', margin: '0 0 4px', color: '#aaa8c8' }}>
              No upcoming exams.
            </p>
            <p style={{ fontSize: '13px', margin: 0, color: '#8888a8' }}>
              Add one to start planning your study schedule!
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {exams.slice(0, 3).map((exam) => (
              <ExamCountdown
                key={exam.id}
                exam={exam}
                onGeneratePlan={generatingPlanId === exam.id ? undefined : handleGeneratePlan}
                onDelete={handleDeleteExam}
              />
            ))}
          </div>
        )}
      </section>

      {/* Exam Form Modal */}
      {showExamForm && (
        <ExamForm
          notebooks={notebooks}
          onSubmit={handleCreateExam}
          onClose={() => setShowExamForm(false)}
        />
      )}

      {/* Bento grid */}
      <section>
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '24px' }}>

          {/* Recent Activity */}
          <div
            style={{
              background: '#1c1c38',
              borderRadius: '32px',
              padding: '32px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}>Recent Activity</h2>
                <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0 }}>Pick up where you left off</p>
              </div>
              <Link
                href="/notebooks"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ae89ff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  textDecoration: 'none',
                }}
              >
                View all
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
              </Link>
            </div>

            {recentActivity.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa8c8' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', opacity: 0.4 }}>
                  history
                </span>
                <p style={{ fontSize: '14px', margin: 0 }}>
                  {dashboard === null ? 'Loading…' : 'No notebooks yet — create one to get started.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {recentActivity.map((item) => {
                  const style = getActivityStyle(item.subject);
                  return (
                    <Link
                      key={item.id}
                      href={`/notebooks/${item.id}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '16px',
                          borderRadius: '16px',
                          background: '#161630',
                          transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLDivElement).style.background = '#2a2a4c';
                          const btn = (e.currentTarget as HTMLDivElement).querySelector<HTMLButtonElement>('.activity-btn');
                          if (btn) { btn.style.background = '#ae89ff'; btn.style.color = '#2a0066'; }
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLDivElement).style.background = '#161630';
                          const btn = (e.currentTarget as HTMLDivElement).querySelector<HTMLButtonElement>('.activity-btn');
                          if (btn) { btn.style.background = '#2a2a4c'; btn.style.color = '#ae89ff'; }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
                          <div
                            style={{
                              width: '48px', height: '48px', borderRadius: '14px',
                              background: style.iconBg,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, color: style.iconColor,
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>{style.icon}</span>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.name}
                            </h4>
                            <p style={{ fontSize: '12px', color: '#aaa8c8', margin: 0 }}>
                              {timeAgo(item.updatedAt)} · {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}
                            </p>
                          </div>
                        </div>
                        <button
                          className="activity-btn"
                          style={{
                            padding: '8px 16px',
                            background: '#2a2a4c',
                            borderRadius: '12px',
                            border: 'none',
                            color: '#ae89ff',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            flexShrink: 0,
                            marginLeft: '16px',
                            transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1), color 0.2s cubic-bezier(0.22,1,0.36,1)',
                          }}
                        >
                          Open
                        </button>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Daily Goal */}
          <div
            style={{
              background: 'linear-gradient(135deg, #8348f6 0%, #001971 100%)',
              borderRadius: '32px',
              padding: '32px',
              color: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ marginBottom: 'auto' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '9999px',
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: '16px',
                }}
              >
                Daily Goal
              </span>
              <h2
                style={{
                  fontFamily: '"Shrikhand", serif',
                  fontStyle: 'italic',
                  fontSize: '30px',
                  fontWeight: 400,
                  margin: '0 0 16px',
                  lineHeight: 1.1,
                }}
              >
                {goalProgress >= 100 ? 'Goal Complete!' : 'Keep Writing'}
              </h2>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', lineHeight: '1.7', margin: '0 0 32px' }}>
                {dashboard === null
                  ? 'Loading your progress…'
                  : goalProgress >= 100
                  ? `You wrote ${dashboard.todayPages} pages today. Amazing work — you hit your daily target!`
                  : `${dashboard.todayPages} of ${dashboard.dailyGoal} pages written today. ${dashboard.dailyGoal - dashboard.todayPages} more to reach your goal.`}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px',
                  }}
                >
                  <span>Progress</span>
                  <span>{goalProgress}%</span>
                </div>
                <div
                  style={{
                    height: '12px',
                    width: '100%',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '9999px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${goalProgress}%`,
                      background: '#ffde59',
                      borderRadius: '9999px',
                      boxShadow: goalProgress > 0 ? '0 0 15px rgba(255,222,89,0.5)' : 'none',
                      transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)',
                    }}
                  />
                </div>
              </div>
              <Link
                href="/notebooks"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '16px',
                  background: '#ffffff',
                  color: '#8348f6',
                  borderRadius: '16px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '15px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'center',
                  textDecoration: 'none',
                  boxSizing: 'border-box',
                  transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1), color 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = '#ffde59';
                  (e.currentTarget as HTMLAnchorElement).style.color = '#5f4f00';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = '#ffffff';
                  (e.currentTarget as HTMLAnchorElement).style.color = '#8348f6';
                }}
              >
                {goalProgress >= 100 ? 'Keep Going' : 'Start Writing'}
              </Link>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', margin: 0, textAlign: 'center' }}>
                Change target in{' '}
                <Link href="/settings" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}>
                  Settings
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Empty state / CTA — only show if no notebooks */}
      {dashboard !== null && notebookCount === 0 && (
        <section
          style={{
            border: '2px dashed rgba(70,69,96,0.2)',
            borderRadius: '32px',
            padding: '48px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '80px', height: '80px',
              background: '#232342',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '24px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '36px', color: '#aaa8c8' }}>library_add</span>
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}>Feeling Inspired?</h3>
          <p style={{ fontSize: '14px', color: '#aaa8c8', margin: '0 0 32px', maxWidth: '380px', lineHeight: '1.7' }}>
            No notebooks yet. Create your first one to get started on your neon scholar journey.
          </p>
          <Link
            href="/notebooks"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '12px 32px',
              background: '#ae89ff', color: '#2a0066',
              borderRadius: '12px', fontWeight: 700, fontSize: '15px', textDecoration: 'none',
              transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>add</span>
            Create Notebook
          </Link>
        </section>
      )}
    </div>
  );
}

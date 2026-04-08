'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import ActivityHeatmap from '@/components/features/ActivityHeatmap';
import StreakDisplay from '@/components/features/StreakDisplay';
import XPProgressBar from '@/components/features/XPProgressBar';
import ExamCountdown from '@/components/features/ExamCountdown';
import ExamForm from '@/components/features/ExamForm';
import DashboardAchievements from '@/components/features/DashboardAchievements';
import DashboardGreeting from '@/components/features/DashboardGreeting';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { responsiveValue } from '@/lib/responsive';

interface RecentItem {
  id: string;
  name: string;
  subject?: string | null;
  color?: string | null;
  updatedAt: string;
  pageCount: number;
}

interface StudyGoalData {
  type: string;
  target: number;
  current: number;
}

interface DashboardData {
  dailyGoal: number;
  todayPages: number;
  recentActivity: RecentItem[];
  studyGoals?: StudyGoalData[];
}

const GOAL_META: Record<string, { icon: string; label: string; unit: string }> = {
  hours: { icon: 'schedule', label: 'Study Hours', unit: 'hrs' },
  pages: { icon: 'description', label: 'Pages Written', unit: 'pgs' },
  quizzes: { icon: 'psychology', label: 'Quizzes', unit: 'quiz' },
  notebooks: { icon: 'auto_stories', label: 'Notebooks', unit: 'nb' },
};

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
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
  const [notebookCount, setNotebookCount] = useState<number | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoInput, setTodoInput] = useState('');
  const [todoLoading, setTodoLoading] = useState(false);
  const [streakValue, setStreakValue] = useState<string>('—');
  const [streakIsActive, setStreakIsActive] = useState(false);
  const [freezesLeft, setFreezeesLeft] = useState(0);
  const [xpData, setXPData] = useState<XPData | null>(null);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [notebooks, setNotebooks] = useState<NotebookOption[]>([]);
  const [showExamForm, setShowExamForm] = useState(false);
  const [generatingPlanId, setGeneratingPlanId] = useState<string | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeCard, setActiveCard] = useState(0);
  const { isPhone, isTablet, isDesktop, bp } = useBreakpoint();

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
      .then((res) => {
        const d = res?.data ?? res;
        if (d?.dailyGoal !== undefined) setDashboard(d);
      })
      .catch(() => {});

    fetchTodos();

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

  const handleCreateExam = async (data: {
    title: string;
    examDate: string;
    notebookId: string;
  }) => {
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
    } catch {
      /* silent */
    }
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

  const fetchTodos = () => {
    fetch('/api/user/todos')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (Array.isArray(d)) setTodos(d);
      })
      .catch(() => {});
  };

  const handleAddTodo = async () => {
    const text = todoInput.trim();
    if (!text) return;
    setTodoLoading(true);
    try {
      const res = await fetch('/api/user/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        setTodoInput('');
        fetchTodos();
      }
    } finally {
      setTodoLoading(false);
    }
  };

  const handleToggleTodo = async (id: string, completed: boolean) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t))
    );
    try {
      await fetch(`/api/user/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed }),
      });
      fetchTodos();
    } catch {
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed } : t))
      );
    }
  };

  const handleDeleteTodo = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch(`/api/user/todos/${id}`, { method: 'DELETE' });
    } catch {
      fetchTodos();
    }
  };

  const handleCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el) return;
    const cardWidth = el.scrollWidth / 3;
    setActiveCard(Math.round(el.scrollLeft / cardWidth));
  };

  const hasStudyGoals = (dashboard?.studyGoals ?? []).length > 0;
  const hasPagesGoal = (dashboard?.studyGoals ?? []).some((g) => g.type === 'pages');
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
    {
      label: 'Todos',
      value: String(todos.filter((t) => !t.completed).length),
      icon: 'checklist',
      iconColor: '#f0d04c',
      iconBg: 'rgba(240,208,76,0.1)',
      arrowColor: 'rgba(240,208,76,0.4)',
    },
  ];

  const recentActivity = dashboard?.recentActivity ?? [];

  return (
    <div
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: responsiveValue(bp, { phone: '16px', tablet: '20px', desktop: '32px' }),
      }}
    >
      {/* Greeting */}
      <DashboardGreeting
        userName={session?.user?.name || session?.user?.username || 'Scholar'}
      />

      {/* Stats Row — carousel on phone, grid on tablet/desktop */}
      {isPhone && (
        <style>{`.stat-carousel::-webkit-scrollbar { display: none; }`}</style>
      )}
      <section
        ref={isPhone ? carouselRef : undefined}
        className={isPhone ? 'stat-carousel' : undefined}
        onScroll={isPhone ? handleCarouselScroll : undefined}
        style={
          isPhone
            ? {
                display: 'flex',
                overflowX: 'auto',
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                gap: '16px',
                paddingBottom: '4px',
                scrollbarWidth: 'none',
              }
            : {
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '24px',
              }
        }
      >
        {statCards.map(
          ({
            label,
            value,
            icon,
            iconFilled,
            iconColor,
            iconBg,
            badge,
            arrowColor,
            href,
          }) => {
            const isTodo = label === 'Todos';
            const pendingTodos = todos.filter((t) => !t.completed);

            const cardContent = (
              <div
                style={{
                  background: '#161630',
                  padding: '24px',
                  borderRadius: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: href ? 'pointer' : 'default',
                  transition: 'background 0.3s cubic-bezier(0.22,1,0.36,1)',
                  height: '100%',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = '#1c1c38';
                  const arrow = (e.currentTarget as HTMLDivElement).querySelector<HTMLSpanElement>(
                    '.stat-arrow'
                  );
                  if (arrow) arrow.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = '#161630';
                  const arrow = (e.currentTarget as HTMLDivElement).querySelector<HTMLSpanElement>(
                    '.stat-arrow'
                  );
                  if (arrow) arrow.style.transform = 'translateX(0)';
                }}
              >
                {/* Card header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '16px',
                      background: iconBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '28px',
                        color: iconColor,
                        fontVariationSettings: iconFilled
                          ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                          : undefined,
                      }}
                    >
                      {icon}
                    </span>
                  </div>
                  {badge || (
                    <span
                      className="material-symbols-outlined stat-arrow"
                      style={{
                        color: arrowColor,
                        fontSize: '22px',
                        transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                      }}
                    >
                      arrow_forward
                    </span>
                  )}
                </div>

                {/* Value + label */}
                <h3
                  style={{
                    fontFamily: 'var(--font-brand)',
                    fontSize: '30px',
                    fontWeight: 400,
                    color: '#e5e3ff',
                    margin: '0 0 4px',
                    lineHeight: 1,
                  }}
                >
                  {value}
                </h3>
                <p style={{ fontSize: '15px', fontWeight: 500, color: '#aaa8c8', margin: 0 }}>
                  {label}
                </p>

                {/* Todo mini-list (only on Todos card) */}
                {isTodo && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid rgba(174,137,255,0.08)', paddingTop: '12px' }}>
                    {/* Todo items */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto', scrollbarWidth: 'none' }}>
                      {pendingTodos.length === 0 && (
                        <p style={{ fontSize: '12px', color: '#555578', margin: 0, textAlign: 'center', padding: '8px 0' }}>
                          No pending todos
                        </p>
                      )}
                      {pendingTodos.slice(0, 4).map((todo) => (
                        <div
                          key={todo.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '4px 0',
                            position: 'relative',
                          }}
                          className="todo-row"
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleTodo(todo.id, todo.completed); }}
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '6px',
                              border: '2px solid #555578',
                              background: 'transparent',
                              cursor: 'pointer',
                              padding: 0,
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'border-color 0.2s cubic-bezier(0.22,1,0.36,1)',
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#ae89ff'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#555578'; }}
                          >
                            &nbsp;
                          </button>
                          <span
                            style={{
                              fontSize: '13px',
                              color: '#c0bed8',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {todo.text}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteTodo(todo.id); }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                              opacity: 0.4,
                              transition: 'opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
                              display: 'flex',
                              alignItems: 'center',
                              flexShrink: 0,
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.4'; }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#fd6f85' }}>
                              close
                            </span>
                          </button>
                        </div>
                      ))}
                      {pendingTodos.length > 4 && (
                        <p style={{ fontSize: '11px', color: '#555578', margin: '2px 0 0' }}>
                          +{pendingTodos.length - 4} more
                        </p>
                      )}
                    </div>

                    {/* Add todo input */}
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        marginTop: '10px',
                      }}
                    >
                      <input
                        type="text"
                        value={todoInput}
                        onChange={(e) => setTodoInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddTodo(); }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Add a todo..."
                        maxLength={200}
                        style={{
                          flex: 1,
                          background: '#1c1c38',
                          border: '1px solid rgba(174,137,255,0.1)',
                          borderRadius: '10px',
                          padding: '8px 12px',
                          fontSize: '12px',
                          color: '#e5e3ff',
                          outline: 'none',
                          minWidth: 0,
                        }}
                        onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(174,137,255,0.3)'; }}
                        onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(174,137,255,0.1)'; }}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAddTodo(); }}
                        disabled={todoLoading || !todoInput.trim()}
                        style={{
                          background: 'rgba(174,137,255,0.15)',
                          border: 'none',
                          borderRadius: '10px',
                          width: '36px',
                          height: '36px',
                          cursor: todoLoading || !todoInput.trim() ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: todoLoading || !todoInput.trim() ? 0.4 : 1,
                          transition: 'opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
                          flexShrink: 0,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#ae89ff' }}>
                          add
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );

            const wrapper = (child: React.ReactNode) => (
              <div
                key={label}
                style={
                  isPhone
                    ? { flex: '0 0 85%', scrollSnapAlign: 'center', minWidth: 0 }
                    : undefined
                }
              >
                {child}
              </div>
            );

            if (href) {
              return wrapper(
                <Link href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
                  {cardContent}
                </Link>
              );
            }

            return wrapper(cardContent);
          }
        )}
      </section>

      {/* Carousel dot indicators (phone only) */}
      {isPhone && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '-20px' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: i === activeCard ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: i === activeCard ? '#ae89ff' : 'rgba(174,137,255,0.2)',
                transition: 'width 0.3s cubic-bezier(0.22,1,0.36,1), background 0.3s cubic-bezier(0.22,1,0.36,1)',
              }}
            />
          ))}
        </div>
      )}

      {/* XP Progress */}
      {xpData && (
        <section
          style={{
            background: '#161630',
            borderRadius: '20px',
            padding: responsiveValue(bp, { phone: '16px', tablet: '20px', desktop: '24px' }),
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

      {/* Achievements */}
      <section>
        <DashboardAchievements />
      </section>

      {/* Upcoming Exams */}
      <section
        style={{
          background: '#161630',
          borderRadius: '20px',
          padding: responsiveValue(bp, { phone: '16px', tablet: '20px', desktop: '24px' }),
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '22px', color: '#ae89ff' }}
            >
              event
            </span>
            <h2 style={{ fontSize: responsiveValue(bp, { phone: '16px', tablet: '17px', desktop: '18px' }), fontWeight: 700, color: '#e5e3ff', margin: 0 }}>
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
              transition:
                'background 0.2s cubic-bezier(0.22,1,0.36,1), transform 0.2s cubic-bezier(0.22,1,0.36,1)',
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
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              add
            </span>
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
          <div style={{ display: 'grid', gridTemplateColumns: responsiveValue(bp, { phone: '1fr', tablet: 'repeat(2, 1fr)', desktop: 'repeat(3, 1fr)' }), gap: '16px' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: responsiveValue(bp, { phone: '1fr', tablet: '2fr 1fr', desktop: '3fr 1fr' }), gap: responsiveValue(bp, { phone: '16px', tablet: '20px', desktop: '24px' }) }}>
          {/* Recent Activity */}
          <div
            style={{
              background: '#1c1c38',
              borderRadius: responsiveValue(bp, { phone: '20px', tablet: '24px', desktop: '32px' }),
              padding: responsiveValue(bp, { phone: '16px', tablet: '20px', desktop: '32px' }),
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: responsiveValue(bp, { phone: '16px', tablet: '20px', desktop: '32px' }),
              }}
            >
              <div>
                <h2
                  style={{ fontSize: responsiveValue(bp, { phone: '16px', tablet: '17px', desktop: '18px' }), fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}
                >
                  Recent Activity
                </h2>
                <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0 }}>
                  Pick up where you left off
                </p>
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
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  chevron_right
                </span>
              </Link>
            </div>

            {recentActivity.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa8c8' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '48px', display: 'block', marginBottom: '12px', opacity: 0.4 }}
                >
                  history
                </span>
                <p style={{ fontSize: '14px', margin: 0 }}>
                  {dashboard === null
                    ? 'Loading…'
                    : 'No notebooks yet — create one to get started.'}
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
                          const btn = (
                            e.currentTarget as HTMLDivElement
                          ).querySelector<HTMLButtonElement>('.activity-btn');
                          if (btn) {
                            btn.style.background = '#ae89ff';
                            btn.style.color = '#2a0066';
                          }
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLDivElement).style.background = '#161630';
                          const btn = (
                            e.currentTarget as HTMLDivElement
                          ).querySelector<HTMLButtonElement>('.activity-btn');
                          if (btn) {
                            btn.style.background = '#2a2a4c';
                            btn.style.color = '#ae89ff';
                          }
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '14px',
                              background: style.iconBg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              color: style.iconColor,
                            }}
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: '22px' }}
                            >
                              {style.icon}
                            </span>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h4
                              style={{
                                fontSize: '14px',
                                fontWeight: 700,
                                color: '#e5e3ff',
                                margin: '0 0 2px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.name}
                            </h4>
                            <p style={{ fontSize: '12px', color: '#aaa8c8', margin: 0 }}>
                              {timeAgo(item.updatedAt)} · {item.pageCount}{' '}
                              {item.pageCount === 1 ? 'page' : 'pages'}
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
                            transition:
                              'background 0.2s cubic-bezier(0.22,1,0.36,1), color 0.2s cubic-bezier(0.22,1,0.36,1)',
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

          {/* Study Goals */}
          <div
            style={{
              background: 'linear-gradient(135deg, #8348f6 0%, #001971 100%)',
              borderRadius: responsiveValue(bp, { phone: '20px', tablet: '24px', desktop: '32px' }),
              padding: responsiveValue(bp, { phone: '16px', tablet: '20px', desktop: '32px' }),
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
                {hasStudyGoals ? 'Weekly Goals' : 'Daily Goal'}
              </span>
              <h2
                style={{
                  fontFamily: 'var(--font-brand)',
                  fontSize: responsiveValue(bp, { phone: '22px', tablet: '26px', desktop: '30px' }),
                  fontWeight: 400,
                  margin: '0 0 16px',
                  lineHeight: 1.1,
                }}
              >
                {hasPagesGoal
                  ? (goalProgress >= 100 ? 'Goal Complete!' : 'Keep Going')
                  : hasStudyGoals
                    ? 'Your Goals'
                    : (goalProgress >= 100 ? 'Goal Complete!' : 'Keep Going')}
              </h2>
              {/* Only show pages summary text if the user has a pages goal or no study goals at all */}
              {(hasPagesGoal || !hasStudyGoals) && (
                <p
                  style={{
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.8)',
                    lineHeight: '1.7',
                    margin: '0 0 32px',
                  }}
                >
                  {dashboard === null
                    ? 'Loading your progress…'
                    : goalProgress >= 100
                      ? `You wrote ${dashboard.todayPages} pages today. Amazing work — you hit your daily target!`
                      : `${dashboard.todayPages} of ${dashboard.dailyGoal} pages written today. ${dashboard.dailyGoal - dashboard.todayPages} more to reach your goal.`}
                </p>
              )}
              {/* If user only has non-pages goals, show a generic subtitle */}
              {!hasPagesGoal && hasStudyGoals && (
                <p
                  style={{
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.8)',
                    lineHeight: '1.7',
                    margin: '0 0 32px',
                  }}
                >
                  Track your weekly targets below.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Show all active study goals */}
              {hasStudyGoals ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {(dashboard?.studyGoals ?? []).map((goal) => {
                    const meta = GOAL_META[goal.type];
                    if (!meta) return null;
                    // For pages goals, use the auto-tracked todayPages vs dailyGoal
                    const isPagesGoal = goal.type === 'pages';
                    const currentValue = isPagesGoal ? (dashboard?.todayPages ?? 0) : goal.current;
                    const targetValue = isPagesGoal ? (dashboard?.dailyGoal ?? goal.target) : goal.target;
                    const pct = Math.min(100, Math.round((currentValue / targetValue) * 100));
                    return (
                      <div key={goal.type} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: '20px',
                            color: pct >= 100 ? '#ffde59' : 'rgba(255,255,255,0.7)',
                            flexShrink: 0,
                            fontVariationSettings: pct >= 100 ? "'FILL' 1" : "'FILL' 0",
                          }}
                        >
                          {pct >= 100 ? 'check_circle' : meta.icon}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '11px',
                              fontWeight: 600,
                              marginBottom: '4px',
                            }}
                          >
                            <span style={{ color: 'rgba(255,255,255,0.9)' }}>
                              {meta.label}{isPagesGoal ? ' (today)' : ''}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                              {currentValue}/{targetValue} {meta.unit}
                            </span>
                          </div>
                          <div
                            style={{
                              height: '8px',
                              background: 'rgba(255,255,255,0.1)',
                              borderRadius: '9999px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${pct}%`,
                                background: '#ffde59',
                                borderRadius: '9999px',
                                boxShadow: pct > 0 ? '0 0 10px rgba(255,222,89,0.4)' : 'none',
                                transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Fallback: no study goals set — show legacy pages progress */
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
              )}

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
                  transition:
                    'background 0.2s cubic-bezier(0.22,1,0.36,1), color 0.2s cubic-bezier(0.22,1,0.36,1)',
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
              <p
                style={{
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.5)',
                  margin: 0,
                  textAlign: 'center',
                }}
              >
                Change targets in{' '}
                <Link
                  href="/settings"
                  style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}
                >
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
            borderRadius: responsiveValue(bp, { phone: '20px', tablet: '24px', desktop: '32px' }),
            padding: responsiveValue(bp, { phone: '24px', tablet: '32px', desktop: '48px' }),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              background: '#232342',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '24px',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '36px', color: '#aaa8c8' }}
            >
              library_add
            </span>
          </div>
          <h3 style={{ fontSize: responsiveValue(bp, { phone: '18px', tablet: '19px', desktop: '20px' }), fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}>
            Feeling Inspired?
          </h3>
          <p
            style={{
              fontSize: '14px',
              color: '#aaa8c8',
              margin: '0 0 32px',
              maxWidth: '380px',
              lineHeight: '1.7',
            }}
          >
            No notebooks yet. Create your first one to get started on your neon scholar journey.
          </p>
          <Link
            href="/notebooks"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 32px',
              background: '#ae89ff',
              color: '#2a0066',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '15px',
              textDecoration: 'none',
              transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              add
            </span>
            Create Notebook
          </Link>
        </section>
      )}
    </div>
  );
}

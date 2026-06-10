'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import ActivityHeatmap from '@/components/features/ActivityHeatmap';
import StreakDisplay from '@/components/features/StreakDisplay';
import ExamForm from '@/components/features/ExamForm';
import DashboardAchievements from '@/components/features/DashboardAchievements';
import DashboardGreeting from '@/components/features/DashboardGreeting';
import PathHeroCard from '@/components/features/PathHeroCard';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { usePresence } from '@/hooks/usePresence';
import { responsiveValue } from '@/lib/responsive';
import { useTutorial } from '@/components/tutorial/TutorialContext';
import { useTutorialTarget } from '@/components/tutorial/useTutorialTarget';
import { EmptyState } from '@/components/ui/EmptyState';

interface RecentItem {
  id: string;
  name: string;
  subject?: string | null;
  color?: string | null;
  updatedAt: string;
  pageCount: number;
}

interface UserGoals {
  dailyStudyMinutes: number | null;
  weeklyStudyPlans: number | null;
  weeklyNotes: number | null;
  weeklyChats: number | null;
}

interface GoalProgress {
  todayStudyMinutes: number;
  weekStudyPlansCompleted: number;
  weekNotesCreated: number;
  weekChatsCreated: number;
}

interface DashboardData {
  dailyGoal: number;
  todayPages: number;
  recentActivity: RecentItem[];
  goals?: UserGoals;
  progress?: GoalProgress;
}

interface GoalRow {
  key: keyof UserGoals;
  icon: string;
  label: string;
  unit: string;
  cadence: 'today' | 'this week';
  current: number;
  target: number;
}

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

interface ExamItem {
  id: string;
  title: string;
  examDate: string;
  notebookId: string;
  notebookName: string;
}

interface NotebookOption {
  id: string;
  name: string;
}

interface FriendItem {
  id: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  lastSeenAt: string | null;
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
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoInput, setTodoInput] = useState('');
  const [todoLoading, setTodoLoading] = useState(false);
  const [streakValue, setStreakValue] = useState<string>('—');
  const [streakIsActive, setStreakIsActive] = useState(false);
  const [freezesLeft, setFreezeesLeft] = useState(0);
  const [friends, setFriends] = useState<FriendItem[] | null>(null);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const { onlineFriendIds } = usePresence();
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [notebooks, setNotebooks] = useState<NotebookOption[]>([]);
  const [showExamForm, setShowExamForm] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeCard, setActiveCard] = useState(0);
  const { isPhone, isTablet, isDesktop, bp } = useBreakpoint();
  const { step: tutorialStep } = useTutorial();
  const tutorialCtaRef = useTutorialTarget('dashboard-cta');
  const ctaHref = tutorialStep === 'step-1-dashboard' ? '/notebooks?tutorial=1' : '/notebooks';

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

    fetch('/api/friends?status=accepted')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (Array.isArray(d?.friends)) setFriends(d.friends);
      })
      .catch(() => {});

    fetch('/api/friends?status=pending&direction=incoming')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (typeof d?.count === 'number') setPendingFriendRequests(d.count);
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
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t)));
    try {
      await fetch(`/api/user/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed }),
      });
      fetchTodos();
    } catch {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed } : t)));
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

  const goals = dashboard?.goals;
  const progress = dashboard?.progress;
  const goalRows: GoalRow[] = [];
  if (goals && progress) {
    if (goals.dailyStudyMinutes !== null) {
      goalRows.push({
        key: 'dailyStudyMinutes',
        icon: 'schedule',
        label: 'Study Time',
        unit: 'min',
        cadence: 'today',
        current: progress.todayStudyMinutes,
        target: goals.dailyStudyMinutes,
      });
    }
    if (goals.weeklyStudyPlans !== null) {
      goalRows.push({
        key: 'weeklyStudyPlans',
        icon: 'event_available',
        label: 'Study Plans',
        unit: 'plans',
        cadence: 'this week',
        current: progress.weekStudyPlansCompleted,
        target: goals.weeklyStudyPlans,
      });
    }
    if (goals.weeklyNotes !== null) {
      goalRows.push({
        key: 'weeklyNotes',
        icon: 'edit_note',
        label: 'Notes',
        unit: 'notes',
        cadence: 'this week',
        current: progress.weekNotesCreated,
        target: goals.weeklyNotes,
      });
    }
    if (goals.weeklyChats !== null) {
      goalRows.push({
        key: 'weeklyChats',
        icon: 'auto_awesome',
        label: 'Mage Chats',
        unit: 'chats',
        cadence: 'this week',
        current: progress.weekChatsCreated,
        target: goals.weeklyChats,
      });
    }
  }
  const hasStudyGoals = goalRows.length > 0;
  const goalProgress = dashboard
    ? Math.min(100, Math.round((dashboard.todayPages / dashboard.dailyGoal) * 100))
    : 0;

  const statCards: StatCard[] = [
    {
      label: 'Day Streak',
      value: streakValue,
      icon: 'local_fire_department',
      iconFilled: true,
      iconColor: '#fd6f85',
      iconBg: 'rgba(253,111,133,0.1)',
      arrowColor: 'var(--on-surface-variant)',
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
      iconColor: 'var(--warning)',
      iconBg: 'rgba(240,208,76,0.1)',
      arrowColor: 'var(--on-surface-variant)',
    },
    {
      label: 'Friends',
      value: friends !== null ? String(friends.length) : '—',
      icon: 'group',
      iconColor: 'var(--accent-strong)',
      iconBg: 'rgba(185,195,255,0.12)',
      arrowColor: 'var(--on-surface-variant)',
      href: '/profile',
      badge:
        pendingFriendRequests > 0 ? (
          <div
            style={{
              padding: '2px 8px',
              background: 'rgba(185,195,255,0.15)',
              borderRadius: '8px',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--primary-container)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {pendingFriendRequests} new
          </div>
        ) : undefined,
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
        gap: responsiveValue(bp, { phone: '18px', tablet: '20px', desktop: '32px' }),
      }}
    >
      {/* Greeting */}
      <DashboardGreeting userName={session?.user?.name || session?.user?.username || 'Mage'} />

      {/* Stats Row — carousel on phone, grid on tablet/desktop */}
      {isPhone && <style>{`.stat-carousel::-webkit-scrollbar { display: none; }`}</style>}
      <section
        data-tutorial="dashboard"
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
                gap: '18px',
                paddingBottom: '4px',
                scrollbarWidth: 'none',
              }
            : {
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '24px',
                // Size each card to its content so the short stat cards don't
                // stretch to match the taller Todos card (dead-space fix,
                // audit item 3b).
                alignItems: 'start',
              }
        }
      >
        {statCards.map(
          ({ label, value, icon, iconFilled, iconColor, iconBg, badge, arrowColor, href }) => {
            const isTodo = label === 'Todos';
            const pendingTodos = todos.filter((t) => !t.completed);
            const isFriends = label === 'Friends';
            const sortedFriends =
              isFriends && friends
                ? [...friends].sort((a, b) => {
                    const aOnline = onlineFriendIds.has(a.id) ? 1 : 0;
                    const bOnline = onlineFriendIds.has(b.id) ? 1 : 0;
                    if (aOnline !== bOnline) return bOnline - aOnline;
                    const aSeen = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
                    const bSeen = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
                    return bSeen - aSeen;
                  })
                : [];

            const headerTrailing = badge || (
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
            );

            const cardContent = (
              <div
                style={{
                  background: 'var(--surface-container-low)',
                  padding: 'var(--card-pad)',
                  borderRadius: 'var(--radius-xl)',
                  border: '1px solid var(--ink-08)',
                  boxShadow: 'inset 0 1px 0 var(--ink-06), 0 1px 2px rgba(0,0,0,0.18)',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: href ? 'pointer' : 'default',
                  transition: 'background 0.3s cubic-bezier(0.22,1,0.36,1)',
                  height: '100%',
                }}
                onClick={href ? () => router.push(href) : undefined}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    'var(--card-hover-bg-soft)';
                  const arrow = (e.currentTarget as HTMLDivElement).querySelector<HTMLSpanElement>(
                    '.stat-arrow'
                  );
                  if (arrow) arrow.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    'var(--surface-container-low)';
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
                  {href ? (
                    <Link
                      href={href}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Open ${label}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        textDecoration: 'none',
                        color: 'inherit',
                        borderRadius: '8px',
                      }}
                    >
                      {headerTrailing}
                    </Link>
                  ) : (
                    headerTrailing
                  )}
                </div>

                {/* Value + label */}
                <h3
                  className="tabular-nums"
                  style={{
                    fontFamily: 'var(--font-brand)',
                    fontSize: 'var(--fs-2xl)',
                    fontWeight: 400,
                    color: 'var(--on-surface)',
                    margin: '0 0 4px',
                    lineHeight: 1,
                  }}
                >
                  {value}
                </h3>
                <p
                  style={{
                    fontSize: 'var(--fs-base)',
                    fontWeight: 500,
                    color: 'var(--on-surface-variant)',
                    margin: 0,
                  }}
                >
                  {label}
                </p>

                {/* Todo mini-list (only on Todos card) */}
                {isTodo && (
                  <div
                    style={{
                      marginTop: '16px',
                      borderTop: '1px solid rgba(174,137,255,0.16)',
                      paddingTop: '12px',
                    }}
                  >
                    {/* Todo items */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        maxHeight: '140px',
                        overflowY: 'auto',
                        scrollbarWidth: 'none',
                      }}
                    >
                      {pendingTodos.length === 0 && (
                        <p
                          style={{
                            fontSize: '12px',
                            color: 'var(--outline-variant)',
                            margin: 0,
                            textAlign: 'center',
                            padding: '8px 0',
                          }}
                        >
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
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleTodo(todo.id, todo.completed);
                            }}
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
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.borderColor = '#ae89ff';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.borderColor = '#555578';
                            }}
                          >
                            &nbsp;
                          </button>
                          <span
                            style={{
                              fontSize: '13px',
                              color: 'var(--on-surface-variant)',
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
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTodo(todo.id);
                            }}
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
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.opacity = '0.4';
                            }}
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: '16px', color: '#fd6f85' }}
                            >
                              close
                            </span>
                          </button>
                        </div>
                      ))}
                      {pendingTodos.length > 4 && (
                        <p
                          style={{
                            fontSize: '11px',
                            color: 'var(--outline-variant)',
                            margin: '2px 0 0',
                          }}
                        >
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTodo();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Add a todo..."
                        maxLength={200}
                        style={{
                          flex: 1,
                          background: 'var(--surface-container)',
                          border: '1px solid rgba(174,137,255,0.1)',
                          borderRadius: '10px',
                          padding: '8px 12px',
                          fontSize: '12px',
                          color: 'var(--on-surface)',
                          outline: 'none',
                          minWidth: 0,
                        }}
                        onFocus={(e) => {
                          (e.currentTarget as HTMLInputElement).style.borderColor =
                            'rgba(174,137,255,0.3)';
                        }}
                        onBlur={(e) => {
                          (e.currentTarget as HTMLInputElement).style.borderColor =
                            'rgba(174,137,255,0.1)';
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddTodo();
                        }}
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
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: '18px', color: 'var(--md-h4)' }}
                        >
                          add
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Friends mini-list (only on Friends card) */}
                {isFriends && (
                  <div
                    style={{
                      marginTop: '16px',
                      borderTop: '1px solid rgba(185,195,255,0.16)',
                      paddingTop: '12px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        scrollbarWidth: 'none',
                      }}
                    >
                      {friends !== null && sortedFriends.length === 0 && (
                        <p
                          style={{
                            fontSize: '12px',
                            color: 'var(--outline-variant)',
                            margin: 0,
                            textAlign: 'center',
                            padding: '8px 0',
                          }}
                        >
                          No friends yet — add some on your profile
                        </p>
                      )}
                      {sortedFriends.slice(0, 4).map((friend) => {
                        const isOnline = onlineFriendIds.has(friend.id);
                        const displayName = friend.name || friend.username || 'Friend';
                        const initials = displayName
                          .split(' ')
                          .map((p) => p[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase();
                        const lastSeenMs = friend.lastSeenAt
                          ? new Date(friend.lastSeenAt).getTime()
                          : 0;
                        const diffMin = lastSeenMs
                          ? Math.floor((Date.now() - lastSeenMs) / 60000)
                          : -1;
                        // Threshold: anything older than 7 days (or null) reads
                        // "Offline" — until study-heartbeat had a chance to bump
                        // lastSeenAt across the user base, the historical data
                        // is stale (only set by cowork sessions before today).
                        const status = isOnline
                          ? 'Studying now'
                          : diffMin < 0
                            ? 'Offline'
                            : diffMin < 1
                              ? 'Just now'
                              : diffMin < 60
                                ? `Last seen ${diffMin}m ago`
                                : diffMin < 1440
                                  ? `Last seen ${Math.floor(diffMin / 60)}h ago`
                                  : diffMin < 10_080
                                    ? `Last seen ${Math.floor(diffMin / 1440)}d ago`
                                    : 'Offline';
                        return (
                          <Link
                            key={friend.id}
                            href={friend.username ? `/profile/${friend.username}` : '/profile'}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '6px 4px',
                              borderRadius: '8px',
                              textDecoration: 'none',
                              color: 'inherit',
                              transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLAnchorElement).style.background =
                                'rgba(255,255,255,0.04)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLAnchorElement).style.background =
                                'transparent';
                            }}
                          >
                            <div
                              style={{
                                position: 'relative',
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: friend.avatarUrl
                                  ? `url(${friend.avatarUrl}) center/cover`
                                  : 'rgba(185,195,255,0.18)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: 'var(--accent-strong)',
                                flexShrink: 0,
                              }}
                              aria-hidden
                            >
                              {!friend.avatarUrl && initials}
                              {isOnline && (
                                <span
                                  style={{
                                    position: 'absolute',
                                    right: '-1px',
                                    bottom: '-1px',
                                    width: '9px',
                                    height: '9px',
                                    borderRadius: '50%',
                                    background: '#4ade80',
                                    border: '2px solid var(--surface-container-low)',
                                  }}
                                />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: 'var(--on-surface)',
                                  margin: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {displayName}
                              </p>
                              <p
                                style={{
                                  fontSize: '10px',
                                  color: isOnline ? '#4ade80' : 'var(--outline)',
                                  margin: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {status}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );

            const wrapper = (child: React.ReactNode) => (
              <div
                key={label}
                style={
                  isPhone ? { flex: '0 0 85%', scrollSnapAlign: 'center', minWidth: 0 } : undefined
                }
              >
                {child}
              </div>
            );

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
                transition:
                  'width 0.3s cubic-bezier(0.22,1,0.36,1), background 0.3s cubic-bezier(0.22,1,0.36,1)',
              }}
            />
          ))}
        </div>
      )}

      {/* Activity Heatmap */}
      <section>
        <ActivityHeatmap />
      </section>

      {/* Achievements */}
      <section>
        <DashboardAchievements />
      </section>

      {/* Upcoming Exams — compact card */}
      <section
        style={{
          background: 'var(--surface-container-low)',
          borderRadius: '20px',
          padding: responsiveValue(bp, { phone: '14px', tablet: '14px', desktop: '16px' }),
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: exams.length === 0 ? '4px' : '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '20px', color: 'var(--md-h4)' }}
            >
              event
            </span>
            <h2
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--on-surface)',
                margin: 0,
              }}
            >
              Upcoming Exams
            </h2>
            {exams.length > 0 && (
              <span
                style={{
                  padding: '1px 8px',
                  background: 'rgba(174,137,255,0.12)',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--md-h4)',
                }}
              >
                {exams.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowExamForm(true)}
            aria-label="Add exam"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              background: 'rgba(174,137,255,0.12)',
              border: '1px solid rgba(174,137,255,0.2)',
              borderRadius: '8px',
              color: 'var(--md-h4)',
              fontSize: '12px',
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
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              add
            </span>
            Add
          </button>
        </div>

        {exams.length === 0 ? (
          <p style={{ fontSize: '13px', margin: 0, color: 'var(--on-surface-variant)' }}>
            No exams yet — add one to start planning.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[...exams]
              .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime())
              .slice(0, 3)
              .map((exam) => {
                const daysUntil = Math.ceil(
                  (new Date(exam.examDate).getTime() - Date.now()) / 86400000
                );
                const urgency =
                  daysUntil < 7
                    ? { bg: 'rgba(253,111,133,0.15)', fg: '#fd6f85' }
                    : daysUntil < 14
                      ? { bg: 'rgba(240,208,76,0.15)', fg: '#f0d04c' }
                      : { bg: 'rgba(185,195,255,0.12)', fg: '#b9c3ff' };
                return (
                  <div
                    key={exam.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 10px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.02)',
                      transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background =
                        'rgba(255,255,255,0.04)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background =
                        'rgba(255,255,255,0.02)';
                    }}
                  >
                    <div
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: urgency.fg,
                        flexShrink: 0,
                      }}
                    />
                    <Link
                      href={`/notebooks/${exam.notebookId}`}
                      style={{
                        display: 'block',
                        flex: 1,
                        minWidth: 0,
                        textDecoration: 'none',
                        color: 'var(--on-surface)',
                        borderRadius: '6px',
                        transition: 'color 0.2s cubic-bezier(0.22,1,0.36,1)',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.color = '#ae89ff';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.color = 'var(--on-surface)';
                      }}
                    >
                      <p
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'inherit',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {exam.title}
                      </p>
                      <p
                        style={{
                          fontSize: '11px',
                          color: 'var(--outline)',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {exam.notebookName}
                      </p>
                    </Link>
                    <span
                      style={{
                        padding: '3px 10px',
                        background: urgency.bg,
                        color: urgency.fg,
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {daysUntil <= 0 ? 'today' : `${daysUntil}d`}
                    </span>
                    <button
                      onClick={() => handleDeleteExam(exam.id)}
                      aria-label="Delete exam"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: 'var(--outline)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        opacity: 0.5,
                        transition:
                          'opacity 0.2s cubic-bezier(0.22,1,0.36,1), color 0.2s cubic-bezier(0.22,1,0.36,1)',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                        (e.currentTarget as HTMLButtonElement).style.color = '#fd6f85';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = '0.5';
                        (e.currentTarget as HTMLButtonElement).style.color = 'var(--outline)';
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                        close
                      </span>
                    </button>
                  </div>
                );
              })}
            {exams.length > 3 && (
              <p
                style={{
                  fontSize: '11px',
                  color: 'var(--outline)',
                  margin: '4px 4px 0',
                }}
              >
                +{exams.length - 3} more upcoming
              </p>
            )}
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

      {/* Learn Path hero */}
      <PathHeroCard />

      {/* Bento grid */}
      <section>
        <div className="bento-3-1">
          {/* Recent Activity */}
          <div
            style={{
              background: 'var(--surface-container)',
              borderRadius: responsiveValue(bp, { phone: '22px', tablet: '24px', desktop: '32px' }),
              padding: responsiveValue(bp, { phone: '18px', tablet: '20px', desktop: '32px' }),
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: responsiveValue(bp, {
                  phone: '18px',
                  tablet: '20px',
                  desktop: '32px',
                }),
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: responsiveValue(bp, {
                      phone: '18px',
                      tablet: '17px',
                      desktop: '18px',
                    }),
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: '0 0 4px',
                  }}
                >
                  Recent Activity
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', margin: 0 }}>
                  Pick up where you left off
                </p>
              </div>
              <Link
                href="/notebooks"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--md-h4)',
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
              <div
                style={{
                  textAlign: 'center',
                  padding: '32px 0',
                  color: 'var(--on-surface-variant)',
                }}
              >
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
                          background: 'var(--surface-container-low)',
                          transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLDivElement).style.background =
                            'var(--card-hover-bg-strong)';
                          const btn = (
                            e.currentTarget as HTMLDivElement
                          ).querySelector<HTMLButtonElement>('.activity-btn');
                          if (btn) {
                            btn.style.background = '#ae89ff';
                            btn.style.color = '#2a0066';
                          }
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLDivElement).style.background =
                            'var(--surface-container-low)';
                          const btn = (
                            e.currentTarget as HTMLDivElement
                          ).querySelector<HTMLButtonElement>('.activity-btn');
                          if (btn) {
                            btn.style.background = 'var(--card-hover-bg-strong)';
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
                                color: 'var(--on-surface)',
                                margin: '0 0 2px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.name}
                            </h4>
                            <p
                              style={{
                                fontSize: '12px',
                                color: 'var(--on-surface-variant)',
                                margin: 0,
                              }}
                            >
                              {timeAgo(item.updatedAt)} · {item.pageCount}{' '}
                              {item.pageCount === 1 ? 'page' : 'pages'}
                            </p>
                          </div>
                        </div>
                        <button
                          className="activity-btn"
                          style={{
                            padding: '8px 16px',
                            background: 'var(--surface-container-highest)',
                            borderRadius: '12px',
                            border: 'none',
                            color: 'var(--md-h4)',
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
              background: '#8348f6',
              borderRadius: responsiveValue(bp, { phone: '22px', tablet: '24px', desktop: '32px' }),
              padding: responsiveValue(bp, { phone: '18px', tablet: '20px', desktop: '32px' }),
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
                {hasStudyGoals ? 'Your Goals' : 'No Goals Set'}
              </span>
              <h2
                style={{
                  fontFamily: 'var(--font-brand)',
                  fontSize: responsiveValue(bp, { phone: '24px', tablet: '26px', desktop: '30px' }),
                  fontWeight: 400,
                  margin: '0 0 16px',
                  lineHeight: 1.1,
                }}
              >
                {!hasStudyGoals
                  ? 'Set Your First Goal'
                  : goalRows.every((g) => g.current >= g.target)
                    ? 'All Goals Complete!'
                    : 'Keep Going'}
              </h2>
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
                  : hasStudyGoals
                    ? 'Track your daily and weekly targets below.'
                    : 'Head to Settings to pick the targets that matter to you.'}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {hasStudyGoals && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {goalRows.map((row) => {
                    const pct = Math.min(100, Math.round((row.current / row.target) * 100));
                    return (
                      <div
                        key={row.key}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: '20px',
                            color: pct >= 100 ? '#ffde59' : 'rgba(255,255,255,0.7)',
                            flexShrink: 0,
                            fontVariationSettings: pct >= 100 ? "'FILL' 1" : "'FILL' 0",
                          }}
                        >
                          {pct >= 100 ? 'check_circle' : row.icon}
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
                              {row.label} ({row.cadence})
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                              {row.current}/{row.target} {row.unit}
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
                                width: '100%',
                                transform: `scaleX(${pct / 100})`,
                                transformOrigin: 'left',
                                background: '#ffde59',
                                borderRadius: '9999px',
                                boxShadow: pct > 0 ? '0 0 10px rgba(255,222,89,0.4)' : 'none',
                                transition: 'transform 0.6s cubic-bezier(0.22,1,0.36,1)',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!hasStudyGoals && dashboard !== null && (
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
                    <span>Pages today</span>
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
                        width: '100%',
                        transform: `scaleX(${goalProgress / 100})`,
                        transformOrigin: 'left',
                        background: '#ffde59',
                        borderRadius: '9999px',
                        boxShadow: goalProgress > 0 ? '0 0 15px rgba(255,222,89,0.5)' : 'none',
                        transition: 'transform 0.6s cubic-bezier(0.22,1,0.36,1)',
                      }}
                    />
                  </div>
                </div>
              )}

              <Link
                href={hasStudyGoals ? '/notebooks' : '/settings'}
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
                {hasStudyGoals
                  ? goalRows.every((g) => g.current >= g.target)
                    ? 'Keep Going'
                    : 'Start Studying'
                  : 'Set Goals'}
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
            border: '2px dashed var(--ink-12)',
            borderRadius: responsiveValue(bp, { phone: '22px', tablet: '24px', desktop: '32px' }),
            padding: responsiveValue(bp, { phone: '12px', tablet: '16px', desktop: '24px' }),
          }}
        >
          <EmptyState
            mascot="holding-pen"
            title="Feeling Inspired?"
            description="No notebooks yet. Create your first one to get started on your notemage journey."
            action={
              <Link
                ref={tutorialCtaRef}
                href={ctaHref}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 32px',
                  background: 'var(--accent-strong)',
                  color: 'var(--on-primary-container)',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 700,
                  fontSize: 'var(--fs-base)',
                  textDecoration: 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.18)',
                  transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                  add
                </span>
                Create Notebook
              </Link>
            }
          />
        </section>
      )}
    </div>
  );
}

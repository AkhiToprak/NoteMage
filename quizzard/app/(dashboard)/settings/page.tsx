'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import AvatarEditor from '@/components/ui/AvatarEditor';
import { useBreakpoint } from '@/hooks/useBreakpoint';

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

type Section = 'account' | 'notifications' | 'goals' | 'subscription' | 'privacy' | 'admin' | 'stats';

interface AdminStats {
  totalUsers: number;
  freeUsers: number;
  plusUsers: number;
  proUsers: number;
  avgWeeklyTokensPerUser: number;
  weeklyTokensTotal: number;
  totalRevenue: number;
  waitlistCount: number;
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  notebookCount: number;
  postCount: number;
}

function StatCard({
  icon,
  accent,
  label,
  value,
  sub,
}: {
  icon: string;
  accent: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: '#21213e',
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        border: '1px solid rgba(70,69,96,0.2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            background: `${accent}22`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ color: accent, fontSize: '18px' }}
          >
            {icon}
          </span>
        </div>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#aaa8c8',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: '28px',
          fontWeight: 700,
          color: '#e5e3ff',
          fontFamily: 'var(--font-brand)',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '12px', color: '#8888a8' }}>{sub}</div>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: '56px',
        height: '32px',
        borderRadius: '9999px',
        background: checked ? '#ae89ff' : '#35355c',
        border: 'none',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '4px',
          left: checked ? '28px' : '4px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: '#ffffff',
          transition: 'left 0.2s cubic-bezier(0.22,1,0.36,1)',
          display: 'block',
        }}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const { isPhone } = useBreakpoint();
  const [activeSection, setActiveSection] = useState<Section>('account');

  const [notifications, setNotifications] = useState({
    studyReminders: true,
    productUpdates: true,
    weeklyReport: false,
  });

  const [studyGoals, setStudyGoals] = useState<{ type: string; target: number }[]>([]);
  const [goalCustomInputs, setGoalCustomInputs] = useState<Record<string, string>>({});
  const [goalStatus, setGoalStatus] = useState<{ type: 'error' | 'success'; msg: string } | null>(
    null
  );
  const [goalLoading, setGoalLoading] = useState(false);

  // Subscription state
  const [subTier, setSubTier] = useState<string>('FREE');
  const [subPendingTier, setSubPendingTier] = useState<string | null>(null);
  const [subPeriodEnd, setSubPeriodEnd] = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subStatus, setSubStatus] = useState<{ type: 'error' | 'success'; msg: string } | null>(
    null
  );
  const [subConfirmAction, setSubConfirmAction] = useState<{
    action: 'cancel' | 'change';
    newTier?: string;
  } | null>(null);

  // Custom greeting state
  const [customGreeting, setCustomGreeting] = useState('');
  const [greetingLoading, setGreetingLoading] = useState(false);
  const [greetingStatus, setGreetingStatus] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);

  // Mage name state
  const [mageNameInput, setMageNameInput] = useState('');
  const [mageNameLoading, setMageNameLoading] = useState(false);
  const [mageNameStatus, setMageNameStatus] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);

  // Mage level (computed from XP)
  const [mageLevel, setMageLevel] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/user/xp')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (d?.level !== undefined) setMageLevel(d.level);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/user/profile')
      .then((r) => r.json())
      .then((res) => {
        if (res?.data?.customGreeting) {
          setCustomGreeting(res.data.customGreeting);
        }
        if (res?.data?.scholarName) {
          setMageNameInput(res.data.scholarName);
        }
      })
      .catch(() => {});
  }, []);

  const handleGreetingSave = async () => {
    setGreetingLoading(true);
    setGreetingStatus(null);
    try {
      const value = customGreeting.trim() || null;
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customGreeting: value }),
      });
      if (res.ok) {
        setGreetingStatus({ type: 'success', msg: value ? 'Custom greeting saved!' : 'Reset to random greetings.' });
        if (!value) setCustomGreeting('');
      } else {
        const json = await res.json();
        setGreetingStatus({ type: 'error', msg: json.error || 'Failed to save.' });
      }
    } catch {
      setGreetingStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setGreetingLoading(false);
  };

  const handleMageNameSave = async () => {
    setMageNameLoading(true);
    setMageNameStatus(null);
    try {
      const value = mageNameInput.trim() || null;
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scholarName: value }),
      });
      if (res.ok) {
        setMageNameStatus({ type: 'success', msg: value ? 'Mage name saved!' : 'Reset to default "Mage".' });
        if (!value) setMageNameInput('');
        await updateSession();
      } else {
        const json = await res.json();
        setMageNameStatus({ type: 'error', msg: json.error || 'Failed to save.' });
      }
    } catch {
      setMageNameStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setMageNameLoading(false);
  };

  const tierNames: Record<string, string> = { FREE: 'Free', PLUS: 'Plus', PRO: 'Pro' };
  const tierPrices: Record<string, number> = { FREE: 0, PLUS: 5, PRO: 10 };
  const tierColors: Record<string, string> = { FREE: '#aaa8c8', PLUS: '#c084fc', PRO: '#fbbf24' };

  const fetchSubscription = useCallback(() => {
    fetch('/api/user/subscription')
      .then((r) => r.json())
      .then((res) => {
        if (res.data) {
          setSubTier(res.data.tier);
          setSubPendingTier(res.data.pendingTier);
          setSubPeriodEnd(res.data.subscriptionPeriodEnd);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const handleSubAction = async (action: 'cancel' | 'change', newTier?: string) => {
    setSubLoading(true);
    setSubStatus(null);
    setSubConfirmAction(null);
    try {
      const res = await fetch('/api/user/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, newTier }),
      });
      const json = await res.json();
      if (res.ok) {
        // If a checkout URL is returned, redirect to Stripe
        if (json.data?.checkoutUrl) {
          window.location.href = json.data.checkoutUrl;
          return;
        }
        if (json.data?.requiresCheckout) {
          window.location.href = json.data.checkoutUrl || '/pricing';
          return;
        }
        setSubTier(json.data.tier);
        setSubPendingTier(json.data.pendingTier);
        setSubPeriodEnd(json.data.subscriptionPeriodEnd);
        setSubStatus({ type: 'success', msg: json.message });
        await updateSession();
      } else {
        setSubStatus({ type: 'error', msg: json.error || 'Something went wrong.' });
      }
    } catch {
      setSubStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setSubLoading(false);
  };

  const handleManageBilling = async () => {
    setSubLoading(true);
    setSubStatus(null);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.data?.url) {
        window.location.href = json.data.url;
        return;
      }
      setSubStatus({ type: 'error', msg: json.error || 'Failed to open billing portal.' });
    } catch {
      setSubStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setSubLoading(false);
  };

  const handleUndoPending = async () => {
    setSubLoading(true);
    setSubStatus(null);
    try {
      const res = await fetch('/api/user/subscription', { method: 'DELETE' });
      const json = await res.json();
      if (res.ok) {
        setSubPendingTier(json.data.pendingTier);
        setSubStatus({ type: 'success', msg: json.message });
      } else {
        setSubStatus({ type: 'error', msg: json.error || 'Something went wrong.' });
      }
    } catch {
      setSubStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setSubLoading(false);
  };

  useEffect(() => {
    fetch('/api/user/study-goals')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (Array.isArray(d?.goals)) {
          setStudyGoals(d.goals.map((g: { type: string; target: number }) => ({ type: g.type, target: g.target })));
        }
      })
      .catch(() => {});
  }, []);

  const GOAL_CONFIGS = [
    { type: 'hours', icon: 'schedule', label: 'Study Hours / Week', unit: 'hrs', presets: [5, 10, 15, 20] },
    { type: 'pages', icon: 'description', label: 'Pages Written / Week', unit: 'pgs', presets: [5, 10, 20, 50] },
    { type: 'quizzes', icon: 'psychology', label: 'Quizzes / Week', unit: 'quiz', presets: [3, 5, 10, 20] },
    { type: 'notebooks', icon: 'auto_stories', label: 'Notebooks / Week', unit: 'nb', presets: [1, 2, 3, 5] },
  ];

  const getStudyGoal = (type: string) => studyGoals.find((g) => g.type === type);

  const toggleStudyGoal = (config: typeof GOAL_CONFIGS[number]) => {
    const existing = getStudyGoal(config.type);
    if (existing) {
      setStudyGoals(studyGoals.filter((g) => g.type !== config.type));
    } else {
      setStudyGoals([...studyGoals, { type: config.type, target: config.presets[1] }]);
    }
  };

  const setStudyGoalTarget = (type: string, target: number) => {
    setStudyGoals(studyGoals.map((g) => (g.type === type ? { ...g, target } : g)));
  };

  const handleGoalCustomInput = (type: string, value: string) => {
    setGoalCustomInputs((prev) => ({ ...prev, [type]: value }));
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      setStudyGoalTarget(type, num);
    }
  };

  const handleGoalSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoalLoading(true);
    setGoalStatus(null);
    try {
      const res = await fetch('/api/user/study-goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals: studyGoals }),
      });
      if (res.ok) {
        setGoalStatus({ type: 'success', msg: 'Study goals updated!' });
      } else {
        setGoalStatus({ type: 'error', msg: 'Failed to save. Try again.' });
      }
    } catch {
      setGoalStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setGoalLoading(false);
  };

  // Admin state
  const isAdmin = session?.user?.role === 'admin';
  const [adminSearch, setAdminSearch] = useState('');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminPage, setAdminPage] = useState(1);
  const [adminTotalPages, setAdminTotalPages] = useState(1);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminActionLoading, setAdminActionLoading] = useState<string | null>(null);
  const [banModalUser, setBanModalUser] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState('');
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<AdminUser | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Admin stats
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminStatsLoading, setAdminStatsLoading] = useState(false);
  const [adminStatsError, setAdminStatsError] = useState<string | null>(null);

  const fetchAdminStats = useCallback(async () => {
    setAdminStatsLoading(true);
    setAdminStatsError(null);
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        setAdminStats(data.data);
      } else {
        setAdminStatsError('Failed to load stats');
      }
    } catch {
      setAdminStatsError('Network error');
    }
    setAdminStatsLoading(false);
  }, []);

  useEffect(() => {
    if (activeSection === 'stats' && isAdmin && !adminStats && !adminStatsLoading) {
      fetchAdminStats();
    }
  }, [activeSection, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Avatar editor state
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchAdminUsers = useCallback(async (search: string, page: number) => {
    setAdminLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAdminUsers(data.data.users);
        setAdminTotal(data.data.total);
        setAdminPage(data.data.page);
        setAdminTotalPages(data.data.totalPages);
      }
    } catch {
      /* ignore */
    }
    setAdminLoading(false);
  }, []);

  // Fetch users when admin section is active
  useEffect(() => {
    if (activeSection === 'admin' && isAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAdminUsers(adminSearch, adminPage);
    }
  }, [activeSection, isAdmin, adminPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  const handleAdminSearchChange = (value: string) => {
    setAdminSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setAdminPage(1);
      fetchAdminUsers(value, 1);
    }, 400);
  };

  const handleBanUser = async () => {
    if (!banModalUser) return;
    setAdminActionLoading(banModalUser.id);
    try {
      const res = await fetch(`/api/admin/users/${banModalUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ban', reason: banReason.trim() || undefined }),
      });
      if (res.ok) {
        setAdminUsers((prev) =>
          prev.map((u) =>
            u.id === banModalUser.id
              ? { ...u, banned: true, banReason: banReason.trim() || null }
              : u
          )
        );
      }
    } catch {
      /* ignore */
    }
    setAdminActionLoading(null);
    setBanModalUser(null);
    setBanReason('');
  };

  const handleUnbanUser = async (userId: string) => {
    setAdminActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unban' }),
      });
      if (res.ok) {
        setAdminUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, banned: false, banReason: null } : u))
        );
      }
    } catch {
      /* ignore */
    }
    setAdminActionLoading(null);
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    setAdminActionLoading(deleteConfirmUser.id);
    try {
      const res = await fetch(`/api/admin/users/${deleteConfirmUser.id}`, { method: 'DELETE' });
      if (res.ok) {
        setAdminUsers((prev) => prev.filter((u) => u.id !== deleteConfirmUser.id));
        setAdminTotal((t) => t - 1);
      }
    } catch {
      /* ignore */
    }
    setAdminActionLoading(null);
    setDeleteConfirmUser(null);
  };

  // ── Admin cosmetic grant/revoke ────────────────────────────────────────
  // Drives the per-user grant menu in the admin user list. The three slugs
  // here are the only adminOnly entries in the catalog; if a new adminOnly
  // cosmetic is added, update this list so it shows up in the dropdown.
  const ADMIN_GRANTABLE_COSMETICS: { id: string; label: string }[] = [
    { id: 'title.og-noter', label: 'Title: OG-Noter' },
    { id: 'title.tester', label: 'Title: Tester' },
    { id: 'font.minecraft', label: 'Font: Minecraft' },
  ];
  const [grantFeedback, setGrantFeedback] = useState<{
    userId: string;
    kind: 'ok' | 'err';
    msg: string;
  } | null>(null);

  const handleGrantCosmetic = async (userId: string, cosmeticId: string) => {
    if (!cosmeticId) return;
    setAdminActionLoading(userId);
    setGrantFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/cosmetics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cosmeticId }),
      });
      if (res.ok) {
        const label =
          ADMIN_GRANTABLE_COSMETICS.find((c) => c.id === cosmeticId)?.label || cosmeticId;
        setGrantFeedback({ userId, kind: 'ok', msg: `Granted ${label}` });
      } else {
        setGrantFeedback({ userId, kind: 'err', msg: 'Grant failed' });
      }
    } catch {
      setGrantFeedback({ userId, kind: 'err', msg: 'Network error' });
    }
    setAdminActionLoading(null);
  };

  const handleRevokeCosmetic = async (userId: string, cosmeticId: string) => {
    if (!cosmeticId) return;
    setAdminActionLoading(userId);
    setGrantFeedback(null);
    try {
      const res = await fetch(
        `/api/admin/users/${userId}/cosmetics?cosmeticId=${encodeURIComponent(cosmeticId)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        const label =
          ADMIN_GRANTABLE_COSMETICS.find((c) => c.id === cosmeticId)?.label || cosmeticId;
        setGrantFeedback({ userId, kind: 'ok', msg: `Revoked ${label}` });
      } else {
        setGrantFeedback({ userId, kind: 'err', msg: 'Revoke failed' });
      }
    } catch {
      setGrantFeedback({ userId, kind: 'err', msg: 'Network error' });
    }
    setAdminActionLoading(null);
  };

  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [pwStatus, setPwStatus] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.newPass !== passwords.confirm) {
      setPwStatus({ type: 'error', msg: 'New passwords do not match' });
      return;
    }
    if (passwords.newPass.length < 8) {
      setPwStatus({ type: 'error', msg: 'Password must be at least 8 characters' });
      return;
    }
    setPwLoading(true);
    // Stub — wire to API when available
    await new Promise((r) => setTimeout(r, 800));
    setPwStatus({ type: 'success', msg: 'Password updated successfully' });
    setPasswords({ current: '', newPass: '', confirm: '' });
    setPwLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '16px 20px',
    background: 'rgba(14,14,28,0.6)',
    border: 'none',
    borderRadius: '16px',
    color: '#e5e3ff',
    fontSize: '15px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
  };

  const navItems: { section: Section; icon: string; label: string }[] = [
    { section: 'account', icon: 'person', label: 'Account Details' },
    { section: 'notifications', icon: 'notifications_active', label: 'Notifications' },
    { section: 'goals', icon: 'track_changes', label: 'Study Goals' },
    { section: 'subscription', icon: 'credit_card', label: 'Subscription' },
    { section: 'privacy', icon: 'lock', label: 'Privacy & Security' },
    ...(isAdmin
      ? [
          { section: 'admin' as Section, icon: 'admin_panel_settings', label: 'User Management' },
          { section: 'stats' as Section, icon: 'query_stats', label: 'Platform Stats' },
        ]
      : []),
  ];

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', position: 'relative', padding: isPhone ? '0 16px' : undefined, overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>
      {/* Ambient bg blobs */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '600px',
          height: '600px',
          background: 'rgba(174,137,255,0.05)',
          filter: 'blur(120px)',
          borderRadius: '50%',
          zIndex: 0,
          transform: 'translate(50%, -50%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: '256px',
          width: '400px',
          height: '400px',
          background: 'rgba(185,195,255,0.05)',
          filter: 'blur(100px)',
          borderRadius: '50%',
          zIndex: 0,
          transform: 'translate(-50%, 50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Page header */}
      <header style={{ marginBottom: isPhone ? '24px' : '48px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: isPhone ? '32px' : '48px',
            fontWeight: 400,
            color: '#ae89ff',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}
        >
          Settings
        </h2>
        <p style={{ fontSize: isPhone ? '14px' : '17px', color: '#aaa8c8', margin: 0 }}>
          Manage your digital study sanctum and preferences.
        </p>
      </header>

      <div
        style={{
          display: isPhone ? 'flex' : 'grid',
          flexDirection: isPhone ? 'column' : undefined,
          gridTemplateColumns: isPhone ? undefined : '1fr 2fr',
          gap: isPhone ? '16px' : '32px',
          alignItems: 'start',
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
        }}
      >
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isPhone ? '16px' : '24px' }}>
          {/* Profile card */}
          <div
            style={{
              background: '#21213e',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: 'flex',
              flexDirection: 'column',
              gap: isPhone ? '16px' : '24px',
            }}
          >
            {/* Avatar + name */}
            <div
              style={{
                display: 'flex',
                flexDirection: isPhone ? 'row' : 'column',
                alignItems: 'center',
                textAlign: isPhone ? 'left' : 'center',
                gap: isPhone ? '12px' : '16px',
              }}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {session?.user?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.avatarUrl}
                    alt={session.user.name || 'Avatar'}
                    style={{
                      width: isPhone ? '64px' : '96px',
                      height: isPhone ? '64px' : '96px',
                      borderRadius: isPhone ? '16px' : '24px',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: isPhone ? '64px' : '96px',
                      height: isPhone ? '64px' : '96px',
                      borderRadius: isPhone ? '16px' : '24px',
                      background: 'linear-gradient(135deg, #ae89ff 0%, #8348f6 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: isPhone ? '24px' : '32px',
                      fontWeight: 700,
                      color: '#ffffff',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {getInitials(session?.user?.name)}
                  </div>
                )}
                <button
                  onClick={() => setAvatarEditorOpen(true)}
                  style={{
                    position: 'absolute',
                    bottom: isPhone ? '-4px' : '-8px',
                    right: isPhone ? '-4px' : '-8px',
                    background: '#ae89ff',
                    color: '#2a0066',
                    border: 'none',
                    borderRadius: isPhone ? '8px' : '12px',
                    width: isPhone ? '24px' : '32px',
                    height: isPhone ? '24px' : '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                  }}
                  onMouseDown={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.9)';
                  }}
                  onMouseUp={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: isPhone ? '13px' : '16px' }}>
                    edit
                  </span>
                </button>
              </div>
              <div>
                <h3
                  style={{ fontSize: '18px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}
                >
                  {session?.user?.name ?? 'Mage'}
                </h3>
                <p style={{ fontSize: '13px', color: '#b9c3ff', fontWeight: 500, margin: 0 }}>
                  Mage Level {mageLevel ?? '—'}
                </p>
              </div>
            </div>

            {/* Settings nav */}
            <nav style={{
              display: 'flex',
              flexDirection: isPhone ? 'row' : 'column',
              gap: isPhone ? '8px' : '4px',
              overflowX: isPhone ? 'auto' : undefined,
              WebkitOverflowScrolling: isPhone ? 'touch' : undefined,
              scrollbarWidth: isPhone ? 'none' : undefined,
              paddingBottom: isPhone ? '4px' : undefined,
            }}>
              {navItems.map(({ section, icon, label }) => {
                const active = activeSection === section;
                return (
                  <button
                    key={section}
                    onClick={() => setActiveSection(section)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: isPhone ? '6px' : '12px',
                      padding: isPhone ? '8px 14px' : '12px 16px',
                      borderRadius: '12px',
                      border: 'none',
                      background: active ? 'rgba(174,137,255,0.1)' : 'transparent',
                      color: active ? '#ae89ff' : '#aaa8c8',
                      fontWeight: active ? 700 : 500,
                      fontSize: isPhone ? '13px' : '15px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      whiteSpace: isPhone ? 'nowrap' : undefined,
                      flexShrink: isPhone ? 0 : undefined,
                      transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          'rgba(35,35,60,0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: isPhone ? '18px' : '20px' }}>
                      {icon}
                    </span>
                    {label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isPhone ? '16px' : '24px' }}>
          {/* Account Security */}
          <section
            style={{
              background: '#272746',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: activeSection === 'account' || activeSection === 'privacy' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(174,137,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: '#ae89ff', fontSize: '24px' }}
                >
                  fingerprint
                </span>
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: 0 }}>
                Account Security
              </h3>
            </div>

            {/* Email row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isPhone ? '1fr' : '1fr auto',
                gap: '16px',
                alignItems: isPhone ? 'stretch' : 'end',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#cbd2ff',
                    paddingLeft: '4px',
                  }}
                >
                  Email Address
                </label>
                <input
                  type="email"
                  value={session?.user?.email ?? ''}
                  readOnly
                  style={{ ...inputStyle, color: '#aaa8c8' }}
                />
              </div>
              <button
                style={{
                  padding: '16px 24px',
                  background: '#35355c',
                  border: '1px solid rgba(70,69,96,0.3)',
                  borderRadius: '16px',
                  color: '#e5e3ff',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = '#292946';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = '#35355c';
                }}
              >
                Change Email
              </button>
            </div>

            {/* Change Password */}
            <div style={{ paddingTop: '24px', borderTop: '1px solid rgba(70,69,96,0.1)' }}>
              <h4
                style={{ fontSize: '16px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 24px' }}
              >
                Change Password
              </h4>
              <form
                onSubmit={handlePasswordUpdate}
                style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
              >
                {pwStatus && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background:
                        pwStatus.type === 'error'
                          ? 'rgba(253,111,133,0.12)'
                          : 'rgba(174,137,255,0.12)',
                      color: pwStatus.type === 'error' ? '#fd6f85' : '#ae89ff',
                      fontSize: '14px',
                    }}
                  >
                    {pwStatus.msg}
                  </div>
                )}
                <input
                  type="password"
                  placeholder="Current Password"
                  value={passwords.current}
                  onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                  }}
                  onBlur={(e) => {
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <input
                    type="password"
                    placeholder="New Password"
                    value={passwords.newPass}
                    onChange={(e) => setPasswords((p) => ({ ...p, newPass: e.target.value }))}
                    style={inputStyle}
                    onFocus={(e) => {
                      e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                    }}
                    onBlur={(e) => {
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  <input
                    type="password"
                    placeholder="Confirm New Password"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                    style={inputStyle}
                    onFocus={(e) => {
                      e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                    }}
                    onBlur={(e) => {
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={pwLoading}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '14px 32px',
                    background: pwLoading ? '#555578' : '#ae89ff',
                    color: pwLoading ? '#aaa8c8' : '#2a0066',
                    border: 'none',
                    borderRadius: '16px',
                    fontWeight: 700,
                    fontSize: '15px',
                    cursor: pwLoading ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: pwLoading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
                    transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                  }}
                  onMouseEnter={(e) => {
                    if (!pwLoading)
                      (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    if (!pwLoading)
                      (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                  }}
                  onMouseDown={(e) => {
                    if (!pwLoading)
                      (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)';
                  }}
                >
                  {pwLoading ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </div>
          </section>

          {/* Dashboard Greeting */}
          <section
            style={{
              background: '#272746',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: activeSection === 'account' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(240,208,76,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: '#f0d04c', fontSize: '24px' }}
                >
                  waving_hand
                </span>
              </div>
              <div>
                <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: 0 }}>
                  Dashboard Greeting
                </h3>
                <p style={{ fontSize: '13px', color: '#aaa8c8', margin: '4px 0 0 0' }}>
                  Set a custom greeting. Use {'{'}<span style={{ color: '#ae89ff' }}>name</span>{'}'} to include your name.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="e.g. The mighty {name} has arrived!"
                value={customGreeting}
                onChange={(e) => {
                  setCustomGreeting(e.target.value);
                  setGreetingStatus(null);
                }}
                maxLength={120}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: '#555578' }}>
                  {customGreeting.length}/120 &middot; Leave empty for random greetings
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {customGreeting && (
                    <button
                      onClick={async () => {
                        setCustomGreeting('');
                        setGreetingLoading(true);
                        setGreetingStatus(null);
                        try {
                          const res = await fetch('/api/user/profile', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ customGreeting: null }),
                          });
                          if (res.ok) {
                            setGreetingStatus({ type: 'success', msg: 'Reset to random greetings.' });
                          } else {
                            setGreetingStatus({ type: 'error', msg: 'Failed to clear.' });
                          }
                        } catch {
                          setGreetingStatus({ type: 'error', msg: 'Network error.' });
                        }
                        setGreetingLoading(false);
                      }}
                      disabled={greetingLoading}
                      style={{
                        padding: '10px 20px',
                        background: 'transparent',
                        border: '1px solid #555578',
                        borderRadius: '12px',
                        color: '#aaa8c8',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: greetingLoading ? 'not-allowed' : 'pointer',
                        transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                      }}
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={handleGreetingSave}
                    disabled={greetingLoading}
                    style={{
                      padding: '10px 24px',
                      background: greetingLoading
                        ? 'rgba(174,137,255,0.3)'
                        : 'linear-gradient(135deg, #ae89ff, #8348f6)',
                      border: 'none',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: greetingLoading ? 'not-allowed' : 'pointer',
                      boxShadow: greetingLoading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
                      transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!greetingLoading)
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                      if (!greetingLoading)
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                    }}
                  >
                    {greetingLoading ? 'Saving…' : 'Save Greeting'}
                  </button>
                </div>
              </div>
              {greetingStatus && (
                <p
                  style={{
                    fontSize: '14px',
                    color: greetingStatus.type === 'success' ? '#4ade80' : '#fd6f85',
                    margin: 0,
                  }}
                >
                  {greetingStatus.msg}
                </p>
              )}
            </div>
          </section>

          {/* Mage Name */}
          <section
            style={{
              background: '#272746',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: activeSection === 'account' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(174,137,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: '#ae89ff', fontSize: '24px' }}
                >
                  auto_awesome
                </span>
              </div>
              <div>
                <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: 0 }}>
                  Mage Name
                </h3>
                <p style={{ fontSize: '13px', color: '#aaa8c8', margin: '4px 0 0 0' }}>
                  Give your AI study assistant a custom name.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="e.g. Archimedes, Sage, Athena…"
                value={mageNameInput}
                onChange={(e) => {
                  setMageNameInput(e.target.value);
                  setMageNameStatus(null);
                }}
                maxLength={30}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: '#555578' }}>
                  {mageNameInput.length}/30 &middot; Leave empty for default &ldquo;Mage&rdquo;
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {mageNameInput && (
                    <button
                      onClick={async () => {
                        setMageNameInput('');
                        setMageNameLoading(true);
                        setMageNameStatus(null);
                        try {
                          const res = await fetch('/api/user/profile', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ scholarName: null }),
                          });
                          if (res.ok) {
                            setMageNameStatus({ type: 'success', msg: 'Reset to default "Mage".' });
                            await updateSession();
                          } else {
                            setMageNameStatus({ type: 'error', msg: 'Failed to clear.' });
                          }
                        } catch {
                          setMageNameStatus({ type: 'error', msg: 'Network error.' });
                        }
                        setMageNameLoading(false);
                      }}
                      disabled={mageNameLoading}
                      style={{
                        padding: '10px 20px',
                        background: 'transparent',
                        border: '1px solid #555578',
                        borderRadius: '12px',
                        color: '#aaa8c8',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: mageNameLoading ? 'not-allowed' : 'pointer',
                        transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                      }}
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={handleMageNameSave}
                    disabled={mageNameLoading}
                    style={{
                      padding: '10px 24px',
                      background: mageNameLoading
                        ? 'rgba(174,137,255,0.3)'
                        : 'linear-gradient(135deg, #ae89ff, #8348f6)',
                      border: 'none',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: mageNameLoading ? 'not-allowed' : 'pointer',
                      boxShadow: mageNameLoading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
                      transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!mageNameLoading)
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                      if (!mageNameLoading)
                        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                    }}
                  >
                    {mageNameLoading ? 'Saving…' : 'Save Name'}
                  </button>
                </div>
              </div>
              {mageNameStatus && (
                <p
                  style={{
                    fontSize: '14px',
                    color: mageNameStatus.type === 'success' ? '#4ade80' : '#fd6f85',
                    margin: 0,
                  }}
                >
                  {mageNameStatus.msg}
                </p>
              )}
            </div>
          </section>

          {/* Notifications */}
          <section
            style={{
              background: '#272746',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display:
                activeSection === 'notifications' || activeSection === 'account' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(185,195,255,0.32)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: '#b9c3ff', fontSize: '24px' }}
                >
                  campaign
                </span>
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: 0 }}>
                Notifications
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                {
                  key: 'studyReminders' as const,
                  label: 'Study Reminders',
                  desc: 'Get nudged when you fall behind your daily streak.',
                },
                {
                  key: 'productUpdates' as const,
                  label: 'Product Updates',
                  desc: 'Stay informed about new AI features and beta releases.',
                },
                {
                  key: 'weeklyReport' as const,
                  label: 'Weekly Mage Report',
                  desc: 'A detailed breakdown of your learning progress via email.',
                },
              ].map(({ key, label, desc }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '24px',
                    padding: '16px',
                    background: '#21213e',
                    borderRadius: '16px',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = '#2d2d52';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = '#21213e';
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: '#e5e3ff',
                        margin: '0 0 2px',
                      }}
                    >
                      {label}
                    </p>
                    <p style={{ fontSize: '12px', color: '#aaa8c8', margin: 0 }}>{desc}</p>
                  </div>
                  <Toggle
                    checked={notifications[key]}
                    onChange={(v) => setNotifications((n) => ({ ...n, [key]: v }))}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Study Goals */}
          <section
            style={{
              background: '#272746',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: activeSection === 'goals' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(255,222,89,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: '#ffde59', fontSize: '24px' }}
                >
                  track_changes
                </span>
              </div>
              <div>
                <h3
                  style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}
                >
                  Study Goals
                </h3>
                <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0 }}>
                  Set the targets that drive your daily learning habit.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleGoalSave}
              style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
            >
              <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0, lineHeight: 1.6 }}>
                Track what matters to you. Your page goal also drives the dashboard progress bar.
              </p>

              {/* Goal Cards Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
                  gap: '12px',
                }}
              >
                {GOAL_CONFIGS.map((config) => {
                  const goal = getStudyGoal(config.type);
                  const isSelected = !!goal;

                  return (
                    <div
                      key={config.type}
                      onClick={() => toggleStudyGoal(config)}
                      style={{
                        background: '#2d2d52',
                        borderRadius: '20px',
                        padding: '20px',
                        border: isSelected
                          ? '2px solid #ae89ff'
                          : '1px solid #555578',
                        boxShadow: isSelected ? '0 0 0 4px rgba(174,137,255,0.1)' : 'none',
                        cursor: 'pointer',
                        transition:
                          'border-color 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
                        userSelect: 'none' as const,
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: '24px',
                          color: isSelected ? '#ae89ff' : '#8888a8',
                          display: 'block',
                          marginBottom: '8px',
                          transition: 'color 0.2s cubic-bezier(0.22,1,0.36,1)',
                          fontVariationSettings: isSelected ? "'FILL' 1" : "'FILL' 0",
                        }}
                      >
                        {config.icon}
                      </span>

                      <p
                        style={{
                          margin: '0 0 4px',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: isSelected ? '#e5e3ff' : '#aaa8c8',
                          lineHeight: '1.4',
                          transition: 'color 0.2s cubic-bezier(0.22,1,0.36,1)',
                        }}
                      >
                        {config.label}
                      </p>

                      {isSelected && goal ? (
                        <p
                          style={{
                            margin: '0 0 12px',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: '#ae89ff',
                          }}
                        >
                          {goal.target} / week
                        </p>
                      ) : (
                        <p style={{ margin: '0 0 0', fontSize: '11px', color: '#555578' }}>
                          Tap to set goal
                        </p>
                      )}

                      {isSelected && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}
                        >
                          {config.presets.map((preset) => {
                            const isActive = goal?.target === preset && !goalCustomInputs[config.type];
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  setGoalCustomInputs((prev) => ({ ...prev, [config.type]: '' }));
                                  setStudyGoalTarget(config.type, preset);
                                }}
                                style={{
                                  background: isActive ? '#ae89ff' : '#35355c',
                                  color: isActive ? '#1a0044' : '#aaa8c8',
                                  border: `1px solid ${isActive ? '#ae89ff' : '#555578'}`,
                                  borderRadius: '20px',
                                  padding: '4px 10px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                                }}
                              >
                                {preset}
                              </button>
                            );
                          })}
                          <input
                            type="number"
                            min={1}
                            placeholder="?"
                            value={goalCustomInputs[config.type] || ''}
                            onChange={(e) => handleGoalCustomInput(config.type, e.target.value)}
                            style={{
                              width: '52px',
                              background: '#35355c',
                              border: goalCustomInputs[config.type] ? '1px solid #ae89ff' : '1px solid #555578',
                              borderRadius: '8px',
                              padding: '4px 8px',
                              color: '#e5e3ff',
                              fontSize: '12px',
                              fontFamily: 'inherit',
                              outline: 'none',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {goalStatus && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background:
                      goalStatus.type === 'error'
                        ? 'rgba(253,111,133,0.12)'
                        : 'rgba(174,137,255,0.12)',
                    color: goalStatus.type === 'error' ? '#fd6f85' : '#ae89ff',
                    fontSize: '14px',
                  }}
                >
                  {goalStatus.msg}
                </div>
              )}

              <button
                type="submit"
                disabled={goalLoading}
                style={{
                  alignSelf: 'flex-start',
                  padding: '14px 32px',
                  background: goalLoading ? '#555578' : '#ae89ff',
                  color: goalLoading ? '#aaa8c8' : '#2a0066',
                  border: 'none',
                  borderRadius: '16px',
                  fontWeight: 700,
                  fontSize: '15px',
                  cursor: goalLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: goalLoading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
                  transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={(e) => {
                  if (!goalLoading)
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  if (!goalLoading)
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                }}
              >
                {goalLoading ? 'Saving…' : 'Save Goals'}
              </button>
            </form>
          </section>

          {/* Subscription Management */}
          <section
            style={{
              background: '#272746',
              borderRadius: isPhone ? '20px' : '32px',
              padding: isPhone ? '20px' : '32px',
              display: activeSection === 'subscription' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '16px',
                  background: 'rgba(192,132,252,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ color: '#c084fc', fontSize: '24px' }}
                >
                  credit_card
                </span>
              </div>
              <div>
                <h3
                  style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}
                >
                  Subscription
                </h3>
                <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0 }}>
                  Manage your plan and billing.
                </p>
              </div>
            </div>

            {/* Current plan card */}
            <div
              style={{
                background: '#21213e',
                borderRadius: '20px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <p
                    style={{
                      fontSize: '13px',
                      color: '#aaa8c8',
                      margin: '0 0 4px',
                      fontWeight: 600,
                    }}
                  >
                    Current Plan
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        fontSize: '28px',
                        fontWeight: 800,
                        color: tierColors[subTier] || '#e5e3ff',
                      }}
                    >
                      {tierNames[subTier] || subTier}
                    </span>
                    {subTier !== 'FREE' && (
                      <span style={{ fontSize: '15px', color: '#aaa8c8', fontWeight: 600 }}>
                        CHF {tierPrices[subTier]}/mo
                      </span>
                    )}
                  </div>
                </div>
                {subTier !== 'FREE' && (
                  <div
                    style={{
                      padding: '6px 14px',
                      borderRadius: '9999px',
                      background: 'rgba(74,222,128,0.15)',
                      color: '#4ade80',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    Active
                  </div>
                )}
              </div>

              {subPeriodEnd && subTier !== 'FREE' && (
                <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0 }}>
                  Current period ends on{' '}
                  <span style={{ color: '#e5e3ff', fontWeight: 600 }}>
                    {new Date(subPeriodEnd).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </p>
              )}

              {/* Pending change banner */}
              {subPendingTier && (
                <div
                  style={{
                    padding: isPhone ? '14px' : '14px 18px',
                    borderRadius: '14px',
                    background:
                      subPendingTier === 'FREE' ? 'rgba(253,111,133,0.1)' : 'rgba(174,137,255,0.1)',
                    border: `1px solid ${subPendingTier === 'FREE' ? 'rgba(253,111,133,0.25)' : 'rgba(174,137,255,0.25)'}`,
                    display: 'flex',
                    flexDirection: isPhone ? 'column' : 'row',
                    justifyContent: 'space-between',
                    alignItems: isPhone ? 'flex-start' : 'center',
                    gap: '12px',
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#e5e3ff',
                        margin: '0 0 2px',
                      }}
                    >
                      {subPendingTier === 'FREE'
                        ? 'Cancellation scheduled'
                        : `Switching to ${tierNames[subPendingTier]}`}
                    </p>
                    <p style={{ fontSize: '12px', color: '#aaa8c8', margin: 0 }}>
                      {subPendingTier === 'FREE'
                        ? 'Your plan will revert to Free at the end of your billing period.'
                        : `Your plan will change to ${tierNames[subPendingTier]} (CHF ${tierPrices[subPendingTier]}/mo) at the end of your billing period.`}
                    </p>
                  </div>
                  <button
                    onClick={handleUndoPending}
                    disabled={subLoading}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '10px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#e5e3ff',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: subLoading ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                      opacity: subLoading ? 0.5 : 1,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!subLoading)
                        (e.currentTarget as HTMLButtonElement).style.background =
                          'rgba(255,255,255,0.12)';
                    }}
                    onMouseLeave={(e) => {
                      if (!subLoading)
                        (e.currentTarget as HTMLButtonElement).style.background =
                          'rgba(255,255,255,0.08)';
                    }}
                  >
                    Undo
                  </button>
                </div>
              )}
            </div>

            {/* Plan options */}
            {!subPendingTier && (
              <div>
                <p
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: '#e5e3ff',
                    margin: '0 0 16px',
                  }}
                >
                  {subTier === 'FREE' ? 'Upgrade your plan' : 'Change plan'}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr 1fr', gap: '12px' }}>
                  {(['FREE', 'PLUS', 'PRO'] as const).map((tier) => {
                    const isCurrent = tier === subTier;
                    const color = tierColors[tier];
                    return (
                      <div
                        key={tier}
                        style={{
                          background: isCurrent ? 'rgba(174,137,255,0.08)' : '#21213e',
                          borderRadius: '16px',
                          padding: '20px',
                          border: isCurrent
                            ? '1px solid rgba(174,137,255,0.3)'
                            : '1px solid rgba(70,69,96,0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          transition: 'border-color 0.2s',
                        }}
                      >
                        <div>
                          <p
                            style={{ fontSize: '17px', fontWeight: 700, color, margin: '0 0 4px' }}
                          >
                            {tierNames[tier]}
                          </p>
                          <p
                            style={{
                              fontSize: '22px',
                              fontWeight: 800,
                              color: '#e5e3ff',
                              margin: 0,
                            }}
                          >
                            {tierPrices[tier] === 0 ? 'Free' : `CHF ${tierPrices[tier]}`}
                            {tierPrices[tier] > 0 && (
                              <span style={{ fontSize: '13px', fontWeight: 500, color: '#aaa8c8' }}>
                                /mo
                              </span>
                            )}
                          </p>
                        </div>
                        {isCurrent ? (
                          <div
                            style={{
                              padding: '10px',
                              borderRadius: '12px',
                              background: 'rgba(174,137,255,0.15)',
                              color: '#ae89ff',
                              fontSize: '13px',
                              fontWeight: 700,
                              textAlign: 'center',
                            }}
                          >
                            Current plan
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              if (tier === 'FREE') {
                                setSubConfirmAction({ action: 'cancel' });
                              } else {
                                setSubConfirmAction({ action: 'change', newTier: tier });
                              }
                            }}
                            disabled={subLoading}
                            style={{
                              padding: '10px',
                              borderRadius: '12px',
                              background:
                                tier === 'FREE'
                                  ? 'rgba(253,111,133,0.12)'
                                  : 'rgba(174,137,255,0.15)',
                              color: tier === 'FREE' ? '#fd6f85' : '#ae89ff',
                              border: 'none',
                              fontSize: '13px',
                              fontWeight: 700,
                              cursor: subLoading ? 'not-allowed' : 'pointer',
                              fontFamily: 'inherit',
                              transition: 'background 0.15s',
                              opacity: subLoading ? 0.5 : 1,
                            }}
                            onMouseEnter={(e) => {
                              if (!subLoading)
                                (e.currentTarget as HTMLButtonElement).style.background =
                                  tier === 'FREE'
                                    ? 'rgba(253,111,133,0.2)'
                                    : 'rgba(174,137,255,0.25)';
                            }}
                            onMouseLeave={(e) => {
                              if (!subLoading)
                                (e.currentTarget as HTMLButtonElement).style.background =
                                  tier === 'FREE'
                                    ? 'rgba(253,111,133,0.12)'
                                    : 'rgba(174,137,255,0.15)';
                            }}
                          >
                            {tier === 'FREE'
                              ? 'Cancel subscription'
                              : tierPrices[tier] > tierPrices[subTier]
                                ? 'Upgrade'
                                : 'Downgrade'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {subStatus && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background:
                    subStatus.type === 'error'
                      ? 'rgba(253,111,133,0.12)'
                      : 'rgba(174,137,255,0.12)',
                  color: subStatus.type === 'error' ? '#fd6f85' : '#ae89ff',
                  fontSize: '14px',
                }}
              >
                {subStatus.msg}
              </div>
            )}

            {/* Manage Billing button (for paid users) */}
            {subTier !== 'FREE' && (
              <button
                onClick={handleManageBilling}
                disabled={subLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '14px 24px',
                  borderRadius: '14px',
                  background: 'rgba(174,137,255,0.12)',
                  border: '1px solid rgba(174,137,255,0.2)',
                  color: '#ae89ff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: subLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: subLoading ? 0.5 : 1,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!subLoading)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(174,137,255,0.2)';
                }}
                onMouseLeave={(e) => {
                  if (!subLoading)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(174,137,255,0.12)';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  open_in_new
                </span>
                Manage Billing
              </button>
            )}

            {/* Info note */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                padding: '16px',
                borderRadius: '14px',
                background: 'rgba(174,137,255,0.06)',
                border: '1px solid rgba(174,137,255,0.1)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: '#ae89ff', fontSize: '20px', flexShrink: 0, marginTop: '1px' }}
              >
                info
              </span>
              <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0, lineHeight: 1.6 }}>
                Plan changes and cancellations take effect at the end of your current billing period
                (30 days after payment). You will keep access to your current plan&apos;s features
                until then.
              </p>
            </div>
          </section>

          {/* Subscription confirm modal */}
          {subConfirmAction && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(8px)',
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget && !subLoading) setSubConfirmAction(null);
              }}
            >
              <div
                style={{
                  background: '#272746',
                  borderRadius: '24px',
                  padding: '32px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '20px',
                  maxWidth: '400px',
                  width: '90%',
                  border: `1px solid ${subConfirmAction.action === 'cancel' ? 'rgba(253,111,133,0.3)' : 'rgba(174,137,255,0.3)'}`,
                }}
              >
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '16px',
                    background:
                      subConfirmAction.action === 'cancel'
                        ? 'rgba(253,111,133,0.15)'
                        : 'rgba(174,137,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      color: subConfirmAction.action === 'cancel' ? '#fd6f85' : '#ae89ff',
                      fontSize: '28px',
                    }}
                  >
                    {subConfirmAction.action === 'cancel' ? 'cancel' : 'swap_horiz'}
                  </span>
                </div>
                <h3
                  style={{
                    fontSize: '20px',
                    fontWeight: 700,
                    color: '#ffffff',
                    margin: 0,
                    textAlign: 'center',
                  }}
                >
                  {subConfirmAction.action === 'cancel'
                    ? 'Cancel your subscription?'
                    : `Switch to ${tierNames[subConfirmAction.newTier!]}?`}
                </h3>
                <p
                  style={{
                    fontSize: '14px',
                    color: 'rgba(255,255,255,0.6)',
                    lineHeight: 1.7,
                    margin: 0,
                    textAlign: 'center',
                  }}
                >
                  {subConfirmAction.action === 'cancel'
                    ? "Your plan will revert to Free at the end of your current billing period. You'll keep access to your current features until then."
                    : `Your plan will change from ${tierNames[subTier]} to ${tierNames[subConfirmAction.newTier!]} (CHF ${tierPrices[subConfirmAction.newTier!]}/mo) at the end of your current billing period.`}
                </p>
                <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '4px' }}>
                  <button
                    disabled={subLoading}
                    onClick={() => setSubConfirmAction(null)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#ffffff',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '14px',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: subLoading ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: subLoading ? 0.5 : 1,
                      transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                    }}
                  >
                    Keep current plan
                  </button>
                  <button
                    disabled={subLoading}
                    onClick={() =>
                      handleSubAction(subConfirmAction.action, subConfirmAction.newTier)
                    }
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: subConfirmAction.action === 'cancel' ? '#c8475d' : '#ae89ff',
                      color: subConfirmAction.action === 'cancel' ? '#ffffff' : '#2a0066',
                      border: 'none',
                      borderRadius: '14px',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: subLoading ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: subLoading ? 0.7 : 1,
                      transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                    }}
                  >
                    {subLoading
                      ? 'Processing…'
                      : subConfirmAction.action === 'cancel'
                        ? 'Yes, cancel'
                        : 'Confirm change'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Admin: User Management */}
          {isAdmin && (
            <section
              style={{
                background: '#272746',
                borderRadius: isPhone ? '20px' : '32px',
                padding: isPhone ? '20px' : '32px',
                display: activeSection === 'admin' ? 'flex' : 'none',
                flexDirection: 'column',
                gap: '24px',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '16px',
                    background: 'rgba(255,222,89,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ color: '#ffde59', fontSize: '24px' }}
                  >
                    admin_panel_settings
                  </span>
                </div>
                <div>
                  <h3
                    style={{
                      fontSize: '22px',
                      fontWeight: 700,
                      color: '#e5e3ff',
                      margin: '0 0 4px',
                    }}
                  >
                    User Management
                  </h3>
                  <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0 }}>
                    Search, ban, or delete users.{' '}
                    {adminTotal > 0 && (
                      <span style={{ color: '#ae89ff' }}>{adminTotal} total users</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Search bar */}
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    paddingLeft: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none',
                    color: '#8888a8',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                    search
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="Search by name, username, or email…"
                  value={adminSearch}
                  onChange={(e) => handleAdminSearchChange(e.target.value)}
                  style={{
                    ...inputStyle,
                    paddingLeft: '44px',
                    paddingRight: adminSearch ? '44px' : '20px',
                  }}
                  onFocus={(e) => {
                    e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                  }}
                  onBlur={(e) => {
                    e.target.style.boxShadow = 'none';
                  }}
                />
                {adminSearch && (
                  <button
                    onClick={() => {
                      setAdminSearch('');
                      setAdminPage(1);
                      fetchAdminUsers('', 1);
                    }}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'rgba(70,69,96,0.3)',
                      border: 'none',
                      borderRadius: '8px',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#aaa8c8',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                      close
                    </span>
                  </button>
                )}
              </div>

              {/* Loading state */}
              {adminLoading && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '24px',
                    color: '#aaa8c8',
                    fontSize: '14px',
                  }}
                >
                  Loading users…
                </div>
              )}

              {/* User list */}
              {!adminLoading && adminUsers.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px',
                    color: '#8888a8',
                    fontSize: '14px',
                  }}
                >
                  {adminSearch ? 'No users found for that search.' : 'No users found.'}
                </div>
              )}

              {!adminLoading && adminUsers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {adminUsers.map((user) => {
                    const isUserLoading = adminActionLoading === user.id;
                    const isSelf = user.id === session?.user?.id;
                    return (
                      <div
                        key={user.id}
                        style={{
                          background: user.banned ? 'rgba(253,111,133,0.05)' : '#21213e',
                          borderRadius: '16px',
                          padding: isPhone ? '14px' : '16px 20px',
                          display: 'flex',
                          flexDirection: isPhone ? 'column' : 'row',
                          alignItems: isPhone ? 'flex-start' : 'center',
                          gap: isPhone ? '12px' : '16px',
                          border: user.banned
                            ? '1px solid rgba(253,111,133,0.15)'
                            : '1px solid transparent',
                          transition: 'background 0.15s',
                          opacity: isUserLoading ? 0.6 : 1,
                        }}
                      >
                        {/* Avatar */}
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: user.banned
                              ? 'linear-gradient(135deg, #fd6f85 0%, #c8475d 100%)'
                              : 'linear-gradient(135deg, #ae89ff 0%, #8348f6 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                            fontWeight: 700,
                            color: '#fff',
                            flexShrink: 0,
                          }}
                        >
                          {(user.name || user.username).charAt(0).toUpperCase()}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span style={{ fontSize: '15px', fontWeight: 700, color: '#e5e3ff' }}>
                              {user.name || user.username}
                            </span>
                            <span style={{ fontSize: '12px', color: '#8888a8' }}>
                              @{user.username}
                            </span>
                            {user.role === 'admin' && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: '#ffde59',
                                  background: 'rgba(255,222,89,0.12)',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                }}
                              >
                                Admin
                              </span>
                            )}
                            {user.banned && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: '#fd6f85',
                                  background: 'rgba(253,111,133,0.12)',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                }}
                              >
                                Banned
                              </span>
                            )}
                            {isSelf && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: '#4ade80',
                                  background: 'rgba(74,222,128,0.12)',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                }}
                              >
                                You
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              marginTop: '4px',
                            }}
                          >
                            <span style={{ fontSize: '12px', color: '#aaa8c8' }}>{user.email}</span>
                            <span style={{ fontSize: '11px', color: '#8888a8' }}>
                              {user.notebookCount} notebook{user.notebookCount !== 1 ? 's' : ''} ·{' '}
                              {user.postCount} post{user.postCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {user.banned && user.banReason && (
                            <p
                              style={{
                                fontSize: '11px',
                                color: '#fd6f85',
                                margin: '4px 0 0',
                                fontStyle: 'italic',
                              }}
                            >
                              Reason: {user.banReason}
                            </p>
                          )}
                        </div>

                        {/* Admin cosmetic grant — available for EVERY user,
                            including admins themselves, so I can grant
                            OG-Noter / Tester / Minecraft to my own account
                            without leaving the page. Rendered inline as a
                            compact select + two buttons so it doesn't eat a
                            whole modal. */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                            flexShrink: 0,
                          }}
                        >
                          <select
                            defaultValue=""
                            id={`grant-${user.id}`}
                            disabled={isUserLoading}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '10px',
                              background: 'rgba(174,137,255,0.1)',
                              color: '#e5e3ff',
                              fontSize: '12px',
                              fontWeight: 600,
                              border: '1px solid rgba(174,137,255,0.25)',
                              outline: 'none',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              minWidth: '160px',
                            }}
                          >
                            <option value="">Grant cosmetic…</option>
                            {ADMIN_GRANTABLE_COSMETICS.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={isUserLoading}
                            onClick={() => {
                              const sel = document.getElementById(
                                `grant-${user.id}`
                              ) as HTMLSelectElement | null;
                              if (sel && sel.value) handleGrantCosmetic(user.id, sel.value);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '8px 12px',
                              borderRadius: '10px',
                              border: 'none',
                              background: 'rgba(174,137,255,0.18)',
                              color: '#ae89ff',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              transition: 'background 0.15s',
                            }}
                            title="Grant selected cosmetic"
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: '14px' }}
                            >
                              add
                            </span>
                            Grant
                          </button>
                          <button
                            type="button"
                            disabled={isUserLoading}
                            onClick={() => {
                              const sel = document.getElementById(
                                `grant-${user.id}`
                              ) as HTMLSelectElement | null;
                              if (sel && sel.value) handleRevokeCosmetic(user.id, sel.value);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '8px 12px',
                              borderRadius: '10px',
                              border: '1px solid rgba(253,111,133,0.35)',
                              background: 'transparent',
                              color: '#fd6f85',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                            title="Revoke selected cosmetic"
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: '14px' }}
                            >
                              remove
                            </span>
                            Revoke
                          </button>
                          {grantFeedback?.userId === user.id && (
                            <span
                              style={{
                                fontSize: '11px',
                                fontStyle: 'italic',
                                color:
                                  grantFeedback.kind === 'ok' ? '#4ade80' : '#fd6f85',
                              }}
                            >
                              {grantFeedback.msg}
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        {!isSelf && user.role !== 'admin' && (
                          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                            {user.banned ? (
                              <button
                                onClick={() => handleUnbanUser(user.id)}
                                disabled={isUserLoading}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '8px 14px',
                                  borderRadius: '10px',
                                  border: 'none',
                                  background: 'rgba(74,222,128,0.12)',
                                  color: '#4ade80',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  transition: 'background 0.15s',
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLButtonElement).style.background =
                                    'rgba(74,222,128,0.2)';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLButtonElement).style.background =
                                    'rgba(74,222,128,0.12)';
                                }}
                              >
                                <span
                                  className="material-symbols-outlined"
                                  style={{ fontSize: '14px' }}
                                >
                                  lock_open
                                </span>
                                Unban
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setBanModalUser(user);
                                  setBanReason('');
                                }}
                                disabled={isUserLoading}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '8px 14px',
                                  borderRadius: '10px',
                                  border: 'none',
                                  background: 'rgba(255,222,89,0.1)',
                                  color: '#ffde59',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  transition: 'background 0.15s',
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLButtonElement).style.background =
                                    'rgba(255,222,89,0.18)';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLButtonElement).style.background =
                                    'rgba(255,222,89,0.1)';
                                }}
                              >
                                <span
                                  className="material-symbols-outlined"
                                  style={{ fontSize: '14px' }}
                                >
                                  block
                                </span>
                                Ban
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteConfirmUser(user)}
                              disabled={isUserLoading}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '8px 14px',
                                borderRadius: '10px',
                                border: 'none',
                                background: 'rgba(253,111,133,0.1)',
                                color: '#fd6f85',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.background =
                                  'rgba(253,111,133,0.18)';
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.background =
                                  'rgba(253,111,133,0.1)';
                              }}
                            >
                              <span
                                className="material-symbols-outlined"
                                style={{ fontSize: '14px' }}
                              >
                                delete
                              </span>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {!adminLoading && adminTotalPages > 1 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    paddingTop: '8px',
                  }}
                >
                  <button
                    onClick={() => setAdminPage((p) => Math.max(1, p - 1))}
                    disabled={adminPage <= 1}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      background: adminPage <= 1 ? '#2d2d52' : '#35355c',
                      color: adminPage <= 1 ? '#555578' : '#e5e3ff',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: adminPage <= 1 ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: '13px', color: '#aaa8c8' }}>
                    Page {adminPage} of {adminTotalPages}
                  </span>
                  <button
                    onClick={() => setAdminPage((p) => Math.min(adminTotalPages, p + 1))}
                    disabled={adminPage >= adminTotalPages}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      background: adminPage >= adminTotalPages ? '#2d2d52' : '#35355c',
                      color: adminPage >= adminTotalPages ? '#555578' : '#e5e3ff',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: adminPage >= adminTotalPages ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Admin: Platform Stats */}
          {isAdmin && (
            <section
              style={{
                background: '#272746',
                borderRadius: isPhone ? '20px' : '32px',
                padding: isPhone ? '20px' : '32px',
                display: activeSection === 'stats' ? 'flex' : 'none',
                flexDirection: 'column',
                gap: '24px',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '16px',
                      background: 'rgba(174,137,255,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ color: '#ae89ff', fontSize: '24px' }}
                    >
                      query_stats
                    </span>
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: '22px',
                        fontWeight: 700,
                        color: '#e5e3ff',
                        margin: '0 0 4px',
                      }}
                    >
                      Platform Stats
                    </h3>
                    <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0 }}>
                      High-level numbers across the whole product.
                    </p>
                  </div>
                </div>
                <button
                  onClick={fetchAdminStats}
                  disabled={adminStatsLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(174,137,255,0.25)',
                    background: 'rgba(174,137,255,0.08)',
                    color: '#ae89ff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: adminStatsLoading ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    opacity: adminStatsLoading ? 0.6 : 1,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    refresh
                  </span>
                  Refresh
                </button>
              </div>

              {adminStatsLoading && !adminStats && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px',
                    color: '#aaa8c8',
                    fontSize: '14px',
                  }}
                >
                  Loading stats…
                </div>
              )}

              {adminStatsError && (
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    background: 'rgba(253,111,133,0.08)',
                    border: '1px solid rgba(253,111,133,0.2)',
                    color: '#fd6f85',
                    fontSize: '13px',
                  }}
                >
                  {adminStatsError}
                </div>
              )}

              {adminStats && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isPhone
                      ? '1fr'
                      : 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {/* Total users */}
                  <StatCard
                    icon="group"
                    accent="#ae89ff"
                    label="Total users"
                    value={adminStats.totalUsers.toLocaleString()}
                  />
                  {/* Tier breakdown */}
                  <StatCard
                    icon="person"
                    accent="#8888a8"
                    label="Free users"
                    value={adminStats.freeUsers.toLocaleString()}
                  />
                  <StatCard
                    icon="workspace_premium"
                    accent="#b9c3ff"
                    label="Plus users"
                    value={adminStats.plusUsers.toLocaleString()}
                    sub={`$${(adminStats.plusUsers * 5).toLocaleString()} / mo`}
                  />
                  <StatCard
                    icon="diamond"
                    accent="#ffde59"
                    label="Pro users"
                    value={adminStats.proUsers.toLocaleString()}
                    sub={`$${(adminStats.proUsers * 10).toLocaleString()} / mo`}
                  />
                  {/* Revenue */}
                  <StatCard
                    icon="payments"
                    accent="#7ee3a0"
                    label="Total monthly revenue"
                    value={`$${adminStats.totalRevenue.toLocaleString()}`}
                    sub="plus × $5 + pro × $10"
                  />
                  {/* Weekly tokens */}
                  <StatCard
                    icon="token"
                    accent="#ae89ff"
                    label="Avg tokens / user (7d)"
                    value={adminStats.avgWeeklyTokensPerUser.toLocaleString()}
                    sub={`${adminStats.weeklyTokensTotal.toLocaleString()} total`}
                  />
                  {/* Waitlist */}
                  <StatCard
                    icon="mark_email_read"
                    accent="#b9c3ff"
                    label="Waitlist signups"
                    value={adminStats.waitlistCount.toLocaleString()}
                  />
                </div>
              )}
            </section>
          )}

          {/* Ban Modal */}
          {banModalUser && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={() => setBanModalUser(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: '#272746',
                  borderRadius: '24px',
                  padding: '32px',
                  width: '100%',
                  maxWidth: '440px',
                  boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
                  border: '1px solid rgba(255,222,89,0.15)',
                }}
              >
                <h3
                  style={{ fontSize: '20px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}
                >
                  Ban @{banModalUser.username}
                </h3>
                <p style={{ fontSize: '13px', color: '#aaa8c8', margin: '0 0 20px' }}>
                  This user won&apos;t be able to log in. You can unban them later.
                </p>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#cbd2ff',
                    marginBottom: '8px',
                    paddingLeft: '4px',
                  }}
                >
                  Ban Reason (optional)
                </label>
                <textarea
                  placeholder="e.g. Spam, inappropriate content…"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    minHeight: '80px',
                  }}
                  onFocus={(e) => {
                    e.target.style.boxShadow = '0 0 0 2px rgba(255,222,89,0.3)';
                  }}
                  onBlur={(e) => {
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    marginTop: '20px',
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    onClick={() => setBanModalUser(null)}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '12px',
                      border: '1px solid rgba(70,69,96,0.3)',
                      background: 'transparent',
                      color: '#aaa8c8',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBanUser}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '12px',
                      border: 'none',
                      background: '#ffde59',
                      color: '#5f4f00',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: '0 4px 16px rgba(255,222,89,0.2)',
                    }}
                  >
                    Confirm Ban
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirm Modal */}
          {deleteConfirmUser && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={() => setDeleteConfirmUser(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: '#272746',
                  borderRadius: '24px',
                  padding: '32px',
                  width: '100%',
                  maxWidth: '440px',
                  boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
                  border: '1px solid rgba(253,111,133,0.2)',
                }}
              >
                <h3
                  style={{ fontSize: '20px', fontWeight: 700, color: '#fd6f85', margin: '0 0 8px' }}
                >
                  Delete @{deleteConfirmUser.username}?
                </h3>
                <p
                  style={{ fontSize: '14px', color: '#aaa8c8', margin: '0 0 8px', lineHeight: 1.6 }}
                >
                  This will <strong style={{ color: '#fd6f85' }}>permanently delete</strong> this
                  user and all their data:
                </p>
                <ul
                  style={{
                    fontSize: '13px',
                    color: '#aaa8c8',
                    margin: '0 0 20px',
                    paddingLeft: '20px',
                    lineHeight: 1.8,
                  }}
                >
                  <li>
                    {deleteConfirmUser.notebookCount} notebook
                    {deleteConfirmUser.notebookCount !== 1 ? 's' : ''}
                  </li>
                  <li>
                    {deleteConfirmUser.postCount} post{deleteConfirmUser.postCount !== 1 ? 's' : ''}
                  </li>
                  <li>All comments, friends, and shared content</li>
                </ul>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setDeleteConfirmUser(null)}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '12px',
                      border: '1px solid rgba(70,69,96,0.3)',
                      background: 'transparent',
                      color: '#aaa8c8',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteUser}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '12px',
                      border: 'none',
                      background: '#c8475d',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: '0 4px 16px rgba(253,111,133,0.2)',
                    }}
                  >
                    Delete Permanently
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Account */}
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            style={{
              alignSelf: 'flex-start',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: 'transparent',
              color: 'rgba(253,111,133,0.7)',
              border: '1px solid rgba(253,111,133,0.2)',
              borderRadius: '12px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'border-color 0.2s cubic-bezier(0.22,1,0.36,1), color 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(253,111,133,0.5)';
              (e.currentTarget as HTMLButtonElement).style.color = '#fd6f85';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(253,111,133,0.2)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(253,111,133,0.7)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              delete_forever
            </span>
            Delete Account
          </button>
        </div>
      </div>

      {/* Avatar Editor */}
      <AvatarEditor
        open={avatarEditorOpen}
        onClose={() => setAvatarEditorOpen(false)}
        onSaved={async () => {
          setAvatarEditorOpen(false);
          await updateSession();
        }}
      />
      {/* Delete Account Confirmation Modal */}
      {deleteConfirmOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              setDeleteConfirmOpen(false);
              setDeleteConfirmText('');
            }
          }}
        >
          <div
            style={{
              background: '#272746',
              borderRadius: '24px',
              padding: '32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
              maxWidth: '400px',
              width: '90%',
              border: '1px solid rgba(253,111,133,0.3)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: 'rgba(253,111,133,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: '#fd6f85', fontSize: '28px' }}
              >
                warning
              </span>
            </div>
            <h3
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: '#ffffff',
                margin: 0,
                textAlign: 'center',
              }}
            >
              Delete your account?
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: 'rgba(255,255,255,0.6)',
                lineHeight: 1.7,
                margin: 0,
                textAlign: 'center',
              }}
            >
              All your notebooks, flashcards, progress, and data will be permanently deleted. This cannot be undone.
            </p>
            <div style={{ width: '100%' }}>
              <label
                style={{
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.5)',
                  marginBottom: '8px',
                  display: 'block',
                }}
              >
                Type <strong style={{ color: '#fd6f85' }}>DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '12px',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '4px' }}>
              <button
                disabled={deleting}
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteConfirmText('');
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '14px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: deleting ? 0.5 : 1,
                  transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                Cancel
              </button>
              <button
                disabled={deleting || deleteConfirmText !== 'DELETE'}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const res = await fetch('/api/user/delete-account', { method: 'DELETE' });
                    if (res.ok) {
                      await signOut({ callbackUrl: '/' });
                    } else {
                      alert('Failed to delete account. Please try again.');
                      setDeleting(false);
                    }
                  } catch {
                    alert('Failed to delete account. Please try again.');
                    setDeleting(false);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: deleteConfirmText === 'DELETE' ? '#c8475d' : 'rgba(200,71,93,0.3)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '14px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: deleting || deleteConfirmText !== 'DELETE' ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: deleting ? 0.7 : deleteConfirmText !== 'DELETE' ? 0.5 : 1,
                  transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete my account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

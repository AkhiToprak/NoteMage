'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect, useCallback, useRef, PointerEvent as ReactPointerEvent } from 'react';
import { useDirectUpload } from '@/hooks/useDirectUpload';

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

type Section = 'account' | 'notifications' | 'goals' | 'subscription' | 'privacy' | 'admin';

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
        background: checked ? '#ae89ff' : '#2a2a4c',
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
  const [activeSection, setActiveSection] = useState<Section>('account');

  const [notifications, setNotifications] = useState({
    studyReminders: true,
    productUpdates: true,
    weeklyReport: false,
  });

  const [dailyGoal, setDailyGoal] = useState<number>(10);
  const [goalInput, setGoalInput] = useState<string>('10');
  const [goalStatus, setGoalStatus] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [goalLoading, setGoalLoading] = useState(false);

  // Subscription state
  const [subTier, setSubTier] = useState<string>('FREE');
  const [subPendingTier, setSubPendingTier] = useState<string | null>(null);
  const [subPeriodEnd, setSubPeriodEnd] = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subStatus, setSubStatus] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [subConfirmAction, setSubConfirmAction] = useState<{ action: 'cancel' | 'change'; newTier?: string } | null>(null);

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
    fetch('/api/user/settings')
      .then((r) => r.json())
      .then((data) => {
        if (typeof data?.dailyGoal === 'number') {
          setDailyGoal(data.dailyGoal);
          setGoalInput(String(data.dailyGoal));
        }
      })
      .catch(() => {});
  }, []);

  const handleGoalSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(goalInput, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 200) {
      setGoalStatus({ type: 'error', msg: 'Please enter a number between 1 and 200.' });
      return;
    }
    setGoalLoading(true);
    setGoalStatus(null);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyGoal: parsed }),
      });
      if (res.ok) {
        setDailyGoal(parsed);
        setGoalStatus({ type: 'success', msg: 'Daily goal updated!' });
      } else {
        setGoalStatus({ type: 'error', msg: 'Failed to save. Try again.' });
      }
    } catch {
      setGoalStatus({ type: 'error', msg: 'Network error. Try again.' });
    }
    setGoalLoading(false);
  };

  // Admin state
  const isAdmin = (session?.user as any)?.role === 'admin';
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

  // Avatar editor state
  const { upload } = useDirectUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [avatarImage, setAvatarImage] = useState<HTMLImageElement | null>(null);
  const [avatarScale, setAvatarScale] = useState(1);
  const [avatarOffset, setAvatarOffset] = useState({ x: 0, y: 0 });
  const [avatarDragging, setAvatarDragging] = useState(false);
  const [avatarDragStart, setAvatarDragStart] = useState({ x: 0, y: 0 });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const EDITOR_SIZE = 280;
  const OUTPUT_SIZE = 256;

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('File too large. Maximum size is 5MB.');
      return;
    }
    setAvatarError('');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setAvatarImage(img);
        setAvatarScale(1);
        setAvatarOffset({ x: 0, y: 0 });
        setAvatarEditorOpen(true);
      };
      img.onerror = () => setAvatarError('Could not load image.');
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Draw avatar preview on canvas
  useEffect(() => {
    if (!avatarEditorOpen || !avatarImage || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, EDITOR_SIZE, EDITOR_SIZE);

    // Dark background
    ctx.fillStyle = '#0c0c1e';
    ctx.fillRect(0, 0, EDITOR_SIZE, EDITOR_SIZE);

    // Draw image centered + offset + scaled
    const imgAspect = avatarImage.width / avatarImage.height;
    let drawW: number, drawH: number;
    if (imgAspect > 1) {
      drawH = EDITOR_SIZE * avatarScale;
      drawW = drawH * imgAspect;
    } else {
      drawW = EDITOR_SIZE * avatarScale;
      drawH = drawW / imgAspect;
    }
    const drawX = (EDITOR_SIZE - drawW) / 2 + avatarOffset.x;
    const drawY = (EDITOR_SIZE - drawH) / 2 + avatarOffset.y;
    ctx.drawImage(avatarImage, drawX, drawY, drawW, drawH);

    // Draw circular mask overlay
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(EDITOR_SIZE / 2, EDITOR_SIZE / 2, EDITOR_SIZE / 2 - 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Draw border ring
    ctx.strokeStyle = '#ae89ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(EDITOR_SIZE / 2, EDITOR_SIZE / 2, EDITOR_SIZE / 2 - 8, 0, Math.PI * 2);
    ctx.stroke();
  }, [avatarEditorOpen, avatarImage, avatarScale, avatarOffset]);

  const handleAvatarPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    setAvatarDragging(true);
    setAvatarDragStart({ x: e.clientX - avatarOffset.x, y: e.clientY - avatarOffset.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleAvatarPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!avatarDragging) return;
    setAvatarOffset({
      x: e.clientX - avatarDragStart.x,
      y: e.clientY - avatarDragStart.y,
    });
  };

  const handleAvatarPointerUp = () => {
    setAvatarDragging(false);
  };

  const handleAvatarSave = async () => {
    if (!avatarImage) return;
    setAvatarUploading(true);
    setAvatarError('');

    // Render final image to offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreen.width = OUTPUT_SIZE;
    offscreen.height = OUTPUT_SIZE;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    const ratio = OUTPUT_SIZE / EDITOR_SIZE;
    const imgAspect = avatarImage.width / avatarImage.height;
    let drawW: number, drawH: number;
    if (imgAspect > 1) {
      drawH = EDITOR_SIZE * avatarScale;
      drawW = drawH * imgAspect;
    } else {
      drawW = EDITOR_SIZE * avatarScale;
      drawH = drawW / imgAspect;
    }
    const drawX = ((EDITOR_SIZE - drawW) / 2 + avatarOffset.x) * ratio;
    const drawY = ((EDITOR_SIZE - drawH) / 2 + avatarOffset.y) * ratio;

    // Circular clip
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImage, drawX, drawY, drawW * ratio, drawH * ratio);

    offscreen.toBlob(async (blob) => {
      if (!blob) {
        setAvatarError('Failed to process image.');
        setAvatarUploading(false);
        return;
      }
      try {
        const file = new File([blob], 'avatar.png', { type: 'image/png' });
        const { storagePath } = await upload(file, 'avatar');
        const res = await fetch('/api/user/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath }),
        });
        const json = await res.json();
        if (!res.ok) {
          setAvatarError(json.error || 'Upload failed.');
        } else {
          setAvatarEditorOpen(false);
          // Trigger JWT refresh so avatarUrl is re-read from DB
          await updateSession();
        }
      } catch {
        setAvatarError('Upload failed. Please try again.');
      }
      setAvatarUploading(false);
    }, 'image/png');
  };

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
    } catch { /* ignore */ }
    setAdminLoading(false);
  }, []);

  // Fetch users when admin section is active
  useEffect(() => {
    if (activeSection === 'admin' && isAdmin) {
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
          prev.map((u) => u.id === banModalUser.id ? { ...u, banned: true, banReason: banReason.trim() || null } : u)
        );
      }
    } catch { /* ignore */ }
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
          prev.map((u) => u.id === userId ? { ...u, banned: false, banReason: null } : u)
        );
      }
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
    setAdminActionLoading(null);
    setDeleteConfirmUser(null);
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
    ...(isAdmin ? [{ section: 'admin' as Section, icon: 'admin_panel_settings', label: 'User Management' }] : []),
  ];

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', position: 'relative' }}>

      {/* Ambient bg blobs */}
      <div style={{ position: 'fixed', top: 0, right: 0, width: '600px', height: '600px', background: 'rgba(174,137,255,0.05)', filter: 'blur(120px)', borderRadius: '50%', zIndex: 0, transform: 'translate(50%, -50%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: 0, left: '256px', width: '400px', height: '400px', background: 'rgba(185,195,255,0.05)', filter: 'blur(100px)', borderRadius: '50%', zIndex: 0, transform: 'translate(-50%, 50%)', pointerEvents: 'none' }} />

      {/* Page header */}
      <header style={{ marginBottom: '48px' }}>
        <h2
          style={{
            fontFamily: '"Shrikhand", serif',
            fontStyle: 'italic',
            fontSize: '48px',
            fontWeight: 400,
            color: '#ae89ff',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}
        >
          Settings
        </h2>
        <p style={{ fontSize: '17px', color: '#aaa8c8', margin: 0 }}>
          Manage your digital study sanctum and preferences.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px', alignItems: 'start', position: 'relative', zIndex: 1 }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Profile card */}
          <div style={{ background: '#161630', borderRadius: '32px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Avatar + name */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
              <div style={{ position: 'relative' }}>
                {session?.user?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.avatarUrl}
                    alt={session.user.name || 'Avatar'}
                    style={{
                      width: '96px',
                      height: '96px',
                      borderRadius: '24px',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '96px',
                      height: '96px',
                      borderRadius: '24px',
                      background: 'linear-gradient(135deg, #ae89ff 0%, #8348f6 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '32px',
                      fontWeight: 700,
                      color: '#ffffff',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {getInitials(session?.user?.name)}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleAvatarFileSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    position: 'absolute',
                    bottom: '-8px',
                    right: '-8px',
                    background: '#ae89ff',
                    color: '#2a0066',
                    border: 'none',
                    borderRadius: '12px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                  }}
                  onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.9)'; }}
                  onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                </button>
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}>
                  {session?.user?.name ?? 'Scholar'}
                </h3>
                <p style={{ fontSize: '13px', color: '#b9c3ff', fontWeight: 500, margin: 0 }}>Scholar Level 1</p>
              </div>
            </div>

            {/* Settings nav */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {navItems.map(({ section, icon, label }) => {
                const active = activeSection === section;
                return (
                  <button
                    key={section}
                    onClick={() => setActiveSection(section)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: 'none',
                      background: active ? 'rgba(174,137,255,0.1)' : 'transparent',
                      color: active ? '#ae89ff' : '#aaa8c8',
                      fontWeight: active ? 700 : 500,
                      fontSize: '15px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(35,35,60,0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{icon}</span>
                    {label}
                  </button>
                );
              })}
            </nav>
          </div>

        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Account Security */}
          <section
            style={{
              background: '#1c1c38',
              borderRadius: '32px',
              padding: '32px',
              display: activeSection === 'account' || activeSection === 'privacy' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px', height: '48px', borderRadius: '16px',
                  background: 'rgba(174,137,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ color: '#ae89ff', fontSize: '24px' }}>fingerprint</span>
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: 0 }}>Account Security</h3>
            </div>

            {/* Email row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', alignItems: 'end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#cbd2ff', paddingLeft: '4px' }}>
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
                  background: '#2a2a4c',
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
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#292946'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#2a2a4c'; }}
              >
                Change Email
              </button>
            </div>

            {/* Change Password */}
            <div style={{ paddingTop: '24px', borderTop: '1px solid rgba(70,69,96,0.1)' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 24px' }}>Change Password</h4>
              <form onSubmit={handlePasswordUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {pwStatus && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: pwStatus.type === 'error' ? 'rgba(253,111,133,0.12)' : 'rgba(174,137,255,0.12)',
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
                  onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)'; }}
                  onBlur={(e) => { e.target.style.boxShadow = 'none'; }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <input
                    type="password"
                    placeholder="New Password"
                    value={passwords.newPass}
                    onChange={(e) => setPasswords((p) => ({ ...p, newPass: e.target.value }))}
                    style={inputStyle}
                    onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)'; }}
                    onBlur={(e) => { e.target.style.boxShadow = 'none'; }}
                  />
                  <input
                    type="password"
                    placeholder="Confirm New Password"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                    style={inputStyle}
                    onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)'; }}
                    onBlur={(e) => { e.target.style.boxShadow = 'none'; }}
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
                  onMouseEnter={(e) => { if (!pwLoading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)'; }}
                  onMouseLeave={(e) => { if (!pwLoading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                  onMouseDown={(e) => { if (!pwLoading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
                >
                  {pwLoading ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </div>
          </section>

          {/* Notifications */}
          <section
            style={{
              background: '#1c1c38',
              borderRadius: '32px',
              padding: '32px',
              display: activeSection === 'notifications' || activeSection === 'account' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px', height: '48px', borderRadius: '16px',
                  background: 'rgba(185,195,255,0.32)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ color: '#b9c3ff', fontSize: '24px' }}>campaign</span>
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: 0 }}>Notifications</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { key: 'studyReminders' as const, label: 'Study Reminders', desc: 'Get nudged when you fall behind your daily streak.' },
                { key: 'productUpdates' as const, label: 'Product Updates', desc: 'Stay informed about new AI features and beta releases.' },
                { key: 'weeklyReport' as const, label: 'Weekly Scholar Report', desc: 'A detailed breakdown of your learning progress via email.' },
              ].map(({ key, label, desc }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '24px',
                    padding: '16px',
                    background: '#161630',
                    borderRadius: '16px',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#232342'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#161630'; }}
                >
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 2px' }}>{label}</p>
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
              background: '#1c1c38',
              borderRadius: '32px',
              padding: '32px',
              display: activeSection === 'goals' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px', height: '48px', borderRadius: '16px',
                  background: 'rgba(255,222,89,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ color: '#ffde59', fontSize: '24px' }}>track_changes</span>
              </div>
              <div>
                <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}>Study Goals</h3>
                <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0 }}>Set the targets that drive your daily learning habit.</p>
              </div>
            </div>

            <form onSubmit={handleGoalSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div
                style={{
                  background: '#161630',
                  borderRadius: '20px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}>Daily Page Goal</p>
                    <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0, lineHeight: 1.6 }}>
                      How many pages do you want to write or study each day? Your dashboard progress bar tracks this.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => { const v = Math.max(1, parseInt(goalInput || '0', 10) - 1); setGoalInput(String(v)); }}
                      style={{
                        width: '36px', height: '36px',
                        borderRadius: '10px',
                        background: '#2a2a4c',
                        border: 'none',
                        color: '#ae89ff',
                        fontSize: '20px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.15s',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#2d2d4a'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#2a2a4c'; }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      style={{
                        width: '72px',
                        padding: '10px',
                        background: 'rgba(35,35,60,0.6)',
                        border: 'none',
                        borderRadius: '12px',
                        color: '#e5e3ff',
                        fontSize: '18px',
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        outline: 'none',
                        textAlign: 'center',
                        boxSizing: 'border-box',
                      }}
                      onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)'; }}
                      onBlur={(e) => { e.target.style.boxShadow = 'none'; }}
                    />
                    <button
                      type="button"
                      onClick={() => { const v = Math.min(200, parseInt(goalInput || '0', 10) + 1); setGoalInput(String(v)); }}
                      style={{
                        width: '36px', height: '36px',
                        borderRadius: '10px',
                        background: '#2a2a4c',
                        border: 'none',
                        color: '#ae89ff',
                        fontSize: '20px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.15s',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#2d2d4a'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#2a2a4c'; }}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Quick presets */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[5, 10, 20, 30, 50].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setGoalInput(String(preset))}
                      style={{
                        padding: '6px 16px',
                        borderRadius: '9999px',
                        border: 'none',
                        background: parseInt(goalInput, 10) === preset ? '#ae89ff' : '#2a2a4c',
                        color: parseInt(goalInput, 10) === preset ? '#2a0066' : '#aaa8c8',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      {preset} pages
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    flex: 1,
                    height: '8px',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '9999px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, (dailyGoal / 50) * 100)}%`,
                      background: 'linear-gradient(90deg, #ae89ff 0%, #ffde59 100%)',
                      borderRadius: '9999px',
                      transition: 'width 0.4s cubic-bezier(0.22,1,0.36,1)',
                    }}
                  />
                </div>
                <span style={{ fontSize: '12px', color: '#aaa8c8', flexShrink: 0 }}>
                  Current: {dailyGoal} pages/day
                </span>
              </div>

              {goalStatus && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: goalStatus.type === 'error' ? 'rgba(253,111,133,0.12)' : 'rgba(174,137,255,0.12)',
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
                onMouseEnter={(e) => { if (!goalLoading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)'; }}
                onMouseLeave={(e) => { if (!goalLoading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
              >
                {goalLoading ? 'Saving…' : 'Save Goal'}
              </button>
            </form>
          </section>

          {/* Subscription Management */}
          <section
            style={{
              background: '#1c1c38',
              borderRadius: '32px',
              padding: '32px',
              display: activeSection === 'subscription' ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px', height: '48px', borderRadius: '16px',
                  background: 'rgba(192,132,252,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ color: '#c084fc', fontSize: '24px' }}>credit_card</span>
              </div>
              <div>
                <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}>Subscription</h3>
                <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0 }}>Manage your plan and billing.</p>
              </div>
            </div>

            {/* Current plan card */}
            <div
              style={{
                background: '#161630',
                borderRadius: '20px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '13px', color: '#aaa8c8', margin: '0 0 4px', fontWeight: 600 }}>Current Plan</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '28px', fontWeight: 800, color: tierColors[subTier] || '#e5e3ff' }}>
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
                    {new Date(subPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </p>
              )}

              {/* Pending change banner */}
              {subPendingTier && (
                <div
                  style={{
                    padding: '14px 18px',
                    borderRadius: '14px',
                    background: subPendingTier === 'FREE' ? 'rgba(253,111,133,0.1)' : 'rgba(174,137,255,0.1)',
                    border: `1px solid ${subPendingTier === 'FREE' ? 'rgba(253,111,133,0.25)' : 'rgba(174,137,255,0.25)'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#e5e3ff', margin: '0 0 2px' }}>
                      {subPendingTier === 'FREE' ? 'Cancellation scheduled' : `Switching to ${tierNames[subPendingTier]}`}
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
                    onMouseEnter={(e) => { if (!subLoading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'; }}
                    onMouseLeave={(e) => { if (!subLoading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; }}
                  >
                    Undo
                  </button>
                </div>
              )}
            </div>

            {/* Plan options */}
            {!subPendingTier && (
              <div>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 16px' }}>
                  {subTier === 'FREE' ? 'Upgrade your plan' : 'Change plan'}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  {(['FREE', 'PLUS', 'PRO'] as const).map((tier) => {
                    const isCurrent = tier === subTier;
                    const color = tierColors[tier];
                    return (
                      <div
                        key={tier}
                        style={{
                          background: isCurrent ? 'rgba(174,137,255,0.08)' : '#161630',
                          borderRadius: '16px',
                          padding: '20px',
                          border: isCurrent ? '1px solid rgba(174,137,255,0.3)' : '1px solid rgba(70,69,96,0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          transition: 'border-color 0.2s',
                        }}
                      >
                        <div>
                          <p style={{ fontSize: '17px', fontWeight: 700, color, margin: '0 0 4px' }}>
                            {tierNames[tier]}
                          </p>
                          <p style={{ fontSize: '22px', fontWeight: 800, color: '#e5e3ff', margin: 0 }}>
                            {tierPrices[tier] === 0 ? 'Free' : `CHF ${tierPrices[tier]}`}
                            {tierPrices[tier] > 0 && (
                              <span style={{ fontSize: '13px', fontWeight: 500, color: '#aaa8c8' }}>/mo</span>
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
                              background: tier === 'FREE' ? 'rgba(253,111,133,0.12)' : 'rgba(174,137,255,0.15)',
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
                              if (!subLoading) (e.currentTarget as HTMLButtonElement).style.background =
                                tier === 'FREE' ? 'rgba(253,111,133,0.2)' : 'rgba(174,137,255,0.25)';
                            }}
                            onMouseLeave={(e) => {
                              if (!subLoading) (e.currentTarget as HTMLButtonElement).style.background =
                                tier === 'FREE' ? 'rgba(253,111,133,0.12)' : 'rgba(174,137,255,0.15)';
                            }}
                          >
                            {tier === 'FREE'
                              ? 'Cancel subscription'
                              : (tierPrices[tier] > tierPrices[subTier] ? 'Upgrade' : 'Downgrade')}
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
                  background: subStatus.type === 'error' ? 'rgba(253,111,133,0.12)' : 'rgba(174,137,255,0.12)',
                  color: subStatus.type === 'error' ? '#fd6f85' : '#ae89ff',
                  fontSize: '14px',
                }}
              >
                {subStatus.msg}
              </div>
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
              <span className="material-symbols-outlined" style={{ color: '#ae89ff', fontSize: '20px', flexShrink: 0, marginTop: '1px' }}>info</span>
              <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0, lineHeight: 1.6 }}>
                Plan changes and cancellations take effect at the end of your current billing period (30 days after payment).
                You will keep access to your current plan&apos;s features until then.
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
              onClick={(e) => { if (e.target === e.currentTarget && !subLoading) setSubConfirmAction(null); }}
            >
              <div
                style={{
                  background: '#1c1c38',
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
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: subConfirmAction.action === 'cancel' ? 'rgba(253,111,133,0.15)' : 'rgba(174,137,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{
                    color: subConfirmAction.action === 'cancel' ? '#fd6f85' : '#ae89ff',
                    fontSize: '28px',
                  }}>
                    {subConfirmAction.action === 'cancel' ? 'cancel' : 'swap_horiz'}
                  </span>
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', margin: 0, textAlign: 'center' }}>
                  {subConfirmAction.action === 'cancel'
                    ? 'Cancel your subscription?'
                    : `Switch to ${tierNames[subConfirmAction.newTier!]}?`}
                </h3>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: 0, textAlign: 'center' }}>
                  {subConfirmAction.action === 'cancel'
                    ? 'Your plan will revert to Free at the end of your current billing period. You\'ll keep access to your current features until then.'
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
                    onClick={() => handleSubAction(subConfirmAction.action, subConfirmAction.newTier)}
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
                background: '#1c1c38',
                borderRadius: '32px',
                padding: '32px',
                display: activeSection === 'admin' ? 'flex' : 'none',
                flexDirection: 'column',
                gap: '24px',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    width: '48px', height: '48px', borderRadius: '16px',
                    background: 'rgba(255,222,89,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ color: '#ffde59', fontSize: '24px' }}>admin_panel_settings</span>
                </div>
                <div>
                  <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}>User Management</h3>
                  <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0 }}>
                    Search, ban, or delete users. {adminTotal > 0 && <span style={{ color: '#ae89ff' }}>{adminTotal} total users</span>}
                  </p>
                </div>
              </div>

              {/* Search bar */}
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    paddingLeft: '16px', display: 'flex', alignItems: 'center',
                    pointerEvents: 'none', color: '#8888a8',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>search</span>
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
                  onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)'; }}
                  onBlur={(e) => { e.target.style.boxShadow = 'none'; }}
                />
                {adminSearch && (
                  <button
                    onClick={() => { setAdminSearch(''); setAdminPage(1); fetchAdminUsers('', 1); }}
                    style={{
                      position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                      background: 'rgba(70,69,96,0.3)', border: 'none', borderRadius: '8px',
                      width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#aaa8c8',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                  </button>
                )}
              </div>

              {/* Loading state */}
              {adminLoading && (
                <div style={{ textAlign: 'center', padding: '24px', color: '#aaa8c8', fontSize: '14px' }}>
                  Loading users…
                </div>
              )}

              {/* User list */}
              {!adminLoading && adminUsers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px', color: '#8888a8', fontSize: '14px' }}>
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
                          background: user.banned ? 'rgba(253,111,133,0.05)' : '#161630',
                          borderRadius: '16px',
                          padding: '16px 20px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          border: user.banned ? '1px solid rgba(253,111,133,0.15)' : '1px solid transparent',
                          transition: 'background 0.15s',
                          opacity: isUserLoading ? 0.6 : 1,
                        }}
                      >
                        {/* Avatar */}
                        <div
                          style={{
                            width: '40px', height: '40px', borderRadius: '12px',
                            background: user.banned
                              ? 'linear-gradient(135deg, #fd6f85 0%, #c8475d 100%)'
                              : 'linear-gradient(135deg, #ae89ff 0%, #8348f6 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '14px', fontWeight: 700, color: '#fff', flexShrink: 0,
                          }}
                        >
                          {(user.name || user.username).charAt(0).toUpperCase()}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '15px', fontWeight: 700, color: '#e5e3ff' }}>
                              {user.name || user.username}
                            </span>
                            <span style={{ fontSize: '12px', color: '#8888a8' }}>@{user.username}</span>
                            {user.role === 'admin' && (
                              <span style={{
                                fontSize: '10px', fontWeight: 700, color: '#ffde59',
                                background: 'rgba(255,222,89,0.12)', padding: '2px 8px',
                                borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
                              }}>
                                Admin
                              </span>
                            )}
                            {user.banned && (
                              <span style={{
                                fontSize: '10px', fontWeight: 700, color: '#fd6f85',
                                background: 'rgba(253,111,133,0.12)', padding: '2px 8px',
                                borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
                              }}>
                                Banned
                              </span>
                            )}
                            {isSelf && (
                              <span style={{
                                fontSize: '10px', fontWeight: 700, color: '#4ade80',
                                background: 'rgba(74,222,128,0.12)', padding: '2px 8px',
                                borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
                              }}>
                                You
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                            <span style={{ fontSize: '12px', color: '#aaa8c8' }}>{user.email}</span>
                            <span style={{ fontSize: '11px', color: '#8888a8' }}>
                              {user.notebookCount} notebook{user.notebookCount !== 1 ? 's' : ''} · {user.postCount} post{user.postCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {user.banned && user.banReason && (
                            <p style={{ fontSize: '11px', color: '#fd6f85', margin: '4px 0 0', fontStyle: 'italic' }}>
                              Reason: {user.banReason}
                            </p>
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
                                  display: 'flex', alignItems: 'center', gap: '4px',
                                  padding: '8px 14px', borderRadius: '10px', border: 'none',
                                  background: 'rgba(74,222,128,0.12)', color: '#4ade80',
                                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                                  fontFamily: 'inherit', transition: 'background 0.15s',
                                }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(74,222,128,0.2)'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(74,222,128,0.12)'; }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>lock_open</span>
                                Unban
                              </button>
                            ) : (
                              <button
                                onClick={() => { setBanModalUser(user); setBanReason(''); }}
                                disabled={isUserLoading}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '4px',
                                  padding: '8px 14px', borderRadius: '10px', border: 'none',
                                  background: 'rgba(255,222,89,0.1)', color: '#ffde59',
                                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                                  fontFamily: 'inherit', transition: 'background 0.15s',
                                }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,222,89,0.18)'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,222,89,0.1)'; }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>block</span>
                                Ban
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteConfirmUser(user)}
                              disabled={isUserLoading}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                padding: '8px 14px', borderRadius: '10px', border: 'none',
                                background: 'rgba(253,111,133,0.1)', color: '#fd6f85',
                                fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                                fontFamily: 'inherit', transition: 'background 0.15s',
                              }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(253,111,133,0.18)'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(253,111,133,0.1)'; }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', paddingTop: '8px' }}>
                  <button
                    onClick={() => setAdminPage((p) => Math.max(1, p - 1))}
                    disabled={adminPage <= 1}
                    style={{
                      padding: '8px 16px', borderRadius: '10px', border: 'none',
                      background: adminPage <= 1 ? '#232342' : '#2a2a4c',
                      color: adminPage <= 1 ? '#555578' : '#e5e3ff',
                      fontSize: '13px', fontWeight: 700, cursor: adminPage <= 1 ? 'default' : 'pointer',
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
                      padding: '8px 16px', borderRadius: '10px', border: 'none',
                      background: adminPage >= adminTotalPages ? '#232342' : '#2a2a4c',
                      color: adminPage >= adminTotalPages ? '#555578' : '#e5e3ff',
                      fontSize: '13px', fontWeight: 700, cursor: adminPage >= adminTotalPages ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Ban Modal */}
          {banModalUser && (
            <div
              style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onClick={() => setBanModalUser(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: '#1c1c38', borderRadius: '24px', padding: '32px',
                  width: '100%', maxWidth: '440px',
                  boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
                  border: '1px solid rgba(255,222,89,0.15)',
                }}
              >
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}>
                  Ban @{banModalUser.username}
                </h3>
                <p style={{ fontSize: '13px', color: '#aaa8c8', margin: '0 0 20px' }}>
                  This user won&apos;t be able to log in. You can unban them later.
                </p>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd2ff', marginBottom: '8px', paddingLeft: '4px' }}>
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
                  onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(255,222,89,0.3)'; }}
                  onBlur={(e) => { e.target.style.boxShadow = 'none'; }}
                />
                <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setBanModalUser(null)}
                    style={{
                      padding: '12px 24px', borderRadius: '12px', border: '1px solid rgba(70,69,96,0.3)',
                      background: 'transparent', color: '#aaa8c8', fontSize: '14px', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBanUser}
                    style={{
                      padding: '12px 24px', borderRadius: '12px', border: 'none',
                      background: '#ffde59', color: '#5f4f00', fontSize: '14px', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
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
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onClick={() => setDeleteConfirmUser(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: '#1c1c38', borderRadius: '24px', padding: '32px',
                  width: '100%', maxWidth: '440px',
                  boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
                  border: '1px solid rgba(253,111,133,0.2)',
                }}
              >
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#fd6f85', margin: '0 0 8px' }}>
                  Delete @{deleteConfirmUser.username}?
                </h3>
                <p style={{ fontSize: '14px', color: '#aaa8c8', margin: '0 0 8px', lineHeight: 1.6 }}>
                  This will <strong style={{ color: '#fd6f85' }}>permanently delete</strong> this user and all their data:
                </p>
                <ul style={{ fontSize: '13px', color: '#aaa8c8', margin: '0 0 20px', paddingLeft: '20px', lineHeight: 1.8 }}>
                  <li>{deleteConfirmUser.notebookCount} notebook{deleteConfirmUser.notebookCount !== 1 ? 's' : ''}</li>
                  <li>{deleteConfirmUser.postCount} post{deleteConfirmUser.postCount !== 1 ? 's' : ''}</li>
                  <li>All comments, friends, and shared content</li>
                </ul>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setDeleteConfirmUser(null)}
                    style={{
                      padding: '12px 24px', borderRadius: '12px', border: '1px solid rgba(70,69,96,0.3)',
                      background: 'transparent', color: '#aaa8c8', fontSize: '14px', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteUser}
                    style={{
                      padding: '12px 24px', borderRadius: '12px', border: 'none',
                      background: '#c8475d', color: '#fff', fontSize: '14px', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                      boxShadow: '0 4px 16px rgba(253,111,133,0.2)',
                    }}
                  >
                    Delete Permanently
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Danger Zone */}
          <section
            style={{
              background: 'rgba(138,22,50,0.05)',
              borderRadius: '32px',
              padding: '32px',
              border: '1px solid rgba(253,111,133,0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px', height: '48px', borderRadius: '16px',
                  background: 'rgba(253,111,133,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ color: '#fd6f85', fontSize: '24px' }}>dangerous</span>
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#fd6f85', margin: 0 }}>Danger Zone</h3>
            </div>
            <div
              style={{
                background: 'rgba(138,22,50,0.1)',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <p style={{ fontSize: '14px', color: 'rgba(255,151,163,0.8)', lineHeight: 1.7, margin: 0 }}>
                Once you delete your account, there is no going back. All your study notebooks, flashcards, and progress history will be permanently erased from our neon scrolls.
              </p>
              <button
                style={{
                  alignSelf: 'flex-start',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '14px 40px',
                  background: '#c8475d',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '16px',
                  fontWeight: 700,
                  fontSize: '15px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 20px rgba(253,111,133,0.2)',
                  transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1), transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = '#fd6f85';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = '#c8475d';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                }}
                onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.95)'; }}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>delete_forever</span>
                Delete Account
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Avatar Editor Modal */}
      {avatarEditorOpen && (
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
          onClick={(e) => { if (e.target === e.currentTarget) setAvatarEditorOpen(false); }}
        >
          <div
            style={{
              background: '#1c1c38',
              borderRadius: '24px',
              padding: '32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '24px',
              minWidth: '340px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#e5e3ff' }}>
              Adjust your photo
            </h3>

            <canvas
              ref={canvasRef}
              width={EDITOR_SIZE}
              height={EDITOR_SIZE}
              style={{
                width: `${EDITOR_SIZE}px`,
                height: `${EDITOR_SIZE}px`,
                borderRadius: '50%',
                cursor: avatarDragging ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
              onPointerDown={handleAvatarPointerDown}
              onPointerMove={handleAvatarPointerMove}
              onPointerUp={handleAvatarPointerUp}
            />

            {/* Scale slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
              <span className="material-symbols-outlined" style={{ color: '#aaa8c8', fontSize: '18px' }}>photo_size_select_small</span>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.01"
                value={avatarScale}
                onChange={(e) => setAvatarScale(parseFloat(e.target.value))}
                style={{
                  flex: 1,
                  accentColor: '#ae89ff',
                  height: '6px',
                }}
              />
              <span className="material-symbols-outlined" style={{ color: '#aaa8c8', fontSize: '24px' }}>photo_size_select_large</span>
            </div>

            {avatarError && (
              <p style={{ color: '#ff6b6b', fontSize: '13px', margin: 0 }}>{avatarError}</p>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button
                onClick={() => setAvatarEditorOpen(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(174,137,255,0.3)',
                  background: 'transparent',
                  color: '#aaa8c8',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.08)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                Cancel
              </button>
              <button
                onClick={handleAvatarSave}
                disabled={avatarUploading}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: 'none',
                  background: avatarUploading ? '#6b5a99' : 'linear-gradient(135deg, #ae89ff 0%, #8348f6 100%)',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: avatarUploading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'opacity 0.15s',
                }}
              >
                {avatarUploading ? 'Uploading…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
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
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteConfirmOpen(false); }}
        >
          <div
            style={{
              background: '#1c1c38',
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
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'rgba(253,111,133,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span className="material-symbols-outlined" style={{ color: '#fd6f85', fontSize: '28px' }}>warning</span>
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', margin: 0, textAlign: 'center' }}>
              Delete your account?
            </h3>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: 0, textAlign: 'center' }}>
              This action is permanent. All your notebooks, flashcards, progress, and data will be permanently deleted. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '4px' }}>
              <button
                disabled={deleting}
                onClick={() => setDeleteConfirmOpen(false)}
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
                disabled={deleting}
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
                  background: '#c8475d',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '14px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: deleting ? 0.7 : 1,
                  transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
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

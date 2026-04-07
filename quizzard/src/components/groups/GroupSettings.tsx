'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  yellow: '#ffde59',
  border: '#555578',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

interface Props {
  groupId: string;
  group: { name: string; description: string | null; avatarUrl: string | null; ownerId: string };
  currentUserId: string;
  userRole: string;
  onUpdated: () => void;
}

export default function GroupSettings({ groupId, group, currentUserId, userRole, onUpdated }: Props) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [saving, setSaving] = useState(false);
  const [saveHover, setSaveHover] = useState(false);
  const [deleteHover, setDeleteHover] = useState(false);

  const isOwner = userRole === 'owner';

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });
      if (res.ok) onUpdated();
    } catch { /* ignore */ }
    setSaving(false);
  }, [groupId, name, description, onUpdated]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Are you sure you want to delete this group? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' });
      if (res.ok) router.push('/groups');
    } catch { /* ignore */ }
  }, [groupId, router]);

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: COLORS.textPrimary, letterSpacing: '-0.02em' }}>Group Settings</h2>
        <p style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 4, fontWeight: 500 }}>
          Manage your study group&apos;s identity and permissions.
        </p>
      </div>

      {/* Settings grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        {/* Avatar section */}
        <div style={{
          background: COLORS.cardBg, borderRadius: 16, padding: 32,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
        }}>
          <div style={{
            width: 128, height: 128, borderRadius: 20,
            background: COLORS.elevated, border: `2px dashed ${COLORS.border}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {group.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: COLORS.textMuted }}>image</span>
            )}
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>Group Avatar</p>
            <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>Recommended: 512×512px</p>
          </div>
          <button style={{
            width: '100%', padding: '10px 16px',
            background: `${COLORS.primary}33`, color: COLORS.primary,
            border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: `background 0.2s ${EASING}`,
          }}
            onMouseEnter={(e) => { (e.currentTarget).style.background = COLORS.primary; (e.currentTarget).style.color = '#fff'; }}
            onMouseLeave={(e) => { (e.currentTarget).style.background = `${COLORS.primary}33`; (e.currentTarget).style.color = COLORS.primary; }}
          >
            Change Photo
          </button>
        </div>

        {/* Form section */}
        <div style={{
          background: COLORS.cardBg, borderRadius: 16, padding: 32,
          display: 'flex', flexDirection: 'column', gap: 24,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: COLORS.textMuted }}>Group Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              style={{
                width: '100%', padding: '14px 16px',
                background: COLORS.inputBg, border: 'none', borderRadius: 12,
                color: COLORS.textPrimary, fontSize: 14, fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: COLORS.textMuted }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={4}
              style={{
                width: '100%', padding: '14px 16px',
                background: COLORS.inputBg, border: 'none', borderRadius: 12,
                color: COLORS.textPrimary, fontSize: 14, fontFamily: 'inherit',
                outline: 'none', resize: 'vertical', lineHeight: 1.6,
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              onMouseEnter={() => setSaveHover(true)}
              onMouseLeave={() => setSaveHover(false)}
              style={{
                padding: '12px 32px',
                background: COLORS.yellow, color: '#5f4f00', border: 'none',
                borderRadius: 12, fontWeight: 700, fontSize: 14,
                cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
                boxShadow: `0 8px 24px rgba(255,222,89,0.15)`,
                opacity: saving || !name.trim() ? 0.5 : 1,
                transform: saveHover && !saving ? 'scale(1.03)' : 'scale(1)',
                transition: `transform 0.2s ${EASING}, opacity 0.2s ${EASING}`,
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      {isOwner && (
        <div style={{ marginTop: 48, paddingTop: 32, borderTop: `1px solid ${COLORS.border}1a`, display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={handleDelete}
            onMouseEnter={() => setDeleteHover(true)}
            onMouseLeave={() => setDeleteHover(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 32px',
              background: deleteHover ? `${COLORS.error}1a` : 'transparent',
              color: COLORS.error, border: `1px solid ${COLORS.error}`,
              borderRadius: 12, fontWeight: 700, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: `background 0.2s ${EASING}`,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
            Delete Group
          </button>
        </div>
      )}
    </div>
  );
}

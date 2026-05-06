'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

const COLORS = {
  pageBg: '#1a1a36',
  cardBg: '#21213e',
  elevated: '#2d2d52',
  inputBg: '#35355c',
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
  group: {
    name: string;
    description: string | null;
    avatarUrl: string | null;
    ownerId: string;
    type: string;
    allowMemberChat: boolean;
    allowMemberSharing: boolean;
    allowMemberInvites: boolean;
  };
  currentUserId: string;
  userRole: string;
  onUpdated: () => void;
}

export default function GroupSettings({
  groupId,
  group,
  currentUserId,
  userRole,
  onUpdated,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [saving, setSaving] = useState(false);
  const [saveHover, setSaveHover] = useState(false);
  const [deleteHover, setDeleteHover] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(group.avatarUrl);
  const [allowChat, setAllowChat] = useState(group.allowMemberChat);
  const [allowSharing, setAllowSharing] = useState(group.allowMemberSharing);
  const [allowInvites, setAllowInvites] = useState(group.allowMemberInvites);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwner = userRole === 'owner';

  const handleAvatarUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const allowed = ['image/png', 'image/jpeg', 'image/webp'];
      if (!allowed.includes(file.type)) {
        alert('Only PNG, JPEG, and WebP images are allowed.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('File must be under 5MB.');
        return;
      }

      setAvatarUploading(true);
      try {
        // 1. Get signed URL
        const urlRes = await fetch('/api/uploads/signed-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            purpose: 'group-avatar',
            fileName: file.name,
            contentType: file.type,
            groupId,
          }),
        });
        if (!urlRes.ok) throw new Error('Failed to get upload URL');
        const urlJson = await urlRes.json();
        const { signedUrl, storagePath } = urlJson.data;

        // 2. Upload file to storage
        const uploadRes = await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
          body: file,
        });
        if (!uploadRes.ok) throw new Error('Upload failed');

        // 3. Confirm with backend
        const confirmRes = await fetch(`/api/groups/${groupId}/avatar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath }),
        });
        if (!confirmRes.ok) throw new Error('Failed to update avatar');
        const confirmJson = await confirmRes.json();
        setAvatarUrl(confirmJson.data.avatarUrl);
        onUpdated();
      } catch {
        alert('Failed to upload avatar. Please try again.');
      }
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [groupId, onUpdated]
  );

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          ...(group.type === 'class'
            ? {
                allowMemberChat: allowChat,
                allowMemberSharing: allowSharing,
                allowMemberInvites: allowInvites,
              }
            : {}),
        }),
      });
      if (res.ok) onUpdated();
    } catch {
      /* ignore */
    }
    setSaving(false);
  }, [groupId, name, description, onUpdated]);

  const handleDelete = useCallback(async () => {
    if (
      !window.confirm('Are you sure you want to delete this group? This action cannot be undone.')
    )
      return;
    try {
      const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' });
      if (res.ok) router.push('/groups');
    } catch {
      /* ignore */
    }
  }, [groupId, router]);

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: COLORS.textPrimary,
            letterSpacing: '-0.02em',
          }}
        >
          Group Settings
        </h2>
        <p style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 4, fontWeight: 500 }}>
          Manage your study group&apos;s identity and permissions.
        </p>
      </div>

      {/* Settings grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        {/* Avatar section */}
        <div
          style={{
            background: COLORS.cardBg,
            borderRadius: 16,
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
          }}
        >
          <div
            style={{
              width: 128,
              height: 128,
              borderRadius: 20,
              background: COLORS.elevated,
              border: `2px dashed ${COLORS.border}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 40, color: COLORS.textMuted }}
              >
                image
              </span>
            )}
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>Group Avatar</p>
            <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
              Recommended: 512×512px
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={handleAvatarUpload}
          />
          <button
            style={{
              width: '100%',
              padding: '10px 16px',
              background: `${COLORS.primary}33`,
              color: COLORS.primary,
              border: 'none',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 13,
              cursor: avatarUploading ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              transition: `background 0.2s ${EASING}`,
              opacity: avatarUploading ? 0.6 : 1,
            }}
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            onMouseEnter={(e) => {
              if (!avatarUploading) {
                e.currentTarget.style.background = COLORS.primary;
                e.currentTarget.style.color = '#fff';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `${COLORS.primary}33`;
              e.currentTarget.style.color = COLORS.primary;
            }}
          >
            {avatarUploading ? 'Uploading...' : 'Change Photo'}
          </button>
        </div>

        {/* Form section */}
        <div
          style={{
            background: COLORS.cardBg,
            borderRadius: 16,
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: COLORS.textMuted,
              }}
            >
              Group Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: COLORS.inputBg,
                border: 'none',
                borderRadius: 12,
                color: COLORS.textPrimary,
                fontSize: 14,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: COLORS.textMuted,
              }}
            >
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={4}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: COLORS.inputBg,
                border: 'none',
                borderRadius: 12,
                color: COLORS.textPrimary,
                fontSize: 14,
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'vertical',
                lineHeight: 1.6,
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
                background: COLORS.yellow,
                color: '#5f4f00',
                border: 'none',
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 14,
                cursor: saving ? 'wait' : 'pointer',
                fontFamily: 'inherit',
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

      {/* Class permissions */}
      {group.type === 'class' && (
        <div
          style={{
            marginTop: 32,
            background: COLORS.cardBg,
            borderRadius: 16,
            padding: 32,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>
            Student Permissions
          </h3>
          <p style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 24 }}>
            Control what students can do in this class.
          </p>

          {[
            {
              key: 'chat' as const,
              label: 'Allow students to chat',
              icon: 'chat',
              value: allowChat,
              setter: setAllowChat,
            },
            {
              key: 'sharing' as const,
              label: 'Allow students to share content',
              icon: 'share',
              value: allowSharing,
              setter: setAllowSharing,
            },
            {
              key: 'invites' as const,
              label: 'Allow students to invite members',
              icon: 'person_add',
              value: allowInvites,
              setter: setAllowInvites,
            },
          ].map((perm) => (
            <div
              key={perm.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 0',
                borderBottom: perm.key !== 'invites' ? `1px solid ${COLORS.border}1a` : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 20, color: COLORS.textMuted }}
                >
                  {perm.icon}
                </span>
                <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.textPrimary }}>
                  {perm.label}
                </span>
              </div>
              <button
                onClick={() => perm.setter(!perm.value)}
                style={{
                  width: 48,
                  height: 28,
                  borderRadius: 14,
                  border: 'none',
                  background: perm.value ? COLORS.primary : COLORS.inputBg,
                  cursor: 'pointer',
                  position: 'relative',
                  transition: `background 0.2s ${EASING}`,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: 3,
                    left: perm.value ? 23 : 3,
                    transition: `left 0.2s ${EASING}`,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Danger zone */}
      {isOwner && (
        <div
          style={{
            marginTop: 48,
            paddingTop: 32,
            borderTop: `1px solid ${COLORS.border}1a`,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={handleDelete}
            onMouseEnter={() => setDeleteHover(true)}
            onMouseLeave={() => setDeleteHover(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 32px',
              background: deleteHover ? `${COLORS.error}1a` : 'transparent',
              color: COLORS.error,
              border: `1px solid ${COLORS.error}`,
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: `background 0.2s ${EASING}`,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              delete
            </span>
            Delete Group
          </button>
        </div>
      )}
    </div>
  );
}

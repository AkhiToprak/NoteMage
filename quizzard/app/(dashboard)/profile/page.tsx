'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import TrophyShelf from '@/components/features/TrophyShelf';

interface ProfileData {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  dailyGoal: number;
  age: number | null;
  location: string | null;
  school: string | null;
  lineOfWork: string | null;
  profilePrivate: boolean;
  hideAchievements: boolean;
  createdAt: string;
}

interface FormState {
  name: string;
  bio: string;
  age: string;
  location: string;
  school: string;
  lineOfWork: string;
  profilePrivate: boolean;
  hideAchievements: boolean;
}

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: '#1c1c38',
  border: '1px solid rgba(170,168,200,0.2)',
  borderRadius: '10px',
  color: '#e5e3ff',
  fontSize: '14px',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 0.2s cubic-bezier(0.22,1,0.36,1)',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#8888a8',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '6px',
  display: 'block',
};

const DETAIL_ITEMS: { key: keyof ProfileData; label: string; icon: string }[] = [
  { key: 'age', label: 'Age', icon: 'person' },
  { key: 'location', label: 'Location', icon: 'location_on' },
  { key: 'school', label: 'School', icon: 'school' },
  { key: 'lineOfWork', label: 'Line of Work', icon: 'work' },
];

export default function ProfilePage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: '',
    bio: '',
    age: '',
    location: '',
    school: '',
    lineOfWork: '',
    profilePrivate: false,
    hideAchievements: false,
  });

  useEffect(() => {
    fetch('/api/user/profile')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (d?.id) setProfile(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const startEditing = () => {
    if (!profile) return;
    setForm({
      name: profile.name || '',
      bio: profile.bio || '',
      age: profile.age != null ? String(profile.age) : '',
      location: profile.location || '',
      school: profile.school || '',
      lineOfWork: profile.lineOfWork || '',
      profilePrivate: profile.profilePrivate,
      hideAchievements: profile.hideAchievements,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || null,
          bio: form.bio || null,
          age: form.age ? parseInt(form.age, 10) : null,
          location: form.location || null,
          school: form.school || null,
          lineOfWork: form.lineOfWork || null,
          profilePrivate: form.profilePrivate,
          hideAchievements: form.hideAchievements,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const updated = json?.data ?? json;
        setProfile(updated);
        setEditing(false);
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '48px', color: '#ae89ff', animation: 'spin 1s linear infinite' }}
        >
          progress_activity
        </span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 24px', color: '#aaa8c8' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '48px', display: 'block', marginBottom: '16px', opacity: 0.4 }}>
          error
        </span>
        <p style={{ fontSize: '16px', margin: 0 }}>Could not load profile.</p>
      </div>
    );
  }

  const hasDetails = DETAIL_ITEMS.some((item) => profile[item.key] != null);

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Profile Header */}
      <div
        style={{
          background: '#161630',
          borderRadius: '24px',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {/* Avatar */}
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatarUrl}
            alt={profile.name || profile.username}
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              objectFit: 'cover',
              marginBottom: '16px',
              border: '3px solid rgba(174,137,255,0.3)',
            }}
          />
        ) : (
          <div
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #ae89ff 0%, #8348f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              fontWeight: 700,
              color: '#ffffff',
              marginBottom: '16px',
              border: '3px solid rgba(174,137,255,0.3)',
            }}
          >
            {getInitials(profile.name || profile.username)}
          </div>
        )}

        {/* Name & Username */}
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 4px' }}>
          {profile.name || profile.username}
        </h1>
        <p style={{ fontSize: '14px', color: '#aaa8c8', margin: '0 0 12px' }}>
          @{profile.username}
        </p>

        {/* Bio */}
        {profile.bio && (
          <p style={{ fontSize: '14px', color: '#b9c3ff', margin: '0 0 16px', lineHeight: 1.6, maxWidth: '480px' }}>
            {profile.bio}
          </p>
        )}

        {/* Member Since */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa8c8', fontSize: '13px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>calendar_month</span>
          Member since {formatDate(profile.createdAt)}
        </div>

        {/* Privacy badges */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {profile.profilePrivate && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 12px',
                background: 'rgba(136,136,168,0.12)',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#8888a8',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>lock</span>
              Private Profile
            </div>
          )}
          {profile.hideAchievements && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 12px',
                background: 'rgba(136,136,168,0.12)',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#8888a8',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>visibility_off</span>
              Achievements Hidden
            </div>
          )}
        </div>

        {/* Edit Profile Button */}
        <button
          onClick={startEditing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '20px',
            padding: '10px 24px',
            background: 'rgba(174,137,255,0.15)',
            color: '#ae89ff',
            borderRadius: '12px',
            border: '1px solid rgba(174,137,255,0.25)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), background 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.25)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.15)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
          Edit Profile
        </button>
      </div>

      {/* Profile Details (view mode) */}
      {!editing && hasDetails && (
        <div
          style={{
            background: '#161630',
            borderRadius: '24px',
            padding: '28px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#e5e3ff', margin: 0 }}>About</h3>
          {DETAIL_ITEMS.map((item) => {
            const value = profile[item.key];
            if (value == null) return null;
            return (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '20px', color: '#ae89ff', flexShrink: 0 }}
                >
                  {item.icon}
                </span>
                <div>
                  <p style={{ fontSize: '11px', color: '#8888a8', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    {item.label}
                  </p>
                  <p style={{ fontSize: '14px', color: '#e5e3ff', margin: 0 }}>
                    {String(value)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Form */}
      {editing && (
        <div
          style={{
            background: '#161630',
            borderRadius: '24px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#e5e3ff', margin: 0 }}>Edit Profile</h3>

          {/* Name */}
          <div>
            <label style={LABEL_STYLE}>Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={100}
              placeholder="Your full name"
              style={INPUT_STYLE}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)'; }}
            />
          </div>

          {/* Bio */}
          <div>
            <label style={LABEL_STYLE}>Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              maxLength={160}
              placeholder="Write a short description about yourself"
              rows={3}
              style={{
                ...INPUT_STYLE,
                resize: 'vertical',
                minHeight: '72px',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)'; }}
            />
            <p style={{ fontSize: '11px', color: '#6a6a8c', margin: '4px 0 0', textAlign: 'right' }}>
              {form.bio.length}/160
            </p>
          </div>

          {/* Two-column grid for short fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={LABEL_STYLE}>Age</label>
              <input
                type="number"
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                min={1}
                max={150}
                placeholder="Your age"
                style={INPUT_STYLE}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)'; }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                maxLength={100}
                placeholder="City, Country"
                style={INPUT_STYLE}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)'; }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>School</label>
              <input
                type="text"
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
                maxLength={100}
                placeholder="Your school or university"
                style={INPUT_STYLE}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)'; }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Line of Work</label>
              <input
                type="text"
                value={form.lineOfWork}
                onChange={(e) => setForm({ ...form, lineOfWork: e.target.value })}
                maxLength={100}
                placeholder="Your profession"
                style={INPUT_STYLE}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(174,137,255,0.5)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(170,168,200,0.2)'; }}
              />
            </div>
          </div>

          {/* Privacy Toggles */}
          <div style={{ borderTop: '1px solid rgba(170,168,200,0.1)', paddingTop: '20px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 16px' }}>Privacy</h4>

            {/* Private Profile Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#1c1c38',
                borderRadius: '12px',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#ae89ff' }}>lock</span>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#e5e3ff', margin: 0 }}>Private Profile</p>
                  <p style={{ fontSize: '11px', color: '#8888a8', margin: '2px 0 0' }}>Only friends can see your full profile</p>
                </div>
              </div>
              <button
                onClick={() => setForm({ ...form, profilePrivate: !form.profilePrivate })}
                style={{
                  width: '44px',
                  height: '24px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  background: form.profilePrivate ? '#ae89ff' : '#3a3a5c',
                  transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: '3px',
                    left: form.profilePrivate ? '23px' : '3px',
                    transition: 'left 0.2s cubic-bezier(0.22,1,0.36,1)',
                  }}
                />
              </button>
            </div>

            {/* Hide Achievements Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#1c1c38',
                borderRadius: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#ae89ff' }}>visibility_off</span>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#e5e3ff', margin: 0 }}>Hide Achievements</p>
                  <p style={{ fontSize: '11px', color: '#8888a8', margin: '2px 0 0' }}>Others cannot see your achievements</p>
                </div>
              </div>
              <button
                onClick={() => setForm({ ...form, hideAchievements: !form.hideAchievements })}
                style={{
                  width: '44px',
                  height: '24px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  background: form.hideAchievements ? '#ae89ff' : '#3a3a5c',
                  transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: '3px',
                    left: form.hideAchievements ? '23px' : '3px',
                    transition: 'left 0.2s cubic-bezier(0.22,1,0.36,1)',
                  }}
                />
              </button>
            </div>
          </div>

          {/* Save / Cancel */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              style={{
                padding: '10px 24px',
                background: 'transparent',
                color: '#aaa8c8',
                borderRadius: '12px',
                border: '1px solid rgba(170,168,200,0.2)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(170,168,200,0.08)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 24px',
                background: '#ae89ff',
                color: '#2a0066',
                borderRadius: '12px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 600,
                cursor: saving ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                opacity: saving ? 0.7 : 1,
                transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Achievements Section */}
      <TrophyShelf />
    </div>
  );
}

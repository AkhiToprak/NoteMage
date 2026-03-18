'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Plus } from 'lucide-react';

export default function NotebookLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${id}/sections`);
        const json = await res.json();
        if (json.success && json.data) {
          for (const section of json.data) {
            if (section.pages && section.pages.length > 0) {
              router.replace(`/notebooks/${id}/pages/${section.pages[0].id}`);
              return;
            }
          }
        }
      } catch {
        // Fall through to empty state
      }
      setChecked(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!checked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '400px' }}>
        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        `}</style>
        <div style={{ width: '160px', height: '16px', borderRadius: '8px', background: 'rgba(237,233,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '400px',
        gap: '16px',
        textAlign: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '20px',
          background: 'rgba(140,82,255,0.08)',
          border: '1px solid rgba(140,82,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BookOpen size={32} style={{ color: 'rgba(140,82,255,0.4)' }} />
      </div>
      <div>
        <p
          style={{
            fontFamily: "'Gliker', 'DM Sans', sans-serif",
            fontSize: '17px',
            fontWeight: '600',
            color: '#ede9ff',
            margin: '0 0 6px',
          }}
        >
          This notebook is empty
        </p>
        <p
          style={{
            fontFamily: "'Gliker', 'DM Sans', sans-serif",
            fontSize: '14px',
            color: 'rgba(237,233,255,0.35)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Create a section in the sidebar to start adding pages
        </p>
      </div>
      <button
        onClick={() => {
          const btn = document.querySelector('[data-new-section-btn]') as HTMLButtonElement | null;
          if (btn) btn.click();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          padding: '10px 20px',
          marginTop: '4px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #8c52ff, #5170ff)',
          border: 'none',
          fontFamily: "'Gliker', 'DM Sans', sans-serif",
          fontSize: '14px',
          fontWeight: '700',
          color: '#ede9ff',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(140,82,255,0.28)',
          transition: 'opacity 0.12s ease, transform 0.1s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '0.9';
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '1';
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
        }}
      >
        <Plus size={15} />
        New Section
      </button>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, BookOpen } from 'lucide-react';
import NotebookCard, { type NotebookData } from '@/components/features/NotebookCard';
import NotebookForm from '@/components/features/NotebookForm';

function SkeletonCard() {
  return (
    <div
      style={{
        background: '#0d0c20',
        border: '1px solid rgba(140,82,255,0.12)',
        borderRadius: '14px',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: '4px', background: 'rgba(140,82,255,0.15)' }} />
      <div style={{ padding: '18px 20px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ width: '60px', height: '10px', borderRadius: '5px', background: 'rgba(237,233,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ width: '80%', height: '14px', borderRadius: '6px', background: 'rgba(237,233,255,0.08)', animation: 'pulse 1.5s ease-in-out infinite 0.1s' }} />
        <div style={{ width: '100%', height: '11px', borderRadius: '5px', background: 'rgba(237,233,255,0.05)', animation: 'pulse 1.5s ease-in-out infinite 0.2s' }} />
        <div style={{ width: '70%', height: '11px', borderRadius: '5px', background: 'rgba(237,233,255,0.05)', animation: 'pulse 1.5s ease-in-out infinite 0.25s' }} />
      </div>
      <div style={{ padding: '10px 20px 14px', borderTop: '1px solid rgba(140,82,255,0.08)', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ width: '50px', height: '11px', borderRadius: '5px', background: 'rgba(237,233,255,0.05)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ width: '40px', height: '11px', borderRadius: '5px', background: 'rgba(237,233,255,0.05)', animation: 'pulse 1.5s ease-in-out infinite 0.15s' }} />
      </div>
    </div>
  );
}

export default function NotebooksPage() {
  const [notebooks, setNotebooks] = useState<NotebookData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingNotebook, setEditingNotebook] = useState<NotebookData | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NotebookData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchNotebooks = useCallback(async () => {
    try {
      const res = await fetch('/api/notebooks');
      const json = await res.json();
      if (json.success) setNotebooks(json.data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotebooks();
  }, [fetchNotebooks]);

  const handleCreate = async (data: { name: string; subject: string; description: string; color: string }) => {
    setFormLoading(true);
    try {
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setShowForm(false);
        await fetchNotebooks();
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (data: { name: string; subject: string; description: string; color: string }) => {
    if (!editingNotebook) return;
    setFormLoading(true);
    try {
      const res = await fetch(`/api/notebooks/${editingNotebook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setEditingNotebook(null);
        setShowForm(false);
        await fetchNotebooks();
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/notebooks/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setDeleteTarget(null);
        await fetchNotebooks();
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '960px' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "'Gliker', 'DM Sans', sans-serif",
              fontSize: '28px',
              fontWeight: '700',
              color: '#ede9ff',
              margin: 0,
              letterSpacing: '-0.03em',
            }}
          >
            My Notebooks
          </h1>
          {!isLoading && notebooks.length > 0 && (
            <p
              style={{
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '14px',
                color: 'rgba(237,233,255,0.4)',
                margin: '6px 0 0',
              }}
            >
              {notebooks.length} notebook{notebooks.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <button
          onClick={() => { setEditingNotebook(null); setShowForm(true); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '10px 18px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #8c52ff, #5170ff)',
            border: 'none',
            fontFamily: "'Gliker', 'DM Sans', sans-serif",
            fontSize: '14px',
            fontWeight: '700',
            color: '#ede9ff',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(140,82,255,0.3)',
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
          onMouseDown={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0) scale(0.98)';
          }}
          onMouseUp={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px) scale(1)';
          }}
        >
          <Plus size={16} />
          New Notebook
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px',
          }}
        >
          {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && notebooks.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 20px',
            gap: '16px',
            textAlign: 'center',
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
                fontSize: '16px',
                fontWeight: '600',
                color: '#ede9ff',
                margin: '0 0 6px',
              }}
            >
              No notebooks yet
            </p>
            <p
              style={{
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '14px',
                color: 'rgba(237,233,255,0.35)',
                margin: 0,
              }}
            >
              Create your first notebook to start studying
            </p>
          </div>
          <button
            onClick={() => { setEditingNotebook(null); setShowForm(true); }}
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
            }}
          >
            <Plus size={15} />
            Create your first notebook
          </button>
        </div>
      )}

      {/* Notebook grid */}
      {!isLoading && notebooks.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px',
          }}
        >
          {notebooks.map((nb) => (
            <NotebookCard
              key={nb.id}
              notebook={nb}
              onEdit={(n) => { setEditingNotebook(n); setShowForm(true); }}
              onDelete={(n) => setDeleteTarget(n)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit form modal */}
      {showForm && (
        <NotebookForm
          notebook={editingNotebook}
          onSubmit={editingNotebook ? handleEdit : handleCreate}
          onCancel={() => { setShowForm(false); setEditingNotebook(null); }}
          isLoading={formLoading}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => { if (!deleteLoading) setDeleteTarget(null); }}
        >
          <div
            style={{
              background: '#0d0c20',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '16px',
              padding: '28px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
              animation: 'slideUp 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes slideUp {
                from { opacity: 0; transform: translateY(12px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            <h3
              style={{
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '17px',
                fontWeight: '700',
                color: '#ede9ff',
                margin: '0 0 8px',
              }}
            >
              Delete &ldquo;{deleteTarget.name}&rdquo;?
            </h3>
            <p
              style={{
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '13px',
                color: 'rgba(237,233,255,0.4)',
                margin: '0 0 24px',
                lineHeight: 1.5,
              }}
            >
              This will permanently delete the notebook and all its documents and chat history. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { if (!deleteLoading) setDeleteTarget(null); }}
                disabled={deleteLoading}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '11px',
                  background: 'rgba(237,233,255,0.06)',
                  border: '1px solid rgba(237,233,255,0.12)',
                  fontFamily: "'Gliker', 'DM Sans', sans-serif",
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'rgba(237,233,255,0.6)',
                  cursor: deleteLoading ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '11px',
                  background: deleteLoading ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.85)',
                  border: 'none',
                  fontFamily: "'Gliker', 'DM Sans', sans-serif",
                  fontSize: '14px',
                  fontWeight: '700',
                  color: deleteLoading ? 'rgba(252,165,165,0.5)' : '#fca5a5',
                  cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.12s ease',
                }}
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

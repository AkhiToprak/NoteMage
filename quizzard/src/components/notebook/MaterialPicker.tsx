'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, FileText, Layers, HelpCircle, File, Check } from 'lucide-react';

interface MaterialItem {
  id: string;
  title: string;
}

interface SelectedMaterial {
  type: 'page' | 'flashcard_set' | 'quiz_set' | 'document';
  referenceId: string;
  title: string;
}

interface MaterialPickerProps {
  notebookId: string;
  onSelect: (materials: SelectedMaterial[]) => void;
  onClose: () => void;
}

type TabType = 'pages' | 'flashcard_sets' | 'quiz_sets' | 'documents';

export default function MaterialPicker({ notebookId, onSelect, onClose }: MaterialPickerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('pages');
  const [pages, setPages] = useState<MaterialItem[]>([]);
  const [flashcardSets, setFlashcardSets] = useState<MaterialItem[]>([]);
  const [quizSets, setQuizSets] = useState<MaterialItem[]>([]);
  const [documents, setDocuments] = useState<MaterialItem[]>([]);
  const [selected, setSelected] = useState<Map<string, SelectedMaterial>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [sectionsRes, flashRes, quizRes, docRes] = await Promise.all([
          fetch(`/api/notebooks/${notebookId}/sections`).then(r => r.json()),
          fetch(`/api/notebooks/${notebookId}/flashcard-sets`).then(r => r.json()),
          fetch(`/api/notebooks/${notebookId}/quiz-sets`).then(r => r.json()),
          fetch(`/api/notebooks/${notebookId}/documents`).then(r => r.json()),
        ]);

        // Extract pages from sections
        if (sectionsRes.success && sectionsRes.data) {
          const allPages: MaterialItem[] = [];
          for (const section of sectionsRes.data) {
            if (section.pages) {
              for (const page of section.pages) {
                allPages.push({ id: page.id, title: page.title || 'Untitled' });
              }
            }
          }
          setPages(allPages);
        }

        if (flashRes.success && flashRes.data) {
          setFlashcardSets(flashRes.data.map((f: { id: string; title: string }) => ({ id: f.id, title: f.title })));
        }
        if (quizRes.success && quizRes.data) {
          setQuizSets(quizRes.data.map((q: { id: string; title: string }) => ({ id: q.id, title: q.title })));
        }
        if (docRes.success && docRes.data) {
          setDocuments(docRes.data.map((d: { id: string; fileName: string }) => ({ id: d.id, title: d.fileName })));
        }
      } catch { /* silent */ }
      setLoading(false);
    }
    load();
  }, [notebookId]);

  const toggleItem = useCallback((type: SelectedMaterial['type'], item: MaterialItem) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, { type, referenceId: item.id, title: item.title });
      }
      return next;
    });
  }, []);

  const handleConfirm = () => {
    onSelect(Array.from(selected.values()));
  };

  const getItems = (): { items: MaterialItem[]; type: SelectedMaterial['type'] } => {
    switch (activeTab) {
      case 'pages': return { items: pages, type: 'page' };
      case 'flashcard_sets': return { items: flashcardSets, type: 'flashcard_set' };
      case 'quiz_sets': return { items: quizSets, type: 'quiz_set' };
      case 'documents': return { items: documents, type: 'document' };
    }
  };

  const getTabIcon = (tab: TabType) => {
    switch (tab) {
      case 'pages': return <FileText size={12} />;
      case 'flashcard_sets': return <Layers size={12} />;
      case 'quiz_sets': return <HelpCircle size={12} />;
      case 'documents': return <File size={12} />;
    }
  };

  const getTabLabel = (tab: TabType) => {
    switch (tab) {
      case 'pages': return 'Pages';
      case 'flashcard_sets': return 'Flashcards';
      case 'quiz_sets': return 'Quizzes';
      case 'documents': return 'Documents';
    }
  };

  const { items, type } = getItems();
  const tabs: TabType[] = ['pages', 'flashcard_sets', 'quiz_sets', 'documents'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        width: '480px', maxHeight: '70vh',
        background: '#1e1d35', borderRadius: '16px',
        border: '1px solid rgba(140,82,255,0.2)',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'inherit',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid rgba(140,82,255,0.1)',
        }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#ede9ff' }}>
            Add Materials
          </span>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'rgba(196,169,255,0.5)',
            cursor: 'pointer', padding: '4px',
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '2px', padding: '8px 20px',
          borderBottom: '1px solid rgba(140,82,255,0.1)',
        }}>
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 12px', borderRadius: '6px',
                border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: 500,
                fontFamily: 'inherit',
                background: activeTab === tab ? 'rgba(140,82,255,0.2)' : 'transparent',
                color: activeTab === tab ? '#c4a9ff' : 'rgba(196,169,255,0.5)',
                transition: 'background 0.12s ease, color 0.12s ease',
              }}
            >
              {getTabIcon(tab)}
              {getTabLabel(tab)}
            </button>
          ))}
        </div>

        {/* Items list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', minHeight: '200px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(237,233,255,0.3)', fontSize: '13px' }}>
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(237,233,255,0.2)', fontSize: '13px' }}>
              No {getTabLabel(activeTab).toLowerCase()} in this notebook.
            </div>
          ) : (
            items.map(item => {
              const isChecked = selected.has(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => toggleItem(type, item)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    width: '100%', padding: '8px 10px', borderRadius: '8px',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: isChecked ? 'rgba(140,82,255,0.12)' : 'transparent',
                    fontFamily: 'inherit',
                    transition: 'background 0.12s ease',
                  }}
                >
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '4px',
                    border: isChecked ? 'none' : '1.5px solid rgba(140,82,255,0.3)',
                    background: isChecked ? '#8c52ff' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all 0.12s ease',
                  }}>
                    {isChecked && <Check size={12} style={{ color: '#fff' }} />}
                  </div>
                  <span style={{
                    fontSize: '13px', color: isChecked ? '#ede9ff' : 'rgba(237,233,255,0.6)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {item.title}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderTop: '1px solid rgba(140,82,255,0.1)',
        }}>
          <span style={{ fontSize: '12px', color: 'rgba(196,169,255,0.4)' }}>
            {selected.size} selected
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{
              padding: '7px 16px', borderRadius: '8px',
              border: '1px solid rgba(140,82,255,0.2)',
              background: 'transparent', color: '#c4a9ff',
              fontSize: '12px', cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0}
              style={{
                padding: '7px 16px', borderRadius: '8px', border: 'none',
                background: selected.size > 0 ? '#8c52ff' : 'rgba(140,82,255,0.2)',
                color: selected.size > 0 ? '#fff' : 'rgba(196,169,255,0.4)',
                fontSize: '12px', fontWeight: 600, cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              Add ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

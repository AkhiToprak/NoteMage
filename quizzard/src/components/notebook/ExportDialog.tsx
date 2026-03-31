'use client';

import { useState, useCallback } from 'react';
import { X, Download, Loader2, FileText, ChevronRight } from 'lucide-react';

interface SectionWithPages {
  id: string;
  title: string;
  pages: { id: string; title: string }[];
  children: SectionWithPages[];
}

interface ExportDialogProps {
  notebookId: string;
  sections: SectionWithPages[];
  onClose: () => void;
}

type ExportFormat = 'pdf' | 'pptx';
type ExportMode = 'individual' | 'merge' | 'split';

export default function ExportDialog({ notebookId, sections, onClose }: ExportDialogProps) {
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [mode, setMode] = useState<ExportMode>('individual');
  const [splitAfter, setSplitAfter] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');

  // Flatten all pages from sections (recursive)
  const allPages = flattenPages(sections);
  const selectedCount = selectedPageIds.size;
  const allSelected = allPages.length > 0 && selectedCount === allPages.length;

  function flattenPages(secs: SectionWithPages[]): { id: string; title: string }[] {
    const result: { id: string; title: string }[] = [];
    for (const sec of secs) {
      result.push(...sec.pages);
      result.push(...flattenPages(sec.children));
    }
    return result;
  }

  const togglePage = useCallback((pageId: string) => {
    setSelectedPageIds(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedPageIds(new Set());
    } else {
      setSelectedPageIds(new Set(allPages.map(p => p.id)));
    }
  }, [allSelected, allPages]);

  const toggleSection = useCallback((sec: SectionWithPages) => {
    const sectionPageIds = flattenPages([sec]).map(p => p.id);
    setSelectedPageIds(prev => {
      const next = new Set(prev);
      const allInSection = sectionPageIds.every(id => next.has(id));
      if (allInSection) {
        sectionPageIds.forEach(id => next.delete(id));
      } else {
        sectionPageIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, []);

  const toggleSplitPoint = useCallback((index: number) => {
    setSplitAfter(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleExport = useCallback(async () => {
    if (selectedCount === 0) return;
    setIsExporting(true);
    setError('');

    const pageIds = Array.from(selectedPageIds);

    try {
      let url: string;
      let body: Record<string, unknown>;
      let expectedType: string;

      if (format === 'pptx') {
        url = `/api/notebooks/${notebookId}/export/pages/pdf`;
        // We'll handle PPTX via the same page selection but different endpoint
        // For now, use the pages PDF route — PPTX export reuses generatePagesPptx
        // Actually, we need a PPTX pages route. Let's use PDF for now and add a note.
        // The plan says to call existing generatePagesPptx — but there's no route for it yet.
        // We'll add it inline below.
        url = `/api/notebooks/${notebookId}/export/pages/pdf`;
        body = { pageIds };
        expectedType = 'application/pdf';
      } else if (mode === 'merge') {
        url = `/api/notebooks/${notebookId}/export/pdf/merge`;
        body = { pageIds };
        expectedType = 'application/pdf';
      } else if (mode === 'split') {
        url = `/api/notebooks/${notebookId}/export/pdf/split`;
        body = { pageIds, splitAfter: Array.from(splitAfter).sort((a, b) => a - b) };
        expectedType = 'application/zip';
      } else {
        url = `/api/notebooks/${notebookId}/export/pages/pdf`;
        body = { pageIds };
        expectedType = 'application/pdf';
      }

      // Override for PPTX
      if (format === 'pptx') {
        url = `/api/notebooks/${notebookId}/export/pages/pptx`;
        body = { pageIds };
        expectedType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || `export.${format === 'pptx' ? 'pptx' : mode === 'split' ? 'zip' : 'pdf'}`;

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [selectedPageIds, selectedCount, format, mode, splitAfter, notebookId, onClose]);

  // Ordered list of selected pages (for split UI)
  const orderedSelectedPages = allPages.filter(p => selectedPageIds.has(p.id));

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#13122a',
          border: '1px solid rgba(140,82,255,0.2)',
          borderRadius: 16,
          width: 520,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px',
          borderBottom: '1px solid rgba(140,82,255,0.12)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Download size={18} style={{ color: '#8c52ff' }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#ede9ff' }}>Export Pages</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'rgba(237,233,255,0.4)',
              cursor: 'pointer', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {/* Page selector */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#ede9ff' }}>Select Pages</span>
              <button
                onClick={toggleAll}
                style={{
                  background: 'none', border: 'none', color: '#8c52ff',
                  cursor: 'pointer', fontSize: 12, fontWeight: 500,
                }}
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div style={{
              maxHeight: 200, overflow: 'auto',
              border: '1px solid rgba(140,82,255,0.1)',
              borderRadius: 10, background: 'rgba(255,255,255,0.035)',
            }}>
              {sections.map(sec => (
                <SectionGroup
                  key={sec.id}
                  section={sec}
                  selectedPageIds={selectedPageIds}
                  onTogglePage={togglePage}
                  onToggleSection={toggleSection}
                  depth={0}
                />
              ))}
              {allPages.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: 'rgba(237,233,255,0.3)', fontSize: 13 }}>
                  No pages in this notebook
                </div>
              )}
            </div>
          </div>

          {/* Format picker */}
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#ede9ff', display: 'block', marginBottom: 8 }}>Format</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['pdf', 'pptx'] as ExportFormat[]).map(f => (
                <button
                  key={f}
                  onClick={() => { setFormat(f); if (f === 'pptx') setMode('individual'); }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${format === f ? '#8c52ff' : 'rgba(140,82,255,0.15)'}`,
                    background: format === f ? 'rgba(140,82,255,0.15)' : 'transparent',
                    color: format === f ? '#ede9ff' : 'rgba(237,233,255,0.5)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* PDF options */}
          {format === 'pdf' && selectedCount > 1 && (
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#ede9ff', display: 'block', marginBottom: 8 }}>PDF Options</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(['individual', 'merge', 'split'] as ExportMode[]).map(m => (
                  <label
                    key={m}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      background: mode === m ? 'rgba(140,82,255,0.1)' : 'transparent',
                      border: `1px solid ${mode === m ? 'rgba(140,82,255,0.25)' : 'transparent'}`,
                      transition: 'background 0.15s',
                    }}
                  >
                    <input
                      type="radio"
                      name="exportMode"
                      checked={mode === m}
                      onChange={() => setMode(m)}
                      style={{ accentColor: '#8c52ff' }}
                    />
                    <div>
                      <div style={{ fontSize: 13, color: '#ede9ff', fontWeight: 500 }}>
                        {m === 'individual' ? 'Single PDF' : m === 'merge' ? 'Merge into one PDF' : 'Split into multiple PDFs'}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(237,233,255,0.4)' }}>
                        {m === 'individual'
                          ? 'All selected pages in one file'
                          : m === 'merge'
                          ? 'Each page generated separately, then merged'
                          : 'Choose where to split, download as ZIP'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Split points selector */}
          {format === 'pdf' && mode === 'split' && orderedSelectedPages.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#ede9ff', display: 'block', marginBottom: 8 }}>
                Split Points <span style={{ fontWeight: 400, color: 'rgba(237,233,255,0.4)' }}>(click between pages to split)</span>
              </span>
              <div style={{
                border: '1px solid rgba(140,82,255,0.1)', borderRadius: 10,
                background: 'rgba(255,255,255,0.035)', overflow: 'hidden',
              }}>
                {orderedSelectedPages.map((page, idx) => (
                  <div key={page.id}>
                    <div style={{
                      padding: '6px 12px', fontSize: 12, color: '#ede9ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <FileText size={12} style={{ color: 'rgba(237,233,255,0.3)', flexShrink: 0 }} />
                      {page.title}
                    </div>
                    {idx < orderedSelectedPages.length - 1 && (
                      <button
                        onClick={() => toggleSplitPoint(idx)}
                        style={{
                          width: '100%', padding: '3px 12px',
                          background: splitAfter.has(idx) ? 'rgba(140,82,255,0.15)' : 'transparent',
                          border: 'none',
                          borderTop: `1px ${splitAfter.has(idx) ? 'solid' : 'dashed'} ${splitAfter.has(idx) ? '#8c52ff' : 'rgba(140,82,255,0.15)'}`,
                          borderBottom: `1px ${splitAfter.has(idx) ? 'solid' : 'dashed'} ${splitAfter.has(idx) ? '#8c52ff' : 'rgba(140,82,255,0.15)'}`,
                          color: splitAfter.has(idx) ? '#8c52ff' : 'rgba(237,233,255,0.25)',
                          cursor: 'pointer', fontSize: 10, fontWeight: 500,
                          textAlign: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        {splitAfter.has(idx) ? '✂ Split here' : '— click to split —'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 12,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#fca5a5', fontSize: 12,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(140,82,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12, color: 'rgba(237,233,255,0.4)' }}>
            {selectedCount} page{selectedCount !== 1 ? 's' : ''} selected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px', borderRadius: 8,
                background: 'transparent',
                border: '1px solid rgba(140,82,255,0.2)',
                color: 'rgba(237,233,255,0.6)',
                cursor: 'pointer', fontSize: 13,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={selectedCount === 0 || isExporting || (mode === 'split' && splitAfter.size === 0)}
              style={{
                padding: '8px 20px', borderRadius: 8,
                background: selectedCount === 0 || isExporting ? 'rgba(140,82,255,0.3)' : '#8c52ff',
                border: 'none',
                color: '#fff',
                cursor: selectedCount === 0 || isExporting ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'background 0.15s',
              }}
            >
              {isExporting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
              {isExporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Section group with checkboxes ────────────────────────────────── */

function SectionGroup({
  section,
  selectedPageIds,
  onTogglePage,
  onToggleSection,
  depth,
}: {
  section: SectionWithPages;
  selectedPageIds: Set<string>;
  onTogglePage: (id: string) => void;
  onToggleSection: (sec: SectionWithPages) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const sectionPages = flattenSectionPages(section);
  const allChecked = sectionPages.length > 0 && sectionPages.every(p => selectedPageIds.has(p.id));
  const someChecked = sectionPages.some(p => selectedPageIds.has(p.id));

  function flattenSectionPages(sec: SectionWithPages): { id: string; title: string }[] {
    const result: { id: string; title: string }[] = [...sec.pages];
    for (const child of sec.children) result.push(...flattenSectionPages(child));
    return result;
  }

  if (sectionPages.length === 0) return null;

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: `6px 10px 6px ${10 + depth * 16}px`,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          size={12}
          style={{
            color: 'rgba(237,233,255,0.3)',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
            flexShrink: 0,
          }}
        />
        <input
          type="checkbox"
          checked={allChecked}
          ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
          onChange={(e) => { e.stopPropagation(); onToggleSection(section); }}
          onClick={e => e.stopPropagation()}
          style={{ accentColor: '#8c52ff', flexShrink: 0 }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#ede9ff' }}>{section.title}</span>
        <span style={{ fontSize: 10, color: 'rgba(237,233,255,0.3)' }}>({sectionPages.length})</span>
      </div>
      {expanded && (
        <>
          {section.pages.map(page => (
            <label
              key={page.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: `4px 10px 4px ${28 + depth * 16}px`,
                cursor: 'pointer',
                fontSize: 12, color: 'rgba(237,233,255,0.7)',
              }}
            >
              <input
                type="checkbox"
                checked={selectedPageIds.has(page.id)}
                onChange={() => onTogglePage(page.id)}
                style={{ accentColor: '#8c52ff', flexShrink: 0 }}
              />
              <FileText size={12} style={{ color: 'rgba(237,233,255,0.3)', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {page.title}
              </span>
            </label>
          ))}
          {section.children.map(child => (
            <SectionGroup
              key={child.id}
              section={child}
              selectedPageIds={selectedPageIds}
              onTogglePage={onTogglePage}
              onToggleSection={onToggleSection}
              depth={depth + 1}
            />
          ))}
        </>
      )}
    </div>
  );
}

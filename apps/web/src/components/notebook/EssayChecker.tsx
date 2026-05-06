'use client';

import { useState } from 'react';
import {
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileText,
  SpellCheck,
} from 'lucide-react';

interface EssayIssue {
  type: 'spelling' | 'grammar' | 'clarity' | 'structure';
  original: string;
  suggestion: string;
  explanation: string;
}

interface EssayCheckResult {
  issues: EssayIssue[];
  overallScore: number;
  summary: string;
}

interface EssayCheckerProps {
  notebookId: string;
  initialText?: string;
  onClose: () => void;
  onApplyFix?: (original: string, replacement: string) => void;
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  spelling: {
    bg: 'rgba(239,68,68,0.06)',
    border: 'rgba(239,68,68,0.2)',
    text: '#fca5a5',
    label: 'Spelling',
  },
  grammar: {
    bg: 'rgba(251,191,36,0.06)',
    border: 'rgba(251,191,36,0.2)',
    text: '#fbbf24',
    label: 'Grammar',
  },
  clarity: {
    bg: 'rgba(96,165,250,0.06)',
    border: 'rgba(96,165,250,0.2)',
    text: '#60a5fa',
    label: 'Clarity',
  },
  structure: {
    bg: 'rgba(167,139,250,0.06)',
    border: 'rgba(167,139,250,0.2)',
    text: '#a78bfa',
    label: 'Structure',
  },
};

export default function EssayChecker({
  notebookId,
  initialText,
  onClose,
  onApplyFix,
}: EssayCheckerProps) {
  const [text, setText] = useState(initialText || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EssayCheckResult | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  const handleCheck = async (mode: 'grammar' | 'full') => {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/essay-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, mode }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setResult(json.data);
      }
    } catch {
      /* silent */
    }
    setLoading(false);
  };

  const scoreColor = result
    ? result.overallScore >= 80
      ? '#4ade80'
      : result.overallScore >= 60
        ? '#fbbf24'
        : '#fca5a5'
    : '#c4a9ff';

  const filteredIssues = result?.issues.filter((i) => !filterType || i.type === filterType) ?? [];

  const issueTypeCounts =
    result?.issues.reduce(
      (acc, issue) => {
        acc[issue.type] = (acc[issue.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ) ?? {};

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '600px',
          maxHeight: '80vh',
          background: '#1a1a36',
          border: '1px solid rgba(140,82,255,0.25)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(140,82,255,0.15)',
          }}
        >
          <h3
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#ede9ff',
              margin: 0,
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <SpellCheck size={16} style={{ color: '#c4a9ff' }} /> Grammar & Writing Check
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(237,233,255,0.4)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* Text input */}
          {!result && (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste your essay or text here..."
                rows={10}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  background: 'rgba(140,82,255,0.06)',
                  border: '1px solid rgba(140,82,255,0.15)',
                  borderRadius: '10px',
                  padding: '14px',
                  fontSize: '14px',
                  color: '#ede9ff',
                  lineHeight: 1.7,
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: '12px',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  onClick={() => handleCheck('grammar')}
                  disabled={loading || !text.trim()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(140,82,255,0.3)',
                    background: 'transparent',
                    color: '#c4a9ff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: loading || !text.trim() ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    opacity: loading || !text.trim() ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {loading ? (
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <SpellCheck size={14} />
                  )}
                  Check Grammar
                </button>
                <button
                  onClick={() => handleCheck('full')}
                  disabled={loading || !text.trim()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #8c52ff, #5170ff)',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: loading || !text.trim() ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    opacity: loading || !text.trim() ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 16px rgba(140,82,255,0.3)',
                  }}
                >
                  {loading ? (
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <FileText size={14} />
                  )}
                  Full Review
                </button>
              </div>
            </>
          )}

          {/* Loading */}
          {loading && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '48px 0',
                gap: '12px',
              }}
            >
              <Loader2
                size={28}
                style={{ color: '#c4a9ff', animation: 'spin 1s linear infinite' }}
              />
              <span style={{ fontSize: '13px', color: 'rgba(237,233,255,0.4)' }}>
                Analyzing your text...
              </span>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <>
              {/* Score */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '16px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  marginBottom: '16px',
                }}
              >
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: `${scoreColor}15`,
                    border: `2px solid ${scoreColor}50`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: '20px', fontWeight: 800, color: scoreColor }}>
                    {result.overallScore}
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#ede9ff',
                      marginBottom: '4px',
                    }}
                  >
                    {result.overallScore >= 80
                      ? 'Great writing!'
                      : result.overallScore >= 60
                        ? 'Good, with room for improvement'
                        : 'Needs work'}
                  </div>
                  <div
                    style={{ fontSize: '13px', color: 'rgba(237,233,255,0.5)', lineHeight: 1.5 }}
                  >
                    {result.summary}
                  </div>
                </div>
              </div>

              {/* Filter tabs */}
              {result.issues.length > 0 && (
                <div
                  style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}
                >
                  <button
                    onClick={() => setFilterType(null)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: !filterType
                        ? '1px solid rgba(140,82,255,0.4)'
                        : '1px solid rgba(255,255,255,0.06)',
                      background: !filterType ? 'rgba(140,82,255,0.15)' : 'transparent',
                      color: !filterType ? '#c4a9ff' : 'rgba(237,233,255,0.4)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    All ({result.issues.length})
                  </button>
                  {Object.entries(issueTypeCounts).map(([type, count]) => {
                    const colors = TYPE_COLORS[type] || TYPE_COLORS.grammar;
                    return (
                      <button
                        key={type}
                        onClick={() => setFilterType(filterType === type ? null : type)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: `1px solid ${filterType === type ? colors.border : 'rgba(255,255,255,0.06)'}`,
                          background: filterType === type ? colors.bg : 'transparent',
                          color: filterType === type ? colors.text : 'rgba(237,233,255,0.4)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          textTransform: 'capitalize',
                        }}
                      >
                        {type} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Issues list */}
              {result.issues.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '32px 0',
                    gap: '8px',
                  }}
                >
                  <CheckCircle2 size={32} style={{ color: '#4ade80' }} />
                  <span style={{ fontSize: '14px', color: '#4ade80', fontWeight: 600 }}>
                    No issues found!
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredIssues.map((issue, i) => {
                    const colors = TYPE_COLORS[issue.type] || TYPE_COLORS.grammar;
                    return (
                      <div
                        key={i}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '8px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: colors.text,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                            }}
                          >
                            {colors.label}
                          </span>
                          {onApplyFix && issue.original && issue.suggestion && (
                            <button
                              onClick={() => onApplyFix(issue.original, issue.suggestion)}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                border: `1px solid ${colors.border}`,
                                background: 'transparent',
                                color: colors.text,
                                fontSize: '10px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              Apply Fix
                            </button>
                          )}
                        </div>
                        {issue.original && (
                          <div
                            style={{
                              fontSize: '13px',
                              color: 'rgba(237,233,255,0.5)',
                              textDecoration: 'line-through',
                              marginBottom: '4px',
                            }}
                          >
                            {issue.original}
                          </div>
                        )}
                        {issue.suggestion && (
                          <div
                            style={{
                              fontSize: '13px',
                              color: '#ede9ff',
                              fontWeight: 500,
                              marginBottom: '4px',
                            }}
                          >
                            → {issue.suggestion}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'rgba(237,233,255,0.4)',
                            lineHeight: 1.5,
                          }}
                        >
                          {issue.explanation}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Back / Re-check buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: '16px',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  onClick={() => setResult(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(140,82,255,0.3)',
                    background: 'transparent',
                    color: '#c4a9ff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Edit Text
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

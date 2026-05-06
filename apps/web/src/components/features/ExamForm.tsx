'use client';

import { useState } from 'react';

interface ExamFormProps {
  notebooks: Array<{ id: string; name: string }>;
  onSubmit: (data: { title: string; examDate: string; notebookId: string }) => Promise<void>;
  onClose: () => void;
}

export default function ExamForm({ notebooks, onSubmit, onClose }: ExamFormProps) {
  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [notebookId, setNotebookId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; examDate?: string; notebookId?: string }>(
    {}
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    if (!examDate) {
      newErrors.examDate = 'Date is required';
    } else if (examDate < minDate) {
      newErrors.examDate = 'Date must be in the future';
    }
    if (!notebookId) newErrors.notebookId = 'Notebook is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), examDate, notebookId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '12px 14px',
    background: '#272746',
    border: `1.5px solid ${hasError ? '#f87171' : 'rgba(174,137,255,0.15)'}`,
    borderRadius: '10px',
    color: '#e5e3ff',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.2s cubic-bezier(0.22,1,0.36,1)',
    boxSizing: 'border-box' as const,
  });

  return (
    <>
      <style>{`
        @keyframes exam-modal-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes exam-modal-slide-up {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
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
          animation: 'exam-modal-fade-in 0.2s ease-out',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '440px',
            maxWidth: '90vw',
            background: '#1a1a36',
            border: '1px solid rgba(174,137,255,0.2)',
            borderRadius: '20px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            animation: 'exam-modal-slide-up 0.3s cubic-bezier(0.22,1,0.36,1)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 24px',
              borderBottom: '1px solid rgba(174,137,255,0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(174,137,255,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '20px', color: '#ae89ff' }}
                >
                  event
                </span>
              </div>
              <h3
                style={{
                  fontSize: '17px',
                  fontWeight: 700,
                  color: '#e5e3ff',
                  margin: 0,
                }}
              >
                Add Exam
              </h3>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#8888a8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                borderRadius: '8px',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#e5e3ff';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#8888a8';
                (e.currentTarget as HTMLButtonElement).style.background = 'none';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                close
              </span>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Title */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#aaa8c8',
                    marginBottom: '8px',
                  }}
                >
                  Exam Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (errors.title) setErrors((p) => ({ ...p, title: undefined }));
                  }}
                  placeholder="e.g. Midterm Exam, Final Quiz"
                  style={inputStyle(!!errors.title)}
                  onFocus={(e) => {
                    (e.currentTarget as HTMLInputElement).style.borderColor = '#ae89ff';
                  }}
                  onBlur={(e) => {
                    (e.currentTarget as HTMLInputElement).style.borderColor = errors.title
                      ? '#f87171'
                      : 'rgba(174,137,255,0.15)';
                  }}
                />
                {errors.title && (
                  <p style={{ fontSize: '12px', color: '#f87171', margin: '6px 0 0' }}>
                    {errors.title}
                  </p>
                )}
              </div>

              {/* Date */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#aaa8c8',
                    marginBottom: '8px',
                  }}
                >
                  Exam Date
                </label>
                <input
                  type="date"
                  value={examDate}
                  min={minDate}
                  onChange={(e) => {
                    setExamDate(e.target.value);
                    if (errors.examDate) setErrors((p) => ({ ...p, examDate: undefined }));
                  }}
                  style={{
                    ...inputStyle(!!errors.examDate),
                    colorScheme: 'dark',
                  }}
                  onFocus={(e) => {
                    (e.currentTarget as HTMLInputElement).style.borderColor = '#ae89ff';
                  }}
                  onBlur={(e) => {
                    (e.currentTarget as HTMLInputElement).style.borderColor = errors.examDate
                      ? '#f87171'
                      : 'rgba(174,137,255,0.15)';
                  }}
                />
                {errors.examDate && (
                  <p style={{ fontSize: '12px', color: '#f87171', margin: '6px 0 0' }}>
                    {errors.examDate}
                  </p>
                )}
              </div>

              {/* Notebook */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#aaa8c8',
                    marginBottom: '8px',
                  }}
                >
                  Notebook
                </label>
                <select
                  value={notebookId}
                  onChange={(e) => {
                    setNotebookId(e.target.value);
                    if (errors.notebookId) setErrors((p) => ({ ...p, notebookId: undefined }));
                  }}
                  style={{
                    ...inputStyle(!!errors.notebookId),
                    appearance: 'none',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23aaa8c8' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 14px center',
                    paddingRight: '36px',
                  }}
                  onFocus={(e) => {
                    (e.currentTarget as HTMLSelectElement).style.borderColor = '#ae89ff';
                  }}
                  onBlur={(e) => {
                    (e.currentTarget as HTMLSelectElement).style.borderColor = errors.notebookId
                      ? '#f87171'
                      : 'rgba(174,137,255,0.15)';
                  }}
                >
                  <option value="" style={{ background: '#272746', color: '#8888a8' }}>
                    Select a notebook...
                  </option>
                  {notebooks.map((nb) => (
                    <option
                      key={nb.id}
                      value={nb.id}
                      style={{ background: '#272746', color: '#e5e3ff' }}
                    >
                      {nb.name}
                    </option>
                  ))}
                </select>
                {errors.notebookId && (
                  <p style={{ fontSize: '12px', color: '#f87171', margin: '6px 0 0' }}>
                    {errors.notebookId}
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: isSubmitting ? 'rgba(174,137,255,0.3)' : '#ae89ff',
                  color: isSubmitting ? '#aaa8c8' : '#2a0066',
                  border: 'none',
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: '15px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition:
                    'background 0.2s cubic-bezier(0.22,1,0.36,1), transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting)
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                }}
              >
                {isSubmitting ? (
                  <>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: '18px', animation: 'exam-spin 1s linear infinite' }}
                    >
                      hourglass_empty
                    </span>
                    Adding...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      add
                    </span>
                    Add Exam
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
      <style>{`@keyframes exam-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

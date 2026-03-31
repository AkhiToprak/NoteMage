'use client';

import { useState } from 'react';

interface Goal {
  type: string;
  target: number;
}

interface StudyGoalsStepProps {
  goals: Goal[];
  onChange: (goals: Goal[]) => void;
  onFinish: () => void;
  onSkip: () => void;
  loading: boolean;
  error: string;
}

interface GoalConfig {
  type: string;
  icon: string;
  label: string;
  unit: string;
  presets: number[];
}

const GOAL_CONFIGS: GoalConfig[] = [
  { type: 'hours',     icon: 'schedule',     label: 'Study Hours / Week',   unit: 'hrs',  presets: [5, 10, 15, 20] },
  { type: 'pages',     icon: 'description',  label: 'Pages Written / Week', unit: 'pgs',  presets: [5, 10, 20, 50] },
  { type: 'quizzes',   icon: 'psychology',   label: 'Quizzes / Week',       unit: 'quiz', presets: [3, 5, 10, 20] },
  { type: 'notebooks', icon: 'auto_stories', label: 'Notebooks / Week',     unit: 'nb',   presets: [1, 2, 3, 5] },
];

export default function StudyGoalsStep({
  goals,
  onChange,
  onFinish,
  onSkip,
  loading,
  error,
}: StudyGoalsStepProps) {
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const getGoal = (type: string) => goals.find((g) => g.type === type);

  const toggleGoal = (config: GoalConfig) => {
    const existing = getGoal(config.type);
    if (existing) {
      // Deselect
      onChange(goals.filter((g) => g.type !== config.type));
    } else {
      // Select with default preset
      onChange([...goals, { type: config.type, target: config.presets[1] }]);
    }
  };

  const setTarget = (type: string, target: number) => {
    onChange(goals.map((g) => (g.type === type ? { ...g, target } : g)));
  };

  const handleCustomInput = (type: string, value: string) => {
    setCustomInputs((prev) => ({ ...prev, [type]: value }));
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      setTarget(type, num);
    }
  };

  return (
    <>
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}>
          Set your weekly goals
        </h2>
        <p style={{ fontSize: '14px', color: '#aaa8c8', margin: 0, lineHeight: '1.6' }}>
          Track what matters to you. You can change these anytime.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            background: 'rgba(253,111,133,0.12)',
            color: '#fd6f85',
            fontSize: '14px',
            marginBottom: '20px',
          }}
        >
          {error}
        </div>
      )}

      {/* Goal Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginBottom: '32px',
        }}
      >
        {GOAL_CONFIGS.map((config) => {
          const goal = getGoal(config.type);
          const isSelected = !!goal;
          const isHovered = hoveredCard === config.type;

          return (
            <div
              key={config.type}
              onClick={() => toggleGoal(config)}
              onMouseEnter={() => setHoveredCard(config.type)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                background: '#232342',
                borderRadius: '20px',
                padding: '20px',
                border: isSelected
                  ? '2px solid #ae89ff'
                  : isHovered
                  ? '1px solid rgba(174,137,255,0.3)'
                  : '1px solid #555578',
                boxShadow: isSelected ? '0 0 0 4px rgba(174,137,255,0.1)' : 'none',
                cursor: 'pointer',
                transition: 'border-color 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
                userSelect: 'none',
              }}
            >
              {/* Icon */}
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '24px',
                  color: isSelected ? '#ae89ff' : '#8888a8',
                  display: 'block',
                  marginBottom: '8px',
                  transition: 'color 0.2s cubic-bezier(0.22,1,0.36,1)',
                  fontVariationSettings: isSelected ? "'FILL' 1" : "'FILL' 0",
                }}
              >
                {config.icon}
              </span>

              {/* Label */}
              <p
                style={{
                  margin: '0 0 4px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isSelected ? '#e5e3ff' : '#aaa8c8',
                  lineHeight: '1.4',
                  transition: 'color 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                {config.label}
              </p>

              {/* Status or hint */}
              {isSelected && goal ? (
                <p
                  style={{
                    margin: '0 0 12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#ae89ff',
                  }}
                >
                  {goal.target} / week
                </p>
              ) : (
                <p style={{ margin: '0 0 0', fontSize: '11px', color: '#555578' }}>
                  Tap to set goal
                </p>
              )}

              {/* Presets & custom (only when selected) */}
              {isSelected && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}
                >
                  {config.presets.map((preset) => {
                    const isActive = goal?.target === preset && !customInputs[config.type];
                    return (
                      <button
                        key={preset}
                        onClick={() => {
                          setCustomInputs((prev) => ({ ...prev, [config.type]: '' }));
                          setTarget(config.type, preset);
                        }}
                        style={{
                          background: isActive ? '#ae89ff' : '#2a2a4c',
                          color: isActive ? '#1a0044' : '#aaa8c8',
                          border: `1px solid ${isActive ? '#ae89ff' : '#555578'}`,
                          borderRadius: '20px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                        }}
                      >
                        {preset}
                      </button>
                    );
                  })}
                  {/* Custom input */}
                  <input
                    type="number"
                    min={1}
                    placeholder="?"
                    value={customInputs[config.type] || ''}
                    onChange={(e) => handleCustomInput(config.type, e.target.value)}
                    style={{
                      width: '52px',
                      background: '#2a2a4c',
                      border: customInputs[config.type]
                        ? '1px solid #ae89ff'
                        : '1px solid #555578',
                      borderRadius: '8px',
                      padding: '4px 8px',
                      color: '#e5e3ff',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          onClick={onFinish}
          disabled={loading}
          style={{
            width: '100%',
            padding: '16px',
            background: loading ? '#555578' : 'linear-gradient(135deg, #ae89ff 0%, #884efb 100%)',
            border: 'none',
            borderRadius: '16px',
            color: loading ? '#aaa8c8' : '#2a0066',
            fontSize: '16px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: loading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
            transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 12px 32px rgba(174,137,255,0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(174,137,255,0.3)';
            }
          }}
          onMouseDown={(e) => {
            if (!loading) e.currentTarget.style.transform = 'scale(0.98)';
          }}
          onMouseUp={(e) => {
            if (!loading) e.currentTarget.style.transform = 'scale(1.02)';
          }}
        >
          {loading ? (
            'Saving…'
          ) : (
            <>
              Get Started
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
              >
                rocket_launch
              </span>
            </>
          )}
        </button>

        <button
          onClick={onSkip}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            background: 'transparent',
            border: 'none',
            borderRadius: '16px',
            color: '#8888a8',
            fontSize: '15px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            transition: 'color 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.color = '#aaa8c8';
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.color = '#8888a8';
          }}
        >
          Skip for now
        </button>
      </div>
    </>
  );
}

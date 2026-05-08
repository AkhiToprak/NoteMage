'use client';

import { useState } from 'react';
import { Mascot } from '@/components/mascot';

export type GoalKey =
  | 'dailyStudyMinutesGoal'
  | 'weeklyStudyPlansGoal'
  | 'weeklyNotesGoal'
  | 'weeklyChatsGoal';

export type GoalValues = Record<GoalKey, number | null>;

interface StudyGoalsStepProps {
  goals: GoalValues;
  mageName: string;
  onChange: (goals: GoalValues) => void;
  onFinish: () => void;
  onSkip: () => void;
  loading: boolean;
  error: string;
}

export interface GoalConfig {
  key: GoalKey;
  icon: string;
  label: (mageName: string) => string;
  cadence: 'day' | 'week';
  unit: string;
  presets: number[];
  min: number;
  max: number;
}

export const GOAL_CONFIGS: GoalConfig[] = [
  {
    key: 'dailyStudyMinutesGoal',
    icon: 'schedule',
    label: () => 'Study Time',
    cadence: 'day',
    unit: 'min',
    presets: [5, 15, 30, 60],
    min: 1,
    max: 1440,
  },
  {
    key: 'weeklyStudyPlansGoal',
    icon: 'event_available',
    label: () => 'Finish Study Plans',
    cadence: 'week',
    unit: 'plans',
    presets: [1, 2, 3, 5],
    min: 1,
    max: 100,
  },
  {
    key: 'weeklyNotesGoal',
    icon: 'edit_note',
    label: () => 'Take Notes',
    cadence: 'week',
    unit: 'notes',
    presets: [3, 5, 10, 20],
    min: 1,
    max: 1000,
  },
  {
    key: 'weeklyChatsGoal',
    icon: 'auto_awesome',
    label: (mageName) => `Consult ${mageName || 'your Mage'}`,
    cadence: 'week',
    unit: 'chats',
    presets: [3, 5, 10, 20],
    min: 1,
    max: 1000,
  },
];

export const EMPTY_GOAL_VALUES: GoalValues = {
  dailyStudyMinutesGoal: null,
  weeklyStudyPlansGoal: null,
  weeklyNotesGoal: null,
  weeklyChatsGoal: null,
};

export default function StudyGoalsStep({
  goals,
  mageName,
  onChange,
  onFinish,
  onSkip,
  loading,
  error,
}: StudyGoalsStepProps) {
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const toggleGoal = (config: GoalConfig) => {
    const current = goals[config.key];
    if (current !== null) {
      onChange({ ...goals, [config.key]: null });
    } else {
      onChange({ ...goals, [config.key]: config.presets[1] });
    }
  };

  const setTarget = (key: GoalKey, target: number) => {
    onChange({ ...goals, [key]: target });
  };

  const handleCustomInput = (config: GoalConfig, value: string) => {
    setCustomInputs((prev) => ({ ...prev, [config.key]: value }));
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= config.min && num <= config.max) {
      setTarget(config.key, num);
    }
  };

  const setGoalCount = Object.values(goals).filter((v) => v !== null).length;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
        <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
          <Mascot pose="holding-scroll" size="md" idle="sway" />
          {setGoalCount > 0 && (
            <span
              key={setGoalCount}
              data-mascot-check
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-4px',
                width: '30px',
                height: '30px',
                borderRadius: '9999px',
                background: '#4dff91',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 16px rgba(77,255,145,0.35), 0 0 0 3px #21213e',
                animation:
                  'mascotStepIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
                willChange: 'transform, opacity',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '18px',
                  color: '#0c2a14',
                  fontVariationSettings: "'FILL' 1, 'wght' 700",
                }}
              >
                check
              </span>
            </span>
          )}
        </div>
      </div>
      <div style={{ marginBottom: '14px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 6px' }}>
          Set your goals
        </h2>
        <p style={{ fontSize: '13px', color: '#aaa8c8', margin: 0, lineHeight: '1.6' }}>
          Pick what matters to you. You can change these anytime.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '12px',
            background: 'rgba(253,111,133,0.12)',
            color: '#fd6f85',
            fontSize: '13px',
            marginBottom: '12px',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px',
          marginBottom: '16px',
        }}
      >
        {GOAL_CONFIGS.map((config) => {
          const target = goals[config.key];
          const isSelected = target !== null;
          const isHovered = hoveredCard === config.key;

          return (
            <div
              key={config.key}
              onClick={() => toggleGoal(config)}
              onMouseEnter={() => setHoveredCard(config.key)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                background: '#2d2d52',
                borderRadius: '18px',
                padding: '14px 16px',
                border: isSelected
                  ? '2px solid #ae89ff'
                  : isHovered
                    ? '1px solid rgba(174,137,255,0.3)'
                    : '1px solid #555578',
                boxShadow: isSelected ? '0 0 0 4px rgba(174,137,255,0.1)' : 'none',
                cursor: 'pointer',
                transition:
                  'border-color 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
                userSelect: 'none',
              }}
            >
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
                {config.label(mageName)}
              </p>

              {isSelected && target !== null ? (
                <p
                  style={{
                    margin: '0 0 12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#ae89ff',
                  }}
                >
                  {target} {config.unit} / {config.cadence}
                </p>
              ) : (
                <p style={{ margin: '0 0 0', fontSize: '11px', color: '#555578' }}>
                  Tap to set goal
                </p>
              )}

              {isSelected && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}
                >
                  {config.presets.map((preset) => {
                    const isActive = target === preset && !customInputs[config.key];
                    return (
                      <button
                        key={preset}
                        onClick={() => {
                          setCustomInputs((prev) => ({ ...prev, [config.key]: '' }));
                          setTarget(config.key, preset);
                        }}
                        style={{
                          background: isActive ? '#ae89ff' : '#35355c',
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
                  <input
                    type="number"
                    min={config.min}
                    max={config.max}
                    placeholder="?"
                    value={customInputs[config.key] || ''}
                    onChange={(e) => handleCustomInput(config, e.target.value)}
                    style={{
                      width: '52px',
                      background: '#35355c',
                      border: customInputs[config.key]
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          onClick={onFinish}
          disabled={loading}
          style={{
            width: '100%',
            padding: '13px',
            background: loading ? '#555578' : '#ae89ff',
            border: 'none',
            borderRadius: '14px',
            color: loading ? '#aaa8c8' : '#2a0066',
            fontSize: '16px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: loading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
            transition:
              'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
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
            padding: '10px',
            background: 'transparent',
            border: 'none',
            borderRadius: '14px',
            color: '#8888a8',
            fontSize: '14px',
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

      <style>{`
        @keyframes mascotStepIn {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-mascot-check] { animation: none !important; }
        }
      `}</style>
    </>
  );
}

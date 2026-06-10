'use client';

import { useState } from 'react';

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

export default function StudyGoalsStep({ goals, mageName, onChange }: StudyGoalsStepProps) {
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

  return (
    <div
      className="stack-phone"
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}
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
              background: 'var(--surface-container-high)',
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
                color: isSelected ? 'var(--on-surface)' : 'var(--on-surface-variant)',
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
                  color: 'var(--md-h4)',
                }}
              >
                {target} {config.unit} / {config.cadence}
              </p>
            ) : (
              <p style={{ margin: '0 0 0', fontSize: '11px', color: 'var(--outline-variant)' }}>
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
                    background: 'var(--surface-container-highest)',
                    border: customInputs[config.key] ? '1px solid #ae89ff' : '1px solid #555578',
                    borderRadius: '8px',
                    padding: '4px 8px',
                    color: 'var(--on-surface)',
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
  );
}

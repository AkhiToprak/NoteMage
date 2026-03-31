'use client';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: 3;
  labels: string[];
}

export default function StepIndicator({ currentStep, totalSteps, labels }: StepIndicatorProps) {
  return (
    <>
      <style>{`
        @keyframes stepGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(174,137,255,0.3); }
          50% { box-shadow: 0 0 0 6px rgba(174,137,255,0); }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0 }}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          const isLast = stepNum === totalSteps;

          return (
            <div key={stepNum} style={{ display: 'flex', alignItems: 'flex-start', flex: isLast ? '0 0 auto' : 1 }}>
              {/* Step node + label */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                {/* Circle */}
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: isCompleted
                      ? '#ae89ff'
                      : isActive
                      ? '#161630'
                      : '#2a2a4c',
                    border: isCompleted
                      ? '2px solid #ae89ff'
                      : isActive
                      ? '2px solid #ae89ff'
                      : '2px solid #555578',
                    animation: isActive ? 'stepGlow 2s ease-in-out infinite' : 'none',
                    transition: 'background 0.3s cubic-bezier(0.22,1,0.36,1), border-color 0.3s cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  {isCompleted ? (
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: '16px', color: '#fff', fontVariationSettings: "'FILL' 1" }}
                    >
                      check
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: isActive ? '#ae89ff' : '#555578',
                      }}
                    >
                      {stepNum}
                    </span>
                  )}
                </div>

                {/* Label */}
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: isCompleted || isActive ? '#ae89ff' : '#aaa8c8',
                    whiteSpace: 'nowrap',
                    transition: 'color 0.3s cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  {labels[i]}
                </span>
              </div>

              {/* Connector line (not after last step) */}
              {!isLast && (
                <div
                  style={{
                    flex: 1,
                    height: '2px',
                    marginTop: '15px',
                    background: stepNum < currentStep ? '#ae89ff' : '#555578',
                    transition: 'background 0.4s cubic-bezier(0.22,1,0.36,1)',
                    minWidth: '24px',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

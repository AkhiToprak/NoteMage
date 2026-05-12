import { CSSProperties } from 'react';

// Kind-specific icons for path checkpoints. Inlined as SVG components so
// they accept a `color` prop (defaults to `currentColor`) and theme
// against the slot's icon-color token without filter hacks.
//
// Source SVGs: /new_icons/theory_checkpoint_icon.svg,
// /new_icons/review_icon.svg, /new_icons/assessment_icon.svg.

interface CheckpointIconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function TheoryCheckpointIcon({
  size = 24,
  color = 'currentColor',
  style,
}: CheckpointIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path
        opacity="0.4"
        d="M12 5.2997V21.3297C11.83 21.3297 11.65 21.2997 11.51 21.2197L11.47 21.1997C9.55 20.1497 6.2 19.0497 4.03 18.7597L3.74 18.7197C2.78 18.5997 2 17.6997 2 16.7397V4.6597C2 3.4697 2.97 2.5697 4.16 2.6697C6.26 2.8397 9.44 3.8997 11.22 5.0097L11.47 5.1597C11.62 5.2497 11.81 5.2997 12 5.2997Z"
      />
      <path d="M22 4.66954V16.7395C22 17.6995 21.22 18.5995 20.26 18.7195L19.93 18.7595C17.75 19.0495 14.39 20.1595 12.47 21.2195C12.34 21.2995 12.18 21.3295 12 21.3295V5.29954C12.19 5.29954 12.38 5.24954 12.53 5.15954L12.7 5.04954C14.48 3.92954 17.67 2.85954 19.77 2.67954H19.83C21.02 2.57954 22 3.46954 22 4.66954Z" />
      <path d="M7.75 9.24023H5.5C5.09 9.24023 4.75 8.90023 4.75 8.49023C4.75 8.08023 5.09 7.74023 5.5 7.74023H7.75C8.16 7.74023 8.5 8.08023 8.5 8.49023C8.5 8.90023 8.16 9.24023 7.75 9.24023Z" />
      <path d="M8.5 12.2402H5.5C5.09 12.2402 4.75 11.9002 4.75 11.4902C4.75 11.0802 5.09 10.7402 5.5 10.7402H8.5C8.91 10.7402 9.25 11.0802 9.25 11.4902C9.25 11.9002 8.91 12.2402 8.5 12.2402Z" />
    </svg>
  );
}

export function ReviewCheckpointIcon({
  size = 24,
  color = 'currentColor',
  style,
}: CheckpointIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path
        d="M6.00002 5.17031L4.03002 6.46031C2.10002 7.72031 2.10002 10.5403 4.03002 11.8003L10.05 15.7303C11.13 16.4403 12.91 16.4403 13.99 15.7303L19.98 11.8003C21.9 10.5403 21.9 7.73031 19.98 6.47031L13.99 2.54031C12.91 1.83031 11.13 1.83031 10.05 2.54031"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.63012 13.0801L5.62012 17.7701C5.62012 19.0401 6.60012 20.4001 7.80012 20.8001L10.9901 21.8601C11.5401 22.0401 12.4501 22.0401 13.0101 21.8601L16.2001 20.8001C17.4001 20.4001 18.3801 19.0401 18.3801 17.7701V13.1301"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21.3999 15V9"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AssessmentCheckpointIcon({
  size = 24,
  color = 'currentColor',
  style,
}: CheckpointIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path d="M19.35 18.1401C18.95 18.1401 18.61 17.8601 18.53 17.4701L18.32 16.5501C18.23 16.1601 17.92 15.8501 17.54 15.7601L16.6 15.5401C16.22 15.4601 15.95 15.1201 15.95 14.7201C15.95 14.3201 16.22 13.9701 16.61 13.8901L17.54 13.6801C17.93 13.5901 18.24 13.2801 18.33 12.9001L18.55 11.9601C18.63 11.5801 18.98 11.3101 19.38 11.3101C19.78 11.3101 20.12 11.5901 20.2 11.9801L20.41 12.9001C20.5 13.2901 20.81 13.6001 21.19 13.6901L22.13 13.9101C22.51 13.9901 22.78 14.3301 22.78 14.7301C22.78 15.1301 22.51 15.4701 22.12 15.5601L21.19 15.7701C20.8 15.8601 20.49 16.1701 20.41 16.5501L20.19 17.4901C20.11 17.8701 19.76 18.1401 19.35 18.1401ZM18.79 14.7201C19.01 14.8801 19.2 15.0701 19.36 15.2901C19.52 15.0701 19.71 14.8801 19.93 14.7201C19.71 14.5601 19.52 14.3701 19.36 14.1501C19.2 14.3701 19.01 14.5601 18.79 14.7201Z" />
      <path d="M16.26 18.04C14.63 18.04 12.69 17.42 12.69 14.47V8.82C12.69 5.87 14.63 5.25 16.26 5.25C17.89 5.25 19.83 5.87 19.83 8.82V9.58C19.83 9.99 19.49 10.33 19.08 10.33C18.67 10.33 18.33 9.99 18.33 9.58V8.82C18.33 7.31 17.77 6.75 16.26 6.75C14.75 6.75 14.19 7.31 14.19 8.82V14.47C14.19 15.98 14.75 16.54 16.26 16.54C16.67 16.54 17.01 16.88 17.01 17.29C17.01 17.7 16.67 18.04 16.26 18.04Z" />
      <path d="M6.51 18.04C4.88 18.04 2.94 17.42 2.94 14.47V8.82C2.94 5.87 4.88 5.25 6.51 5.25C8.14 5.25 10.08 5.87 10.08 8.82V14.47C10.08 17.42 8.14 18.04 6.51 18.04ZM6.51 6.75C5 6.75 4.44 7.31 4.44 8.82V14.47C4.44 15.98 5 16.54 6.51 16.54C8.02 16.54 8.58 15.98 8.58 14.47V8.82C8.58 7.31 8.02 6.75 6.51 6.75Z" />
      <path d="M13.43 12.4H9.33002C8.92002 12.4 8.58002 12.06 8.58002 11.65C8.58002 11.24 8.92002 10.9 9.33002 10.9H13.43C13.84 10.9 14.18 11.24 14.18 11.65C14.18 12.06 13.84 12.4 13.43 12.4Z" />
      <path d="M21.27 11.56C20.86 11.56 20.52 11.22 20.52 10.81V9.30005C20.52 8.89005 20.86 8.55005 21.27 8.55005C21.68 8.55005 22.02 8.89005 22.02 9.30005V10.81C22.02 11.22 21.68 11.56 21.27 11.56Z" />
      <path d="M1.5 14.75C1.09 14.75 0.75 14.41 0.75 14V9.29004C0.75 8.88004 1.09 8.54004 1.5 8.54004C1.91 8.54004 2.25 8.88004 2.25 9.29004V14C2.25 14.41 1.91 14.75 1.5 14.75Z" />
    </svg>
  );
}

export type CheckpointKind = 'learning' | 'review' | 'assessment' | 'final_exam';

export function CheckpointIcon({
  kind,
  ...rest
}: CheckpointIconProps & { kind: string }) {
  if (kind === 'review') return <ReviewCheckpointIcon {...rest} />;
  // Final exam reuses the assessment icon — the gold star reads as
  // "graded, capstone" and SlotNode already differentiates it via the
  // 3-star display + the FINAL EXAM pill in the drawer.
  if (kind === 'assessment' || kind === 'final_exam') {
    return <AssessmentCheckpointIcon {...rest} />;
  }
  return <TheoryCheckpointIcon {...rest} />;
}

export function LockIcon({
  size = 24,
  color = 'currentColor',
  style,
}: CheckpointIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path
        opacity="0.4"
        d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
      />
      <path d="M15.7501 10.73V10C15.7501 9.07 15.7501 6.25 12.0001 6.25C8.25012 6.25 8.25012 9.07 8.25012 10V10.73C7.03012 11 6.62012 11.79 6.62012 13.5V14.5C6.62012 16.7 7.30012 17.38 9.50012 17.38H14.5001C16.7001 17.38 17.3801 16.7 17.3801 14.5V13.5C17.3801 11.79 16.9701 11 15.7501 10.73ZM12.0001 15.1C11.3901 15.1 10.9001 14.61 10.9001 14C10.9001 13.39 11.3901 12.9 12.0001 12.9C12.6101 12.9 13.1001 13.39 13.1001 14C13.1001 14.61 12.6101 15.1 12.0001 15.1ZM14.2501 10.62H9.75012V10C9.75012 8.54 10.1101 7.75 12.0001 7.75C13.8901 7.75 14.2501 8.54 14.2501 10V10.62Z" />
    </svg>
  );
}

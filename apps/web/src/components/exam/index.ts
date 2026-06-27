/* Exam Mode (Phase 0) — shared cream UI atoms. Each renders inside the AppShell
   `.shell` scope (it inherits the cream palette). See the implementation plan
   §"Reusable assets". */

export { ExamWeightBadge, type ExamWeightBadgeProps, type ExamWeight } from './ExamWeightBadge';
export { GateBadge, type GateBadgeProps, type GateState } from './GateBadge';
export { DayCard, type DayCardProps, type DayStatus } from './DayCard';
export { CalendarGrid, type CalendarGridProps } from './CalendarGrid';
export { TimerBar, type TimerBarProps } from './TimerBar';
export {
  QuestionNavigator,
  type QuestionNavigatorProps,
  type QuestionNavigatorItem,
  type QuestionCellState,
} from './QuestionNavigator';

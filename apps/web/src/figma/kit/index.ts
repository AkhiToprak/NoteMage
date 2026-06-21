/**
 * Figma build — shared kit. Built once in Phase 0, reused by every screen.
 *
 * Reuse policy: prefer the app's existing components (`Button`, `NMCard`,
 * `ProgressBar`, `TopicChip`, `Mascot`) when they match a Figma frame; reach for
 * these F-primitives only where the new design diverges. All colors/type/spacing
 * come from the existing `--nm-*` / `--surface-*` / `--fs-*` / `--space-*` tokens.
 */

// Responsive switch
export { useIsDesktop } from './useIsDesktop';
export { useMounted } from './useMounted';
export { ResponsiveScreen, type ResponsiveScreenProps } from './ResponsiveScreen';
export { FigmaScreenView, type FigmaScreenViewProps } from './FigmaScreenView';

// Device shells
export { PhoneFrame, PHONE_WIDTH, PHONE_HEIGHT, type PhoneFrameProps } from './PhoneFrame';
export { StatusBar, type StatusBarProps } from './StatusBar';
export { HomeIndicator, type HomeIndicatorProps } from './HomeIndicator';

// App / site chrome
export { BottomNav, type BottomNavProps, type BottomNavTab } from './BottomNav';
export { WebTopNav, type WebTopNavProps, type WebTopNavItem } from './WebTopNav';
export {
  MarketingHeader,
  MarketingFooter,
  type MarketingHeaderProps,
  type MarketingFooterProps,
} from './MarketingChrome';
export { BackButton, type BackButtonProps } from './BackButton';
export { StepDots, type StepDotsProps } from './StepDots';

// Faithful primitives
export { FButton, type FButtonProps, type FButtonVariant, type FButtonSize } from './FButton';
export { FCard, type FCardProps } from './FCard';
export { FChip, type FChipProps } from './FChip';
export { FInput, type FInputProps } from './FInput';
export { FToggle, type FToggleProps } from './FToggle';
export { FProgress, type FProgressProps } from './FProgress';
export { Mage, type MageProps, type MagePose } from './Mage';

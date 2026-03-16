# Quizzard Style Guide

## Design System Overview
This guide defines the design system for Quizzard. All UI components and pages should follow these standards for consistency and maintainability.

---

## Color Palette

### Primary Colors
- **Primary Blue**: `#2563EB` - Main brand color (buttons, links, accents)
- **Primary Dark**: `#1E40AF` - Darker variant for hover states
- **Primary Light**: `#DBEAFE` - Light background variant

### Semantic Colors
- **Success**: `#10B981` - Success messages, confirmations
- **Warning**: `#F59E0B` - Warnings, caution states
- **Error**: `#EF4444` - Errors, destructive actions
- **Info**: `#3B82F6` - Informational messages

### Neutral Colors
- **Dark**: `#1F2937` - Text, primary content (gray-800)
- **Medium**: `#6B7280` - Secondary text, labels (gray-500)
- **Light**: `#F3F4F6` - Backgrounds, borders (gray-100)
- **White**: `#FFFFFF` - Pure white backgrounds

---

## Typography

### Font Family
- **Primary Font**: `Inter` (system fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto`)
- **Mono Font**: `'Courier New', monospace` (for code snippets)

### Font Sizes & Styles
```
H1: 32px, bold, line-height 1.2
H2: 28px, bold, line-height 1.3
H3: 24px, semibold, line-height 1.4
H4: 20px, semibold, line-height 1.4

Body Large: 16px, regular, line-height 1.6
Body: 14px, regular, line-height 1.5
Body Small: 12px, regular, line-height 1.4

Label: 12px, semibold, line-height 1.4
Caption: 11px, regular, line-height 1.4
```

### Font Weights
- Light: 300
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700

---

## Spacing System

Use multiples of 4px for consistency:

```
xs: 4px
sm: 8px
md: 12px
lg: 16px
xl: 24px
2xl: 32px
3xl: 48px
4xl: 64px
```

**Padding & Margins**: Always use spacing system values
**Gaps in Flexbox/Grid**: Use spacing system values

---

## Component Standards

### Buttons
- **Height**: 40px (lg), 36px (md), 32px (sm)
- **Padding**: Horizontal 16px (lg), 12px (md), 8px (sm)
- **Border Radius**: 8px
- **Font Size**: 14px, semibold
- **Cursor**: pointer
- **Transition**: 200ms ease

**Variants**:
- **Primary**: Blue bg, white text
- **Secondary**: Gray bg, dark text
- **Tertiary**: Transparent bg, blue text, blue border
- **Danger**: Red bg, white text

### Cards
- **Padding**: 16px, 20px, or 24px
- **Border Radius**: 8px
- **Background**: White
- **Border**: 1px solid #E5E7EB (gray-200)
- **Box Shadow**: 0 1px 2px 0 rgba(0, 0, 0, 0.05)
- **Hover Shadow**: 0 4px 6px -1px rgba(0, 0, 0, 0.1)

### Input Fields
- **Height**: 40px
- **Padding**: 8px 12px
- **Border Radius**: 6px
- **Border**: 1px solid #D1D5DB
- **Font Size**: 14px
- **Focus State**: Border color changes to primary blue, box-shadow for depth

### Navigation
- **Height**: 64px (main header)
- **Sidebar Width**: 240px (or collapsible)
- **Font Size**: 14px, medium weight
- **Active State**: Blue indicator/highlight

---

## Layout Principles

### Responsive Breakpoints
```
Mobile: < 640px (sm)
Tablet: 640px - 1024px (md, lg)
Desktop: > 1024px (xl, 2xl)
```

### Container Sizes
- **Max Width**: 1280px for main content
- **Padding**: 16px on mobile, 24px on tablet/desktop

### Grid System
- **12-column grid** for layouts
- **Gap**: 16px between columns
- **Stack on mobile**: 1 column

---

## Shadows & Elevation

```
sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05)
md: 0 4px 6px -1px rgba(0, 0, 0, 0.1)
lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1)
xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1)
```

---

## Animations & Transitions

### Duration Standards
- Quick interactions: 150ms
- Medium transitions: 200ms
- Slow animations: 300-500ms

### Easing Functions
- `ease-in-out`: Default for most transitions
- `ease-out`: For elements entering the viewport
- `ease-in`: For elements leaving the viewport

### Common Transitions
- Button hover: 200ms ease
- Fade in/out: 300ms ease-in-out
- Slide: 200ms ease-out

---

## Accessibility (A11y)

### Colors
- Minimum contrast ratio: 4.5:1 for text
- Don't rely on color alone to convey information

### Focus States
- All interactive elements must have visible focus (blue outline)
- Focus outline: 2px solid primary blue with 2px offset

### Text
- Use semantic HTML (`<h1>`, `<h2>`, etc.)
- Provide alt text for all images
- Use ARIA labels where needed

---

## Code Style Standards

### Naming Conventions
- **Components**: PascalCase (`NotebookCard.tsx`)
- **Functions/Variables**: camelCase (`getUserNotebooks`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_FILE_SIZE`)
- **CSS Classes**: kebab-case (if using traditional CSS)

### File Organization
```
src/
├── components/
│   ├── common/          # Reusable UI components
│   ├── layout/          # Layout components
│   ├── forms/           # Form components
│   └── features/        # Feature-specific components
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   └── api/
├── lib/                 # Utilities, helpers
├── styles/              # Global styles
├── types/               # TypeScript types
└── hooks/               # Custom React hooks
```

### Component Structure
```typescript
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}

export function MyComponent({ children, variant = 'primary' }: Props) {
  return <div className={`component component--${variant}`}>{children}</div>;
}
```

---

## Dark Mode (Future)

Reserve the following for future dark mode implementation:
```
Dark bg: #0F172A
Dark card: #1E293B
Dark text: #F1F5F9
```

---

## Usage Examples

### Button Usage
```tsx
<button className="btn btn--primary">Action</button>
<button className="btn btn--secondary">Cancel</button>
```

### Card Usage
```tsx
<div className="card">
  <h3 className="text-lg font-semibold">Title</h3>
  <p className="text-base text-medium">Content</p>
</div>
```

---

## When to Reference This Guide

- Creating new components
- Building new pages
- Styling features
- Code reviews
- Onboarding new team members

---

**Last Updated**: 2026-03-15

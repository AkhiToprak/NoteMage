import * as React from 'react';
import styles from './SectionHeading.module.css';

export interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function SectionHeading({
  title,
  subtitle,
  action,
  icon,
  className,
  style,
}: SectionHeadingProps) {
  return (
    <div
      className={[styles.root, className].filter(Boolean).join(' ')}
      style={style}
    >
      <div className={styles.left}>
        {icon && (
          <div className={styles.iconWrap} aria-hidden>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              {icon}
            </span>
          </div>
        )}
        <div className={styles.titles}>
          <h2 className={styles.title}>{title}</h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

export default SectionHeading;

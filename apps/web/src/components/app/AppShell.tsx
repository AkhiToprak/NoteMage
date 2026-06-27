import type { ReactNode } from 'react';
import AppSidebar from './AppSidebar';
import styles from './AppShell.module.css';

/** Cream app-shell wrapper for the redesigned logged-in screens. Renders the
 *  canonical left sidebar + a scrollable content column. Pages drop their
 *  content inside and inherit the shared palette declared on `.shell`. */
export default function AppShell({
  children,
  width = 'wide',
}: {
  children: ReactNode;
  /** 'narrow' caps the content column for lighter screens (paths/profile). */
  width?: 'wide' | 'narrow';
}) {
  return (
    <div className={styles.shell}>
      <AppSidebar />
      <div className={styles.scroll}>
        <div className={`${styles.content} ${width === 'narrow' ? styles.narrow : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

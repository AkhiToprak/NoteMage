'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { DocSummary } from '@/lib/docs';
import styles from './Docs.module.css';

/* Docs sidebar — search box + grouped nav. Client island so the search can
   filter the (server-supplied) doc list. Content/structure come from docs.ts. */
export default function DocsSidebar({
  categories,
  currentSlug,
}: {
  categories: { name: string; docs: DocSummary[] }[];
  currentSlug: string | null;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((c) => ({ ...c, docs: c.docs.filter((d) => d.title.toLowerCase().includes(q)) }))
      .filter((c) => c.docs.length > 0);
  }, [query, categories]);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.search}>
        <span className={`material-symbols-outlined ${styles.searchIcon}`} aria-hidden>search</span>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search docs…"
          aria-label="Search docs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <nav aria-label="Documentation">
        {filtered.length === 0 ? (
          <p className={styles.navEmpty}>No matching docs.</p>
        ) : (
          filtered.map((cat) => (
            <div key={cat.name} className={styles.navGroup}>
              <h4 className={styles.navLabel}>{cat.name}</h4>
              <ul className={styles.navList}>
                {cat.docs.map((doc) => {
                  const active = doc.slug === currentSlug;
                  return (
                    <li key={doc.slug}>
                      <Link
                        href={`/docs/${doc.slug}`}
                        className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                        aria-current={active ? 'page' : undefined}
                      >
                        {doc.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import GradingSystemWizard from './GradingSystemWizard';

/* First-run gate: once a signed-up user lands in the app with no grading system
   chosen yet, show the picker once. Catches every signup path (free, Pro-after-
   checkout, OAuth) since it triggers on "in the app + gradingSystem == null"
   rather than on a specific step. Skippable for the session. */

const SKIP_KEY = 'nm.gradingGate.skipped';

export default function GradingSystemGate() {
  const { status, update } = useSession();
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || checkedRef.current) return;
    checkedRef.current = true;
    try {
      if (sessionStorage.getItem(SKIP_KEY)) return;
    } catch {
      /* sessionStorage unavailable — proceed */
    }
    let cancelled = false;
    fetch('/api/user/grading-system')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (cancelled || !res) return;
        const d = res?.data ?? res;
        // Only prompt once the column exists (available) and is still unset.
        if (d?.available && d.gradingSystem == null) setShow(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (!show) return null;

  const save = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/user/grading-system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradingSystem: id }),
      });
      if (res.ok) {
        await update();
        setShow(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    try {
      sessionStorage.setItem(SKIP_KEY, '1');
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return <GradingSystemWizard onSave={save} onSkip={skip} saving={saving} />;
}

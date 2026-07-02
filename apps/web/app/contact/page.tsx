'use client';

import { useState } from 'react';
import MageNav from '@/components/landing/MageNav';
import MageFooter from '@/components/landing/MageFooter';
import styles from './Contact.module.css';

const TOPICS = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature idea' },
  { value: 'general', label: 'Just saying hi' },
  { value: 'other', label: 'Something else' },
];

const CONTACT_EMAIL = 'notemage.app@gmail.com';

const SparkGold = (
  <svg viewBox="0 0 29 29" fill="none" aria-hidden focusable="false">
    <path d="M10.6066 0L17.1889 9.81239L28.9778 10.6066L19.1654 17.1889L18.3712 28.9778L11.7889 19.1655L0 18.3712L9.81237 11.7889L10.6066 0Z" fill="#FFC83D" />
  </svg>
);
const SparkPurple = (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden focusable="false">
    <path d="M9 0L11.291 6.70897L18 9L11.291 11.291L9 18L6.70897 11.291L0 9L6.70897 6.70897L9 0Z" fill="#7C5CFF" />
  </svg>
);

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('bug');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const topicLabel = TOPICS.find((t) => t.value === topic)?.label ?? 'Message';
    const subject = `[${topicLabel}] From ${name.trim() || 'Notemage'}`;
    const body = [
      `Name: ${name || '(not provided)'}`,
      `Reply-to: ${email || '(not provided)'}`,
      `Topic: ${topicLabel}`,
      '',
      '---',
      '',
      message,
    ].join('\n');

    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  return (
    <main className={styles.root} data-theme="light">
      <MageNav />

      {/* ───────────── HERO ───────────── */}
      <section className={styles.hero}>
        <span className={`${styles.spk} ${styles.spk1}`} aria-hidden>{SparkGold}</span>
        <span className={`${styles.spk} ${styles.spk2}`} aria-hidden>{SparkPurple}</span>
        <span className={`${styles.spk} ${styles.spk3}`} aria-hidden>{SparkPurple}</span>
        <span className={`${styles.spk} ${styles.spk4}`} aria-hidden>{SparkGold}</span>

        <span className={styles.eyebrow}>
          <span className="material-symbols-outlined" aria-hidden>mail</span>
          Contact
        </span>
        <h1 className={styles.heroTitle}>
          Say <span className={styles.hi}>hi</span>.
        </h1>
        <p className={styles.heroSub}>
          Found a bug? Got a feature idea? Just want to chat? Drop a line and I&apos;ll get back to
          you as soon as I can.
        </p>
      </section>

      {/* ───────────── FORM ───────────── */}
      <section className={styles.formWrap}>
        <form onSubmit={handleSubmit} className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.headIcon}>
              <span className="material-symbols-outlined" aria-hidden>edit_note</span>
            </div>
            <div>
              <div className={styles.headTitle}>Write me a message</div>
              <div className={styles.headSub}>
                Goes straight to <b>{CONTACT_EMAIL}</b>
              </div>
            </div>
          </div>

          {/* Name + Email */}
          <div className={styles.row}>
            <div>
              <label htmlFor="nm-name" className={styles.label}>Your name</label>
              <input
                id="nm-name"
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                autoComplete="name"
              />
            </div>
            <div>
              <label htmlFor="nm-email" className={styles.label}>Email</label>
              <input
                id="nm-email"
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ada@example.com"
                autoComplete="email"
              />
            </div>
          </div>

          {/* Topic chips */}
          <div className={styles.field}>
            <div className={styles.label}>What&apos;s this about?</div>
            <div className={styles.chips}>
              {TOPICS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTopic(t.value)}
                  className={`${styles.chip} ${topic === t.value ? styles.chipActive : ''}`}
                  aria-pressed={topic === t.value}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className={styles.field}>
            <label htmlFor="nm-message" className={styles.label}>Message</label>
            <textarea
              id="nm-message"
              className={styles.textarea}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell me what's on your mind…"
              rows={7}
              required
            />
          </div>

          {/* Submit */}
          <div className={styles.submitRow}>
            <p className={styles.hint}>
              Opens your email client with everything prefilled — no magic tracking, I promise.
            </p>
            <button type="submit" className={styles.submit}>
              Send message
              <span className="material-symbols-outlined" aria-hidden>send</span>
            </button>
          </div>
        </form>

        <p className={styles.fallback}>
          Prefer plain email? Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>

      <MageFooter />
    </main>
  );
}

'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import MageNav from '@/components/landing/MageNav';
import MageFooter from '@/components/landing/MageFooter';
import {
  TIERS,
  monthlyEquivalent,
  yearlySavingsPct,
  INTERVAL_LABEL,
  INTERVAL_SUFFIX,
  type BillingInterval,
} from '@/lib/tiers';
import { useCurrency } from '@/hooks/useCurrency';
import styles from './Pricing.module.css';

const INTERVALS: BillingInterval[] = ['weekly', 'monthly', 'yearly'];

/* The two brand sparkles (user SVGs) — gold twinkle + purple 4-point. */
function Spark({ variant }: { variant: 'gold' | 'purple' }) {
  return variant === 'gold' ? (
    <svg viewBox="0 0 29 29" fill="none" aria-hidden focusable="false">
      <path d="M10.6066 0L17.1889 9.81239L28.9778 10.6066L19.1654 17.1889L18.3712 28.9778L11.7889 19.1655L0 18.3712L9.81237 11.7889L10.6066 0Z" fill="#FFC83D" />
    </svg>
  ) : (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden focusable="false">
      <path d="M9 0L11.291 6.70897L18 9L11.291 11.291L9 18L6.70897 11.291L0 9L6.70897 6.70897L9 0Z" fill="#7C5CFF" />
    </svg>
  );
}

type CompareVal = string | boolean;
type CompareRow = { label: string; free: CompareVal; pro: CompareVal };

function Cell({ value }: { value: CompareVal }) {
  if (value === true) return <span className={styles.tick} aria-hidden>✓</span>;
  if (value === '—') return <span className={styles.dash} aria-hidden>—</span>;
  return <>{value}</>;
}

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Can I switch plans at any time?',
    a: 'Yes — upgrade or downgrade anytime from Settings. Changes take effect right away.',
  },
  {
    q: 'Is there a student discount?',
    a: 'Pro is already priced for students — there’s no separate student code, but the yearly plan works out to roughly the price of a coffee a month.',
  },
  {
    q: 'What happens when I hit my monthly limit?',
    a: 'Your AI allowance simply pauses until it resets at the start of the next month. Your notes, flashcards, quizzes and saved paths keep working — upgrade to Pro for unlimited AI.',
  },
  {
    q: 'Can I cancel my subscription?',
    a: 'Anytime, from Settings. You keep Pro until the end of the period you’ve already paid for, then drop back to Free. We also offer a 14-day money-back guarantee.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'All major cards, handled securely by our payment provider (Lemon Squeezy), which manages checkout, invoices and VAT. You’re billed in CHF.',
  },
];

export default function PricingPageClient() {
  const { formatPrice, currency } = useCurrency();
  const [interval, setInterval] = useState<BillingInterval>('yearly');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const savings = yearlySavingsPct('PRO');

  const plans = [
    {
      key: 'FREE' as const,
      name: 'Free',
      pro: false,
      features: [
        '1 AI flashcard set',
        '2 AI quizzes / month',
        '50 Mage chat messages / month',
        '50 PDF pages (one-time)',
        'Flashcards, quizzes & study tools',
      ],
      ctaLabel: 'Get started',
      note: null as string | null,
    },
    {
      key: 'PRO' as const,
      name: 'Pro',
      pro: true,
      features: [
        'Unlimited AI flashcards, quizzes & chat*',
        'Unlimited AI study paths',
        '3 Ultra paths / month',
        '450 PDF pages / month',
        'Inline AI editing',
        'Everything in Free',
      ],
      ctaLabel: 'Go Pro  →',
      note: '*Fair use ~1M tokens / month',
    },
  ];

  const compare: { group: string; rows: CompareRow[] }[] = [
    {
      group: 'AI FEATURES',
      rows: [
        { label: 'AI flashcard sets', free: '1 / mo', pro: 'Unlimited*' },
        { label: 'AI presentations', free: '1 / mo', pro: 'Unlimited*' },
        { label: 'Study paths', free: '—', pro: 'Unlimited*' },
        { label: 'Ultra paths', free: '—', pro: '3 / mo' },
        { label: 'AI quizzes', free: '2 / mo', pro: 'Unlimited*' },
        { label: 'Mage chat messages', free: '50 / mo', pro: 'Unlimited*' },
        { label: 'Inline AI editing', free: '—', pro: 'Unlimited*' },
        { label: 'PDF pages', free: '50 total', pro: '450 / mo' },
      ],
    },
    {
      group: 'STUDY TOOLS',
      rows: [
        { label: 'Flashcards & quizzes', free: true, pro: true },
        { label: 'Text & canvas files', free: true, pro: true },
        { label: 'Mind maps', free: true, pro: true },
        { label: 'Exam timers & streaks', free: true, pro: true },
        { label: 'And much more…', free: true, pro: true },
      ],
    },
  ];

  const proSub =
    interval === 'yearly'
      ? `≈ ${formatPrice(monthlyEquivalent('PRO'))}/mo · billed yearly`
      : interval === 'monthly'
        ? 'Billed monthly · cancel anytime'
        : 'Billed weekly · cancel anytime';

  return (
    <div className={styles.root}>
      <MageNav />

      <main className={styles.page}>
        {/* ─────────── HEADER ─────────── */}
        <header className={styles.head}>
          <div className={styles.headInner}>
            <span className={`${styles.spark} ${styles.sparkA}`} aria-hidden><Spark variant="gold" /></span>
            <span className={`${styles.spark} ${styles.sparkB}`} aria-hidden><Spark variant="purple" /></span>
            <span className={`${styles.spark} ${styles.sparkC}`} aria-hidden><Spark variant="purple" /></span>
            <p className={styles.eyebrow}>PRICING</p>
            <h1 className={styles.title}>Simple, student-friendly pricing.</h1>
            <p className={styles.sub}>
              Start free. Upgrade to Pro for unlimited AI whenever you need it.
            </p>
          </div>
        </header>

        {/* ─────────── BILLING TOGGLE ─────────── */}
        <div className={styles.toggleRow}>
          <div className={styles.seg} role="tablist" aria-label="Billing interval">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                type="button"
                role="tab"
                aria-selected={interval === iv}
                className={`${styles.segBtn} ${interval === iv ? styles.segActive : ''}`}
                onClick={() => setInterval(iv)}
              >
                {INTERVAL_LABEL[iv]}
              </button>
            ))}
          </div>
          {savings > 0 && <span className={styles.savePill}>Save {savings}%</span>}
        </div>

        {/* ─────────── PLAN CARDS ─────────── */}
        <section className={styles.cards}>
          {plans.map((plan) => {
            // Free is always "CHF 0" (formatPrice maps 0 → "Free", which would double
            // the plan name). Pro drops a trailing ".00" so round prices read "CHF 99".
            const amount = plan.pro
              ? formatPrice(TIERS.PRO.price[interval]).replace(/([.,])00\b/, '')
              : 'CHF 0';
            const suffix = plan.pro ? INTERVAL_SUFFIX[interval] : '';
            const sub = plan.pro ? proSub : 'Free forever — no card needed';
            return (
              <div key={plan.key} className={`${styles.plan} ${plan.pro ? styles.planPro : ''}`}>
                <div className={styles.planHead}>
                  <span className={styles.planName}>{plan.name}</span>
                  {plan.pro && <span className={styles.popular}>Most popular</span>}
                </div>
                <div className={styles.price}>
                  <span className={styles.priceAmt}>{amount}</span>
                  {suffix && <span className={styles.priceSuffix}>{suffix}</span>}
                </div>
                <p className={styles.priceSub}>{sub}</p>
                <div className={styles.planDivider} />
                <ul className={styles.feats}>
                  {plan.features.map((f, i) => (
                    <li key={i}>
                      <span className={`${styles.tick} ${plan.pro ? styles.tickPro : ''}`} aria-hidden>✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.pro ? `/auth/register?interval=${interval}` : '/auth/register'}
                  className={plan.pro ? styles.btnPro : styles.btnFree}
                >
                  {plan.ctaLabel}
                </Link>
                {plan.note && <p className={styles.planNote}>{plan.note}</p>}
              </div>
            );
          })}
        </section>

        {currency !== 'CHF' && (
          <p className={styles.fx}>
            <span className="material-symbols-outlined" aria-hidden>info</span>
            Prices shown in your approximate local currency. You’ll be billed in CHF, converted at checkout.
          </p>
        )}

        {/* ─────────── COMPARISON TABLE ─────────── */}
        <section className={styles.compareWrap}>
          <h2 className={styles.h2}>Compare plans in detail</h2>
          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thFeature}>Feature</th>
                  <th className={styles.thPlan}>Free</th>
                  <th className={`${styles.thPlan} ${styles.proCol}`}>Pro</th>
                </tr>
              </thead>
              <tbody>
                {compare.map((section) => (
                  <Fragment key={section.group}>
                    <tr className={styles.groupRow}>
                      <td colSpan={3}>{section.group}</td>
                    </tr>
                    {section.rows.map((row) => (
                      <tr key={row.label} className={styles.dataRow}>
                        <td className={styles.tdFeature}>{row.label}</td>
                        <td className={styles.tdPlan}><Cell value={row.free} /></td>
                        <td className={`${styles.tdPlan} ${styles.proCol}`}><Cell value={row.pro} /></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.fineprint}>
            *Pro usage is subject to a fair-use policy (~1M tokens/month) — far more than any student
            realistically uses. It’s only there to prevent abuse.
          </p>
        </section>

        {/* ─────────── FAQ ─────────── */}
        <section className={styles.faqWrap}>
          <h2 className={styles.h2}>Frequently asked questions</h2>
          <div className={styles.faqList}>
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q} className={styles.faqItem}>
                  <button
                    type="button"
                    className={styles.faqQ}
                    aria-expanded={open}
                    onClick={() => setOpenFaq(open ? null : i)}
                  >
                    <span>{f.q}</span>
                    <span className={styles.faqSign} aria-hidden>{open ? '−' : '+'}</span>
                  </button>
                  {open && <p className={styles.faqA}>{f.a}</p>}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <MageFooter />
    </div>
  );
}

'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import MageNav from '@/components/landing/MageNav';
import MageFooter from '@/components/landing/MageFooter';
import {
  TIERS,
  monthlyEquivalent,
  proPriceCHF,
  yearlySavingsPct,
  INTERVAL_LABEL,
  INTERVAL_SUFFIX,
  type BillingInterval,
} from '@/lib/tiers';
import { useCurrency } from '@/hooks/useCurrency';
import { PPP_CHECKOUT_CONFIGURED } from '@/lib/lemonsqueezy-client';
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
type CompareRow = { label: string; pro: CompareVal };

function Cell({ value }: { value: CompareVal }) {
  if (value === true) return <span className={styles.tick} aria-hidden>✓</span>;
  if (value === '—') return <span className={styles.dash} aria-hidden>—</span>;
  return <>{value}</>;
}

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Do I need a card for the free trial?',
    a: 'No. The 7-day trial gives you full access with no card. When it ends, you choose to subscribe or pause — pausing keeps your paths, progress and weak points safe for 3 months.',
  },
  {
    q: 'Can I switch plans at any time?',
    a: 'Yes — switch between weekly, monthly and yearly anytime from Settings. Changes take effect right away.',
  },
  {
    q: 'Is there a student discount?',
    a: 'Pro is already priced for students — there’s no separate student code, but the yearly plan works out to roughly the price of a coffee a month.',
  },
  {
    q: 'What happens when I hit my limit?',
    a: 'Your AI allowance simply pauses until it resets at the start of the next period. Your notes, flashcards, quizzes and saved paths keep working the whole time.',
  },
  {
    q: 'Can I cancel my subscription?',
    a: 'Anytime, from Settings — you keep Pro until the end of the period you’ve already paid for. If you don’t resubscribe, your account pauses and we keep your paths and progress safe for 3 months, so you can pick up right where you left off. There’s also a 14-day money-back guarantee.',
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

  // PPP price points show only once their checkout variants are wired — never
  // display a discount the checkout wouldn't charge.
  const priceCurrency = PPP_CHECKOUT_CONFIGURED ? currency : undefined;
  const savings = yearlySavingsPct('PRO', priceCurrency);

  const plans = [
    {
      key: 'PRO' as const,
      name: 'Pro',
      pro: true,
      features: [
        'Unlimited AI flashcards, quizzes & chat*',
        'Unlimited AI study paths',
        `${TIERS.PRO.limits.ultra_path} Ultra paths / month`,
        `${TIERS.PRO.limits.pdf_import} PDF pages / month`,
        'Ask Mage, your AI tutor, anything',
      ],
      ctaLabel: 'Start free trial  →',
      note: '*Fair use ~4M tokens / month',
    },
  ];

  const compare: { group: string; rows: CompareRow[] }[] = [
    {
      group: 'AI FEATURES',
      rows: [
        { label: 'AI flashcard sets', pro: 'Unlimited*' },
        { label: 'AI presentations', pro: 'Unlimited*' },
        { label: 'Study paths', pro: 'Unlimited*' },
        { label: 'Ultra paths', pro: `${TIERS.PRO.limits.ultra_path} / mo` },
        { label: 'AI quizzes', pro: 'Unlimited*' },
        { label: 'Mage chat messages', pro: 'Unlimited*' },
        { label: 'PDF pages', pro: `${TIERS.PRO.limits.pdf_import} / mo` },
      ],
    },
    {
      group: 'STUDY TOOLS',
      rows: [
        { label: 'Flashcards & quizzes', pro: true },
        { label: 'Text & canvas files', pro: true },
        { label: 'Mind maps', pro: true },
        { label: 'Exam timers & streaks', pro: true },
        { label: 'And much more…', pro: true },
      ],
    },
  ];

  const proSub =
    interval === 'yearly'
      ? `≈ ${formatPrice(monthlyEquivalent('PRO', priceCurrency))}/mo · billed yearly`
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
              Try everything free for 7 days — no card required. Then just one simple plan.
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
            // Drop a trailing ".00" so round prices read "CHF 64", not "CHF 64.00".
            const amount = formatPrice(proPriceCHF(interval, priceCurrency)).replace(/([.,])00\b/, '');
            const suffix = INTERVAL_SUFFIX[interval];
            const sub = `7-day free trial, then ${proSub}`;
            return (
              <div key={plan.key} className={`${styles.plan} ${plan.pro ? styles.planPro : ''}`}>
                <div className={styles.planHead}>
                  <span className={styles.planName}>{plan.name}</span>
                  {plan.pro && <span className={styles.popular}>7 days free</span>}
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
          <h2 className={styles.h2}>Everything included in Pro</h2>
          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thFeature}>Feature</th>
                  <th className={`${styles.thPlan} ${styles.proCol}`}>Pro</th>
                </tr>
              </thead>
              <tbody>
                {compare.map((section) => (
                  <Fragment key={section.group}>
                    <tr className={styles.groupRow}>
                      <td colSpan={2}>{section.group}</td>
                    </tr>
                    {section.rows.map((row) => (
                      <tr key={row.label} className={styles.dataRow}>
                        <td className={styles.tdFeature}>{row.label}</td>
                        <td className={`${styles.tdPlan} ${styles.proCol}`}><Cell value={row.pro} /></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.fineprint}>
            *Pro usage is subject to a fair-use policy (~4M tokens/month, up to 5 new paths/day) —
            far more than any student realistically uses. It’s only there to prevent abuse.
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

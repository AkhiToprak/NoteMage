'use client';

import { useState, useEffect, useRef } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import OnboardingScreen from './OnboardingScreen';
import AccountStep from './AccountStep';
import OAuthBirthDateStep from './OAuthBirthDateStep';
import OAuthProviderRow from '@/components/auth/OAuthProviderRow';
import TierSelectionStep from './TierSelectionStep';
import FirstNameStep from './FirstNameStep';
import LastNameStep from './LastNameStep';
import UsernameStep from './UsernameStep';
import ContextStep from './ContextStep';
import FieldOfStudyStep from './FieldOfStudyStep';
import SchoolStep from './SchoolStep';
import FindClassmatesStep, { type ClassmatePeer } from './FindClassmatesStep';
import AvatarStep from './AvatarStep';
import StudyGoalsStep, { EMPTY_GOAL_VALUES, type GoalValues } from './StudyGoalsStep';
import ScholarNameStep, { MAGE_NAME_REGEX } from './ScholarNameStep';
import OnboardingImportStep from './OnboardingImportStep';
import VerifyCodeForm from '@/components/auth/VerifyCodeForm';
import { parseBirthDate } from '@/lib/age';
import { useUpgrade } from '@/hooks/useUpgrade';
import { getNativePlatform } from '@/lib/native-bridge';
import IosUpgradeSheet from '@/components/settings/IosUpgradeSheet';
import type { TierKey } from '@/lib/tiers';
import type { ImportPhase } from '@/hooks/useMultiImport';

type StepId =
  | 'account'
  | 'verify'
  | 'tier'
  | 'firstName'
  | 'lastName'
  | 'username'
  | 'context'
  | 'fieldOfStudy'
  | 'school'
  | 'findClassmates'
  | 'avatar'
  | 'mageName'
  | 'goals'
  | 'import';

/** Ordered flow — drives the progress bar fill. */
const STEP_ORDER: readonly StepId[] = [
  'account',
  'tier',
  'firstName',
  'lastName',
  'username',
  'context',
  'fieldOfStudy',
  'school',
  'findClassmates',
  'avatar',
  'mageName',
  'goals',
  'import',
];

/**
 * Back-chevron targets. Only screens that purely mutate local `formData`
 * appear here — there is no way back across account creation (screen 1), so
 * `account` and `tier` (which sits immediately after it) are deliberately
 * absent. `firstName` can return to the plan step.
 */
const BACK_TARGETS: Partial<Record<StepId, StepId>> = {
  firstName: 'tier',
  lastName: 'firstName',
  username: 'lastName',
  context: 'username',
  fieldOfStudy: 'context',
  school: 'fieldOfStudy',
  // findClassmates only appears when peers exist, so back lands on school;
  // avatar deliberately stays absent from BACK_TARGETS — it has never been
  // back-navigable and adding it now would have to branch on whether the
  // user passed through findClassmates.
  findClassmates: 'school',
  mageName: 'avatar',
  goals: 'mageName',
  import: 'goals',
};

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
  birthDate: string;
  agreed: boolean;
  firstName: string;
  lastName: string;
  username: string;
  context: string;
  fieldOfStudy: string;
  school: string;
  avatarUrl: string | null;
  scholarName: string;
  goals: GoalValues;
  /** Plan picked on the tier step. FREE proceeds; PRO takes payment here. */
  tier: TierKey;
}

/** Suggest a starting username by sanitizing the email prefix. */
function suggestUsernameFromEmail(email: string | null | undefined): string {
  if (!email) return '';
  const base = email.split('@')[0] || '';
  // Strip everything outside the allowed [a-zA-Z0-9_] set, clamp to 20.
  const cleaned = base.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  return cleaned.toLowerCase();
}

/** Split a display name into a first token and the remainder. */
function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

const INITIAL_FORM: FormData = {
  email: '',
  password: '',
  confirmPassword: '',
  birthDate: '',
  agreed: false,
  firstName: '',
  lastName: '',
  username: '',
  context: '',
  fieldOfStudy: '',
  school: '',
  avatarUrl: null,
  scholarName: '',
  goals: { ...EMPTY_GOAL_VALUES },
  tier: 'FREE',
};

export default function OnboardingWizard({
  freeAiPathsDisabled = false,
}: {
  /** Server-resolved FREE_TIER_AI_PATHS_DISABLED, threaded from the route. */
  freeAiPathsDisabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus, update: updateSession } = useSession();
  const [step, setStep] = useState<StepId>('account');
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [stepErrors, setStepErrors] = useState<Partial<Record<StepId, string>>>({});
  const [avatarBusy, setAvatarBusy] = useState(false);
  // Peers prefetched when the user submits the school step — handed to
  // FindClassmatesStep as a prop so it renders instantly with no flash of
  // empty/loading state. Empty array means the wizard skipped that screen.
  const [schoolPeers, setSchoolPeers] = useState<ClassmatePeer[]>([]);
  // Mirrors the import finale's internal sub-step so the shell chevron can
  // be context-aware (see screen 11 below).
  const [importPhase, setImportPhase] = useState<ImportPhase>('source');

  // Pro upgrade (tier step). On a completed purchase the session flips to PRO
  // and we advance into the profile steps instead of the default refresh.
  const { startUpgrade, upgrading } = useUpgrade(() => setStep('firstName'));
  // iOS uses StoreKit IAP via the native sheet, not the Lemon Squeezy overlay.
  const [iosSheetOpen, setIosSheetOpen] = useState(false);

  /**
   * Path detection. A credentials user starts unauthenticated and creates a
   * session in AccountStep; an OAuth user arrives already authenticated. The
   * decision is captured once — after the credentials user submits the form
   * they are authenticated too, so re-deriving it later would misclassify
   * them. `null` until the session status first resolves.
   */
  const decidedPathRef = useRef<'credentials' | 'oauth' | null>(null);
  if (decidedPathRef.current === null && sessionStatus !== 'loading') {
    decidedPathRef.current = sessionStatus === 'authenticated' ? 'oauth' : 'credentials';
  }
  const authPath = decidedPathRef.current;
  const isOauthPath = authPath === 'oauth';

  // Surface NextAuth errors redirected back here by a failed OAuth round-trip
  // started from the register page. The signIn callback's "account_exists"
  // branch goes to /auth/login (not here), so the cases we care about here
  // are the generic NextAuth errors that can fire on a first-time OAuth from
  // /auth/register itself. Stamp the message onto the screen-1 step error so
  // it renders inside OnboardingScreen's existing error banner slot.
  const oauthErrorAppliedRef = useRef(false);
  useEffect(() => {
    if (oauthErrorAppliedRef.current) return;
    const err = searchParams?.get('error');
    if (!err) return;
    oauthErrorAppliedRef.current = true;
    let msg: string | null = null;
    if (err === 'OAuthSignin' || err === 'OAuthCallback' || err === 'Callback') {
      msg = 'Something went wrong during sign-in. Please try again.';
    } else if (err === 'AccessDenied') {
      msg = 'Sign-in was denied. If you think this is a mistake, contact support.';
    } else if (err === 'OAuthAccountExists') {
      // The signIn callback redirects collisions to /auth/login, so this
      // branch is only hit if a future code path routes here. Show the same
      // copy the login banner uses for consistency.
      msg = 'An account already exists for this email. Please sign in with your password, then link Google or Apple from settings.';
    }
    if (msg) setStepErrors((prev) => ({ ...prev, account: msg }));
  }, [searchParams]);

  // OAuth users: pre-fill name + avatar from the OAuth profile, exactly once.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (authPath !== 'oauth' || prefilledRef.current) return;
    prefilledRef.current = true;
    const { first, last } = splitName(session?.user?.name);
    setFormData((prev) => ({
      ...prev,
      firstName: prev.firstName || first,
      lastName: prev.lastName || last,
      avatarUrl: prev.avatarUrl || session?.user?.avatarUrl || null,
    }));
  }, [authPath, session?.user?.name, session?.user?.avatarUrl]);

  // A credentials user becomes authenticated mid-flow (right after verifying
  // their email), and an OAuth user is authenticated from the start. If the
  // wizard remounts while authenticated — e.g. the iOS shell reloads after an
  // app-switch — the path is re-derived as 'oauth' and the DOB gate (rendered
  // for `isOauthPath` on the 'account' step) would ask for the birth date a
  // *second* time even though it's already on file. Skip straight past it
  // whenever the account already has a birth date.
  useEffect(() => {
    if (isOauthPath && step === 'account' && session?.user?.hasBirthDate) {
      setStep('tier');
    }
  }, [isOauthPath, step, session?.user?.hasBirthDate]);

  const setStepError = (s: StepId, msg: string) =>
    setStepErrors((prev) => ({ ...prev, [s]: msg }));

  const clearStepError = (s: StepId) => setStepErrors((prev) => ({ ...prev, [s]: '' }));

  const handleFieldChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // ── Screen 1 (credentials path): register + auto-login ───────────────────
  const handleAccountNext = async () => {
    clearStepError('account');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          birthDate: formData.birthDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStepError('account', data.error || 'Failed to create account');
        return;
      }
      // Account created but unverified — credentials login is hard-blocked
      // until the email is confirmed (see authorize() in src/auth/config.ts),
      // so advance to the verify step rather than signing in. The 6-digit code
      // was already emailed by /api/auth/register. Password stays in state so
      // handleVerified can sign in once the email is confirmed.
      setStep('verify');
    } catch {
      setStepError('account', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Verify step (credentials path): confirm email, then sign in ──────────
  const handleVerified = async () => {
    setLoading(true);
    try {
      const signInResult = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });
      if (signInResult?.error) {
        // Verification succeeded server-side; only the immediate auto-login
        // hiccuped. A manual login will now work since the account is verified.
        setStepError('verify', 'Email verified! Please log in to continue.');
        return;
      }
      // Clear sensitive data now that the session exists.
      setFormData((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      setStep('tier');
    } catch {
      setStepError('verify', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Screen 1 (OAuth path): date-of-birth age gate ────────────────────────
  const handleOAuthDobNext = async () => {
    clearStepError('account');
    if (!parseBirthDate(formData.birthDate)) {
      setStepError('account', 'Please enter a valid date of birth.');
      return;
    }
    if (!formData.agreed) {
      setStepError('account', 'Please agree to the Terms of Service and Privacy Policy.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/user/birth-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate: formData.birthDate }),
      });
      if (res.status === 403) {
        // Under 13 — the account row was removed server-side. Sign out.
        await signOut({ callbackUrl: '/auth/login?error=AgeRestricted' });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStepError('account', data.error || 'Something went wrong. Please try again.');
        return;
      }
      // Refresh the JWT so `hasBirthDate` is now true — if the wizard later
      // remounts (app-switch reload), the gate above won't re-ask for it.
      try {
        await updateSession();
      } catch {
        // Non-fatal — the value is persisted server-side already.
      }
      setStep('tier');
    } catch {
      setStepError('account', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Screen 2: Plan selection — FREE proceeds, PRO takes payment here ──────
  const handleTierContinue = async () => {
    // Free, or already upgraded to Pro (e.g. payment just completed) → proceed.
    if (formData.tier === 'FREE' || session?.user?.tier === 'PRO') {
      clearStepError('tier');
      setStep('firstName');
      return;
    }
    // Pro selected. Inside the iOS shell, App Store IAP is required, so open the
    // native purchase sheet (its onPurchased advances the wizard). On web/desktop,
    // take payment via the Lemon Squeezy overlay — useUpgrade's onSuccess advances
    // to 'firstName'; if checkout is unavailable, surface a graceful message.
    clearStepError('tier');
    if (getNativePlatform() === 'ios') {
      setIosSheetOpen(true);
      return;
    }
    try {
      await startUpgrade();
    } catch {
      setStepError(
        'tier',
        'Pro checkout isn’t available yet — start on Free and upgrade anytime from Settings.'
      );
    }
  };

  // ── Screen 4: Username saved ─────────────────────────────────────────────
  const handleUsernameSaved = async (username: string) => {
    // Refresh the JWT so session.user.username reflects the real handle
    // instead of the oauth_* placeholder before any later navigation.
    setFormData((prev) => ({ ...prev, username }));
    try {
      await updateSession();
    } catch {
      // Non-fatal — the value is persisted server-side already.
    }
    setStep('context');
  };

  // ── School + classmates: continue from school looks up peers; if any exist
  // we land on findClassmates, otherwise skip straight to avatar. Skipping
  // school (empty value) also skips the classmate finder — there's nothing
  // to find. Failures fall through to avatar so a flaky network can't trap
  // the user in onboarding.
  const handleSchoolContinue = async () => {
    clearStepError('school');
    const trimmed = formData.school.trim();
    if (!trimmed) {
      setFormData((prev) => ({ ...prev, school: '' }));
      setSchoolPeers([]);
      setStep('avatar');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/schools/peers?school=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const json = await res.json().catch(() => null);
        const peers: ClassmatePeer[] = json?.data?.users ?? [];
        setSchoolPeers(peers);
        if (peers.length > 0) {
          setStep('findClassmates');
          return;
        }
      }
      setSchoolPeers([]);
      setStep('avatar');
    } catch {
      setSchoolPeers([]);
      setStep('avatar');
    } finally {
      setLoading(false);
    }
  };

  const handleSchoolSkip = () => {
    setFormData((prev) => ({ ...prev, school: '' }));
    setSchoolPeers([]);
    clearStepError('school');
    setStep('avatar');
  };

  // ── Screen 8: Avatar ─────────────────────────────────────────────────────
  const handleAvatarNext = () => {
    setStep('mageName');
  };

  const handleAvatarSkip = () => {
    setFormData((prev) => ({ ...prev, avatarUrl: null }));
    setStep('mageName');
  };

  const handleAvatarChange = (url: string) => {
    setFormData((prev) => ({ ...prev, avatarUrl: url }));
  };

  // ── Screen 9: Mage name ──────────────────────────────────────────────────
  const handleMageNameNext = () => {
    const trimmed = formData.scholarName.trim();
    if (trimmed && !MAGE_NAME_REGEX.test(trimmed)) {
      setStepError(
        'mageName',
        'Name can only contain letters, numbers, spaces, hyphens, and apostrophes.'
      );
      return;
    }
    clearStepError('mageName');
    setStep('goals');
  };

  const handleMageNameSkip = () => {
    setFormData((prev) => ({ ...prev, scholarName: '' }));
    clearStepError('mageName');
    setStep('goals');
  };

  // ── Screen 10: Goals → advance to the import finale ──────────────────────
  const handleGoalsFinish = () => setStep('import');
  const handleGoalsSkip = () => {
    setFormData((prev) => ({ ...prev, goals: { ...EMPTY_GOAL_VALUES } }));
    setStep('import');
  };

  // ── Screen 11: Import finale → complete onboarding ───────────────────────
  const submitOnboarding = async (redirectTo: string) => {
    clearStepError('import');
    setLoading(true);
    try {
      const scholarName = formData.scholarName.trim() || null;
      const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim();
      await fetch('/api/user/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goals: formData.goals,
          scholarName,
          name: fullName || null,
          lineOfWork: formData.context || null,
          fieldOfStudy: formData.fieldOfStudy.trim() || null,
          school: formData.school.trim() || null,
        }),
      });
      // Refresh the JWT token so middleware sees onboardingComplete: true
      await updateSession();
      router.push(redirectTo);
    } catch {
      setStepError('import', 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  // Completed the import finale — land on the first imported notebook if
  // one was created, otherwise the dashboard.
  const handleImportComplete = (firstNotebookId: string | null) => {
    submitOnboarding(firstNotebookId ? `/notebooks/${firstNotebookId}` : '/dashboard');
  };
  const handleImportSkip = () => submitOnboarding('/dashboard');

  const handleBack = () => {
    const target = BACK_TARGETS[step];
    if (target) setStep(target);
  };

  // 'verify' is a credentials-only interstitial between account and tier that
  // OAuth users skip, so it's deliberately absent from STEP_ORDER. Pin its bar
  // to the account step's fill so the progress doesn't jump back to empty.
  const orderIndex = step === 'verify' ? 0 : STEP_ORDER.indexOf(step);
  const progress = (orderIndex + 1) / STEP_ORDER.length;
  const goalCount = Object.values(formData.goals).filter((v) => v !== null).length;

  const goalsBadge =
    goalCount > 0 ? (
      <span
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '9999px',
          background: '#4dff91',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(77,255,145,0.35), 0 0 0 3px var(--surface-container-low)',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '15px', color: '#0c2a14', fontVariationSettings: "'FILL' 1, 'wght' 700" }}
        >
          check
        </span>
      </span>
    ) : undefined;

  const renderScreen = () => {
    // ── Screen 1: identity — sign-up form (credentials) or DOB gate (OAuth) ──
    if (step === 'account') {
      if (authPath === null) {
        return (
          <OnboardingScreen screenKey="account" progress={progress}>
            <div
              style={{
                minHeight: '360px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '24px', color: 'var(--md-h4)', animation: 'spin 1s linear infinite' }}
              >
                progress_activity
              </span>
            </div>
          </OnboardingScreen>
        );
      }

      if (isOauthPath) {
        return (
          <OnboardingScreen
            screenKey="account"
            progress={progress}
            mascotPose="wave"
            mascotIdle="float"
            heading="First, your date of birth"
            subheading="NoteMage is for ages 13 and up."
            error={stepErrors.account || ''}
            primaryLabel={loading ? 'Saving…' : 'Continue'}
            onPrimary={handleOAuthDobNext}
            primaryDisabled={loading || !formData.birthDate || !formData.agreed}
            primaryLoading={loading}
          >
            <OAuthBirthDateStep
              birthDate={formData.birthDate}
              agreed={formData.agreed}
              onChange={handleFieldChange}
              disabled={loading}
            />
          </OnboardingScreen>
        );
      }

      return (
        <OnboardingScreen screenKey="account" progress={progress}>
          <AccountStep
            data={{
              email: formData.email,
              password: formData.password,
              confirmPassword: formData.confirmPassword,
              birthDate: formData.birthDate,
              agreed: formData.agreed,
            }}
            onChange={handleFieldChange}
            onNext={handleAccountNext}
            loading={loading}
            error={stepErrors.account || ''}
          />
          {/*
            OAuth alternative — credentials path only. Sends the user through
            NextAuth's Google/Apple flow with callbackUrl=/auth/register so the
            post-OAuth landing remounts the wizard, decidedPathRef resolves to
            'oauth', and OAuthBirthDateStep renders for the DOB gate.
            Deliberately not rendered on the OAuth DOB step, the verify step,
            or any later step — by then a session exists and these buttons
            would be misleading.
          */}
          <OAuthProviderRow
            callbackUrl="/auth/register"
            disabled={loading}
            onError={(msg) => setStepError('account', msg)}
          />
        </OnboardingScreen>
      );
    }

    // ── Verify email — credentials path only (OAuth users are pre-verified) ──
    if (step === 'verify') {
      return (
        <OnboardingScreen
          screenKey="verify"
          progress={progress}
          mascotPose="holding-pen"
          mascotIdle="bounce"
          heading="Check your inbox"
          error={stepErrors.verify || ''}
        >
          <VerifyCodeForm email={formData.email} onVerified={handleVerified} />
        </OnboardingScreen>
      );
    }

    // ── Screen 2: Plan selection — FREE proceeds, PRO pays here ──────────────
    if (step === 'tier') {
      const proSelected = formData.tier === 'PRO';
      const alreadyPro = session?.user?.tier === 'PRO';
      return (
        <OnboardingScreen
          screenKey="tier"
          progress={progress}
          mascotPose="holding-scroll"
          mascotIdle="sway"
          heading="Choose your plan"
          subheading="Start free, or unlock everything with Pro."
          error={stepErrors.tier || ''}
          primaryLabel={
            proSelected && !alreadyPro
              ? upgrading
                ? 'Opening checkout…'
                : 'Continue to checkout'
              : 'Continue'
          }
          onPrimary={handleTierContinue}
          primaryDisabled={upgrading}
          primaryLoading={upgrading}
        >
          <TierSelectionStep
            selectedTier={formData.tier}
            onSelect={(tier) => setFormData((prev) => ({ ...prev, tier }))}
            freeAiPathsDisabled={freeAiPathsDisabled}
          />
          <IosUpgradeSheet
            open={iosSheetOpen}
            onClose={() => setIosSheetOpen(false)}
            onPurchased={() => {
              setIosSheetOpen(false);
              setStep('firstName');
            }}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 3: First name ─────────────────────────────────────────────────
    if (step === 'firstName') {
      return (
        <OnboardingScreen
          screenKey="firstName"
          progress={progress}
          onBack={handleBack}
          mascotPose="holding-pen"
          mascotIdle="bounce"
          heading="What's your first name?"
          primaryLabel="Continue"
          onPrimary={() => setStep('lastName')}
          primaryDisabled={!formData.firstName.trim()}
        >
          <FirstNameStep
            value={formData.firstName}
            onChange={(value) => setFormData((prev) => ({ ...prev, firstName: value }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 3: Last name ──────────────────────────────────────────────────
    if (step === 'lastName') {
      return (
        <OnboardingScreen
          screenKey="lastName"
          progress={progress}
          onBack={handleBack}
          mascotPose="holding-pen"
          mascotIdle="bounce"
          heading="And your last name?"
          primaryLabel="Continue"
          onPrimary={() => setStep('username')}
          primaryDisabled={!formData.lastName.trim()}
        >
          <LastNameStep
            value={formData.lastName}
            onChange={(value) => setFormData((prev) => ({ ...prev, lastName: value }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 4: Username ───────────────────────────────────────────────────
    if (step === 'username') {
      return (
        <OnboardingScreen screenKey="username" progress={progress} onBack={handleBack}>
          <UsernameStep
            suggested={
              formData.username ||
              suggestUsernameFromEmail(formData.email || session?.user?.email)
            }
            avatarUrl={isOauthPath ? (session?.user?.avatarUrl ?? null) : null}
            displayName={isOauthPath ? (session?.user?.name ?? null) : null}
            onSaved={handleUsernameSaved}
            error={stepErrors.username || ''}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 5: Context ────────────────────────────────────────────────────
    if (step === 'context') {
      return (
        <OnboardingScreen
          screenKey="context"
          progress={progress}
          onBack={handleBack}
          mascotPose="thinking"
          mascotIdle="sway"
          heading="What brings you to NoteMage?"
          primaryLabel="Continue"
          onPrimary={() => setStep('fieldOfStudy')}
          primaryDisabled={!formData.context}
        >
          <ContextStep
            value={formData.context}
            onChange={(value) => setFormData((prev) => ({ ...prev, context: value }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 6: Field of study ─────────────────────────────────────────────
    if (step === 'fieldOfStudy') {
      return (
        <OnboardingScreen
          screenKey="fieldOfStudy"
          progress={progress}
          onBack={handleBack}
          mascotPose="thinking"
          mascotIdle="sway"
          heading="What are you studying?"
          subheading="This helps NoteMage tailor your study material."
          primaryLabel="Continue"
          onPrimary={() => setStep('school')}
          primaryDisabled={!formData.fieldOfStudy.trim()}
          secondaryLabel="Skip for now"
          onSecondary={() => {
            setFormData((prev) => ({ ...prev, fieldOfStudy: '' }));
            setStep('school');
          }}
        >
          <FieldOfStudyStep
            value={formData.fieldOfStudy}
            onChange={(value) => setFormData((prev) => ({ ...prev, fieldOfStudy: value }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 7: School — autocomplete over existing schools ────────────────
    if (step === 'school') {
      return (
        <OnboardingScreen
          screenKey="school"
          progress={progress}
          onBack={handleBack}
          mascotPose="thinking"
          mascotIdle="sway"
          heading="Where do you go to school?"
          subheading="We'll suggest other mages from the same place."
          error={stepErrors.school || ''}
          primaryLabel={loading ? 'Looking…' : 'Continue'}
          onPrimary={handleSchoolContinue}
          primaryDisabled={loading}
          primaryLoading={loading}
          secondaryLabel="Skip for now"
          onSecondary={handleSchoolSkip}
          secondaryDisabled={loading}
        >
          <SchoolStep
            value={formData.school}
            onChange={(value) => setFormData((prev) => ({ ...prev, school: value }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 7b: Find classmates — conditional, only when peers exist ──────
    // handleSchoolContinue is the only path here; if peers turned out empty
    // the wizard skipped this screen entirely.
    if (step === 'findClassmates') {
      return (
        <OnboardingScreen
          screenKey="findClassmates"
          progress={progress}
          onBack={handleBack}
          mascotPose="wave"
          mascotIdle="float"
          heading="Mages from your school"
          primaryLabel="Done"
          onPrimary={() => setStep('avatar')}
          secondaryLabel="Skip for now"
          onSecondary={() => setStep('avatar')}
        >
          <FindClassmatesStep peers={schoolPeers} school={formData.school.trim()} />
        </OnboardingScreen>
      );
    }

    // ── Screen 8: Avatar ─────────────────────────────────────────────────────
    if (step === 'avatar') {
      return (
        <OnboardingScreen
          screenKey="avatar"
          progress={progress}
          mascotPose="default"
          mascotIdle="bounce"
          heading="Choose your avatar"
          primaryLabel="Continue"
          onPrimary={handleAvatarNext}
          primaryDisabled={loading || avatarBusy}
          secondaryLabel="Skip for now"
          onSecondary={handleAvatarSkip}
          secondaryDisabled={loading || avatarBusy}
        >
          <AvatarStep
            username={formData.username}
            currentAvatarUrl={formData.avatarUrl}
            onAvatarChange={handleAvatarChange}
            onUploadingChange={setAvatarBusy}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 9: Mage name ──────────────────────────────────────────────────
    if (step === 'mageName') {
      return (
        <OnboardingScreen
          screenKey="mageName"
          progress={progress}
          onBack={handleBack}
          mascotPose="default"
          mascotIdle="bounce"
          heading="Name your Mage"
          error={stepErrors.mageName || ''}
          primaryLabel="Continue"
          onPrimary={handleMageNameNext}
          secondaryLabel="Skip for now"
          onSecondary={handleMageNameSkip}
        >
          <ScholarNameStep
            scholarName={formData.scholarName}
            onChange={(name) => setFormData((prev) => ({ ...prev, scholarName: name }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 10: Goals ─────────────────────────────────────────────────────
    if (step === 'goals') {
      return (
        <OnboardingScreen
          screenKey="goals"
          progress={progress}
          onBack={handleBack}
          mascotPose="holding-scroll"
          mascotIdle="sway"
          mascotBadge={goalsBadge}
          heading="Set your goals"
          subheading="Pick what matters to you. You can change these anytime."
          error={stepErrors.goals || ''}
          primaryLabel={
            <>
              Continue
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                arrow_forward
              </span>
            </>
          }
          onPrimary={handleGoalsFinish}
          secondaryLabel="Skip for now"
          onSecondary={handleGoalsSkip}
        >
          <StudyGoalsStep
            goals={formData.goals}
            mageName={formData.scholarName.trim()}
            onChange={(goals) => setFormData((prev) => ({ ...prev, goals }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 11: Import finale ─────────────────────────────────────────────
    // The chevron exits to Goals only from the first import sub-step; once an
    // import is underway the flow's own controls own back navigation, and the
    // upload/creating sub-steps are not reversible.
    return (
      <OnboardingScreen
        screenKey="import"
        progress={progress}
        onBack={importPhase === 'source' ? handleBack : undefined}
        error={stepErrors.import || ''}
      >
        <OnboardingImportStep
          onComplete={handleImportComplete}
          onSkip={handleImportSkip}
          onPhaseChange={setImportPhase}
          completing={loading}
        />
      </OnboardingScreen>
    );
  };

  return (
    <div>
      {renderScreen()}

      {/* Footer links */}
      <div
        style={{
          marginTop: '16px',
          display: 'flex',
          justifyContent: 'center',
          gap: '32px',
        }}
      >
        {['Help Center', 'System Status', 'Contact Support'].map((item) => (
          <a
            key={item}
            href="#"
            className="ob-footer-link"
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--outline)',
              textDecoration: 'none',
            }}
          >
            {item}
          </a>
        ))}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes obSpinnerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="spin 1s"] { animation: obSpinnerPulse 1.2s ease-in-out infinite !important; }
        }
        .ob-footer-link:hover { color: var(--on-surface); }
        .ob-footer-link:focus-visible { outline: 2px solid #ae89ff; outline-offset: 3px; border-radius: 4px; }
      `}</style>
    </div>
  );
}

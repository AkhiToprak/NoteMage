/**
 * grading-systems.ts
 *
 * Canonical grading-system catalog and conversion utilities for NoteMage.
 *
 * NEUTRAL SCORE MODEL
 * -------------------
 * All grades are normalized to a 0–100 "neutral" score for internal storage,
 * averaging, and cross-system comparison:
 *   0   = worst possible grade in the system
 *   100 = best possible grade in the system
 *
 * toNeutral(value, sys)   → 0–100 number
 * fromNeutral(n, sys)     → { value, display } in the user's system
 * formatGrade(n, sys)     → display string
 * averageGrades(ns, sys)  → mean neutral → display string
 *
 * Conversions are GENERIC (driven by catalog fields only, no per-country branches).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GradingBand {
  /** The label shown to users (e.g. 'A+', 'First', '9'). */
  label: string;
  /** Midpoint on the 0–100 neutral scale this band maps to. */
  neutral: number;
}

export interface GradingSystem {
  /** Stable kebab identifier. */
  id: string;
  /** Full country name, or null for international/global systems. */
  country: string | null;
  /** Country flag emoji or 🌐 for global. */
  flag: string;
  /** Human-readable label including range (e.g. 'Switzerland (1–6)'). */
  label: string;
  /** 'numeric' = linear scale; 'letter' = discrete bands (incl. letter-like GPA). */
  kind: "numeric" | "letter";

  // --- numeric-only ---
  scaleMin?: number;
  scaleMax?: number;
  /** true = higher is better (CH, US %); false = lower is better (DE, AT). */
  bestIsHigh?: boolean;
  /** Display decimal places. */
  decimals?: number;
  /** Suffix appended in display strings (e.g. '', '%', '/20', '/10'). */
  unit?: string;

  // --- letter-only ---
  /** Ordered array from best to worst; each entry has a label and neutral midpoint. */
  bands?: GradingBand[];

  /** Passing grade in display units (number for numeric, string for letter). */
  passMark: number | string;
  /** One-line source/accuracy note. */
  notes: string;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const GRADING_SYSTEMS: GradingSystem[] = [
  // ── Countries (alphabetical) ────────────────────────────────────────────

  {
    id: "ae",
    country: "United Arab Emirates",
    flag: "🇦🇪",
    label: "UAE/GCC Percentage (0–100)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 100,
    bestIsHigh: true,
    decimals: 1,
    unit: "%",
    passMark: 50,
    notes:
      "UAE MoE government school pass = 50% (Group A subjects, grades 4–12). Universities commonly set pass at 60% (C grade on 4.0 GPA scale). GCC countries (Bahrain, Oman, Kuwait, KSA) use same % basis with 50% school pass. Source: UAE MoE Student Assessment Policy; gulfnews.com 2025; scholaro.com/UAE",
  },
  {
    id: "at",
    country: "Austria",
    flag: "🇦🇹",
    label: "Austria (1–5, inverted)",
    kind: "numeric",
    scaleMin: 1,
    scaleMax: 5,
    bestIsHigh: false,
    decimals: 0,
    unit: "",
    passMark: 4,
    notes:
      "Austrian school scale: 1=sehr gut (best), 4=genügend (pass), 5=nicht genügend (fail); integer grades only, no decimals; source: Wikipedia Academic grading in Austria",
  },
  {
    id: "au",
    country: "Australia",
    flag: "🇦🇺",
    label: "Australia HD/D/Cr/P/F",
    kind: "letter",
    bands: [
      { label: "HD (High Distinction)", neutral: 92.5 },
      { label: "D (Distinction)", neutral: 79.5 },
      { label: "Cr (Credit)", neutral: 69.5 },
      { label: "P (Pass)", neutral: 57 },
      { label: "F (Fail)", neutral: 24.5 },
    ],
    passMark: "P",
    notes:
      "Standard Australian university bands: HD=85–100, D=75–84, Cr=65–74, P=50–64, F=<50. Pass=50%. Cutoffs vary by institution (e.g. ANU: HD=80+). Source: Wikipedia Academic grading in Australia; IDP Australia guide",
  },
  {
    id: "au-gpa-7",
    country: "Australia",
    flag: "🇦🇺",
    label: "Australia 7-point GPA",
    kind: "letter",
    bands: [
      { label: "7 – High Distinction", neutral: 92.5 },
      { label: "6 – Distinction", neutral: 79.5 },
      { label: "5 – Credit", neutral: 69.5 },
      { label: "4 – Pass", neutral: 57 },
      { label: "0 – Fail", neutral: 24.5 },
    ],
    passMark: "4",
    notes:
      "Australian 7-pt GPA scale: HD=7, D=6, Credit=5, Pass=4, Fail=0. Maps to same % bands as au (HD 85–100, D 75–84, Cr 65–74, P 50–64). Source: Wikipedia Academic grading in Australia",
  },
  {
    id: "be",
    country: "Belgium",
    flag: "🇧🇪",
    label: "Belgium (0–20)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 20,
    bestIsHigh: true,
    decimals: 1,
    unit: "/20",
    passMark: 10,
    notes:
      "HE (both Flemish & French communities) uses 0–20, pass=10/20. Secondary schools vary (0–20, 0–100, %); 0–20 with 10 pass chosen as the most commonly recognized form. Source: nuffic.nl, Wikipedia Academic grading in Belgium",
  },
  {
    id: "br",
    country: "Brazil",
    flag: "🇧🇷",
    label: "Brazil (0–10)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 10,
    bestIsHigh: true,
    decimals: 1,
    unit: "",
    passMark: 6,
    notes:
      "Standard 0–10 numeric scale used across Brazilian primary, secondary, and most federal universities (UFRJ, UFMG, etc.); passing threshold 6.0 for primary/secondary (LDB reference); federal universities typically 5.0–6.0 with a supplementary exam zone 5.0–5.9. Decimals to one place are standard on transcripts.",
  },
  {
    id: "ca-gpa",
    country: "Canada",
    flag: "🇨🇦",
    label: "Canada GPA (4.0 scale)",
    kind: "letter",
    bands: [
      { label: "A+ (4.0)", neutral: 95 },
      { label: "A (4.0)", neutral: 87 },
      { label: "A- (3.7)", neutral: 82 },
      { label: "B+ (3.3)", neutral: 78 },
      { label: "B (3.0)", neutral: 74.5 },
      { label: "B- (2.7)", neutral: 71 },
      { label: "C+ (2.3)", neutral: 68 },
      { label: "C (2.0)", neutral: 64.5 },
      { label: "C- (1.7)", neutral: 61 },
      { label: "D+ (1.3)", neutral: 57 },
      { label: "D (1.0)", neutral: 52 },
      { label: "F (0.0)", neutral: 25 },
    ],
    passMark: "1.0",
    notes:
      "Most Canadian universities use a 4.0 GPA scale (Ontario, Alberta); some use 4.33. Percentage bands from Alberta/Ontario norms per Wikipedia 'Academic grading in Canada': A+ 90–100, A 85–89, A- 80–84, B+ 77–79, B 73–76, B- 70–72, C+ 67–69, C 63–66, C- 60–62, D+ 55–59, D 50–54, F 0–49.",
  },
  {
    id: "ca-percent",
    country: "Canada",
    flag: "🇨🇦",
    label: "Canada Percentage (0–100%)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 100,
    bestIsHigh: true,
    decimals: 1,
    unit: "%",
    passMark: 50,
    notes:
      "Most provinces (Alberta, Ontario, BC, Saskatchewan) use 50% as minimum passing grade for secondary/post-secondary; Quebec secondary uses 60%. No single national standard per Wikipedia 'Academic grading in Canada'; 50% chosen as majority convention.",
  },
  {
    id: "ch",
    country: "Switzerland",
    flag: "🇨🇭",
    label: "Switzerland (1–6)",
    kind: "numeric",
    scaleMin: 1,
    scaleMax: 6,
    bestIsHigh: true,
    decimals: 1,
    unit: "",
    passMark: 4,
    notes:
      "Federal + cantonal school scale; 6=best, 1=worst; pass=4.0; certificates round to 0.5 steps, exams use 0.25; source: Wikipedia Academic grading in Switzerland",
  },
  {
    id: "cn",
    country: "China",
    flag: "🇨🇳",
    label: "China (0–100)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 100,
    bestIsHigh: true,
    decimals: 0,
    unit: "",
    passMark: 60,
    notes:
      "Standard 100-pt scale used at Chinese universities; universal pass threshold = 60 (及格). Bands: 90–100 A/优秀, 80–89 B/良好, 70–79 C/中等, 60–69 D/及格, <60 F/不及格. Source: Wikipedia Academic grading in China; MoE guidelines",
  },
  {
    id: "de",
    country: "Germany",
    flag: "🇩🇪",
    label: "Germany (1–6, inverted)",
    kind: "numeric",
    scaleMin: 1,
    scaleMax: 6,
    bestIsHigh: false,
    decimals: 1,
    unit: "",
    passMark: 4,
    notes:
      "German school Notensystem: 1=sehr gut (best), 4=ausreichend (pass), 5–6=fail; report cards use integers; fractional ±steps used in practice; source: Wikipedia Academic grading in Germany",
  },
  {
    id: "dk",
    country: "Denmark",
    flag: "🇩🇰",
    label: "Denmark (−3 to 12)",
    kind: "numeric",
    scaleMin: -3,
    scaleMax: 12,
    bestIsHigh: true,
    decimals: 0,
    unit: "",
    passMark: 2,
    notes:
      "Danish 7-point scale (2007). Valid grades: −3, 00, 02, 4, 7, 10, 12 (non-linear). Pass = 02. Leading zeros in 00/02 are anti-fraud convention. ECTS: 12=A, 10=B, 7=C, 4=D, 02=E, 00=Fx, −3=F. Source: ufsn.dk / Wikipedia.",
  },
  {
    id: "es",
    country: "Spain",
    flag: "🇪🇸",
    label: "Spain (0–10)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 10,
    bestIsHigh: true,
    decimals: 1,
    unit: "",
    passMark: 5,
    notes:
      "Used across all levels (ESO, Bachillerato, university) per LOMLOE; pass=5 (Suficiente/Aprobado); bands: <5 Insuficiente/Suspenso, 5 Suficiente, 6 Bien, 7–8 Notable, 9–10 Sobresaliente. Source: Nuffic Spain, Wikipedia Academic grading in Spain",
  },
  {
    id: "fi",
    country: "Finland",
    flag: "🇫🇮",
    label: "Finland (4–10)",
    kind: "numeric",
    scaleMin: 4,
    scaleMax: 10,
    bestIsHigh: true,
    decimals: 0,
    unit: "",
    passMark: 5,
    notes:
      "Finnish comprehensive and upper secondary school scale. 4=fail (only fail grade), 5=passable through 10=excellent. Half-grades allowed in individual exams but not final grades. Source: Wikipedia / Norden.org.",
  },
  {
    id: "fr",
    country: "France",
    flag: "🇫🇷",
    label: "France (0–20)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 20,
    bestIsHigh: true,
    decimals: 2,
    unit: "/20",
    passMark: 10,
    notes:
      "Standard since 1890 baccalauréat; pass=10/20; Mention TB≥16, Bien≥14, Assez bien≥12. Source: Wikipedia Academic grading in France; studying-in-france.org",
  },
  {
    id: "ie-lc",
    country: "Ireland",
    flag: "🇮🇪",
    label: "Leaving Cert Higher (H1–H8)",
    kind: "letter",
    bands: [
      { label: "H1", neutral: 95 },
      { label: "H2", neutral: 85 },
      { label: "H3", neutral: 75 },
      { label: "H4", neutral: 65 },
      { label: "H5", neutral: 55 },
      { label: "H6", neutral: 45 },
      { label: "H7", neutral: 35 },
      { label: "H8", neutral: 15 },
    ],
    passMark: "H7",
    notes:
      "Irish Leaving Certificate Higher Level grades (2017 reform). H1=90-100%, H8=<30%; pass is H7 or above (H8 = no points awarded). Higher Level shown as most commonly sat for core subjects. Source: CAO/Wikipedia.",
  },
  {
    id: "in-cgpa",
    country: "India",
    flag: "🇮🇳",
    label: "India CGPA (0–10)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 10,
    bestIsHigh: true,
    decimals: 2,
    unit: "",
    passMark: 4,
    notes:
      "Indian university CGPA on a 10-point scale (10 best); pass commonly CGPA 4–5 depending on institution. Letter grades (O/A+/A/...) map onto this scale. Source: UGC CBCS.",
  },
  {
    id: "in-percent",
    country: "India",
    flag: "🇮🇳",
    label: "India Percentage (0–100)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 100,
    bestIsHigh: true,
    decimals: 1,
    unit: "%",
    passMark: 40,
    notes:
      "UGC CBCS 2015 minimum pass = 40% for UG; some PG programmes require 50%. Source: UGC CBCS guidelines, openeducat.org/gradebook/india/cbcs/",
  },
  {
    id: "it-school",
    country: "Italy",
    flag: "🇮🇹",
    label: "Italy — School (0–10)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 10,
    bestIsHigh: true,
    decimals: 1,
    unit: "/10",
    passMark: 6,
    notes:
      "Primary & secondary school scale per Italian Ministry of Education (Ministero dell'Istruzione e del Merito); pass=6; below 4 = extremely insufficient. Source: Wikipedia Academic grading in Italy",
  },
  {
    id: "it-uni",
    country: "Italy",
    flag: "🇮🇹",
    label: "Italy — University (18–30)",
    kind: "numeric",
    scaleMin: 18,
    scaleMax: 30,
    bestIsHigh: true,
    decimals: 0,
    unit: "/30",
    passMark: 18,
    notes:
      "University exam scale; 0–17 = fail (not recorded); pass=18; max=30 e lode (honours). Bands: 18–21 Sufficiente, 22–24 Discreto, 25–27 Buono, 28–30 Ottimo. Source: Politecnico di Torino, Wikipedia Academic grading in Italy",
  },
  {
    id: "jp",
    country: "Japan",
    flag: "🇯🇵",
    label: "Japan Letter (S–A–B–C–F)",
    kind: "letter",
    bands: [
      { label: "S (秀 Exemplary)", neutral: 95 },
      { label: "A (優 Very Good)", neutral: 84.5 },
      { label: "B (良 Good)", neutral: 74.5 },
      { label: "C (可 Pass)", neutral: 64.5 },
      { label: "F (不可 Fail)", neutral: 25 },
    ],
    passMark: "C",
    notes:
      "Most common 5-grade Japanese university system: S=90–100, A=80–89, B=70–79, C=60–69, F=0–59. Pass=60%. Source: Wikipedia Academic grading in Japan; Kyushu University GPA page",
  },
  {
    id: "jp-percent",
    country: "Japan",
    flag: "🇯🇵",
    label: "Japan Numeric (0–100)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 100,
    bestIsHigh: true,
    decimals: 0,
    unit: "",
    passMark: 60,
    notes:
      "Underlying 100-pt raw score used across Japanese universities; 60 is the standard pass threshold. Many institutions map this to S/A/B/C/F bands. Source: Wikipedia Academic grading in Japan",
  },
  {
    id: "li",
    country: "Liechtenstein",
    flag: "🇱🇮",
    label: "Liechtenstein (1–6)",
    kind: "numeric",
    scaleMin: 1,
    scaleMax: 6,
    bestIsHigh: true,
    decimals: 1,
    unit: "",
    passMark: 4,
    notes:
      "Liechtenstein school scale mirrors Swiss convention: 6=very good (best), 4=satisfactory (pass); full and half-mark steps only; source: Eurydice Eurypedia Liechtenstein upper secondary assessment",
  },
  {
    id: "mx",
    country: "Mexico",
    flag: "🇲🇽",
    label: "Mexico (0–10)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 10,
    bestIsHigh: true,
    decimals: 1,
    unit: "",
    passMark: 6,
    notes:
      "SEP-official 0–10 nota scale; 6.0 is the national aprobatorio (passing) threshold across básica, secundaria, and most public universities (UNAM, IPN). Grades 5–10 used in secondary (0–4 only appear in higher ed remediation context). Scores 6.0–6.9 trigger Regularización; below 6.0 triggers Extraordinario exam. Decimals used on SEP boleta.",
  },
  {
    id: "nl",
    country: "Netherlands",
    flag: "🇳🇱",
    label: "Netherlands (1–10)",
    kind: "numeric",
    scaleMin: 1,
    scaleMax: 10,
    bestIsHigh: true,
    decimals: 1,
    unit: "",
    passMark: 6,
    notes:
      "Nuffic official: 1–10 scale used from secondary through university; pass=6 (5.5 rounds up to 6 in secondary; 5.5 sometimes accepted in HE). Source: nuffic.nl grading-systems",
  },
  {
    id: "no",
    country: "Norway",
    flag: "🇳🇴",
    label: "Norway (1–6)",
    kind: "numeric",
    scaleMin: 1,
    scaleMax: 6,
    bestIsHigh: true,
    decimals: 0,
    unit: "",
    passMark: 2,
    notes:
      "Norwegian upper secondary (videregående) numeric scale. 6=outstanding, 1=very low. Pass requires ≥2 in each subject. Finals are whole numbers only. Source: Wikipedia / Norden.org.",
  },
  {
    id: "pt",
    country: "Portugal",
    flag: "🇵🇹",
    label: "Portugal (0–20)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 20,
    bestIsHigh: true,
    decimals: 1,
    unit: "/20",
    passMark: 10,
    notes:
      "Upper secondary and university 0–20 scale; pass=10; bands: 10–13 Suficiente, 14–15 Bom, 16–17 Muito Bom, 18–20 Excelente. Gov.pt official; Decreto-Lei n.º 55/2018. Source: Eurydice Portugal, Wikipedia Academic grading in Portugal",
  },
  {
    id: "se",
    country: "Sweden",
    flag: "🇸🇪",
    label: "Sweden (A–F)",
    kind: "letter",
    bands: [
      { label: "A", neutral: 95 },
      { label: "B", neutral: 75 },
      { label: "C", neutral: 55 },
      { label: "D", neutral: 35 },
      { label: "E", neutral: 15 },
      { label: "F", neutral: 0 },
    ],
    passMark: "E",
    notes:
      "Swedish compulsory and upper secondary school scale (2011 reform). A–E = pass, F = fail. Grade points: A=20, B=17.5, C=15, D=12.5, E=10. Source: Skolverket / Wikipedia.",
  },
  {
    id: "tr",
    country: "Turkey",
    flag: "🇹🇷",
    label: "Turkey Letter (AA–FF, YÖK)",
    kind: "letter",
    bands: [
      { label: "AA (Excellent)", neutral: 95 },
      { label: "BA (Very Good)", neutral: 87 },
      { label: "BB (Good)", neutral: 82 },
      { label: "CB (Fairly Good)", neutral: 77 },
      { label: "CC (Satisfactory)", neutral: 72 },
      { label: "DC (Passing)", neutral: 67 },
      { label: "DD (Poor)", neutral: 62 },
      { label: "FD (Conditional Fail)", neutral: 54.5 },
      { label: "FF (Fail)", neutral: 24.5 },
    ],
    passMark: "DD",
    notes:
      "YÖK-standard double-letter system: AA=90–100(4.0), BA=85–89(3.5), BB=80–84(3.0), CB=75–79(2.5), CC=70–74(2.0), DC=65–69(1.5), DD=60–64(1.0), FD=50–59(0.5), FF=<50(0). Min pass=DD(60); CC needed for unconditional pass. Source: studyinturkiye.com; scholaro.com/Turkey",
  },
  {
    id: "tr-percent",
    country: "Turkey",
    flag: "🇹🇷",
    label: "Turkey school percentage (0–100)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 100,
    bestIsHigh: true,
    decimals: 0,
    unit: "%",
    passMark: 50,
    notes:
      "Turkish school 100-point percentage; pass = 50. Universities use AA–FF letters ('tr') and a 4.0 GPA ('tr-gpa'). Source: Turkish MEB.",
  },
  {
    id: "uk-gcse",
    country: "United Kingdom",
    flag: "🇬🇧",
    label: "GCSE (9–1)",
    kind: "letter",
    bands: [
      { label: "9", neutral: 95 },
      { label: "8", neutral: 84 },
      { label: "7", neutral: 73 },
      { label: "6", neutral: 62 },
      { label: "5", neutral: 51 },
      { label: "4", neutral: 40 },
      { label: "3", neutral: 29 },
      { label: "2", neutral: 18 },
      { label: "1", neutral: 7 },
      { label: "U", neutral: 0 },
    ],
    passMark: "4",
    notes:
      "England GCSE 9-1 scale (introduced 2017). Grade 4 = standard pass (≈ old C); grade 5 = strong pass. Ordinal; no official percent-to-grade table (Ofqual). U = ungraded.",
  },
  {
    id: "uk-uni",
    country: "United Kingdom",
    flag: "🇬🇧",
    label: "UK Degree (First–Third)",
    kind: "letter",
    bands: [
      { label: "First", neutral: 85 },
      { label: "2:1", neutral: 65 },
      { label: "2:2", neutral: 55 },
      { label: "Third", neutral: 45 },
      { label: "Fail", neutral: 20 },
    ],
    passMark: "Third",
    notes:
      "Standard UK undergraduate honours classification; percentages are conventional, not statutory (Wikipedia: British undergraduate degree classification).",
  },
  {
    id: "us-gpa",
    country: "United States",
    flag: "🇺🇸",
    label: "US GPA (4.0 scale)",
    kind: "letter",
    bands: [
      { label: "4.0", neutral: 100 },
      { label: "3.7", neutral: 92.5 },
      { label: "3.3", neutral: 82.5 },
      { label: "3.0", neutral: 75 },
      { label: "2.7", neutral: 67.5 },
      { label: "2.3", neutral: 57.5 },
      { label: "2.0", neutral: 50 },
      { label: "1.7", neutral: 42.5 },
      { label: "1.3", neutral: 32.5 },
      { label: "1.0", neutral: 25 },
      { label: "0.7", neutral: 17.5 },
      { label: "0.0", neutral: 0 },
    ],
    passMark: "1.0",
    notes:
      "Standard unweighted 4.0 GPA scale per College Board / gpacalculator.io; A+ and A both = 4.0 at most institutions (A+ is 4.3 at some schools but 4.0 is the majority convention); neutral midpoints computed as GPA/4.0 × 100.",
  },
  {
    id: "us-letter",
    country: "United States",
    flag: "🇺🇸",
    label: "US Letter Grades (A+–F)",
    kind: "letter",
    bands: [
      { label: "A+", neutral: 98.5 },
      { label: "A", neutral: 95 },
      { label: "A-", neutral: 91 },
      { label: "B+", neutral: 88 },
      { label: "B", neutral: 84.5 },
      { label: "B-", neutral: 81 },
      { label: "C+", neutral: 78 },
      { label: "C", neutral: 74.5 },
      { label: "C-", neutral: 71 },
      { label: "D+", neutral: 68 },
      { label: "D", neutral: 65 },
      { label: "D-", neutral: 61 },
      { label: "F", neutral: 30 },
    ],
    passMark: "D",
    notes:
      "Standard plus/minus letter scale per Wikipedia 'Academic grading in the United States'; A+ and A both map to 4.0 GPA; D is lowest passing grade in most K-12; many colleges treat D as unsatisfactory. Percentage midpoints derived from standard 97/93/90/87/83/80/77/73/70/67/65/60 cutoffs.",
  },
  {
    id: "us-percent",
    country: "United States",
    flag: "🇺🇸",
    label: "US Percentage (0–100%)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 100,
    bestIsHigh: true,
    decimals: 1,
    unit: "%",
    passMark: 60,
    notes:
      "Direct 0–100% scale; passing threshold typically 60% (D) in K-12 per standard practice; some colleges set 65% or 70%. Neutral = value itself.",
  },

  // ── Additional school / university variants ──────────────────────────────

  {
    id: "de-uni",
    country: "Germany",
    flag: "🇩🇪",
    label: "Germany university (1.0–5.0)",
    kind: "numeric",
    scaleMin: 1,
    scaleMax: 5,
    bestIsHigh: false,
    decimals: 1,
    unit: "",
    passMark: 4,
    notes:
      "German university scale 1.0=sehr gut (best) … 4.0=ausreichend (pass) … 5.0=nicht ausreichend (fail); decimal steps (1.0,1.3,1.7,…). Inverted. School uses 1–6 ('de'). Source: German HEI grading.",
  },
  {
    id: "pt-basic",
    country: "Portugal",
    flag: "🇵🇹",
    label: "Portugal basic education (1–5)",
    kind: "numeric",
    scaleMin: 1,
    scaleMax: 5,
    bestIsHigh: true,
    decimals: 0,
    unit: "",
    passMark: 3,
    notes:
      "Portuguese basic-education níveis 1–5 (5 best, 3 = pass). Secondary/university use 0–20 ('pt'). Source: Portuguese education grading.",
  },
  {
    id: "it-degree",
    country: "Italy",
    flag: "🇮🇹",
    label: "Italy final degree (66–110)",
    kind: "numeric",
    scaleMin: 66,
    scaleMax: 110,
    bestIsHigh: true,
    decimals: 0,
    unit: "",
    passMark: 66,
    notes:
      "Italian final university degree mark 66–110 (110 e lode = with honours), 66 = minimum pass. Exam marks use 18–30 ('it-uni'). Source: Italian university grading.",
  },
  {
    id: "uk-alevel",
    country: "United Kingdom",
    flag: "🇬🇧",
    label: "UK A-level (A*–U)",
    kind: "letter",
    bands: [
      { label: "A*", neutral: 97 },
      { label: "A", neutral: 88 },
      { label: "B", neutral: 78 },
      { label: "C", neutral: 68 },
      { label: "D", neutral: 58 },
      { label: "E", neutral: 50 },
      { label: "U", neutral: 20 },
    ],
    passMark: "E",
    notes:
      "UK GCE A-level grades A* (best) – E (pass), U = ungraded (fail). Source: Ofqual / UK exam boards.",
  },
  {
    id: "ie-uni",
    country: "Ireland",
    flag: "🇮🇪",
    label: "Ireland university (honours)",
    kind: "letter",
    bands: [
      { label: "First (1.1)", neutral: 88 },
      { label: "2:1", neutral: 72 },
      { label: "2:2", neutral: 62 },
      { label: "Third", neutral: 52 },
      { label: "Fail", neutral: 20 },
    ],
    passMark: "Third",
    notes:
      "Irish university honours classifications: First (70%+), 2:1 (60–69), 2:2 (50–59), Third (40–49), Fail (<40). Source: Irish HEI grading.",
  },
  {
    id: "se-uni",
    country: "Sweden",
    flag: "🇸🇪",
    label: "Sweden university (5/4/3/U)",
    kind: "letter",
    bands: [
      { label: "5", neutral: 92 },
      { label: "4", neutral: 75 },
      { label: "3", neutral: 55 },
      { label: "U", neutral: 20 },
    ],
    passMark: "3",
    notes:
      "Swedish university numeric scale 5 (best) / 4 / 3 (pass) / U (fail); many programmes also use ECTS A–F. School uses A–F ('se'). Source: Swedish HEI grading.",
  },
  {
    id: "no-uni",
    country: "Norway",
    flag: "🇳🇴",
    label: "Norway university (A–F)",
    kind: "letter",
    bands: [
      { label: "A", neutral: 92 },
      { label: "B", neutral: 80 },
      { label: "C", neutral: 68 },
      { label: "D", neutral: 56 },
      { label: "E", neutral: 46 },
      { label: "F", neutral: 20 },
    ],
    passMark: "E",
    notes:
      "Norwegian university ECTS-style A (best) – E (pass), F = fail. School uses 1–6 ('no'). Source: Norwegian HEI grading.",
  },
  {
    id: "fi-uni",
    country: "Finland",
    flag: "🇫🇮",
    label: "Finland university (0–5)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 5,
    bestIsHigh: true,
    decimals: 0,
    unit: "",
    passMark: 1,
    notes:
      "Finnish university scale 0–5 (5 best, 1 = pass, 0 = fail). School uses 4–10 ('fi'). Source: Finnish HEI grading.",
  },
  {
    id: "cn-gpa",
    country: "China",
    flag: "🇨🇳",
    label: "China letter / GPA (A–F)",
    kind: "letter",
    bands: [
      { label: "A", neutral: 95 },
      { label: "B", neutral: 85 },
      { label: "C", neutral: 75 },
      { label: "D", neutral: 65 },
      { label: "F", neutral: 30 },
    ],
    passMark: "D",
    notes:
      "Common Chinese university letter mapping from the 0–100 scale (A=90+, B=80s, C=70s, D=60s pass, F=<60); 4.0 GPA conversions vary by institution. Percentage scale is 'cn'. Source: Chinese university grading.",
  },
  {
    id: "jp-school",
    country: "Japan",
    flag: "🇯🇵",
    label: "Japan school (1–5)",
    kind: "numeric",
    scaleMin: 1,
    scaleMax: 5,
    bestIsHigh: true,
    decimals: 0,
    unit: "",
    passMark: 2,
    notes:
      "Japanese school 5-point scale (5 best). Universities use S/A/B/C/F ('jp'). Source: Japanese school grading.",
  },
  {
    id: "tr-grade",
    country: "Turkey",
    flag: "🇹🇷",
    label: "Turkey school grade (1–5)",
    kind: "numeric",
    scaleMin: 1,
    scaleMax: 5,
    bestIsHigh: true,
    decimals: 0,
    unit: "",
    passMark: 2,
    notes:
      "Turkish school 5-point grade (5 best, 2 = pass, 1 = fail). Percentage form is 'tr-percent'. Source: Turkish MEB.",
  },
  {
    id: "tr-gpa",
    country: "Turkey",
    flag: "🇹🇷",
    label: "Turkey GPA (0–4.0)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 4,
    bestIsHigh: true,
    decimals: 2,
    unit: "",
    passMark: 2,
    notes:
      "Turkish university 4.0 GPA; ~2.0 commonly required for graduation. University letters are 'tr'. Source: YÖK / Turkish HEI grading.",
  },
  {
    id: "gcc",
    country: "GCC (Gulf states)",
    flag: "🌐",
    label: "GCC general (0–100%)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 100,
    bestIsHigh: true,
    decimals: 0,
    unit: "%",
    passMark: 60,
    notes:
      "General Gulf (GCC) percentage basis; pass commonly 50–60%. Institutions also map to A–F / GPA 4.0 or 5.0. Source: regional GCC conventions.",
  },

  // ── Global / International ───────────────────────────────────────────────

  {
    id: "ib-diploma",
    country: null,
    flag: "🌐",
    label: "IB Diploma total (0–45)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 45,
    bestIsHigh: true,
    decimals: 0,
    unit: "",
    passMark: 24,
    notes:
      "IB Diploma Programme total 0–45 (6 subjects ×7 + up to 3 core points); 24 with conditions = pass. Per-subject 1–7 is 'ib'. Source: IBO.",
  },
  {
    id: "ects",
    country: null,
    flag: "🌐",
    label: "ECTS (A–F)",
    kind: "letter",
    bands: [
      { label: "A", neutral: 95 },
      { label: "B", neutral: 85 },
      { label: "C", neutral: 75 },
      { label: "D", neutral: 65 },
      { label: "E", neutral: 55 },
      { label: "FX", neutral: 25 },
      { label: "F", neutral: 10 },
    ],
    passMark: "E",
    notes:
      "European Credit Transfer and Accumulation System; A=outstanding (top 10%), B=very good (next 25%), C=good (next 30%), D=satisfactory (next 25%), E=sufficient/min pass (bottom 10% of passers), FX/F=fail. Neutral midpoints use the pre-2009 fixed % convention (A≥90, B 80-89, C 70-79, D 60-69, E 50-59, FX 40-49, F<40); post-2009 system is relative per institution. Source: Wikipedia ECTS grading scale; European Commission ECTS Users' Guide.",
  },
  {
    id: "ib",
    country: null,
    flag: "🌐",
    label: "IB Diploma (1–7)",
    kind: "numeric",
    scaleMin: 1,
    scaleMax: 7,
    bestIsHigh: true,
    decimals: 0,
    unit: "",
    passMark: 4,
    notes:
      "IB DP subject scale; grade 4 = 'satisfactory' = conventional per-subject pass mark; diploma requires ≥24/45 total with no grade <2. Source: ibo.org DP passing criteria.",
  },
  {
    id: "letter",
    country: null,
    flag: "🌐",
    label: "Letter Grade (A–F)",
    kind: "letter",
    bands: [
      { label: "A+", neutral: 98.5 },
      { label: "A", neutral: 95 },
      { label: "A-", neutral: 91 },
      { label: "B+", neutral: 88 },
      { label: "B", neutral: 85 },
      { label: "B-", neutral: 81 },
      { label: "C+", neutral: 78 },
      { label: "C", neutral: 75 },
      { label: "C-", neutral: 71 },
      { label: "D+", neutral: 68 },
      { label: "D", neutral: 65 },
      { label: "D-", neutral: 61 },
      { label: "F", neutral: 29.5 },
    ],
    passMark: "D",
    notes:
      "Standard US letter grade scale (global alias 'letter'); bands derived from Wikipedia 'Academic grading in the United States' percentage ranges (A+:97-100, A:93-96, A-:90-92, B+:87-89, B:83-86, B-:80-82, C+:77-79, C:73-76, C-:70-72, D+:67-69, D:63-66, D-:60-62, F:<60). Pass mark = D (60 %). Not universal — individual institutions vary.",
  },
  {
    id: "percent",
    country: null,
    flag: "🌐",
    label: "Percentage (0–100 %)",
    kind: "numeric",
    scaleMin: 0,
    scaleMax: 100,
    bestIsHigh: true,
    decimals: 1,
    unit: "%",
    passMark: 50,
    notes:
      "Universal percentage scale; 50 % used as conventional pass mark (varies by institution). No single authoritative source — widely understood convention.",
  },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/** Returns the GradingSystem with the given id, or undefined if not found. */
export function getGradingSystem(id: string): GradingSystem | undefined {
  return GRADING_SYSTEMS.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a grade in the given system to the 0–100 neutral scale.
 *
 * - numeric: linear interpolation respecting bestIsHigh direction, clamped 0–100.
 * - letter: case-insensitive label match → band.neutral (nearest band if no exact match).
 */
export function toNeutral(value: number | string, sys: GradingSystem): number {
  if (sys.kind === "numeric") {
    const v = typeof value === "string" ? parseFloat(value) : value;
    const min = sys.scaleMin ?? 0;
    const max = sys.scaleMax ?? 100;
    const range = max - min;
    if (range === 0) return 0;
    const raw = sys.bestIsHigh
      ? ((v - min) / range) * 100
      : ((max - v) / range) * 100;
    return Math.max(0, Math.min(100, raw));
  }

  // letter
  const bands = sys.bands ?? [];
  if (bands.length === 0) return 0;
  const label = String(value).trim().toLowerCase();
  const exact = bands.find((b) => b.label.toLowerCase() === label);
  if (exact) return exact.neutral;
  // partial match: band label starts-with the search string (handles "A" matching "A (Very Good)")
  const partial = bands.find((b) => b.label.toLowerCase().startsWith(label));
  if (partial) return partial.neutral;
  // fallback: nearest by index (unknown label → midpoint of last band)
  return bands[bands.length - 1].neutral;
}

/**
 * Convert a 0–100 neutral score back to a display value in the given system.
 * Returns both the raw value and a formatted display string.
 */
export function fromNeutral(
  neutral: number,
  sys: GradingSystem
): { value: number | string; display: string } {
  const n = Math.max(0, Math.min(100, neutral));

  if (sys.kind === "numeric") {
    const min = sys.scaleMin ?? 0;
    const max = sys.scaleMax ?? 100;
    const range = max - min;
    const raw = sys.bestIsHigh
      ? min + (n / 100) * range
      : max - (n / 100) * range;
    const decimals = sys.decimals ?? 1;
    const rounded = parseFloat(raw.toFixed(decimals));
    const unit = sys.unit ?? "";
    return { value: rounded, display: `${rounded.toFixed(decimals)}${unit}` };
  }

  // letter: nearest band by neutral distance
  const bands = sys.bands ?? [];
  if (bands.length === 0) return { value: "", display: "" };
  let nearest = bands[0];
  let minDist = Math.abs(bands[0].neutral - n);
  for (const band of bands) {
    const dist = Math.abs(band.neutral - n);
    if (dist < minDist) {
      minDist = dist;
      nearest = band;
    }
  }
  return { value: nearest.label, display: nearest.label };
}

/**
 * Format a 0–100 neutral score as a display string in the given system.
 * Convenience wrapper around fromNeutral.
 */
export function formatGrade(neutral: number, sys: GradingSystem): string {
  return fromNeutral(neutral, sys).display;
}

/**
 * Compute the arithmetic mean of an array of neutral scores, then return both
 * the averaged neutral and the formatted display string in the given system.
 * Returns null for an empty array.
 */
export function averageGrades(
  neutrals: number[],
  sys: GradingSystem
): { neutral: number; display: string } | null {
  if (neutrals.length === 0) return null;
  const mean = neutrals.reduce((sum, v) => sum + v, 0) / neutrals.length;
  return { neutral: mean, display: formatGrade(mean, sys) };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The default grading system id used when the user has not chosen one. */
export const DEFAULT_GRADING_SYSTEM_ID = "percent";

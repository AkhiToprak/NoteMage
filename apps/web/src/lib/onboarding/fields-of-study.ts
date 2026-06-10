// Curated field-of-study taxonomy powering the onboarding "What are you
// studying?" type-ahead. These are specific fields/majors/subjects (not the
// coarse pedagogy buckets in `lib/path-subjects.ts`), chosen to cover the three
// onboarding audiences: university, school, and work. The list is intentionally
// finite — the input still accepts free text for anything not listed, so this
// only needs to catch the common cases and make selection fast.

/** Shown when the input is empty/focused so there's always something to pick. */
export const POPULAR_FIELDS: readonly string[] = [
  'Computer Science',
  'Medicine',
  'Business Administration',
  'Psychology',
  'Law',
  'Biology',
  'Mechanical Engineering',
  'Economics',
];

/** Full suggestion set, sorted A–Z for stable scanning. */
export const FIELDS_OF_STUDY: readonly string[] = [
  'Accounting',
  'Aerospace Engineering',
  'Anthropology',
  'Architecture',
  'Art History',
  'Artificial Intelligence',
  'Astronomy',
  'Biochemistry',
  'Bioengineering',
  'Biology',
  'Biomedical Science',
  'Business Administration',
  'Chemical Engineering',
  'Chemistry',
  'Civil Engineering',
  'Classics',
  'Communications',
  'Computer Engineering',
  'Computer Science',
  'Criminology',
  'Cybersecurity',
  'Data Science',
  'Dentistry',
  'Design',
  'Earth Science',
  'Economics',
  'Education',
  'Electrical Engineering',
  'English Literature',
  'Environmental Science',
  'Film & Media',
  'Finance',
  'Fine Arts',
  'French',
  'Geography',
  'Geology',
  'German',
  'Graphic Design',
  'History',
  'Human Resources',
  'Industrial Design',
  'Information Technology',
  'International Relations',
  'Japanese',
  'Journalism',
  'Kinesiology',
  'Law',
  'Linguistics',
  'Management',
  'Marketing',
  'Materials Science',
  'Mathematics',
  'Mechanical Engineering',
  'Medicine',
  'Microbiology',
  'Music',
  'Nursing',
  'Nutrition',
  'Pharmacy',
  'Philosophy',
  'Physical Therapy',
  'Physics',
  'Political Science',
  'Psychology',
  'Public Health',
  'Religious Studies',
  'Social Work',
  'Sociology',
  'Software Engineering',
  'Spanish',
  'Statistics',
  'Theatre',
  'Urban Planning',
  'Veterinary Medicine',
];

/**
 * Rank suggestions for a query: prefix matches first, then substring matches,
 * each group keeping the source A–Z order. Empty query returns the popular set.
 */
export function matchFields(query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return POPULAR_FIELDS.slice(0, limit);
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const field of FIELDS_OF_STUDY) {
    const lower = field.toLowerCase();
    if (lower === q) continue; // already typed exactly — no point suggesting it
    if (lower.startsWith(q)) prefix.push(field);
    else if (lower.includes(q)) contains.push(field);
  }
  return [...prefix, ...contains].slice(0, limit);
}

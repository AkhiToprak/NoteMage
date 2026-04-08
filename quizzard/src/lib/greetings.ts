/**
 * Dashboard greeting templates.
 * Each string may contain {name} which gets replaced with the user's display name.
 */
export const GREETINGS: string[] = [
  '{name} returns...',
  'A wild {name} has appeared!',
  'Look who decided to study \u2014 {name}!',
  'The legend of {name} continues...',
  'Alert: {name} spotted in the library!',
  '{name} enters the arena.',
  'Plot twist: {name} is studying!',
  'Breaking news: {name} is here!',
  '{name} has joined the chat.',
  '*{name} has entered the building*',
  'Welcome back, {name}. We missed you.',
  'Ah, {name}. We\u2019ve been expecting you.',
  '{name} is in the zone.',
  'Another day, another brain cell. Right, {name}?',
  'Loading {name}\u2019s genius\u2026 done.',
  'Achievement unlocked: {name} opened the app!',
  '{name} rolled a natural 20.',
  'The one and only {name}.',
  'It\u2019s dangerous to go alone, {name}.',
  '*{name} activates study mode*',
  'Main character energy: {name}.',
  'Ready to grind, {name}?',
  'Brains and beauty \u2014 classic {name}.',
  'Rumor has it {name} is about to crush it.',
  '{name} just buffed their intelligence stat.',
  'Oh snap, {name}\u2019s back!',
  'Level up incoming for {name}.',
  'Did someone say {name}? Because we did.',
  'The world is {name}\u2019s classroom.',
  'Here we go again, {name}.',
  'Respect the grind, {name}.',
  '{name}, the scholar, has arrived.',
  'Knowledge awaits, {name}.',
  '*slow clap* {name} showed up.',
  'Today\u2019s MVP: {name}.',
  '{name} is cooking.',
  'No cap, {name} is locked in.',
  '{name} woke up and chose knowledge.',
  'Hold my flashcards \u2014 {name} is here.',
  '{name} is about to make neurons fire.',
  'Someone call the dean \u2014 {name} is on a roll.',
  'Top of the morning, {name}.',
  '{name} reporting for duty.',
];

/** Pick a random greeting and interpolate the user's name. */
export function getRandomGreeting(name: string): string {
  const template = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  return template.replace(/\{name\}/g, name);
}

/** Interpolate {name} in a custom greeting template. */
export function interpolateGreeting(template: string, name: string): string {
  return template.replace(/\{name\}/g, name);
}

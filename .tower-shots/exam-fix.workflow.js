export const meta = {
  name: 'exam-fix',
  description: 'Fix broken elements on Mock Setup (web), Mock Taking (mobile), Mock Results (web), Notification Settings (mobile+web)',
  phases: [ { title: 'Fix', detail: 'rebuild each broken frame in place, keep node id' } ],
}
const FILE = 'DDFpUOARLO01i5J2dMxsUT'
const KIT = '/Users/toprakdemirel/Entwicklung/Quizzard/.tower-shots/exam-kit.js'

const RULES = `Fix ONE existing Figma frame (a mockup, NOT app code) in file ${FILE} via the Figma MCP tool \`use_figma\`. Load tools in ONE ToolSearch call: mcp__b56af2ea-1ede-4011-8632-dd7932c974d1__use_figma and mcp__b56af2ea-1ede-4011-8632-dd7932c974d1__get_screenshot. Then Read the kit: ${KIT}

use_figma FORMAT: code = ENTIRE kit file contents, then \`await loadFonts();\`, then your build — ALL TOP-LEVEL (NO IIFE; its writes are discarded). Use ONLY kit helpers + figma API; colors only C.*; icons only the kit set; NO gradients. Kit gives: solid,rgba,C,icon,tx,box,col,row,rowSB,fixW,stretch,grow,add,place,shadowSoft,shadowGlow,shadow2,tile,iconTile,dotChip,pill,bar,ring,divider,primaryBtn,softBtn,ghostBtn,mascot,logo,statusBar,homeIndicator,backBtn,sectionLabel,statCol,card,vspace,hspace,vgrow,hgrow,sideNav,webHeader,toggle,chip,severityPill,medallion,root.

IDEMPOTENT REBUILD (keep the SAME node id):
  let r=figma.currentPage.findOne(n=>n.type==='FRAME'&&n.name==='<NAME>');
  if(r){Array.from(r.children).forEach(c=>c.remove()); r.layoutMode='NONE'; r.fills=[solid(C.cream)]; r.clipsContent=true;} else { r=root('<NAME>',<W>,1000); r.x=<X>; r.y=<Y>; }

CRITICAL HEIGHT RULE (this is the bug to avoid): build the content column, append ALL children FIRST, THEN read its height and size the root. Cards must use card(w,{...}) (it hugs content). Never set a final root/card height before its children exist.
- MOBILE (W=393): statusBar(393) at y0; content col at x24,y58 width 345 via fixW(cc,345); after adding children: const H=Math.round(58+cc.height+ (hasTabBar?110: 40)); r.resize(393,H); place pinned footer/nav using H; homeIndicator(r,393,H-11).
- WEB (W=1440): content col at x296,y48 width 1096 via fixW(cc,1096); after adding children: const H=Math.max(48+cc.height+56, 860); r.resize(1440,H); place(r,sideNav(H,1),0,0). Add a back row "← Modul 294 dashboard" + webHeader at top of content.

SELF-VERIFY (required): get_screenshot nodeId '<ID>' enableBase64Response:true (maxDimension 760 mobile / 1280 web). LOOK. If ANY card is collapsed/clipped/sliver-thin, you violated the height rule — fix and re-run (idempotent keeps id), re-screenshot. Iterate up to 3x until every section is fully visible and polished. Report 1-2 sentences with the node id + status.

DESIGN BAR: warm cream bg, white rounded cards, soft shadows, violet primary, gold for readiness/success, amber for needs-practice, coral only for urgent, Inter, generous spacing. NO gradients. Friendly NoteMage feel.`

const FIXES = [
{ name:'X2 Notification Settings (Mobile)', id:'248:799', W:393, x:3360, y:31000, spec:`Notification Settings (mobile). App bar: backBtn + "Reminders" + Ask-Mage tile. Intro "Gentle nudges for Modul 294."
SETTINGS card: 5 rows, each rowSB( col(title 14.5 Semi Bold + desc 12 body wrap ~230) | toggle(on/off) ), hairline dividers: Daily plan reminder(on), Countdown reminder(on), Weakness reminder(on), Mock exam reminder(OFF), Final day reminder(on).
PREFERENCES card: rowSB("Preferred time" | tx "18:00" + chevronDown) ; rowSB("Quiet hours" | tx "22:00 – 07:00" + chevronDown).
PREVIEW card: title "Preview" + 3 mock push notifications. EACH preview row = a row(white/cream, border, radius12, pad10, gap10, align center): an APP-ICON tile (a 36px violet rounded tile (fill C.violet, radius 10) containing mascot(26,'wand') — i.e. the NoteMage mage; **do NOT use a '+' / plus icon**) + col(grow)( rowSB(tx "NoteMage" 12.5 Semi Bold | tx "now" 11 faint) + tx body 12.5 ink2 wrap ). Bodies: "Your Modul 294 plan is ready: 25 minutes today.", "Exam in 3 days. Focus on your 2 weakest areas.", "Take a quick mock today to update readiness." Calm, no streak/spam. THE FIX: the preview app icons currently show a broken "+"; make them the NoteMage mage tile.` },

{ name:'X2 Notification Settings (Web)', id:'252:2', W:1440, x:11900, y:42000, spec:`Notification Settings (web). THE FIX: the cards are currently COLLAPSED/clipped — rebuild so every card hugs its content and the root height fits everything (follow the CRITICAL HEIGHT RULE). sideNav(H,1) + back row + webHeader(1096,"Reminders","Gentle nudges for Modul 294.",null).
Two-column row(gap28, align top): LEFT (640) a SETTINGS card titled "What to remind me about" with 5 toggle rows (Daily plan/Countdown/Weakness/Mock exam[off]/Final day, each title+desc+toggle, dividers) + a PREFERENCES card (Preferred time 18:00 / Quiet hours 22:00–07:00 rows). RIGHT (400) a PREVIEW card "How a nudge looks on your phone" with 3 mock push notifications (each: 40px violet rounded tile w/ mascot(28,'wand') as app icon — NOT a plus — + NoteMage + "now" + body). Make sure ALL rows render (not collapsed).` },

{ name:'X2 Mock Exam Results (Web)', id:'256:3504', W:1440, x:8500, y:42000, spec:`Mock Exam Results (web). THE FIX: the main report card is currently COLLAPSED to a thin sliver — rebuild so the body fully expands (CRITICAL HEIGHT RULE: append all children before measuring; cards hug). sideNav(H,1) + back row + webHeader(1096,"Mock results","Solid run! Readiness 61% → 68%. A few topics left to lock in.", null) + a small right-aligned context (pill "Mock exam" + "Today, 14:20").
A HERO stat band card: rowSB( "Solid run!" + readiness sentence | a gold "↑ 61% → 68%" pill ) then a stat row statCol("32/40","Score") | divider | statCol("80%","Correct") | divider | statCol("68 min","Time").
Two-column row(gap24, align top): LEFT (660) "Topic breakdown" card (4 rows: topic + bar(380,val,color) + delta pill: CSS layout +12% green, DOM events −2% amber, SQL joins +6% green, Arrays +8% green) + "By question type" card (Multiple choice 90% green, Code 70% amber, Written 60% amber, bars + %). RIGHT (400) "Strongest" card (green chips CSS layout, Arrays) + "Weakest" card (amber chips DOM events, Joins) + "Recommended next" card (violetSoft2, 2 rows: "Drill DOM events · 10 min", "Redo 5 mistakes · 8 min") + a "5 mistakes · grouped by topic" row with Review link.
Footer/CTAs: primaryBtn "Fix weakest areas" + ghostBtn "Review mistakes". Everything must be fully visible.` },

{ name:'X2 Mock Exam Setup (Web)', id:'249:338', W:1440, x:5100, y:42000, spec:`Mock Exam Setup (web). It mostly works; THE FIX: the exam-TYPE cards show stray dash/line glyphs at their top corners — remove those. Each type card's only selection indicator is ONE radio circle pinned at the card's TOP-RIGHT (a 22px circle: hollow grey border if unselected; violet filled with a white inner dot if selected). No stray lines/dashes anywhere on the card.
sideNav(H,1) + back row + webHeader(1096,"Mock exam","Simulate the real thing — timed, scored, no peeking.", null). "CHOOSE EXAM TYPE" label. A 2x2 grid (gap24, card width 536) of type cards: each card = col(pad22, gap8) with a top rowSB( title 18 Bold (+ a gold "Final"/"Exam day" pill for the final one) | the single radio circle ) + a description line + a meta row (clock "<time>" · list "<n> questions"). Cards: Quick check (SELECTED: violet border + violetSoft2 + glow + filled radio) "A short timed set to find soft spots fast." ~15 min · 12 Q ; Full mock "Every topic, full length." ~90 min · 40 Q ; Weakness drill "Mage targets your shakiest topics." ~20 min · 12 Q ; Final mock (SPECIAL gold border + goldSoft tint + "Exam day" gold pill, medal icon) "Exam-day conditions with a readiness verdict." ~120 min · 50 Q.
"FINE-TUNE" label + an OPTIONS card: rows Time limit(toggle on) / Topics(chevron) / Question types(chips Multiple choice+Open answer selected, Match pairs, Cloze) / Difficulty(Gentle, Exam level[sel], Stretch) / Hints(toggle off). Footer: a small stats summary (15 min · 12 questions · Exam level) + primaryBtn "Start mock exam".` },

{ name:'X2 Mock Exam Taking (Mobile)', id:'248:210', W:393, x:1920, y:31000, spec:`Mock Exam Taking (mobile, focused takeover — NO tab bar, NO Ask-Mage tile). THE FIX: answer options are currently TOO TALL/stretched, and the question navigator has a stray floating flag dot + the legend is missing "Flagged".
Top bar row: left "Modul 294 · Mock" 13 Semi Bold ; CENTER timer pill("24:18", violetSoft, violetDeep, {icon:'clock', size:15}) ; right a ghost "Exit". Then a thin progress bar (~18%) + "Question 7 of 40" / "18% complete".
QUESTION card (white, pad18): "MULTIPLE CHOICE" 11 sub uppercase + question "Which method removes the last element of an array and returns it?" 17 Semi Bold + "Select one answer." 12.5 body.
ANSWER options (4): a col(gap10) of COMPACT option rows — each = row(white, border C.border, radius12, px14, py14, align center, gap12): a 22px radio circle + tx option 15 ink2. The row must HUG height (~52px) — do NOT add vgrow/spacers, do NOT stretch options tall. ".pop()" SELECTED (violet 1.6 border + violet-filled radio with white inner dot); others hollow. Options: .pop()(sel), .push(), .shift(), .slice().
QUESTION NAVIGATOR card: a clean grid (rows of 6) of numbered cells 1–12, each a 36px rounded square: answered=violet fill/white number, current(7)=white with violet ring + violet number, flagged=amber-tinted fill with a small amber dot in the corner OF THE CELL (NOT floating above the grid), unanswered=white/border. Legend row with FOUR items: Answered, Current, Flagged, Unanswered.
Bottom: rowSB( ghostBtn "Flag question" (with a flag/amber accent) | primaryBtn "Submit exam" ) + faint "You can review flagged questions before submitting." Minimal, serious, no playful accents.` },
]

phase('Fix')
log('Fixing ' + FIXES.length + ' frames')
function prompt(s){
  return `${RULES}

=========================
FIX: ${s.name}  (node id ${s.id})
=========================
${s.spec}

Rebuild "${s.name}" idempotently (keep id ${s.id}), follow the CRITICAL HEIGHT RULE, then get_screenshot ${s.id} (enableBase64Response:true) and refine until every element is visible and polished. Report node id + status.`
}
const results = await parallel(FIXES.map(s => () => agent(prompt(s), { label: s.name.replace('X2 ',''), phase: 'Fix', model: 'sonnet' })))
return { fixed: FIXES.length, results }

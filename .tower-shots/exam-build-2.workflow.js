export const meta = {
  name: 'exam-mode-build-2',
  description: 'Draw remaining NoteMage Exam Mode screens into Figma (batches via args.batch: 1=core sub-pages, 2=post-exam, 3=empty states + variants)',
  phases: [ { title: 'Build', detail: 'fan out one agent per screen, each self-verifies by screenshot' } ],
}

const FILE = 'DDFpUOARLO01i5J2dMxsUT'
const KIT = '/Users/toprakdemirel/Entwicklung/Quizzard/.tower-shots/exam-kit.js'
const BATCH = 3
const ONLY = (args && args.only) || null

const RULES = `You draw ONE Figma screen for NoteMage "Exam Mode" (iteration 2) into file ${FILE} using the Figma MCP tool \`use_figma\`. This is a Figma mockup — you are NOT writing app code.

FIRST: load MCP tools in ONE ToolSearch call:
  "select:mcp__b56af2ea-1ede-4011-8632-dd7932c974d1__use_figma,mcp__b56af2ea-1ede-4011-8632-dd7932c974d1__get_metadata,mcp__b56af2ea-1ede-4011-8632-dd7932c974d1__get_screenshot"
Then Read the shared kit file: ${KIT}

use_figma CALL FORMAT (critical):
- code = the ENTIRE kit file contents, then a newline + \`await loadFonts();\`, then your screen build. ALL TOP-LEVEL STATEMENTS. NEVER wrap in \`(async()=>{})()\` — its writes are discarded. Top-level await works.
- Use ONLY kit helpers + figma API. Kit provides: solid,rgba,C,icon,tx,box,col,row,rowSB,fixW,stretch,grow,add,place,shadowSoft,shadowGlow,shadow2,tile,iconTile,dotChip,pill,bar,ring,divider,primaryBtn,softBtn,ghostBtn,mascot,logo,statusBar,homeIndicator,backBtn,segProgress,mageBubble,bottomNav,sectionLabel,statCol,card,vspace,hspace,vgrow,hgrow,sideNav,webHeader,toggle,chip,severityPill,medallion,root.
- COLORS only C.*: cream,creamDeep,ink,ink2,inkBody,body,sub,faint,violet,violetDeep,violetSoft,violetSoft2,violetLine,gold,goldDeep,goldSoft,goldLine,green,greenSoft,amber,amberSoft,amberLine,coral,coralSoft,white,border,borderSoft,line,track. NO gradients.
- ICONS only: chevronLeft,chevronRight,chevronDown,plus,check,clock,calendar,target,flame,doc,notes,image,code,mic,bolt,chart,bell,list,shield,medal,play,sparkle,pencil,layers,flask,search,star,lock,alert,refresh,home,user,route,brain,grid,dot. icon(name,size,hexColor).
- mascot(size,kind) kinds: def,think,wink,wand,scroll,point,quiz,grad. logo(width). Real brand art — use it.

NEW HELPERS you will likely use: toggle(on) = iOS switch; chip(label,on,{px,py,size,icon}) = filter/select chip (on=violet); severityPill('urgent'|'practice'|'almost' | 'high'|'medium'|'low') = soft severity badge (coral only for urgent/high); medallion(size,'medal'|'star'|'shield') = glowing gold disc for celebration.

LAYOUT MECHANICS:
- Idempotent root so re-runs keep the same node id:
    let r=figma.currentPage.findOne(n=>n.type==='FRAME'&&n.name==='<FRAME_NAME>');
    if(r){const k=Array.from(r.children);k.forEach(c=>c.remove());r.layoutMode='NONE';r.fills=[solid(C.cream)];r.clipsContent=true;}
    else{ r=root('<FRAME_NAME>', <W>, 1000); r.x=<X>; r.y=<Y>; }
- root is NONE layout: position top-level blocks with place(r,node,x,y). Inner blocks use col/row auto-layout (append children, no x/y).
- Build children BEFORE final sizing. Read cc.height to size the root after.
- Use rowSB() for left/right split rows inside cards/sections. stretch(child) to fill width. Compute pixel widths from container minus padding.

MOBILE shell (W=393): statusBar(393) at top (y0). Content col at x24,y58, width 345 (CW=345; card inner ~313). These exam sub-pages are DRILL-INS from the dashboard: start with an app-bar row = backBtn() + a centered/left title + (optional) a right tile(40,white,'sparkle',violet) Ask-Mage. NO bottom tab bar on sub-pages (it's focused). Size root to content + ~30 bottom pad; homeIndicator(r,393,rootH-11).
WEB shell (W=1440): main content col at x296,y48 width 1096 (CW=1096). After measuring, H=Math.max(48+cc.height+56,860); r.resize(1440,H); place(r,sideNav(H,1),0,0) (Exams active). Top of content: a back/breadcrumb row "← Modul 294 dashboard" (14 Semi Bold violetDeep) then webHeader(1096,title,subtitle,ctaNode). 2-up cards width 536; 3-up ~352.

SELF-VERIFY (required):
1) End your build with: const _rb=figma.currentPage.findOne(n=>n.name&&n.name.indexOf('<RBK_NAME>')===0); if(_rb)_rb.name='<RBK_NAME>::'+r.id;
2) get_metadata nodeId '<RBK_ID>' ONCE; parse the frame id after '::' (if it still says just '<RBK_NAME>' your build threw & rolled back — wrap in try/catch, stamp the error into the RBK name, read it, fix).
3) get_screenshot that frame id with enableBase64Response:true (maxDimension 760 mobile / 1280 web). LOOK at it.
4) Fix anything broken/empty/overflowing/misaligned by editing your build code and re-running use_figma (idempotent root keeps the id); re-screenshot (always live). Iterate up to 3x to a polished, on-brand result.

DESIGN BAR: calm, student-focused, premium; warm cream bg, white rounded cards (~18-20 radius) soft shadows, violet primary, GOLD only for readiness/progress/success/exam-day, amber for needs-practice, coral ONLY for urgent. Generous spacing, terse copy, Inter. NO gradients, no cluttered analytics-wall feeling. The student must always grasp: how ready am I, what's weak, what to do next, what changed.

Return 1-2 sentences: frame name, node id, render status.`

const MS = '\n[MOBILE drill-in: back app-bar, no tab bar.]'
const WS = '\n[WEB: sideNav Exams active + "← Modul 294 dashboard" back link + webHeader.]'

// id helper: RBKn -> 246:(n+2)
function rb(n){ return { rbk:'RBK'+n, rbkId:'246:'+(n+2) } }

const SCREENS = [
// ===================== BATCH 1: core command-center sub-pages =====================
{ batch:1, name:'X2 Today\'s Study Plan (Mobile)', W:393, x:0, y:31000, ...rb(0), spec:`Today's Study Plan.${MS}
App bar: back + title "Today's plan" + Ask-Mage tile. Hero card: rowSB(col(tx "Modul 294 Exam" 16 Bold, dotChip "Application Development" violet 12) | pill "8 days left" violetSoft violetDeep calendar) ; a row: tx "Today · ~38 min" (13 ink2) + small bar(150,0.25,C.violet) + tx "1 of 4 done" (12 body).
ORDERED TASK TIMELINE (vertical, left marker column width ~28 with a connecting vertical line + a status node per row, content card to the right). 4 tasks; status node: DONE=green disc+white check, IN PROGRESS=violet ring (ring(26,0.5,violet)), NOT STARTED=hollow grey circle. Each task card: tx title 14.5 Semi Bold ; a row of small chips: time pill (clock + "8 min" violetSoft), reason chip (e.g. "accuracy low" amberSoft amber), linked path chip (route + "JavaScript Core" creamDeep).
 1 Review DOM events · 8 min · reason "accuracy low" · JavaScript Core · DONE
 2 Coding drill: array methods · 15 min · reason "exam-critical" (violet) · JavaScript Core · IN PROGRESS
 3 Redo 4 mistakes · 10 min · reason "missed twice" (amber) · Databases · NOT STARTED
 4 Mini quiz · 5 min · reason "updates readiness" (violet) · Mixed · NOT STARTED
Primary CTA "Resume today's plan" (full width). Secondary actions: a wrap-free row (two rows if needed) of ghost chips: "Adjust time" (clock), "Regenerate" (refresh), "Mark all done" (check), "Why this plan?" (sparkle/Ask Mage). Calm checklist, not gamified.` },

{ batch:1, name:'X2 Weaknesses (Mobile)', W:393, x:480, y:31000, ...rb(1), spec:`Weaknesses page.${MS}
App bar: back + "Weak areas". Intro tx "These topics are holding back your readiness." (14 body).
Grouped by severity with small section headers: "URGENT" (then card), "NEEDS PRACTICE", "ALMOST FIXED".
Weakness card (white, pad14): top rowSB(tx topic 15 Bold | severityPill(level)) ; mastery row: bar(IW,acc,colorByLevel) + tx "<acc>% mastery" 12 body ; tx why (e.g. "Missed 6 of last 10") 12.5 ink2 ; a row: source chip (doc + "Slides · p.12" creamDeep) + readiness-impact chip (e.g. "−6% readiness" coralSoft/amber) + tx "last practiced 2d ago" 11.5 faint ; actions row: primaryBtn small "Practice" (110,h40) + ghost chips "Review theory","Ask Mage","Drill","+ Today".
 URGENT: "JavaScript events" 42% (coral bar) why "Missed 6 of last 10" source "Slides · p.12" impact "−6% readiness" last "2d ago".
 NEEDS PRACTICE: "SQL joins" 61% (amber), "Normalisation" 58% (amber).
 ALMOST FIXED: "CSS layout" 84% (green) impact "+2% if maintained".
Severity visible but not aggressive; coral only for the urgent one.` },

{ batch:1, name:'X2 Exam Paths (Mobile)', W:393, x:960, y:31000, ...rb(2), spec:`Exam Paths page.${MS}
App bar: back + "Exam paths". Readiness summary row: tx "Modul 294 · 64% ready" + dotChip "3 paths" violet.
Filter chips row (horizontal): chip("All",true), chip("In progress",false), chip("Weak",false), chip("Completed",false), chip("Exam-critical",false).
PATH CARDS (white, pad16): rowSB(col(tx name 16 Bold + tx "Current: <node>" 12.5 body) | (exam-critical? pill "Exam-critical" goldSoft goldDeep star)) ; bar(IW,mastery,violet) + rowSB(tx "<m>% mastery" 12 body | tx "<done>/<total> missions" 12 body) ; a row: chip-like meta "<n> weak nodes" (amber dot) ; softBtn("Continue path", full or 150).
 "JavaScript Core" 58% current "DOM events" 6/12 missions, 2 weak, exam-critical.
 "Databases" 41% current "Joins" 4/10, 3 weak.
 "Web APIs" 30% current "REST basics" 2/8, 1 weak.
Reuse the path-card feel; add exam context.` },

{ batch:1, name:'X2 Mock Exam Setup (Mobile)', W:393, x:1440, y:31000, ...rb(3), spec:`Mock Exam Setup.${MS}
App bar: back + "Mock exam". Intro tx "Simulate the real thing — pick a mock."
TYPE CARDS (vertical, selectable). Each: rowSB(row(iconTile + col(title 15 Bold + purpose 12 body)) | radio dot) + meta row (clock + "<time>" , list + "<n> questions").
 Quick mock (SELECTED, violet border+violetSoft2+glow) — bolt icon — "Short readiness check" — ~10 min · 8 questions.
 Full mock — clock icon — "Realistic timed exam" — ~90 min · 40 questions.
 Weakness mock — target icon — "Only your weak areas" — ~20 min · 12 questions.
 Final mock — medal icon, make it SPECIAL (gold border C.goldLine + goldSoft tint + a small "Final" gold pill) — "Serious final simulation" — ~120 min · 50 questions.
OPTIONS card (white): rows with rowSB label|control: "Time limit" toggle(on); "Topics" tx "All topics" + chevronDown; "Question types" small chips MC/Code/Written (selected); "Difficulty" chips Easy/Medium(sel)/Hard; "Hints" toggle(off).
CTA primaryBtn "Start mock exam" (full). Serious but on-brand.` },

{ batch:1, name:'X2 Mock Exam Taking (Mobile)', W:393, x:1920, y:31000, ...rb(4), spec:`Mock Exam — Taking screen (focused TAKEOVER, minimal).${MS} Override: NO Ask-Mage tile.
Top bar (NONE row, white-ish): left tx "Modul 294 · Mock" 13 Semi Bold ; CENTER a prominent timer pill: pill("24:18", C.violetSoft, C.violetDeep, {icon:'clock', size:15}) — make it clear/serious ; right an "Exit" ghost or X. Below: a thin progress bar + tx "Question 7 of 40" (12.5 body).
QUESTION CARD (white, pad18): subtle type label tx "MULTIPLE CHOICE" (11 sub uppercase) ; question tx "Which method removes the last element of an array and returns it?" (17 Semi Bold ink, wrap) ; instruction tx "Select one answer." 12.5 body.
ANSWER options (4): each a row (white, border, radius12, px14, py13): a radio circle (hollow) + tx option. Options: ".pop()" (SELECTED = violet border + filled radio), ".push()", ".shift()", ".slice()". NO correct-answer reveal, NO hints, NO source.
QUESTION NAVIGATOR: a small grid/row of numbered cells (1..12 visible) — answered=violet filled, current=violet ring, flagged=amber dot, unanswered=white/border.
Bottom: rowSB(ghostBtn "⚑ Flag question" | primaryBtn "Submit exam"); under it tx "You can review flagged questions before submitting." 11.5 faint. No playful accents, minimal.` },

{ batch:1, name:'X2 Mock Exam Results (Mobile)', W:393, x:2400, y:31000, ...rb(5), spec:`Mock Exam Results (report-style, friendly).${MS}
App bar: back + "Mock results". HERO card: tx "Solid run!" 20 ExtraBold + tx "Readiness increased from 61% to 68%." 13.5 ink2 ; a stat row: statCol("32/40","Score") | divider | statCol("80%","Correct") | divider | statCol("68 min","Time") ; a readiness-change chip: pill "61% → 68%" goldSoft goldDeep with a small up arrow (use 'chart' or 'star') — gold = improvement.
TOPIC BREAKDOWN card: title "Topic breakdown" + 3-4 rows: tx topic + bar(160,mastery,color) + a small delta pill (e.g. "+9%" green / "−2%" amber). (CSS layout +12% green; DOM events −2% amber; SQL joins +6% green; Arrays +8% green.)
QUESTION-TYPE BREAKDOWN card: rows MC 90%, Code 70%, Written 60% with bars.
MISTAKES card: rowSB(tx "5 mistakes · grouped by topic" | tx "Review" violet).
STRONGEST / WEAKEST: two small cards or a row — Strongest: green chips "CSS layout","Arrays"; Weakest: amber chips "DOM events","Joins".
RECOMMENDED RECOVERY card (violetSoft2): "Recommended next" + 2 rows (icon + "Drill DOM events · 10 min", "Redo 5 mistakes · 8 min").
CTAs: primaryBtn "Fix weakest areas" + ghostBtn "Review mistakes". Friendly, explain what changed. Avoid overwhelming charts.` },

{ batch:1, name:'X2 Study Calendar (Mobile)', W:393, x:2880, y:31000, ...rb(6), spec:`Study Calendar (vertical timeline to exam day).${MS}
App bar: back + "Study plan" + a right ghost "Adjust" (or chevron). Header: tx "8 days to exam" 18 ExtraBold + tx "Modul 294 · 12 Sep" 13 body + a calm progress bar (days done).
VERTICAL TIMELINE: a left marker column (line + node per day) + a day card per row. Day card: rowSB(col(tx weekday+date e.g. "Today · Wed 4 Sep" 14 Semi Bold + tx plan summary "Review DOM events · Coding drill · 38 min" 12 body) | status).
 - TODAY (emphasized: violet ring node + violetSoft2 card + "Today" violet pill) — "Review DOM events · Coding drill".
 - Thu 5 — "Databases path · 30 min" upcoming.
 - Fri 6 — REVIEW DAY (refresh icon) "Spaced review".
 - Sat 7 — MOCK DAY (target/medal icon, gold accent) "Weakness mock".
 - ... a couple more upcoming (faded).
 - Tue 11 — FINAL REVISION (gold) "Final revision".
 - Wed 12 — EXAM DAY (gold medal node + gold card + "Exam day" gold pill) feels important.
Done days = green check node. Bottom: ghostBtn "Reschedule" + ghostBtn "Adjust daily time". Calm urgency, not panic.` },

{ batch:1, name:'X2 Notification Settings (Mobile)', W:393, x:3360, y:31000, ...rb(7), spec:`Exam Notification Settings.${MS}
App bar: back + "Reminders". Intro tx "Gentle nudges for Modul 294." 12.5 body.
SETTINGS card(s): rows each rowSB(col(tx title 14.5 Semi Bold + tx desc 12 body, wrap ~230) | toggle(on/off)):
 Daily plan reminder (on) "A nudge with today's plan", Countdown reminder (on) "Days-left updates", Weakness reminder (on) "When a topic slips", Mock exam reminder (off) "Suggests a mock", Final day reminder (on) "The day before & day of".
PREFERENCES card: rowSB("Preferred time" | tx "18:00" + chevronDown) ; rowSB("Quiet hours" | tx "22:00 – 07:00" + chevronDown).
PREVIEW card: title "Preview" + 2-3 mock push notifications (each a row: a small app icon tile (logo/iconTile violet 'sparkle') + col(tx "NoteMage" 12 Semi Bold + tx body 12.5 ink2)): "Your Modul 294 plan is ready: 25 minutes today.", "Exam in 3 days. Focus on your 2 weakest areas.", "Take a quick mock today to update readiness." No streak/spam language. Calm.` },

// ===================== BATCH 2: post-exam flow =====================
{ batch:2, name:'X2 Post-Exam Archive (Mobile)', W:393, x:0, y:33800, ...rb(16), spec:`Post-Exam Archive (calm transition, no outcome assumed).${MS}
add statusBar. Centered-ish content. A calm mascot (think) in a violetSoft tile (~96) at top. Headline tx "Your exam is finished" 24 ExtraBold (center) + tx "Modul 294 · 12 Sep" 13.5 body (center).
RECAP card (white): title "Your prep" + a 2x2 grid of mini stats (statCol style): "68%" Final readiness, "24" Missions, "5/8" Weak areas closed, "3" Mock exams.
OPTIONS (button stack): primaryBtn "Enter result" (full) ; ghostBtn "View preparation recap" ; ghostBtn "Keep studying" ; ghostBtn "Archive exam" (muted). Calm, neutral (don't imply pass/fail).` },

{ batch:2, name:'X2 Exam Result Entry (Mobile)', W:393, x:480, y:33800, ...rb(17), spec:`Exam Result Entry (centered card, low pressure).${MS}
add statusBar + a back app bar. Centered CARD (CW): headline tx "How did it go?" 22 ExtraBold + tx "Enter your Modul 294 result." 13.5 body.
A LARGE grade input: a centered big number field — a row(white, border, radius16, big) showing tx "5.2" 40 ExtraBold violet + below tx "out of 6" 12 body ; (optionally − / + steppers as small tiles).
Passed/Failed segmented: a row of 3 chips: chip("Passed",true,{}), chip("Failed",false), chip("Pending",false).
Target comparison: a small pill row "Target: 4.5" goldSoft + "You beat it!" (green) if applicable.
"How hard was it?" label + 3 chips: "Easier than expected","As expected"(sel),"Harder than expected".
Optional comment field (input placeholder "Anything to note?").
primaryBtn "Submit result" (full). Friendly, low pressure.` },

{ batch:2, name:'X2 Good Result Celebration (Mobile)', W:393, x:960, y:33800, ...rb(18), spec:`Good Result Celebration (magical, earned — NOT childish).${MS} TAKEOVER (no app bar, cream bg).
add statusBar. Scatter ~6 'sparkle' icons (gold + violet) at varied positions near the top (absolute place on root).
CENTER: medallion(120,'medal') with a glow ; just above/over it a mascot(grad) (~110) — place mascot above medallion or beside.
Headline tx "You did it!" 28 ExtraBold (center) + tx "You beat your target — 5.2 / 6." 14 ink2 (center). A gold pill "Target smashed".
STATS card (white): a 2-col grid of stat rows: Target 4.5 | Actual 5.2 ; Final readiness 68% | Missions 24 ; Weak areas closed 5/8 | Mocks taken 3 ; Streak 12 days.
ACHIEVEMENT chip: a goldSoft card "🏅 Achievement unlocked · Exam Slayer" (use medal icon, no emoji).
CTAs: primaryBtn "View report" + ghostBtn "Prepare next exam". Gold+purple, soft confetti via sparkles, glowing medallion. Feels earned.` },

{ batch:2, name:'X2 Bad Result Reflection (Mobile)', W:393, x:1440, y:33800, ...rb(19), spec:`Bad Result Reflection (supportive, NOT shameful, no harsh red).${MS}
add statusBar + back app bar. A gentle mascot (default/think) small. Headline tx "Let's learn from this." 24 ExtraBold + tx "Modul 294 didn't go as planned — that's okay. Tell me what happened." 14 body (wrap).
Question tx "What went wrong?" 15 Semi Bold. A list of selectable reason rows (multi-select look — each a row: white card, border, radius12, px14, py13: a left checkbox square (hollow) + tx reason 14 ink2; one or two SELECTED show violet check). Reasons:
 "I didn't study enough", "NoteMage missed topics"(selected), "Exam questions were different", "Knew the theory but failed application", "I ran out of time", "Material was incomplete", "Study plan was unrealistic", "Readiness score was wrong", "Explanations were unclear", "Other".
primaryBtn "Continue" (full). Calm, supportive palette (violet/cream), no red.` },

{ batch:2, name:'X2 Exam Feedback Detail (Mobile)', W:393, x:1920, y:33800, ...rb(20), spec:`Exam Feedback Detail (conditional step form — show the "NoteMage missed topics" branch).${MS}
add statusBar + back app bar + segProgress(345-?,3,2) ("Step 2 of 3").
Context chip at top: pill "NoteMage missed topics" violetSoft. mageBubble("Which topics showed up that we didn't cover?", 345, 'think').
QUESTION 1 card: tx "Which topics appeared?" 15 Semi Bold + a tag input area: a few removable tag chips ("WebSockets ×","CORS ×") + an input row placeholder "Add a topic…" + a ghost "+ Add topic manually".
QUESTION 2 card: tx "Have material that covers these?" 14.5 Semi Bold + an upload dropzone (violetLine, "Upload notes or a photo" + plus icon).
Keep max 2-3 questions visible, supportive. Footer: ghostBtn "Back" + primaryBtn "Submit feedback". Note small text "Other reasons ask different questions." faint.` },

{ batch:2, name:'X2 Post-Exam Learning Report (Mobile)', W:393, x:2400, y:33800, ...rb(21), spec:`Post-Exam Learning Report (clean closure report).${MS}
add statusBar + back app bar + title "Exam report".
HEADER card: tx "Modul 294 Exam" 18 Bold + tx "Application Development · 12 Sep" 12.5 body + rowSB(a big result pill "Passed · 5.2" green | tx "Target 4.5" goldSoft pill).
PREDICTION card: tx "Predicted vs actual" 14 Semi Bold + a row: "Predicted 68% ready" → "Passed at 5.2" with a check (green) ; tx "Mage's readiness was on point." 12.5 body.
WHAT WORKED card (green-tinted header/icons): check rows: "Daily plan kept you consistent", "Mock exams matched the format", "Weak-point drills paid off".
WHAT DIDN'T card (amber-tinted): alert rows: "DOM events stayed weak", "Underestimated written answers".
FEEDBACK SUMMARY card: tx "You told us: \"NoteMage missed 2 topics\"" 12.5 ink2 + chips "WebSockets","CORS".
RECOMMENDATIONS card (violetSoft2): "For next time" + 2 rows: "Add 10 min/day for application practice", "Start mocks earlier".
Footer: primaryBtn "Prepare next exam" + ghostBtn "Archive exam". Serious but encouraging, not an analytics wall.` },

// ===================== BATCH 3: empty states + exam-context variants =====================
{ batch:3, name:'X2 Empty · No exams (Mobile)', W:393, x:0, y:36600, ...rb(28), empty:'wand', spec:`Empty state. headline "No exams yet" ; body "Create your first exam and NoteMage builds a study plan around your deadline." ; primaryBtn "Create exam" (icon plus).` },
{ batch:3, name:'X2 Empty · No weak areas (Mobile)', W:393, x:440, y:36600, ...rb(29), empty:'think', spec:`Empty state. headline "No weak areas yet" ; body "Complete a few missions or a mock so Mage can spot what needs practice." ; primaryBtn "Start a mission".` },
{ batch:3, name:'X2 Empty · No study plan (Mobile)', W:393, x:880, y:36600, ...rb(30), empty:'scroll', spec:`Empty state. headline "No plan for today" ; body "Generate today's plan and Mage picks what matters most." ; primaryBtn "Generate plan" (icon sparkle).` },
{ batch:3, name:'X2 Empty · No mock exams (Mobile)', W:393, x:1320, y:36600, ...rb(31), empty:'quiz', emptyIcon:'lock', spec:`Empty state (locked feel). headline "No mock exams yet" ; body "Mock exams unlock once enough topics are covered." ; show a small progress "62% of topics covered" bar ; ghostBtn "See what's needed".` },
{ batch:3, name:'X2 Empty · No linked paths (Mobile)', W:393, x:1760, y:36600, ...rb(32), empty:'point', spec:`Empty state. headline "No paths linked" ; body "Add material so Mage can build learning paths for this exam." ; primaryBtn "Upload material".` },
{ batch:3, name:'X2 Empty · No material (Mobile)', W:393, x:2200, y:36600, ...rb(33), empty:'def', spec:`Empty state. headline "No material yet" ; body "Upload notes, slides, or past exams to get started." ; primaryBtn "Upload material" (icon plus).` },
{ batch:3, name:'X2 Empty · No archived exams (Mobile)', W:393, x:2640, y:36600, ...rb(34), empty:'grad', spec:`Empty state. headline "No archived exams" ; body "Finished exams will appear here for reference." ; ghostBtn "Back to exams".` },
{ batch:3, name:'X2 Empty · No reminders (Mobile)', W:393, x:3080, y:36600, ...rb(35), empty:'def', emptyIcon:'bell', spec:`Empty state. headline "Reminders are off" ; body "Turn on reminders so you never miss a study session." ; primaryBtn "Enable reminders" (icon bell).` },

{ batch:3, name:'X2 Exam Path (Mobile)', W:393, x:0, y:39200, ...rb(36), spec:`Exam-context Study Path (a learning path that belongs to an exam).${MS}
EXAM BANNER at top (card, violetSoft2 or gold-accent): rowSB(col(tx "Modul 294 Exam" 14 Bold + dotChip "JavaScript Core path" violet 12) | col(pill "8 days left" goldSoft, tx "+12% readiness" 11 green)). a ghost link "Exam dashboard →".
NODE-STATE LEGEND row: tiny chips: normal (violet dot), weak (amber dot), review (refresh), exam-critical (gold star), completed (green check).
PATH: a vertical timeline of node rows (left marker + node tile + label card). ~6 nodes alternating states:
 - "Variables" COMPLETED (green check tile)
 - "Functions" COMPLETED
 - "DOM events" WEAK (amber tile + "Weak" pill) + EXAM-CRITICAL (gold star) — current
 - "Async" REVIEW (refresh, "Review due")
 - "Fetch API" NORMAL (locked-ish)
 - "Final check" gate (gold)
A weak-point CTA: primaryBtn "Start weak-point session" (full). Keep path uncluttered; exam context visible not dominating.` },

{ batch:3, name:'X2 Exam Mission (Mobile)', W:393, x:480, y:39200, ...rb(37), spec:`Exam-context Mission Viewer (theory page, clean).${MS}
App bar: back + breadcrumb "JavaScript Core › DOM events".
EXAM RELEVANCE row: pill "Exam-critical" goldSoft goldDeep star + pill "+4% readiness" greenSoft green.
LEARNING GOAL card (violetSoft2): tx "LEARNING GOAL" 11 sub + tx "Explain how DOM events propagate (capture & bubble)." 13.5 ink2.
THEORY card (white): kicker "CORE CONCEPT" + title "Event bubbling" + a one-line summary + 2 short paragraphs + a KEY IDEA accent box (lavender) + an EXAMPLE accent box (gold-tint).
SOURCES card: doc rows "Slides · p.12", "MDN notes · imported".
Action row: ghostBtn "Ask Mage about this" (sparkle) + ghostBtn "+ Weak-point practice".
Bottom: primaryBtn "Continue" (full). Keep clean, sources clear, not a dashboard.` },

{ batch:3, name:'X2 Exam Quiz (Mobile)', W:393, x:960, y:39200, ...rb(38), spec:`Exam-context Quiz Interface (one question).${MS}
App bar: back + tx "Quick check" + tx "3 of 8" right.
BADGES row: pill "Exam practice" violetSoft + pill "DOM events" creamDeep + a subtle readiness chip "+1% on correct" goldSoft (small/subtle).
QUESTION card (white): type label "MULTIPLE CHOICE" 11 sub + question "Which event phase runs first?" 17 Semi Bold + instruction "Select one."
ANSWER options (4) radio rows: "Capture phase" (SELECTED violet), "Bubble phase", "Target phase", "Idle phase".
A SOURCE note that appears AFTER answering — show it as a subtle collapsed row "Source revealed after you answer" (faint) OR a post-answer source chip "From: Slides · p.12" shown muted. Keep one-question layout, source not distracting.
Bottom: rowSB(ghostBtn "Mark difficult" | primaryBtn "Check answer"). Subtle mistake-tracking hint not required.` },

{ batch:3, name:'X2 Exam Quiz Result (Mobile)', W:393, x:1440, y:39200, ...rb(39), spec:`Exam-context Quiz Result / Mistake Review (diagnostic).${MS}
App bar: back + "Quiz complete". HERO: tx "6 / 8 correct" 22 ExtraBold + a readiness-change chip "Readiness +2% (66% → 68%)" goldSoft goldDeep.
WEAK AREAS UPDATED card: tx "Weak areas updated" 14 Semi Bold + rows: "DOM events ↑ improving" (green delta), "Event delegation ↓ new weak" (amber).
TOPIC MASTERY card: 2-3 rows topic + bar + delta pill (+/−%).
MISTAKES card: "2 mistakes · grouped by topic" + grouped: "DOM events (1)", "Delegation (1)" each with a "Review" link.
RECOMMENDED NEXT card (violetSoft2): "What's next" + the 3 CTAs as rows or buttons.
CTAs: primaryBtn "Continue path" + ghostBtn "Fix weak areas" + ghostBtn "Start mini-drill". Diagnostic — show what improved/worsened.` },

// ----- WEB versions -----
{ batch:1, name:'X2 Today\'s Study Plan (Web)', W:1440, x:0, y:42000, ...rb(8), spec:`Today's Study Plan, desktop.${WS} webHeader "Today's plan" subtitle "Modul 294 · 8 days left · ~38 min today", CTA primaryBtn "Resume today's plan". Two-column: LEFT (660) the ordered task TIMELINE (4 task cards with status nodes done/in-progress/not-started, time+reason+path chips — same content as mobile Today's Plan). RIGHT (400) rail: "Why this plan?" Mage card (mascot + explanation "Picked from your weak points + exam format" + Ask Mage btn) ; an "Adjust" card (Adjust time / Regenerate / Mark all done as ghost rows). Calm checklist.` },
{ batch:1, name:'X2 Weaknesses (Web)', W:1440, x:1700, y:42000, ...rb(9), spec:`Weaknesses, desktop.${WS} webHeader "Weak areas" subtitle "These topics are holding back your readiness." Severity groups (Urgent / Needs practice / Almost fixed) each a labeled section with a 2-up grid of weakness cards (width 536). Card content same as mobile Weaknesses (topic, severityPill, mastery bar+%, why, source chip, readiness impact, last practiced, actions: Practice primary + Review theory/Ask Mage/Drill/+Today). Coral only for urgent.` },
{ batch:1, name:'X2 Exam Paths (Web)', W:1440, x:3400, y:42000, ...rb(10), spec:`Exam Paths, desktop.${WS} webHeader "Exam paths" subtitle "Modul 294 · 64% ready · 3 paths". Filter chips row (All/In progress/Weak/Completed/Exam-critical). A 2-up grid of path cards (536): name, exam-critical gold pill, "Current: <node>", mastery bar+%, "<done>/<total> missions", weak-nodes meta, Continue path button. Same 3 paths as mobile.` },
{ batch:1, name:'X2 Mock Exam Setup (Web)', W:1440, x:5100, y:42000, ...rb(11), spec:`Mock Exam Setup, desktop.${WS} webHeader "Mock exam" subtitle "Simulate the real thing." A 2x2 grid of type cards (Quick[selected]/Full/Weakness/Final[special gold]) width 536 each: icon, title, purpose, time+question meta, radio. Below, a full-width OPTIONS card with rows: Time limit toggle, Topics dropdown, Question-type chips, Difficulty chips, Hints toggle. Right-aligned or full primaryBtn "Start mock exam". Final mock feels special (gold).` },
{ batch:1, name:'X2 Mock Exam Taking (Web)', W:1440, x:6800, y:42000, ...rb(12), spec:`Mock Exam Taking, desktop TAKEOVER — NO sideNav (full exam focus).
Top bar (full width, white, border-bottom): left "Modul 294 · Mock", CENTER big timer pill "24:18" (clock), right rowSB("Question 7 of 40" + primaryBtn "Submit exam"). A thin progress bar under it.
Body two-column: LEFT a centered question card (max 720): type label, question, instruction, 4 radio options (.pop() selected). NO hints/source. RIGHT (300) a QUESTION NAVIGATOR panel: a grid of numbered cells (answered violet / current ring / flagged amber / blank) + a "Flag question" ghost + legend. Bottom note "Review flagged questions before submitting." Minimal, serious, no playful accents.` },
{ batch:1, name:'X2 Mock Exam Results (Web)', W:1440, x:8500, y:42000, ...rb(13), spec:`Mock Exam Results, desktop.${WS} webHeader "Mock results" subtitle "Solid run! Readiness 61% → 68%." A hero stat band: Score 32/40, 80% correct, 68 min, readiness-change gold chip. Two-column: LEFT (660) Topic breakdown card (rows topic+bar+delta) + Question-type breakdown card. RIGHT (400) Strongest (green chips) + Weakest (amber chips) cards + Recommended recovery card (violetSoft2, 2 actions) + Mistakes "Review" link. Footer/CTAs: "Fix weakest areas" primary + "Review mistakes" ghost. Friendly report, not chart wall.` },
{ batch:1, name:'X2 Study Calendar (Web)', W:1440, x:10200, y:42000, ...rb(14), spec:`Study Calendar, desktop (calendar/timeline hybrid).${WS} webHeader "Study plan" subtitle "8 days to exam · Modul 294", CTA ghost "Adjust schedule". A horizontal MILESTONE timeline band (full width card): nodes Today → Review → Weakness mock → Final revision → Exam day (gold medal), connected by a line, today emphasized violet, exam day gold. Below, a 2-up grid of the next ~6 DAY cards (date, label study/review/mock, plan summary, status done/today/upcoming) + a small legend/"Adjust daily time" control. Calm urgency.` },
{ batch:1, name:'X2 Notification Settings (Web)', W:1440, x:11900, y:42000, ...rb(15), spec:`Notification Settings, desktop.${WS} webHeader "Reminders" subtitle "Gentle nudges for Modul 294." Two-column: LEFT (640) settings cards (Daily plan/Countdown/Weakness/Mock/Final-day reminder rows each with description + toggle ; Preferences card with Preferred time 18:00 + Quiet hours). RIGHT (400) a "Preview" card showing 3 mock push notifications (logo icon + NoteMage + body). No spam/streak language.` },

{ batch:2, name:'X2 Post-Exam Archive (Web)', W:1440, x:0, y:44500, ...rb(22), spec:`Post-Exam Archive, desktop.${WS} A centered calm column (max 720): a think mascot tile, headline "Your exam is finished", "Modul 294 · 12 Sep", a recap card (2x2 stats: Final readiness 68% / Missions 24 / Weak areas closed 5/8 / Mocks 3), then option buttons: primary "Enter result", ghost "View preparation recap", "Keep studying", "Archive exam". Neutral, no outcome assumed.` },
{ batch:2, name:'X2 Exam Result Entry (Web)', W:1440, x:1700, y:44500, ...rb(23), spec:`Exam Result Entry, desktop.${WS} A centered card (max 620): "How did it go?" + "Enter your Modul 294 result." A large grade input (big "5.2" / out of 6 with steppers), Passed/Failed/Pending chips, target comparison pill, "How hard was it?" chips, optional comment, primaryBtn "Submit result". Friendly, low pressure.` },
{ batch:2, name:'X2 Good Result Celebration (Web)', W:1440, x:3400, y:44500, ...rb(24), spec:`Good Result Celebration, desktop TAKEOVER (no sideNav, cream bg). Scatter gold+violet sparkles. Centered: medallion(150,'medal') glow + mascot(grad). Headline "You did it!" + "You beat your target — 5.2 / 6." gold pill "Target smashed". A stats card (grid: Target/Actual/Final readiness/Missions/Weak closed/Mocks/Streak). Achievement chip (medal). CTAs: "View report" primary + "Prepare next exam" ghost. Earned, magical, gold+purple.` },
{ batch:2, name:'X2 Bad Result Reflection (Web)', W:1440, x:5100, y:44500, ...rb(25), spec:`Bad Result Reflection, desktop.${WS} A centered supportive column (max 680): gentle mascot, headline "Let's learn from this." + "Modul 294 didn't go as planned — that's okay." "What went wrong?" then the 10 selectable reason rows (checkbox list, one/two selected) in a card. primaryBtn "Continue". No harsh red, supportive.` },
{ batch:2, name:'X2 Exam Feedback Detail (Web)', W:1440, x:6800, y:44500, ...rb(26), spec:`Exam Feedback Detail, desktop.${WS} A centered narrow form (max 640) with step "2 of 3": context pill "NoteMage missed topics", Mage line, Q1 "Which topics appeared?" tag input + add-manually, Q2 "Have material covering these?" upload dropzone. Footer Back + "Submit feedback". Supportive, max 2-3 questions.` },
{ batch:2, name:'X2 Post-Exam Learning Report (Web)', W:1440, x:8500, y:44500, ...rb(27), spec:`Post-Exam Learning Report, desktop.${WS} webHeader "Exam report" subtitle "Modul 294 · Application Development". A header result card (Passed · 5.2 green pill + Target 4.5). Two-column: LEFT (660) Prediction card (predicted 68% → Passed 5.2, "readiness was on point"), What worked (green checks), What didn't (amber). RIGHT (400) Feedback summary (WebSockets/CORS chips) + Recommendations card (violetSoft2). Footer: "Prepare next exam" primary + "Archive exam" ghost. Closure, encouraging.` },

{ batch:3, name:'X2 Exam Path (Web)', W:1440, x:0, y:47000, ...rb(40), spec:`Exam-context Study Path, desktop.${WS} An exam banner card across the top (Modul 294 · JavaScript Core · 8 days left · +12% readiness + "Exam dashboard →"). A node-state legend row. The path as a vertical timeline (or winding) in the main column with the 6 node states (completed/weak/review/exam-critical/normal/gate) — reuse the path feel. A right rail: "Weak nodes" list + primaryBtn "Start weak-point session". Don't clutter.` },
{ batch:3, name:'X2 Exam Mission (Web)', W:1440, x:1700, y:47000, ...rb(41), spec:`Exam-context Mission Viewer, desktop.${WS} Breadcrumb "JavaScript Core › DOM events". Two-column: LEFT (700) theory card (CORE CONCEPT / Event bubbling / summary / 2 paras / KEY IDEA + EXAMPLE accent boxes) + exam-relevance badges (Exam-critical gold + +4% readiness green) + learning-goal box. RIGHT (340) Sources card (Slides p.12 / MDN notes) + Ask-Mage card + "+ Weak-point practice" button. Bottom Continue. Clean, sources clear.` },
{ batch:3, name:'X2 Exam Quiz (Web)', W:1440, x:3400, y:47000, ...rb(42), spec:`Exam-context Quiz, desktop.${WS} (keep it focused; sideNav ok or minimal). Badges row (Exam practice / DOM events / subtle "+1% on correct"). A centered question card (max 720): type label, "Which event phase runs first?", 4 radio options (Capture selected). A muted post-answer source note "From: Slides · p.12 (after you answer)". Bottom rowSB(Mark difficult ghost | Check answer primary). One question, uncluttered.` },
{ batch:3, name:'X2 Exam Quiz Result (Web)', W:1440, x:5100, y:47000, ...rb(43), spec:`Exam-context Quiz Result, desktop.${WS} webHeader "Quiz complete" subtitle "6 / 8 correct · Readiness +2%". Two-column: LEFT (660) Weak-areas-updated card (improving green / new-weak amber rows) + Topic mastery card (bars + deltas) + Mistakes grouped by topic (Review links). RIGHT (400) Recommended-next card (violetSoft2) + the CTAs (Continue path primary / Fix weak areas / Start mini-drill). Diagnostic.` },
]

const EMPTY_RECIPE = `EMPTY-STATE LAYOUT (mobile 393, height ~700): add statusBar. Center a column vertically-ish: a mascot (the given kind, ~120) inside a violetSoft rounded tile (~150, radius 32) with 2 faint gold sparkles; if an emptyIcon is given, also show a small iconTile with that icon as an accent. Then headline (22 ExtraBold, center), one body line (14 body, center, wrap ~300), then the CTA (primaryBtn for primary actions, ghostBtn for soft ones), full-ish width centered. Calm, lots of breathing room. No tab bar.`

phase('Build')
const run = ONLY ? SCREENS.filter(s => ONLY.indexOf(s.name) !== -1) : SCREENS.filter(s => s.batch === BATCH)
log((ONLY ? 'Targeted rebuild' : 'Batch ' + BATCH) + ': building ' + run.length + ' screens')

function prompt(s){
  const extra = s.empty ? ('\nThis is an EMPTY STATE. mascot kind = "' + s.empty + '"' + (s.emptyIcon ? (', accent icon = "' + s.emptyIcon + '"') : '') + '.\n' + EMPTY_RECIPE) : ''
  return `${RULES}

=========================
YOUR SCREEN: ${s.name}
Frame name (EXACT): "${s.name}"
Canvas: width ${s.W}, place root at x=${s.x}, y=${s.y}. Readback node: name "${s.rbk}", id "${s.rbkId}".
=========================
${s.spec}${extra}

Read the kit file, prepend it, top-level await loadFonts(), build top-level (NO IIFE), stamp the frame id into ${s.rbk}, get_metadata "${s.rbkId}" once, get_screenshot (enableBase64Response:true), refine in place until polished and on-brand. Report final node id + status.`
}

const results = await parallel(run.map(s => () => agent(prompt(s), { label: s.name.replace('X2 ','').slice(0,24), phase: 'Build', model: 'sonnet' })))
return { batch: BATCH, built: run.length, results }

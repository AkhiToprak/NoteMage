export const meta = {
  name: 'exam-mode-build',
  description: 'Build NoteMage Exam Mode screens (mobile EX02-08 + web WEX01-08) in Figma',
  phases: [
    { title: 'Mobile', detail: '7 mobile screens EX02-EX08' },
    { title: 'Web', detail: '8 web screens WEX01-WEX08' },
  ],
}

const FILE = 'DDFpUOARLO01i5J2dMxsUT'
const KIT = '/Users/toprakdemirel/Entwicklung/Quizzard/.tower-shots/exam-kit.js'

const RULES = `You build ONE Figma screen for NoteMage "Exam Mode" by running the Figma MCP tool \`use_figma\` against file ${FILE}.

FIRST: load the MCP tools you need via ToolSearch in ONE call:
  ToolSearch query: "select:mcp__b56af2ea-1ede-4011-8632-dd7932c974d1__use_figma,mcp__b56af2ea-1ede-4011-8632-dd7932c974d1__get_metadata,mcp__b56af2ea-1ede-4011-8632-dd7932c974d1__get_screenshot"
Then Read the shared build kit file: ${KIT}

HOW TO CALL use_figma (CRITICAL — follow exactly):
- The \`code\` you pass MUST be: (1) the ENTIRE contents of the kit file verbatim, then (2) a newline and \`await loadFonts();\`, then (3) your screen-build statements.
- ALL TOP-LEVEL STATEMENTS. Do NOT wrap anything in \`(async()=>{...})()\`. An async IIFE's writes are LOST (the MCP commits synchronously). Top-level \`await\` IS supported.
- Use ONLY the kit helpers + the figma Plugin API. The kit provides: solid,rgba,C (colors),icon,tx,box,col,row,rowSB,fixW,stretch,grow,add,place,shadowSoft,shadowGlow,shadow2,tile,iconTile,dotChip,pill,bar,ring,divider,primaryBtn,softBtn,ghostBtn,mascot,logo,statusBar,homeIndicator,backBtn,segProgress,mageBubble,bottomNav,sectionLabel,statCol,card,vspace,hspace,vgrow,hgrow,sideNav,webHeader,root.
- COLORS: use only C.* keys: cream,creamDeep,ink,ink2,inkBody,body,sub,faint,violet,violetDeep,violetSoft,violetSoft2,violetLine,gold,goldDeep,goldSoft,goldLine,green,greenSoft,amber,amberSoft,amberLine,coral,coralSoft,white,border,borderSoft,line,track. NEVER use gradients — solid fills only.
- ICONS: use only these names: chevronLeft,chevronRight,chevronDown,plus,check,clock,calendar,target,flame,doc,notes,image,code,mic,bolt,chart,bell,list,shield,medal,play,sparkle,pencil,layers,flask,search,star,lock,alert,refresh,home,user,route,brain,grid,dot. (icon(name,size,colorHexString) — pass a hex like C.violet.)
- mascot(size, kind) kinds: def,think,wink,wand,scroll,point,quiz,grad,flash. logo(width) draws the Notemage wordmark. These pull the REAL brand art — use them, don't fake.

LAYOUT MECHANICS (the kit already encodes these — follow the patterns):
- Build the screen inside ONE root frame. Make it idempotent so you can re-run after fixes WITHOUT changing the frame id:
    let r=figma.currentPage.findOne(n=>n.type==='FRAME'&&n.name==='<FRAME_NAME>');
    if(r){r.children.forEach(c=>c.remove()); r.layoutMode='NONE'; r.fills=[solid(C.cream)];}
    else{ r=root('<FRAME_NAME>', <W>, 1000); r.x=<X>; r.y=<Y>; }
  Then build into r. The root uses NONE layout: position children with place(r,node,x,y). Inner blocks are auto-layout (col/row) — append children, never set x/y inside auto-layout.
- A vertical content column: const cc=col({gap:..}); fixW(cc,<contentWidth>); add(cc, ...children...); place(r,cc,marginX,topY).
- For a row whose children split left/right, use rowSB() (it stretches to parent width). For full-width children inside a col, call stretch(child).
- Bars/buttons/tiles take explicit pixel widths. Compute inner widths (card padding is usually 16-22 per side).
- After all children are added, READ cc.height to size the root: r.resize(<W>, neededHeight). Mobile bottom nav / footer is placed absolutely near the bottom.

SELF-VERIFY (do this, it is required):
1) At the very END of your build code, stamp the frame id so you can fetch it:
     const _rb=figma.currentPage.findOne(n=>n.name&&n.name.indexOf('<RBK_NAME>')===0); if(_rb)_rb.name='<RBK_NAME>::'+r.id;
2) Call get_metadata on nodeId '<RBK_ID>' ONCE. Parse the frame id from the returned name (after '::').
3) Call get_screenshot with that frame id and enableBase64Response:true (maxDimension 720 for mobile, 1280 for web). LOOK at the image.
4) Compare against the spec. If anything is broken/ugly/misaligned/overflowing/empty, FIX by editing your build code and re-running use_figma (the idempotent root keeps the same id). Re-screenshot (it is always live — no need to re-read metadata). Iterate up to 3 times until it looks polished and matches the spec.
5) If get_metadata shows your RBK node name was NOT updated (still 'RBK..'), your build threw and rolled back — wrap your build in try/catch, stamp the error into the RBK node name ('<RBK_NAME>::ERR '+e.message), read it, and fix the bug.

DESIGN BAR: calm, student-focused, premium. Match the existing NoteMage onboarding screens: warm cream background, white rounded cards (radius ~18-20) with soft shadows, violet primary, gold ONLY for success/readiness/exam-gates, amber (not red) for weak-points/urgency, generous spacing, Inter. Bold ink headlines (tracking tight). No gradients. Keep copy terse.

Return a 1-2 sentence status: the frame name, its node id, and whether it rendered correctly (and any caveat).`

const MOBILE_SHELL = `MOBILE FRAME: width 393. Start with add(r, statusBar(393)) at top (it sits at y0). Content column at x24,y58 width 345 (CW). Card inner width ~313. Size the root tall enough for all content; if the screen has a bottom tab bar use bottomNav(393,[{icon:'home',label:'Home'},{icon:'target',label:'Exams'},{icon:'route',label:'Paths'},{icon:'chart',label:'Progress'},{icon:'user',label:'Profile'}],1) placed at (0, rootH-84) and homeIndicator(r,393,rootH-11). For create/upload/review screens with a primary action, place a pinned footer bar (white, top hairline border, the primary button inside) at the bottom OR put the CTA as the last content item — your call for best look.`

const WEB_SHELL = `WEB FRAME: width 1440. Build main content first as a col at x296,y48 width 1096 (CW). After measuring its height set H=Math.max(48+cc.height+56, 860), r.resize(1440,H), then place(r, sideNav(H,1), 0,0) (Exams tab active). Use webHeader(1096,title,subtitle,ctaNode) for top-of-page header where a page title fits; for wizard/loading screens center a narrower card/column within the 1096 area. Cards in 2-up grids use width (1096-24)/2=536; 3-up use (1096-2*20)/3≈352.`

const SCREENS = [
  // ---------------- MOBILE ----------------
  { key:'EX02', name:'EX02 Create Exam — Basic Info (Mobile)', platform:'Mobile', x:470, y:24000, rbk:'RBK0', rbkId:'229:2', spec:`
SCREEN: Create Exam — Basic Info (wizard step 1 of 3). ${MOBILE_SHELL}
TOP: a row (width 345) = backBtn() + segProgress(345-40-12, 3, 1) vertically centered (wrap segProgress so it sits centered).
THEN mageBubble("I'll build a plan around your deadline.", 345, 'scroll').
HEADLINE "Create your exam" (size 26, ExtraBold ink, ls -2) + helper "NoteMage will build a study plan around your deadline." (14, body, wrap 345).
ONE white card (CW, pad 18, gap 16) containing fields (each = col gap6: a label tx(13, Semi Bold, ink2) + an input row(white, border C.border, radius 12, px14, fixed height 50, align center) holding placeholder/value text(14.5, faint for placeholder / ink2 for value) and where useful a right icon):
  1. "Exam name" — value "Modul 294 — Application Development".
  2. "Subject / module" — value "Application Development" + right chevronDown icon (dropdown look).
  3. A two-column row (gap 12) of two half-width fields: "Exam date" — input with a leading calendar icon + value "12 Sep 2026" (give this field a gold-tinted left accent or a small goldSoft "in 8 days" pill to feel important-but-calm) ; "Target grade" — label with a small "optional" pill, input value "4.5 / 6".
  4. "Difficulty estimate" — label + a row (gap 8) of 4 selectable chips: Easy, Medium(SELECTED=violet bg/white text), Hard, Unknown. Unselected chips = white bg + C.border stroke + ink2 text, radius 11, px12 py8 size13.
  5. "Daily study time" — label + a row (gap 8) of 5 chips: 10 min, 20 min(SELECTED), 30 min, 45 min, Custom.
FOOTER (place last, full width 345 row gap 12): ghostBtn("Back", 110, {h:52}) + primaryBtn("Continue", 345-110-12, {h:52}). Size root to fit; no bottom tab bar (this is a modal wizard).`},

  { key:'EX03', name:'EX03 Create Exam — Format (Mobile)', platform:'Mobile', x:940, y:24000, rbk:'RBK1', rbkId:'229:3', spec:`
SCREEN: Create Exam — Exam Format (wizard step 2 of 3). ${MOBILE_SHELL}
TOP: backBtn() + segProgress(293,3,2) centered in a 345 row.
mageBubble("What kind of questions should I drill you on?", 345, 'quiz').
HEADLINE "What's the exam format?" + helper "Pick all that apply — Mage tailors practice to match."
A 2-column grid (gap 12, card width (345-12)/2=166) of selectable FORMAT CARDS. Card = col(white, pad14, gap8, radius16, border): an iconTile(38, lavender or tinted, <icon>, C.violet, 19, 11) + title(15, Semi Bold ink) + desc(12, body, wrap). SELECTED cards: violet 1.5 border + C.violetSoft2 fill + shadowGlow(card,C.violet,8,18,0.22) + a small check badge (a 20px violet circle with white check icon) placed top-right (absolute via place on the card AFTER making card NONE? simpler: add check pill into a top rowSB inside the card).
Cards (selected ones marked):
  - Multiple choice (SELECTED) — icon 'list' — "Pick-the-answer drills"
  - Written answers — icon 'pencil' — "Short & long-form responses"
  - Calculations — icon 'flask' — "Numbers & formulas"
  - Coding (SELECTED) — icon 'code' — "Write & debug real code"
  - Oral — icon 'mic' — "Spoken-prompt practice"
  - Mixed — icon 'grid' — "A bit of everything"
Then a FULL-WIDTH (345) card "Unknown / not sure" — icon 'brain' — "Mage picks a balanced mix" (horizontal layout: iconTile + texts).
FOOTER: ghostBtn("Back",110,{h:52}) + primaryBtn("Continue to material upload", 345-110-12, {h:52, size:14.5}). No tab bar.`},

  { key:'EX04', name:'EX04 Upload Exam Material (Mobile)', platform:'Mobile', x:1410, y:24000, rbk:'RBK2', rbkId:'229:4', spec:`
SCREEN: Upload Exam Material (repurposed study-pack upload, now exam-aware). ${MOBILE_SHELL}
TOP: backBtn() alone (left), in a 345 row.
EXAM CONTEXT BANNER: a card (CW, pad14, fill C.violetSoft2, no heavy shadow) = rowSB: left row(iconTile(40,C.white,'target',C.violet,20,11) + col(tx "Modul 294 Exam" 15 Bold ink, dotChip "Application Development · 12 Sep" with C.violet dot 12)) ; right a small goldSoft pill "8 days" (icon calendar goldDeep).
HEADLINE "Upload exam material" (26 ExtraBold) + helper "Learning goals, notes, exercises, old exams, PDFs, screenshots, or code files." (14 body wrap).
ADD CARD: a dashed-look card (CW, pad18, fill C.white, stroke C.violetLine, gap6, centered): iconTile(44,C.violetSoft,'plus',C.violet,22,13) centered + tx "Add material" (15 Semi Bold ink, center) + tx "Drop files or browse" (12.5 body center). (Dashed not supportable — use a 1.4 violetLine solid border + violetSoft2 tint to imply a dropzone.)
SECTION label "Materials".
MATERIAL ROWS (each = card CW pad12, rowSB: left row(iconTile(36, tint,'<fileicon>',color,18,10) + col(tx filename 14 Semi Bold ink2, tx size/meta 11.5 body)) ; right the material-type BADGE pill). HIGH-PRIORITY rows (Learning goals, Old exam) get fill C.goldSoft tint + badge gold (goldSoft bg, goldDeep text, star icon) to read as important sources. Others neutral (badge violetSoft/creamDeep).
  - "Lernziele_Modul294.pdf" · "PDF · 240 KB" — icon 'target' — BADGE "Learning goals" (gold, high-priority, gold-tinted row)
  - "IPA_Altpruefung_2024.pdf" · "PDF · 1.1 MB" — icon 'medal' — BADGE "Old exam" (gold, high-priority, gold-tinted row)
  - "Vorlesung_W1-6.pdf" · "PDF · 4.2 MB" — icon 'doc' — BADGE "Slides/PDF" (violet)
  - "Notizen.txt" · "Text · 18 KB" — icon 'notes' — BADGE "Notes" (neutral)
  - "uebungen.zip" · "Archive · 2.0 MB" — icon 'flask' — BADGE "Exercises" (neutral)
  - "main.js" · "Code · 6 KB" — icon 'code' — BADGE "Code file" (neutral)
A subtle hint row under high-priority items overall: a small lavender note "Learning goals & old exams help Mage predict your exam." (sparkle icon).
FOOTER: a pinned bottom bar (white, top border C.border, full width 393, height ~84) containing primaryBtn("Analyze material", 345, {h:52, icon:'sparkle'}) centered; place at (0, rootH-84). homeIndicator below. (No tab bar.)`},

  { key:'EX05', name:'EX05 Material Analysis Loading (Mobile)', platform:'Mobile', x:1880, y:24000, rbk:'RBK3', rbkId:'229:5', spec:`
SCREEN: Material Analysis — magical loading. ${MOBILE_SHELL} (no tab bar; full screen, height ~852, center content vertically-ish).
add statusBar.
HERO (centered col, gap14, placed ~y90): a big lavender panel — a frame fill C.violetSoft, radius 30, size 210x180, with mascot(120,'wand') centered (use a CENTER-aligned row inside) and 3-4 'sparkle' icons in C.gold placed at corners (absolute place on the panel which must be NONE layout — so build panel as NONE frame: create frame, fills violetSoft, resize 210x180, append a centered mascot at computed x,y, then place sparkles). Below the panel a small row of 3 dots (first C.violet filled, rest C.track) to imply progress.
HEADLINE (center) "Building your exam plan…" (24 ExtraBold) + helper (center) "Mage is turning your material into a focused plan." (14 body, center, wrap 320).
CHECKLIST CARD (CW, pad18, gap0): 7 step rows, each a row(gap12, align center, py10): a 24px status node + label(14.5). A faint vertical timeline line connects them (optional). Status:
  1 Reading material — DONE (green filled circle + white check)
  2 Finding learning goals — DONE
  3 Detecting exam topics — ACTIVE (violet ring: ring(24,0.4,C.violet) OR a violet circle with a small inner dot) + label ink Semi Bold
  4 Estimating question types — PENDING (hollow grey circle, label faint)
  5 Creating study pack — PENDING
  6 Building paths — PENDING
  7 Preparing first readiness estimate — PENDING
FOOTER (near bottom): center tx "This usually takes under a minute" (12.5 body) + a continuous bar(345, 0.42, C.violet, 8) below it. Place around y rootH-70. Keep frame height ~852.`},

  { key:'EX06', name:'EX06 Material Understanding Review (Mobile)', platform:'Mobile', x:2350, y:24000, rbk:'RBK4', rbkId:'229:6', spec:`
SCREEN: Material Understanding Review — what Mage found before building. ${MOBILE_SHELL}
TOP: backBtn() + a centered title tx "Review" (15 Semi Bold) — simple app bar.
mageBubble("Here's what I found. Tweak anything before I build it.", 345, 'think').
HEADLINE "Before we build your plan" (24 ExtraBold) + helper "Check what Mage understood from your material." (14 body).
SUMMARY CARDS (vertical, gap14, each CW):
  1. "Detected topics" — header rowSB(iconTile(34,C.violetSoft,'layers',C.violet,17,9)+title 16 Bold | pill "9" creamDeep). Then topic CHIPS as rows: each = rowSB(left dotChip(topic, color,ink2,13.5) | right small row(gap8): a 'star' icon button (gold if important else faint) + a 'pencil' faint + an x via tx "×" faint). Topics: "DOM events"(IMPORTANT — gold star + a goldSoft "Likely exam" mini pill), "Async & Promises", "SQL joins", "Normalization", "REST APIs". Then a faint tx "+4 more topics".
  2. "Learning goals found" — header(iconTile target violet + title + pill "12"). 3 goal rows: check icon (green) + tx: "Explain the JS event loop", "Write parameterised SQL queries", "Design a normalised schema". + faint "+9 more".
  3. "Likely question types" — header(iconTile list violet + title). 3 rows each = label + a thin bar showing share: "Multiple choice" bar 0.4, "Code writing" bar 0.35, "Short answer" bar 0.25 (bars width ~150, violet).
  4. "Key concepts & formulas" — header(iconTile flask violet + title). A wrap-free row(s) of small neutral chips: "Big-O", "ACID", "JOIN types", "Event bubbling", "Indexing" (use two rows of pills to fit).
  5. "Looks thin on" (amber card: fill C.amberSoft, border C.amberLine) — header(iconTile(34,C.white,'alert',C.amber,17,9)+title 16 Bold ink). Items: "Transactions — few examples", "Indexing — not covered". + ghostBtn("Add more material",170,{h:42,size:13}) + tx "You can continue anyway." (12.5 body).
  6. "Source coverage" — header(iconTile shield violet + title). A bar(313,0.84,C.green) + tx "6 sources · 84% used". Mini list: "Learning goals ✓", "Old exam ✓", "Slides ✓", "Notes — partial".
FOOTER: pinned bottom bar with primaryBtn("Generate exam plan", 345, {h:52, icon:'sparkle'}). homeIndicator. No tab bar.`},

  { key:'EX07', name:'EX07 Exam Plan Generated (Mobile)', platform:'Mobile', x:2820, y:24000, rbk:'RBK5', rbkId:'229:7', spec:`
SCREEN: Exam Plan Generated — success (repurposed path-reveal). ${MOBILE_SHELL}
add statusBar.
TOP celebratory row: mageBubble("Your Modul 294 exam plan is ready.", 345, 'grad') — or a mascot(grad) tile + bubble. Add 2 gold 'sparkle' accents near it.
HEADLINE "Your plan is ready." (28 ExtraBold) + helper "Built from your material, aimed at exam day." (14 body).
SUMMARY CARD (CW, pad18, gap14): a stat row = three statCol separated by thin dividers: statCol("3","Paths"), divider, statCol("24","Topics"), divider, statCol("61%","Ready") — make the "61%" number C.goldDeep (gold = readiness). Below: a row(iconTile layers violet + col(tx "Study pack created" 14 Semi Bold, tx "Flashcards + quizzes from your sources" 12 body)). Below: a row(iconTile clock violet + tx "Estimated time · 6h 20m"). Add a gold readiness emphasis: a row with bar(313,0.61,C.gold) + tx "61% initial readiness" (gold).
RECOMMENDED FIRST SESSION CARD (highlighted: fill C.violetSoft2, border C.violetLine): header tx "Recommended first session" (12.5 sub uppercase). Row: iconTile(40,C.white,'play',C.violet,20,11) + col(tx "DOM events — theory" 15 Bold, tx "8 min · warm-up" 12.5 body) + a goldSoft "Likely exam topic" mini pill.
"WHAT'S INSIDE" section label + 3 path rows (card CW pad12 each or one card with rows): each row = row(iconTile route violet + col(tx pathname 14 Semi Bold, tx "x steps · 0% mastery" 12 body) + chevronRight faint). Paths: "JavaScript Core · 9 steps", "Databases · 8 steps", "Web APIs · 7 steps".
FOOTER (last items, full width): primaryBtn("Open exam dashboard", 345, {h:52}) then a ghostBtn("Edit plan", 345, {h:48}) below it. No tab bar.`},

  { key:'EX08', name:'EX08 Basic Exam Dashboard (Mobile)', platform:'Mobile', x:3290, y:24000, rbk:'RBK6', rbkId:'229:8', spec:`
SCREEN: Basic Exam Dashboard — the exam command center (long, scrollable). ${MOBILE_SHELL} (HAS bottom tab bar, Exams active).
add statusBar. APP BAR row(345): backBtn() + tx "Modul 294" (16 Bold, centered-ish) + a right tile(40,C.white,'sparkle',C.violet,18,12) (Ask Mage).
HERO CARD (CW, pad18, gap14, subtle gold accent border C.goldLine OR white with soft shadow):
  - rowSB: col(tx "Modul 294 Exam" 18 Bold, dotChip "Application Development" violet 12.5) | a calm countdown pill: pill("8 days left", C.violetSoft, C.violetDeep, {icon:'calendar', iconColor:C.violet, size:12.5}).
  - a row(gap16, align center): a ring readiness on the LEFT — build a NONE frame 96x96 with ring(96,0.64,C.gold,C.track,9) and a centered col(tx "64%" 22 ExtraBold goldDeep, tx "ready" 11 body) overlaid in the middle ; RIGHT a col(grow): tx insight "You're on track — but JavaScript events need practice." (13.5 ink2, wrap) with a small sparkle icon, plus a small "On track" goldSoft pill.
  - primaryBtn("Start today's plan", 313, {h:50}).
TODAY'S PLAN CARD: header rowSB(tx "Today's plan" 16 Bold | pill "~25 min" violetSoft). 3 task rows (each rowSB): left row(a 22px violet index circle with number, + col(tx task 14 Semi Bold ink2, a tiny reason chip)) ; right tx "8 min" (12.5 body). Tasks: 1 "Review DOM events" reason "weak point"(amber chip) "8 min"; 2 "Coding drill: array methods" reason "exam format"(violet chip) "15 min"; 3 "Redo 4 missed questions" reason "spaced review"(violet chip) "10 min".
WEAK AREAS CARD: header rowSB(tx "Weak areas" 16 Bold | tx "View all" 12.5 violet). 3 rows (rowSB): col(tx topic 14 Semi Bold + tx subject 11.5 body) | row(severity pill + softBtn small). Rows: "JavaScript events" severity "High"(amberSoft/amber) action softBtn("Practice",92,{h:36,size:12.5}); "SQL joins" "Medium"(violetSoft/violetDeep) "Practice"; "Normalisation" "Low"(creamDeep/body) "Review". Then ghostBtn("View all weaknesses", 313, {h:44}).
LINKED PATHS CARD: header tx "Linked paths" 16 Bold. 2 path rows: row(iconTile route violet + col(tx name 14 Semi Bold + bar(150,mastery,C.violet) + tx "x% mastery" 11.5 body) + softBtn("Continue",96,{h:36,size:12.5})). Paths: "JavaScript Core" 58%, "Databases" 41%.
MOCK EXAM CARD (muted/locked: fill C.cream, border C.border): row(iconTile(40,C.creamDeep,'lock',C.faint,18,11) + col(tx "Mock exams" 14 Semi Bold + tx "Unlock after more topics are covered" 12 body)) + a small ghostBtn("Create quick mock", 150, {h:38, size:12.5}) (looks optional).
STUDY CALENDAR CARD: header tx "Study calendar" 16 Bold. A horizontal mini timeline: a row of 4 day-nodes connected by a line: "Today"(violet dot), "+2 Review", "+5 First mock", "Day 8 Exam"(gold flag/medal). Each node = small col(a dot/tile + tiny label).
REMINDERS CARD: rowSB(row(iconTile bell violet + col(tx "Daily reminder" 14 Semi Bold + tx "18:00 · On" 12 body)) | ghostBtn("Manage", 96, {h:38, size:12.5})).
BOTTOM TAB BAR (Exams active) + homeIndicator. Size root to fit everything (~1900+ tall).`},

  // ---------------- WEB ----------------
  { key:'WEX01', name:'WEX01 Exams (Web)', platform:'Web', x:0, y:27000, rbk:'RBK7', rbkId:'229:9', spec:`
SCREEN: Exams Overview (desktop). ${WEB_SHELL}
Main content (col width 1096):
- webHeader(1096, "Exams", "Prepare with paths, weak-point practice, and readiness tracking.", primaryBtn("Create exam",196,{icon:'plus',h:50,size:15})).
- vspace(30) + sectionLabel("Active") + vspace(14).
- A 2-up grid (row gap24) of EXAM CARDS, card width 536. Each card (white, pad22, gap15): rowSB(col(tx title 20 Bold + dotChip subject accent body 13) | pill "<n> days left" lavender violetDeep with calendar icon) ; readiness col(rowSB(tx "<pct>% ready" 14 Bold gold-or-violet | pill "On track"(gold) / "Keep going"(violet) with star/flame), bar(536-44, pct, gold-if>=60-else-violet, 9)) ; meta row(dotChip "<n> weak areas" amber, dotChip "<n> linked paths" violet) ; a lavender reco strip(row fill violetSoft2 radius12 px14 py11: clock icon + "Today: <n> min recommended") ; footer rowSB(ghostBtn("View weak areas",160,{h:44,size:13.5}) | primaryBtn/softBtn(cta,200,{h:44})).
  Card A: "Modul 294 Exam" / "Application Development · IPA" / 8 days / 64% (gold, On track) / 4 weak / 3 paths / "Today: 25 min recommended" / primary "Continue prep".
  Card B: "Statistics Midterm" / "Mathematics · Sem 4" / 21 days / 38% (violet, Keep going) / 6 weak / 2 paths / "Today: 20 min recommended" / soft "Open dashboard".
- vspace(36) + a row(sectionLabel "Archived" + pill "2" creamDeep) + vspace(14).
- A 2-up grid of ARCHIVED cards (width 536, fill C.cream, border C.border, no glow): rowSB(row(iconTile(40,C.greenSoft,'check',C.green,19,11) + col(tx title 15 Semi Bold + tx sub 12.5 body)) | pill "Done" green). Cards: "Modul 183 Exam"/"Application Development · Passed · Grade 5.2" ; "English B2 Mock"/"Languages · Passed · 82%".`},

  { key:'WEX02', name:'WEX02 Create Exam — Basic Info (Web)', platform:'Web', x:1700, y:27000, rbk:'RBK8', rbkId:'229:10', spec:`
SCREEN: Create Exam — Basic Info (desktop wizard step 1 of 3). ${WEB_SHELL}
Main content col (1096), centered children:
- A top row(1096, rowSB): left tx "← Back to Exams" (14 Semi Bold violetDeep) ; center segProgress(360,3,1) ; right tx "Step 1 of 3" (13 body). (Use a 3-part layout; ok to approximate with rowSB and a centered piece.)
- vspace(26). Center a CARD of width 760 (compute its x offset so it's centered in 1096: place inside a row(1096) justify CENTER, or wrap card in a centered col). Card (760, pad32, gap20, white):
   - tx "Create your exam" (28 ExtraBold) center-left + helper "NoteMage will build a study plan around your deadline." (15 body).
   - mageBubble("I'll build a plan around your deadline.", 760-64, 'scroll').
   - Field "Exam name" (full width input, value "Modul 294 — Application Development").
   - Two-column row(gap16): "Subject / module" (input "Application Development" + chevronDown) | "Exam date" (input + calendar icon + "12 Sep 2026" + goldSoft "in 8 days" pill).
   - Two-column row: "Target grade (optional)" (input "4.5 / 6") | "Difficulty" (row of chips Easy/Medium[SEL]/Hard/Unknown).
   - "Daily study time" label + row of chips 10/20[SEL]/30/45 min/Custom.
   - footer rowSB(ghostBtn("Back",120,{h:50}) | primaryBtn("Continue",200,{h:50})).
  Inputs: row white, border C.border, radius12, px16, height 52, label above (13 Semi Bold ink2). Chips like mobile.`},

  { key:'WEX03', name:'WEX03 Create Exam — Format (Web)', platform:'Web', x:3400, y:27000, rbk:'RBK9', rbkId:'229:11', spec:`
SCREEN: Create Exam — Exam Format (desktop wizard step 2 of 3). ${WEB_SHELL}
Main col (1096):
- top row: "← Back" left, segProgress(360,3,2) center, "Step 2 of 3" right. vspace(24).
- Centered headline col (center align): tx "What's the exam format?" (30 ExtraBold) + helper "Pick all that apply — Mage tailors practice to match." (15 body). vspace(22).
- A centered grid container width ~960: 3 columns of FORMAT CARDS (card width (960-2*20)/3≈306, gap20). Card = col(white,pad18,gap10,radius16,border): iconTile(44, tint, icon, C.violet, 22, 12) + title(16 Semi Bold) + desc(12.5 body). SELECTED = violet 1.5 border + violetSoft2 fill + shadowGlow + a check badge top-right. 7 cards: Multiple choice(SEL,list,"Pick-the-answer drills"), Written answers(pencil,"Short & long-form responses"), Calculations(flask,"Numbers & formulas"), Coding(SEL,code,"Write & debug real code"), Oral(mic,"Spoken-prompt practice"), Mixed(grid,"A bit of everything"), Unknown(brain,"Mage picks a balanced mix"). (3+3+1; the last centered or left.)
- vspace(28) + centered primaryBtn("Continue to material upload", 320, {h:52}) (and a ghostBtn "Back" to its left if you like).`},

  { key:'WEX04', name:'WEX04 Upload Exam Material (Web)', platform:'Web', x:5100, y:27000, rbk:'RBK10', rbkId:'229:12', spec:`
SCREEN: Upload Exam Material (desktop, repurposed). ${WEB_SHELL}
Main col (1096):
- An exam context bar (card width 1096, pad16, fill C.violetSoft2): rowSB(row(iconTile(44,C.white,'target',C.violet,22,12)+col(tx "Modul 294 Exam" 17 Bold + dotChip "Application Development · 12 Sep 2026" violet 13)) | pill "8 days left" goldSoft goldDeep calendar). vspace(22).
- webHeader(1096, "Upload exam material", "Learning goals, notes, exercises, old exams, PDFs, screenshots, or code files.", null). vspace(18).
- A two-column row(gap24): LEFT a big dropzone card (width 700, height ~220, fill white, border C.violetLine 1.6, centered col): iconTile(56,C.violetSoft,'plus',C.violet,28,16) + tx "Drop files or browse" (17 Semi Bold) + tx "PDF, slides, images, code, text" (13 body). RIGHT a side note card (width 372, fill C.goldSoft, border C.goldLine): iconTile(36,C.white,'star',C.goldDeep,18,10)+tx "High-priority sources" (14 Bold) + tx "Learning goals & old exams help Mage predict exactly what your exam will ask." (12.5 body wrap).
- vspace(26) + sectionLabel("Materials · 6") + vspace(12).
- A MATERIALS table: 6 rows (each card width 1096, pad14): rowSB(row(iconTile(38,tint,fileicon,color,19,10)+col(tx filename 14.5 Semi Bold + tx meta 12 body)) | row(gap14 align center: material-type BADGE pill + a faint 'x' remove)). Same 6 files & badges as the mobile EX04 (Learning goals[gold], Old exam[gold] — these rows tinted goldSoft; then Slides/PDF[violet], Notes, Exercises, Code file).
- vspace(24) + a footer rowSB(tx "2 high-priority sources detected" 13 body | primaryBtn("Analyze material", 220, {h:52, icon:'sparkle'})).`},

  { key:'WEX05', name:'WEX05 Material Analysis Loading (Web)', platform:'Web', x:6800, y:27000, rbk:'RBK11', rbkId:'229:13', spec:`
SCREEN: Material Analysis — loading (desktop, centered). ${WEB_SHELL}
Main col (1096) but CENTER everything (counterAxisAlignItems CENTER on the content col).
- vspace(30).
- HERO panel: a frame fill C.violetSoft radius36 size 260x210 (NONE layout) with mascot(150,'wand') centered + 4 gold 'sparkle' icons placed near corners. Center it.
- vspace(8) + a row of 3 dots (first violet) centered.
- tx "Building your exam plan…" (30 ExtraBold) center + tx "Mage is turning your material into a focused plan." (15 body, center). vspace(22).
- CHECKLIST CARD width 560 (centered): the 7 steps (Reading material[DONE], Finding learning goals[DONE], Detecting exam topics[ACTIVE violet], Estimating question types, Creating study pack, Building paths, Preparing first readiness estimate[all PENDING]) — each row: 26px status node + label 15. Done=green+check, active=violet ring, pending=grey hollow.
- vspace(18) + tx "This usually takes under a minute" (13 body center) + bar(560, 0.42, C.violet, 8) centered.
Keep it calm and airy; set a comfortable height (~820+).`},

  { key:'WEX06', name:'WEX06 Material Understanding Review (Web)', platform:'Web', x:8500, y:27000, rbk:'RBK12', rbkId:'229:14', spec:`
SCREEN: Material Understanding Review (desktop). ${WEB_SHELL}
Main col (1096):
- webHeader(1096, "Before we build your plan", "Check what Mage understood from your material — tweak anything.", primaryBtn("Generate exam plan",220,{icon:'sparkle',h:50,size:15})). vspace(26).
- A 2-column masonry of summary cards (left col width 536, right col width 536, gap24; build as a row of two vertical columns each gap20):
  LEFT column:
   1. "Detected topics" card (header iconTile layers violet + title 17 Bold + pill "9"): topic rows each rowSB(dotChip(topic,color,ink2,14) | row(gap10: star icon[gold if important else faint] + pencil faint + 'x' faint)). Topics: "DOM events"(IMPORTANT: gold star + goldSoft "Likely exam" pill), "Async & Promises", "SQL joins", "Normalisation", "REST APIs", "+4 more" faint.
   2. "Likely question types" card: rows label + bar(360,share,violet): Multiple choice .40, Code writing .35, Short answer .25.
   3. "Source coverage" card: bar(492,.84,green) + tx "6 sources · 84% used" + mini list (Learning goals ✓ / Old exam ✓ / Slides ✓ / Notes partial).
  RIGHT column:
   4. "Learning goals found" card (pill "12"): 3 check rows (Explain the JS event loop / Write parameterised SQL queries / Design a normalised schema) + "+9 more".
   5. "Key concepts & formulas" card: neutral chips Big-O, ACID, JOIN types, Event bubbling, Indexing (two rows).
   6. "Looks thin on" amber card (fill amberSoft border amberLine): items "Transactions — few examples", "Indexing — not covered" + ghostBtn("Add more material",180,{h:44}) + tx "You can continue anyway."
Each card white pad20 radius18 shadow (except amber one).`},

  { key:'WEX07', name:'WEX07 Exam Plan Generated (Web)', platform:'Web', x:10200, y:27000, rbk:'RBK13', rbkId:'229:15', spec:`
SCREEN: Exam Plan Generated — success (desktop, two-column like path-reveal). ${WEB_SHELL}
Main col (1096):
- vspace(8). A top celebratory row: mageBubble("Your Modul 294 exam plan is ready.", 560, 'grad') on the left with 2 gold sparkles. vspace(8).
- A two-column row(gap28, align top):
  LEFT (width 640):
    - tx "Your plan is ready." (32 ExtraBold) + tx "Built from your material, aimed at exam day." (15 body). vspace(8).
    - SUMMARY CARD (640): stat row statCol("3","Paths")|divider|statCol("24","Topics")|divider|statCol("61%","Ready"[goldDeep]) ; row(iconTile layers violet + col("Study pack created" 14 Semi Bold + "Flashcards + quizzes from your sources" 12 body)) ; row(iconTile clock violet + "Estimated time · 6h 20m") ; gold readiness bar(592,.61,gold) + "61% initial readiness".
    - RECOMMENDED FIRST SESSION card (violetSoft2, violetLine): "Recommended first session" sub-label + row(iconTile play violet + col("DOM events — theory" 15 Bold + "8 min · warm-up" 12.5 body) + goldSoft "Likely exam topic" pill).
    - primaryBtn("Open exam dashboard", 300, {h:52}) + ghostBtn("Edit plan",140,{h:52}) in a row.
  RIGHT (width 428): a "What's inside" card: title 16 Bold + 3 path rows (iconTile route violet + col(name 14 Semi Bold + "x steps · 0% mastery" 12 body) + chevronRight): "JavaScript Core · 9 steps", "Databases · 8 steps", "Web APIs · 7 steps". Plus a small mascot(grad) celebratory corner.`},

  { key:'WEX08', name:'WEX08 Basic Exam Dashboard (Web)', platform:'Web', x:11900, y:27000, rbk:'RBK14', rbkId:'229:16', spec:`
SCREEN: Basic Exam Dashboard (desktop command center). ${WEB_SHELL}
Main col (1096):
- HERO BAND card (width 1096, pad26, white, subtle): rowSB(
    LEFT col(gap10): rowSB-ish row(tx "Modul 294 Exam" 24 ExtraBold + pill "8 days left" violetSoft violetDeep calendar) ; dotChip "Application Development · 12 Sep 2026" violet 13 ; tx insight "You're on track — but JavaScript events need practice." 14 ink2 (with sparkle) ; primaryBtn("Start today's plan", 240, {h:50}) ),
    RIGHT a readiness ring: NONE frame 130x130 with ring(130,0.64,C.gold,C.track,11) + centered col(tx "64%" 30 ExtraBold goldDeep + tx "ready" 12 body) + a goldSoft "On track" pill under it.
  ). vspace(24).
- A two-column dashboard row(gap24, align top):
  LEFT col width 656 (gap20):
    - "Today's plan" card: header rowSB(title 17 Bold | pill "~25 min" violetSoft). 3 task rows rowSB(row(violet index circle + col(task 15 Semi Bold + reason chip)) | tx "x min"). (Review DOM events/weak point/8 min; Coding drill: array methods/exam format/15 min; Redo 4 missed questions/spaced review/10 min.)
    - "Linked paths" card: title 17 Bold + 2 rows(iconTile route violet + col(name 15 Semi Bold + bar(260,mastery,violet) + "x% mastery" 12 body) + softBtn("Continue path",130,{h:40})). JavaScript Core 58%, Databases 41%.
    - "Mock exam" muted card (cream, border): iconTile(44,creamDeep,'lock',faint,20,12) + col("Mock exams" 15 Semi Bold + "Unlock after more topics are covered" 12.5 body) + ghostBtn("Create quick mock",170,{h:42}).
  RIGHT col width 416 (gap20):
    - "Weak areas" card: header rowSB(title 16 Bold | tx "View all" 13 violet). 3 rows rowSB(col(topic 14 Semi Bold + subject 11.5 body) | row(severity pill + softBtn("Practice",90,{h:34,size:12}))). JavaScript events/High(amber); SQL joins/Medium(violet); Normalisation/Low(neutral). + ghostBtn("View all weaknesses",full,{h:42}).
    - "Study calendar" card: title 16 Bold + a vertical or horizontal mini timeline: Today(violet) / +2 Review / +5 First mock / Day 8 Exam(gold medal).
    - "Reminders" card: rowSB(row(iconTile bell violet + col("Daily reminder" 14 Semi Bold + "18:00 · On" 12 body)) | ghostBtn("Manage",96,{h:38})).
Size H to fit. (Web dashboards use the sideNav, NOT a bottom tab bar.)`},
]

phase('Mobile')
const mobile = SCREENS.filter(s => s.platform === 'Mobile')
const web = SCREENS.filter(s => s.platform === 'Web')

function prompt(s){
  return `${RULES}

=========================
YOUR SCREEN: ${s.name}
Frame name (use EXACTLY): "${s.name}"
Place root at x=${s.x}, y=${s.y}.  Readback node: name "${s.rbk}", id "${s.rbkId}".
=========================
${s.spec}

Remember: read the kit file, prepend it, top-level await loadFonts(), build top-level (NO IIFE), stamp the frame id into ${s.rbk}, get_metadata "${s.rbkId}" once to read the id, get_screenshot with enableBase64Response:true, then refine in place until it is polished and on-brand. Report the final node id and status.`
}

const mobileResults = await parallel(mobile.map(s => () => agent(prompt(s), { label: s.key, phase: 'Mobile' })))

phase('Web')
const webResults = await parallel(web.map(s => () => agent(prompt(s), { label: s.key, phase: 'Web' })))

return { mobile: mobileResults, web: webResults }

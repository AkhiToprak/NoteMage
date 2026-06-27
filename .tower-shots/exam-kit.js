// ============================================================================
// NoteMage Exam Mode — shared Figma build kit  (Plugin API, used inside use_figma)
// CRITICAL USAGE: paste this file's body, then `await loadFonts();`, then the screen
// build — ALL AS TOP-LEVEL STATEMENTS. Do NOT wrap in (async()=>{})(). The MCP commits
// the transaction synchronously; an async IIFE's writes land after commit and are LOST.
// Top-level await IS supported (the MCP wraps the code in an async fn and awaits it).
// Design language: cream/lavender bg, rounded cards, violet accents, gold for
// success/readiness, calm student feel. NO gradients. Font = Inter.
// ============================================================================
const F = "Inter";
function hx(h){h=h.replace('#','');return {r:parseInt(h.slice(0,2),16)/255,g:parseInt(h.slice(2,4),16)/255,b:parseInt(h.slice(4,6),16)/255};}
function solid(h,a){return {type:"SOLID",color:hx(h),opacity:a==null?1:a};}
function rgba(h,a){const c=hx(h);return {r:c.r,g:c.g,b:c.b,a:a==null?1:a};}
const C={
  cream:"#FAF7F0", creamDeep:"#F3EFE4", ink:"#18202F", ink2:"#28304180".slice(0,7), // fallback
  inkBody:"#5B6273", body:"#6B7280", sub:"#8A8F9A", faint:"#AEB2BC",
  violet:"#7C5CFF", violetDeep:"#4326B8", violetSoft:"#EDE9FF", violetSoft2:"#F4F1FF", violetLine:"#D9D0FF",
  gold:"#FFC83D", goldDeep:"#E0962B", goldSoft:"#FBEFCF", goldLine:"#F2D894",
  green:"#2FA968", greenSoft:"#E2F3EA",
  amber:"#E8913C", amberSoft:"#FBEBD8", amberLine:"#F3D2A6",
  coral:"#EF6351", coralSoft:"#FBE3DF",
  white:"#FFFFFF", border:"#ECE6D8", borderSoft:"#F1ECE0", line:"#E7E0D2", track:"#E9E2D4",
};
C.ink2="#283041";
function svg(s){return figma.createNodeFromSvg(s);}
const ICONS={
  chevronLeft:'<path d="M15 4.5 7.5 12 15 19.5" stroke="COLOR" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronRight:'<path d="M9 4.5 16.5 12 9 19.5" stroke="COLOR" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronDown:'<path d="M5 9 12 16 19 9" stroke="COLOR" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  plus:'<path d="M12 5v14M5 12h14" stroke="COLOR" stroke-width="2.2" stroke-linecap="round"/>',
  check:'<path d="M5 12.5 10 17.5 19 7" stroke="COLOR" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  clock:'<circle cx="12" cy="12" r="8.2" stroke="COLOR" stroke-width="1.8" fill="none"/><path d="M12 7.5V12l3 1.8" stroke="COLOR" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  calendar:'<rect x="3.8" y="5" width="16.4" height="15" rx="3" stroke="COLOR" stroke-width="1.8" fill="none"/><path d="M3.8 9.5h16.4M8 3.5v3M16 3.5v3" stroke="COLOR" stroke-width="1.8" stroke-linecap="round"/>',
  target:'<circle cx="12" cy="12" r="8.2" stroke="COLOR" stroke-width="1.8" fill="none"/><circle cx="12" cy="12" r="4.2" stroke="COLOR" stroke-width="1.8" fill="none"/><circle cx="12" cy="12" r="1.4" fill="COLOR"/>',
  flame:'<path d="M12 3c3 3.5 5.4 5.5 5.4 9.1A5.4 5.4 0 0 1 6.6 12.3C6.6 10.1 8 9.1 8.5 7.6c1.3 1 1.7 2.4 1.4 3.6C11 9.5 12 6.4 12 3Z" stroke="COLOR" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
  doc:'<path d="M6.5 3.5h7L18 8v12.5H6.5z" stroke="COLOR" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="M13 3.5V8h4.5M9 12.5h6M9 16h6" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  notes:'<path d="M6 4.5h12v15H6zM9 9h6M9 12.5h6M9 16h4" stroke="COLOR" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  image:'<rect x="3.8" y="5" width="16.4" height="14" rx="3" stroke="COLOR" stroke-width="1.7" fill="none"/><circle cx="9" cy="10" r="1.6" fill="COLOR"/><path d="M5 17l4.5-4 3 2.6L16 11l3.2 3.4" stroke="COLOR" stroke-width="1.7" fill="none" stroke-linejoin="round"/>',
  code:'<path d="M9 8.5 5.5 12 9 15.5M15 8.5 18.5 12 15 15.5M13.2 6.5l-2.4 11" stroke="COLOR" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  mic:'<rect x="9" y="3.5" width="6" height="11" rx="3" stroke="COLOR" stroke-width="1.8" fill="none"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke="COLOR" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  bolt:'<path d="M12.5 3 6 13h5l-1 8 7.5-11H12l.5-7Z" fill="COLOR"/>',
  chart:'<path d="M5 19V10M10 19V5M15 19v-6M20 19V8" stroke="COLOR" stroke-width="2" stroke-linecap="round"/>',
  bell:'<path d="M6.5 16.5c0-.8.4-1.2.8-1.8.5-.7.7-1.6.7-2.6V11a4 4 0 0 1 8 0v1.1c0 1 .2 1.9.7 2.6.4.6.8 1 .8 1.8H6.5Z" stroke="COLOR" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="M10 19a2 2 0 0 0 4 0" stroke="COLOR" stroke-width="1.7" fill="none"/>',
  list:'<path d="M9 7h10M9 12h10M9 17h10" stroke="COLOR" stroke-width="1.8" stroke-linecap="round"/><circle cx="5" cy="7" r="1.3" fill="COLOR"/><circle cx="5" cy="12" r="1.3" fill="COLOR"/><circle cx="5" cy="17" r="1.3" fill="COLOR"/>',
  shield:'<path d="M12 3.5 5.5 6v5c0 4 2.8 7 6.5 8.5C15.7 18 18.5 15 18.5 11V6L12 3.5Z" stroke="COLOR" stroke-width="1.7" fill="none" stroke-linejoin="round"/>',
  medal:'<circle cx="12" cy="14.5" r="5" stroke="COLOR" stroke-width="1.7" fill="none"/><path d="M9 9.5 7 3.5M15 9.5 17 3.5M10.2 14.6l1.2 1.2 2.4-2.6" stroke="COLOR" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  play:'<path d="M8 5.5 18 12 8 18.5Z" fill="COLOR"/>',
  sparkle:'<path d="M12 3l1.7 5.4L19 10l-5.3 1.6L12 17l-1.7-5.4L5 10l5.3-1.6Z" fill="COLOR"/>',
  pencil:'<path d="M14.5 5.5 18 9 9 18l-4 1 1-4 8.5-8.5Z" stroke="COLOR" stroke-width="1.7" fill="none" stroke-linejoin="round"/>',
  layers:'<path d="M12 4 3.5 8.5 12 13l8.5-4.5L12 4Z" stroke="COLOR" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M3.5 13 12 17.5 20.5 13" stroke="COLOR" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
  flask:'<path d="M10 3.5v5.2L5.6 17a2 2 0 0 0 1.8 3h9.2a2 2 0 0 0 1.8-3L14 8.7V3.5M8.5 3.5h7M8 13.7h8" stroke="COLOR" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  search:'<circle cx="11" cy="11" r="6.2" stroke="COLOR" stroke-width="1.9" fill="none"/><path d="M15.6 15.6 20 20" stroke="COLOR" stroke-width="1.9" stroke-linecap="round"/>',
  star:'<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8L12 3.5Z" fill="COLOR"/>',
  lock:'<rect x="5.5" y="10.5" width="13" height="9" rx="2.5" stroke="COLOR" stroke-width="1.7" fill="none"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="COLOR" stroke-width="1.7" fill="none"/>',
  alert:'<path d="M12 4 21 19.5H3L12 4Z" stroke="COLOR" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="M12 10v4" stroke="COLOR" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.7" r="1.15" fill="COLOR"/>',
  refresh:'<path d="M19.5 7.5a8 8 0 1 0 1.2 5.5" stroke="COLOR" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M19.5 3.5V8H15" stroke="COLOR" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  home:'<path d="M4 11 12 4l8 7M6.5 9.5V19h11V9.5" stroke="COLOR" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  user:'<circle cx="12" cy="8.5" r="3.6" stroke="COLOR" stroke-width="1.8" fill="none"/><path d="M5.5 19.5c1-3.4 3.6-5 6.5-5s5.5 1.6 6.5 5" stroke="COLOR" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  route:'<circle cx="6" cy="6" r="2.4" stroke="COLOR" stroke-width="1.8" fill="none"/><circle cx="18" cy="18" r="2.4" stroke="COLOR" stroke-width="1.8" fill="none"/><path d="M8.4 6H14a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h5.6" stroke="COLOR" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  brain:'<path d="M12 5.5a2.6 2.6 0 0 0-4.8 1.2A2.6 2.6 0 0 0 5.5 11a2.6 2.6 0 0 0 1.4 4.4A2.4 2.4 0 0 0 12 17m0-11.5a2.6 2.6 0 0 1 4.8 1.2A2.6 2.6 0 0 1 18.5 11a2.6 2.6 0 0 1-1.4 4.4A2.4 2.4 0 0 1 12 17m0-11.5V17" stroke="COLOR" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  grid:'<rect x="4" y="4" width="7" height="7" rx="2" stroke="COLOR" stroke-width="1.7" fill="none"/><rect x="13" y="4" width="7" height="7" rx="2" stroke="COLOR" stroke-width="1.7" fill="none"/><rect x="4" y="13" width="7" height="7" rx="2" stroke="COLOR" stroke-width="1.7" fill="none"/><rect x="13" y="13" width="7" height="7" rx="2" stroke="COLOR" stroke-width="1.7" fill="none"/>',
  dot:'<circle cx="12" cy="12" r="3" fill="COLOR"/>',
};
function icon(name,size,color){const p=ICONS[name]||ICONS.dot;return svg('<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'+p.replace(/COLOR/g,color)+'</svg>');}
async function loadFonts(){const styles=["Regular","Medium","Semi Bold","Bold","Extra Bold"];for(const s of styles){try{await figma.loadFontAsync({family:F,style:s});}catch(e){}}}
// ---- text ----
function tx(s,o){o=o||{};const t=figma.createText();t.fontName={family:F,style:o.style||"Regular"};t.characters=s;t.fontSize=o.size||14;t.fills=[solid(o.color||C.ink,o.alpha)];if(o.lh)t.lineHeight={value:o.lh,unit:"PIXELS"};if(o.ls!=null)t.letterSpacing={value:o.ls,unit:"PERCENT"};if(o.align)t.textAlignHorizontal=o.align;if(o.case)t.textCase=o.case;if(o.w){t.textAutoResize="HEIGHT";t.resize(o.w,t.height);}else{t.textAutoResize="WIDTH_AND_HEIGHT";}return t;}
// ---- auto-layout boxes ----
function box(dir,o){o=o||{};const f=figma.createFrame();f.layoutMode=dir;f.primaryAxisSizingMode="AUTO";f.counterAxisSizingMode="AUTO";f.itemSpacing=o.gap||0;f.paddingTop=o.pt!=null?o.pt:(o.py!=null?o.py:(o.pad||0));f.paddingBottom=o.pb!=null?o.pb:(o.py!=null?o.py:(o.pad||0));f.paddingLeft=o.pl!=null?o.pl:(o.px!=null?o.px:(o.pad||0));f.paddingRight=o.pr!=null?o.pr:(o.px!=null?o.px:(o.pad||0));f.fills=o.fill?[solid(o.fill,o.fillA)]:[];if(o.radius!=null)f.cornerRadius=o.radius;if(o.stroke){f.strokes=[solid(o.stroke,o.strokeA)];f.strokeWeight=o.sw||1;f.strokeAlign="INSIDE";}if(o.align)f.counterAxisAlignItems=o.align;if(o.justify)f.primaryAxisAlignItems=o.justify;if(o.name)f.name=o.name;if(o.clip!=null)f.clipsContent=o.clip;return f;}
function col(o){return box("VERTICAL",o);}
function row(o){return box("HORIZONTAL",o);}
// space-between row that fills its parent's width (use inside cards/sections)
function rowSB(o){o=o||{};const x=row(Object.assign({align:"CENTER"},o));x.primaryAxisAlignItems="SPACE_BETWEEN";x.layoutAlign="STRETCH";x.primaryAxisSizingMode="FIXED";return x;}
function fixW(f,w){f.counterAxisSizingMode="FIXED";f.resize(w,Math.max(f.height,1));f.primaryAxisSizingMode="AUTO";return f;}
function stretch(n){n.layoutAlign="STRETCH";return n;}
function grow(n){n.layoutGrow=1;return n;}
function add(p){for(var i=1;i<arguments.length;i++)if(arguments[i])p.appendChild(arguments[i]);return p;}
function place(p,n,x,y){p.appendChild(n);n.x=x;n.y=y;return n;}
// ---- effects ----
function shadowSoft(f,y,blur,a){f.effects=[{type:"DROP_SHADOW",color:rgba(C.ink,a==null?0.06:a),offset:{x:0,y:y==null?8:y},radius:blur==null?22:blur,spread:0,visible:true,blendMode:"NORMAL"}];return f;}
function shadowGlow(f,h,y,blur,a){f.effects=[{type:"DROP_SHADOW",color:rgba(h,a==null?0.28:a),offset:{x:0,y:y==null?10:y},radius:blur==null?26:blur,spread:0,visible:true,blendMode:"NORMAL"}];return f;}
function shadow2(f,h,a){f.effects=[{type:"DROP_SHADOW",color:rgba(C.ink,0.05),offset:{x:0,y:6},radius:18,spread:0,visible:true,blendMode:"NORMAL"},{type:"DROP_SHADOW",color:rgba(h,a==null?0.16:a),offset:{x:0,y:12},radius:28,spread:0,visible:true,blendMode:"NORMAL"}];return f;}
// ---- primitives ----
function tile(size,bg,node,radius){const t=row({fill:bg,radius:radius==null?13:radius});t.primaryAxisAlignItems="CENTER";t.counterAxisAlignItems="CENTER";t.primaryAxisSizingMode="FIXED";t.counterAxisSizingMode="FIXED";t.resize(size,size);if(node)t.appendChild(node);return t;}
function iconTile(size,bg,name,iconColor,iconSize,radius){return tile(size,bg,icon(name,iconSize||Math.round(size*0.52),iconColor),radius);}
function dotChip(label,dotColor,txtColor,size){const r=row({gap:6,align:"CENTER"});const d=figma.createEllipse();d.resize(7,7);d.fills=[solid(dotColor)];add(r,d,tx(label,{size:size||12.5,color:txtColor||C.body,style:"Medium"}));return r;}
function pill(label,bg,fg,o){o=o||{};const p=row({fill:bg,radius:o.radius==null?100:o.radius,px:o.px==null?10:o.px,py:o.py==null?5:o.py,gap:5,align:"CENTER"});if(o.stroke){p.strokes=[solid(o.stroke)];p.strokeWeight=1;p.strokeAlign="INSIDE";}if(o.icon)add(p,icon(o.icon,o.iconSize||13,o.iconColor||fg));add(p,tx(label,{size:o.size||11.5,color:fg,style:o.style||"Semi Bold",ls:o.ls}));return p;}
function bar(w,pct,colr,h,trackC){h=h||8;const t=figma.createFrame();t.resize(w,h);t.cornerRadius=h/2;t.fills=[solid(trackC||C.track)];t.clipsContent=true;t.name="bar";const f=figma.createFrame();f.resize(Math.max(h,Math.round(w*Math.max(0,Math.min(1,pct)))),h);f.cornerRadius=h/2;f.fills=[solid(colr)];place(t,f,0,0);return t;}
function ring(size,pct,colr,trackC,sw){sw=sw||7;const r=(size-sw)/2;const c=2*Math.PI*r;const off=c*(1-Math.max(0,Math.min(1,pct)));const s='<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'" xmlns="http://www.w3.org/2000/svg"><circle cx="'+(size/2)+'" cy="'+(size/2)+'" r="'+r+'" stroke="'+(trackC||C.track)+'" stroke-width="'+sw+'" fill="none"/><circle cx="'+(size/2)+'" cy="'+(size/2)+'" r="'+r+'" stroke="'+colr+'" stroke-width="'+sw+'" fill="none" stroke-linecap="round" stroke-dasharray="'+c+'" stroke-dashoffset="'+off+'" transform="rotate(-90 '+(size/2)+' '+(size/2)+')"/></svg>';return svg(s);}
function divider(w,c){const r=figma.createRectangle();r.resize(w,1);r.fills=[solid(c||C.border)];return r;}
// ---- buttons ----
function primaryBtn(label,w,o){o=o||{};const b=row({fill:o.bg||C.violet,radius:o.radius==null?15:o.radius,gap:8,align:"CENTER",justify:"CENTER"});b.primaryAxisSizingMode="FIXED";b.counterAxisSizingMode="FIXED";b.resize(w,o.h||52);if(o.icon)add(b,icon(o.icon,o.iconSize||18,o.fg||C.white));add(b,tx(label,{size:o.size||16,color:o.fg||C.white,style:"Semi Bold"}));shadowGlow(b,o.bg||C.violet,8,20,0.30);return b;}
function softBtn(label,w,o){o=o||{};const b=row({fill:o.bg||C.violetSoft,radius:o.radius==null?15:o.radius,gap:8,align:"CENTER",justify:"CENTER"});b.primaryAxisSizingMode="FIXED";b.counterAxisSizingMode="FIXED";b.resize(w,o.h||50);if(o.icon)add(b,icon(o.icon,o.iconSize||18,o.fg||C.violetDeep));add(b,tx(label,{size:o.size||15.5,color:o.fg||C.violetDeep,style:"Semi Bold"}));return b;}
function ghostBtn(label,w,o){o=o||{};const b=row({fill:C.white,radius:o.radius==null?15:o.radius,gap:8,align:"CENTER",justify:"CENTER",stroke:o.stroke||C.border,sw:1.4});b.primaryAxisSizingMode="FIXED";b.counterAxisSizingMode="FIXED";b.resize(w,o.h||50);if(o.icon)add(b,icon(o.icon,o.iconSize||18,o.fg||C.ink));add(b,tx(label,{size:o.size||15.5,color:o.fg||C.ink2,style:"Semi Bold"}));return b;}
// ---- mascot / logo (reuse real image fills from _assets) ----
function imgHash(names){for(const nm of names){const n=figma.currentPage.findOne(x=>x.name===nm&&x.fills&&x.fills.find&&x.fills.find(p=>p.type==="IMAGE"));if(n){const f=n.fills.find(p=>p.type==="IMAGE");if(f)return f.imageHash;}}return null;}
const MASC={def:["A:default","mascot:default"],think:["A:thinking"],wink:["A:wink"],wand:["A:wand","A:holding-wand"],scroll:["A:scroll"],point:["A:pointing","A:pointing-right"],quiz:["A:quizzing"],grad:["A:graduation"]};
function mascot(size,kind){const h=imgHash((MASC[kind]||MASC.def).concat(["A:default","mascot:default"]));const r=figma.createRectangle();r.resize(size,size);r.cornerRadius=Math.round(size*0.18);if(h){r.fills=[{type:"IMAGE",imageHash:h,scaleMode:"FILL"}];}else{r.fills=[solid(C.violetSoft)];}r.name="mascot:"+(kind||"def");return r;}
function logo(w){const h=imgHash(["mascot:logo","logo","A:logo"]);const r=figma.createRectangle();const hh=Math.round(w*0.47);r.resize(w,hh);if(h){r.fills=[{type:"IMAGE",imageHash:h,scaleMode:"FIT"}];}else{r.fills=[solid(C.violetSoft)];}r.name="logo";return r;}
// ---- mobile chrome ----
function statusBar(w){const f=figma.createFrame();f.name="statusbar";f.resize(w||393,52);f.fills=[];f.layoutMode="NONE";const t=tx("9:41",{size:15,color:C.ink,style:"Semi Bold"});place(f,t,24,18);const cl=svg('<svg width="66" height="14" viewBox="0 0 66 14" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="8" width="3" height="6" rx="1" fill="#18202F"/><rect x="5" y="6" width="3" height="8" rx="1" fill="#18202F"/><rect x="10" y="3.5" width="3" height="10.5" rx="1" fill="#18202F"/><rect x="15" y="1" width="3" height="13" rx="1" fill="#18202F"/><path d="M23 5.6c3-2.5 8-2.5 11 0" stroke="#18202F" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M25 8.1c1.9-1.6 5.1-1.6 7 0" stroke="#18202F" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="28.5" cy="10.6" r="1.25" fill="#18202F"/><rect x="40" y="3" width="22" height="11" rx="3.2" fill="none" stroke="#18202F" stroke-width="1.2" opacity="0.45"/><rect x="42" y="5" width="16" height="7" rx="1.6" fill="#18202F"/><rect x="63.2" y="6" width="2" height="5" rx="1" fill="#18202F" opacity="0.45"/></svg>');place(f,cl,(w||393)-24-66,19);return f;}
function homeIndicator(parent,w,y){const r=figma.createRectangle();r.resize(134,5);r.cornerRadius=3;r.fills=[solid(C.ink,0.85)];place(parent,r,((w||393)-134)/2,y);return r;}
function backBtn(){const b=tile(40,C.white,icon("chevronLeft",20,C.ink2),12);b.strokes=[solid(C.border)];b.strokeWeight=1;b.strokeAlign="INSIDE";return b;}
// segmented progress (wizard): segs filled count
function segProgress(w,total,done){const r=row({gap:6});r.primaryAxisSizingMode="FIXED";r.counterAxisSizingMode="AUTO";r.resize(w,6);const seg=(w-(total-1)*6)/total;for(let i=0;i<total;i++){const s=figma.createRectangle();s.resize(seg,6);s.cornerRadius=3;s.fills=[solid(i<done?C.violet:C.track)];add(r,s);}return r;}
// mage speech bubble row
function mageBubble(text,w,kind){const r=row({gap:10,align:"CENTER"});const av=tile(40,C.violetSoft,null,12);av.appendChild(mascot(30,kind||"wand"));const b=row({fill:C.white,radius:14,px:14,py:11,stroke:C.borderSoft,sw:1});shadowSoft(b,4,12,0.05);add(b,tx(text,{size:13.5,color:C.ink2,style:"Medium",w:w-40-10-28,lh:18}));add(r,av,b);b.layoutGrow=1;r.counterAxisSizingMode="AUTO";r.primaryAxisSizingMode="FIXED";r.resize(w,Math.max(r.height,1));return r;}
// bottom nav (mobile): items=[{icon,label}], active idx
function bottomNav(w,items,active){const f=figma.createFrame();f.name="bottomnav";f.layoutMode="HORIZONTAL";f.primaryAxisAlignItems="SPACE_BETWEEN";f.counterAxisAlignItems="CENTER";f.primaryAxisSizingMode="FIXED";f.counterAxisSizingMode="FIXED";f.resize(w||393,84);f.paddingLeft=14;f.paddingRight=14;f.paddingTop=12;f.paddingBottom=26;f.fills=[solid(C.white)];f.strokes=[solid(C.border)];f.strokeTopWeight=1;f.strokeBottomWeight=0;f.strokeLeftWeight=0;f.strokeRightWeight=0;f.strokeAlign="INSIDE";f.effects=[{type:"DROP_SHADOW",color:rgba(C.ink,0.05),offset:{x:0,y:-4},radius:16,spread:0,visible:true,blendMode:"NORMAL"}];items.forEach((it,i)=>{const c=col({gap:4,align:"CENTER"});c.primaryAxisAlignItems="CENTER";add(c,icon(it.icon,23,i===active?C.violet:C.faint),tx(it.label,{size:10,color:i===active?C.violet:C.faint,style:i===active?"Semi Bold":"Medium"}));add(f,c);});return f;}
function sectionLabel(text){return tx(text,{size:12.5,color:C.sub,style:"Semi Bold",ls:3,case:"UPPER"});}
function statCol(num,label){const c=col({gap:3,align:"CENTER"});add(c,tx(num,{size:22,color:C.ink,style:"Extra Bold"}),tx(label,{size:11.5,color:C.body,style:"Medium"}));return c;}
// generic card
function card(w,o){o=o||{};const c=col({fill:o.fill||C.white,radius:o.radius==null?20:o.radius,pad:o.pad==null?18:o.pad,gap:o.gap==null?12:o.gap,stroke:o.stroke||C.borderSoft,sw:o.sw||1});fixW(c,w);if(o.glow){shadow2(c,o.glow);}else{shadowSoft(c,o.sy==null?8:o.sy,o.sb==null?22:o.sb,o.sa);}return c;}
// ---- spacers / grow (handy for all layouts) ----
function vspace(h){const f=figma.createFrame();f.fills=[];f.primaryAxisSizingMode="FIXED";f.counterAxisSizingMode="FIXED";f.resize(1,h);return f;}
function hspace(w){const f=figma.createFrame();f.fills=[];f.primaryAxisSizingMode="FIXED";f.counterAxisSizingMode="FIXED";f.resize(w,1);return f;}
function vgrow(){const f=col({});f.fills=[];f.layoutAlign="STRETCH";f.layoutGrow=1;return f;}
function hgrow(){const f=row({});f.fills=[];f.layoutGrow=1;return f;}
// ---- web desktop chrome ----
// Left sidebar (248px). nav items: Dashboard/Exams/Paths/Progress. active idx (1=Exams).
function sideNav(h,active){const W=248,IW=W-44;const s=col({fill:C.white,pad:22,gap:6,name:"sidenav"});s.primaryAxisSizingMode="FIXED";s.counterAxisSizingMode="FIXED";s.resize(W,h);s.strokes=[solid(C.border)];s.strokeAlign="INSIDE";s.strokeRightWeight=1;s.strokeTopWeight=0;s.strokeLeftWeight=0;s.strokeBottomWeight=0;const lg=logo(146);add(s,lg,vspace(10));const items=[{i:'home',l:'Dashboard'},{i:'target',l:'Exams'},{i:'route',l:'Paths'},{i:'chart',l:'Progress'}];items.forEach((it,idx)=>{const on=idx===active;const r=row({gap:12,align:"CENTER",radius:12,px:12,py:11});stretch(r);if(on){r.fills=[solid(C.violetSoft)];}add(r,icon(it.i,21,on?C.violetDeep:C.body),tx(it.l,{size:14.5,color:on?C.violetDeep:C.inkBody,style:on?"Semi Bold":"Medium"}));add(s,r);});add(s,vgrow());const am=col({fill:C.violetSoft2,radius:16,pad:14,gap:9});stretch(am);const amt=row({gap:9,align:"CENTER"});const av=tile(36,C.white,null,11);av.appendChild(mascot(28,'wand'));add(amt,av,tx("Ask Mage",{size:13.5,color:C.ink,style:"Bold"}));add(am,amt,tx("Stuck? Mage explains with your own sources.",{size:11.5,color:C.body,w:IW-28,lh:15}),softBtn("Ask Mage",IW-28,{h:38,size:13}));add(s,am);return s;}
// Web page header: big title + subtitle (left), optional CTA node (right). Returns a fixed-width SPACE_BETWEEN row.
function webHeader(w,title,sub,cta){const r=row({align:"CENTER"});r.primaryAxisAlignItems="SPACE_BETWEEN";const l=col({gap:8});add(l,tx(title,{size:34,color:C.ink,style:"Extra Bold",ls:-2}));if(sub)add(l,tx(sub,{size:15,color:C.body,style:"Regular",w:Math.min(w-280,620),lh:22}));add(r,l);if(cta)add(r,cta);r.counterAxisSizingMode="AUTO";r.primaryAxisSizingMode="FIXED";r.resize(w,Math.max(r.height,1));return r;}
// ---- exam-mode extras (added for iteration 2) ----
// iOS-style switch. on=boolean.
function toggle(on){const f=figma.createFrame();f.name="toggle";f.resize(46,28);f.cornerRadius=14;f.fills=[solid(on?C.violet:C.track)];f.layoutMode="NONE";const k=figma.createEllipse();k.resize(22,22);k.fills=[solid(C.white)];k.effects=[{type:"DROP_SHADOW",color:rgba(C.ink,0.18),offset:{x:0,y:1},radius:3,spread:0,visible:true,blendMode:"NORMAL"}];place(f,k,on?21:3,3);return f;}
// filter/selectable chip. on=selected.
function chip(label,on,o){o=o||{};return pill(label,on?C.violet:C.white,on?C.white:C.ink2,{stroke:on?undefined:C.border,px:o.px||14,py:o.py||9,size:o.size||13,radius:o.radius==null?11:o.radius,icon:o.icon,iconColor:on?C.white:(o.iconColor||C.violet),iconSize:o.iconSize});}
// severity badge. level: urgent|practice|almost (or high|medium|low). Coral reserved for urgent/high only.
function severityPill(level){const m={urgent:[C.coralSoft,C.coral,"Urgent"],practice:[C.amberSoft,C.amber,"Needs practice"],almost:[C.greenSoft,C.green,"Almost fixed"],high:[C.coralSoft,C.coral,"High"],medium:[C.amberSoft,C.amber,"Medium"],low:[C.greenSoft,C.green,"Low"]};const a=m[level]||m.practice;return pill(a[2],a[0],a[1],{size:11.5});}
// glowing medallion (celebration). returns a NONE frame size×size with a gold disc + icon + glow.
function medallion(size,iconName){const f=figma.createFrame();f.name="medallion";f.resize(size,size);f.fills=[];f.layoutMode="NONE";f.clipsContent=false;const disc=figma.createEllipse();disc.resize(size,size);disc.fills=[solid(C.gold)];disc.strokes=[solid(C.white)];disc.strokeWeight=Math.max(3,size*0.04);disc.strokeAlign="INSIDE";disc.effects=[{type:"DROP_SHADOW",color:rgba(C.gold,0.45),offset:{x:0,y:8},radius:size*0.45,spread:0,visible:true,blendMode:"NORMAL"}];place(f,disc,0,0);const ic=icon(iconName||"medal",size*0.5,C.white);place(f,ic,(size-size*0.5)/2,(size-size*0.5)/2);return f;}
// ROOT (mobile/web): NONE layout, cream fill
function root(name,w,h){const f=figma.createFrame();f.name=name;f.resize(w,h);f.fills=[solid(C.cream)];f.layoutMode="NONE";f.clipsContent=true;f.cornerRadius=0;return f;}

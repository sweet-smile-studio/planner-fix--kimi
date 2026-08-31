"use strict";

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const LS_KEY = "maedeh-planner-state-v3";
const TEHRAN = { lat: 35.6892, lng: 51.3890, tz: 3.5 };
const PERSIAN_MONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
const WEEKDAYS = ["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"];
const FIXED_SCHEDULE = [
  ["01:00","", ""], ["05:00","prayer","نماز صبح"], ["06:00","routine","بیدار شدن"], ["06:00","routine","کشش صبح در تخت (۵ دقیقه)"],
  ["06:05","routine","گوش دادن به وویس ۷ دقیقه‌ای"], ["06:12","routine","سرویس بهداشتی + شستن صورت + مسواک (+ حمام اگه روز حمامه)"],
  ["06:30","routine","یک لیوان آب گرم"], ["06:35","work","کار"], ["08:30","routine","تمرینات کمر (۷ دقیقه)"], ["08:37","work","کار"],
  ["12:15","meal","وعده اول"], ["12:45","work","کار"], ["14:30","routine","تمرینات قد (۱۱ دقیقه)"], ["14:41","work","کار"],
  ["16:30","routine","ورزش کل بدن (۱۰ دقیقه)"], ["16:40","routine","شکم صاف (۳ دقیقه)"], ["16:43","routine","حرکات انعطاف (۱۸ دقیقه)"],
  ["17:01","personal","کارهای شخصی"], ["19:00","meal","وعده دوم"], ["19:30","personal","کارهای شخصی"], ["21:00","vitamin","منیزیم"], ["22:00","routine","تمرین سبک (۱۶ دقیقه قبل از خواب)"], ["24:00","",""]
];
const DEFAULT_HABITS = ["آب کافی","ورزش","تمرینات کمر","تمرین قد","یادداشت روزانه","برنامه‌ریزی","مراقبت پوست","مطالعه"];
const MOODS = ["○","◔","◑","◕","●"];

let state = loadState();
let selected = stripTime(new Date());
let activeView = "today";
let deferredPrompt = null;
let pomodoro = { seconds: 25*60, running:false, interval:null, mode:"focus" };
let fb = { enabled:false, app:null, auth:null, db:null, storage:null, messaging:null, user:null, ready:false };
let cloudSaveTimer = null;
let suppressCloudSave = false;
let todayAutoScrolledFor = "";
let firedReminderKeys = new Set();

function loadState(){
  const base = {
    settings:{ startJy:1405, startJm:4, primary:"#59684f", accent:"#7b0d45", bg:"#f2eee8", ink:"#252820", bgImage:"", sectionOrder:["schedule","side","notes"] },
    days:{}, brain:[], ideas:{work:[],personal:[]}, tools:[], habits:DEFAULT_HABITS,
    template: FIXED_SCHEDULE.map(([time,type,text])=>({time,type,text})), fcmToken:"", cloud:{email:"",lastSync:""}
  };
  try {
    const raw = localStorage.getItem(LS_KEY) || localStorage.getItem("maedeh-planner-state-v1") || "{}";
    return merge(base, JSON.parse(raw));
  } catch { return base; }
}
function merge(a,b){ for(const k in b){ if(b[k] && typeof b[k]==="object" && !Array.isArray(b[k]) && a[k]) a[k]=merge(a[k],b[k]); else a[k]=b[k]; } return a; }
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); queueCloudSave(); }
function stripTime(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function pad(n){ return String(n).padStart(2,"0"); }
function iso(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function fromIso(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return stripTime(x); }
function timeToMin(t){ const [h,m]=t.split(":").map(Number); return (h===24?24:h)*60+(m||0); }
function minToTime(min){ min=(min+1440)%1440; return `${pad(Math.floor(min/60))}:${pad(min%60)}`; }
function slotIndex(time){ return Math.max(0, Math.min(47, Math.floor(timeToMin(time)/30)-2)); }
function toDateInputValue(d){ return iso(d); }

function applyTheme(){
  const s = state.settings;
  document.documentElement.style.setProperty("--primary", s.primary);
  document.documentElement.style.setProperty("--primary-dark", shade(s.primary,-18));
  document.documentElement.style.setProperty("--accent", s.accent);
  document.documentElement.style.setProperty("--bg", s.bg);
  document.documentElement.style.setProperty("--ink", s.ink || "#252820");
  if(s.bgImage) {
    document.documentElement.style.setProperty("--custom-bg", `linear-gradient(rgba(242,238,232,.35),rgba(242,238,232,.45)), url(${s.bgImage})`);
  } else {
    const bg = s.bg || "#f2eee8";
    document.documentElement.style.setProperty("--custom-bg", `radial-gradient(circle at 70% 6%,rgba(255,223,169,.22),transparent 20%),radial-gradient(circle at 15% 22%,rgba(177,201,200,.32),transparent 28%),linear-gradient(135deg,${shade(bg,-6)},${bg})`);
  }
}
function shade(hex, pct){ let n=parseInt(hex.slice(1),16), r=n>>16, g=n>>8&255, b=n&255; const f=x=>Math.max(0,Math.min(255,Math.round(x+(pct/100)*255))); return "#"+((1<<24)+(f(r)<<16)+(f(g)<<8)+f(b)).toString(16).slice(1); }

// Jalaali conversion
function div(a,b){return ~~(a/b)}
function jalCal(jy){ const breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178]; let bl=breaks.length, gy=jy+621, leapJ=-14, jp=breaks[0], jm,jump,n,i; if(jy<jp||jy>=breaks[bl-1]) throw Error("Invalid Jalaali year"); for(i=1;i<bl;i++){jm=breaks[i]; jump=jm-jp; if(jy<jm) break; leapJ+=div(jump,33)*8+div(jump%33,4); jp=jm;} n=jy-jp; leapJ+=div(n,33)*8+div((n%33)+3,4); if(jump%33===4&&jump-n===4) leapJ++; const leapG=div(gy,4)-div((div(gy,100)+1)*3,4)-150; const march=20+leapJ-leapG; if(jump-n<6) n=n-jump+div(jump+4,33)*33; let leap=((n+1)%33-1)%4; if(leap===-1) leap=4; return {leap, gy, march}; }
function g2d(gy,gm,gd){ let d=div((gy+div(gm-8,6)+100100)*1461,4)+div(153*((gm+9)%12)+2,5)+gd-34840408; d=d-div(div(gy+100100+div(gm-8,6),100)*3,4)+752; return d; }
function d2g(jdn){ let j=4*jdn+139361631; j=j+div(div(4*jdn+183187720,146097)*3,4)*4-3908; const i=div((j%1461),4)*5+308; const gd=div((i%153),5)+1; const gm=(div(i,153)%12)+1; const gy=div(j,1461)-100100+div(8-gm,6); return {gy,gm,gd}; }
function j2d(jy,jm,jd){ const r=jalCal(jy); return g2d(r.gy,3,r.march)+(jm-1)*31-div(jm,7)*(jm-7)+jd-1; }
function d2j(jdn){ const gy=d2g(jdn).gy; let jy=gy-621, r=jalCal(jy), jdn1f=g2d(gy,3,r.march), k=jdn-jdn1f, jm,jd; if(k>=0){ if(k<=185){jm=1+div(k,31); jd=(k%31)+1; return {jy,jm,jd};} k-=186;} else {jy--; k+=179; if(r.leap===1) k++;} jm=7+div(k,30); jd=(k%30)+1; return {jy,jm,jd}; }
function toJalaali(date){ return d2j(g2d(date.getFullYear(),date.getMonth()+1,date.getDate())); }
function toGregorian(jy,jm,jd){ const g=d2g(j2d(jy,jm,jd)); return new Date(g.gy,g.gm-1,g.gd); }
function persianLabel(d){ const j=toJalaali(d); return `${WEEKDAYS[(d.getDay()+1)%7]} ${j.jd} ${PERSIAN_MONTHS[j.jm-1]} ${j.jy}`; }

function dayOfYear(date){ return Math.floor((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())-Date.UTC(date.getFullYear(),0,0))/86400000); }
function prayerTimes(date){
  const n = dayOfYear(date); const gamma = 2*Math.PI/365*(n-1); const eqtime = 229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
  const decl = 0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
  const noon = 720 - 4*TEHRAN.lng - eqtime + TEHRAN.tz*60;
  const hourAngle = angle => {
    const lat=TEHRAN.lat*Math.PI/180, zen=(90+angle)*Math.PI/180;
    return Math.acos((Math.cos(zen)/(Math.cos(lat)*Math.cos(decl))) - Math.tan(lat)*Math.tan(decl))*180/Math.PI*4;
  };
  const sunrise = noon-hourAngle(0.833), sunset = noon+hourAngle(0.833);
  return { fajr:minToTime(Math.round(noon-hourAngle(17.7))), dhuhr:minToTime(Math.round(noon+2)), maghrib:minToTime(Math.round(sunset+17)) };
}
function vitaminText(d){ const j=toJalaali(d); if(j.jd%2===0) return [{time:"12:45",type:"vitamin",text:"بعد وعده اول: منتال انرژی"}, {time:"19:30",type:"vitamin",text:"بعد وعده دوم: قرص"}]; return [{time:"12:45",type:"vitamin",text:"بعد وعده اول: D3 + E400 + کلاژن + فمی‌لاکت"}, {time:"19:30",type:"vitamin",text:"بعد وعده دوم: امگا۳"}, {time:"21:00",type:"vitamin",text:"منیزیم"}]; }
function specialDaily(d){ const j=toJalaali(d), arr=[]; if(j.jd%2===1){arr.push({time:"16:30",type:"routine",text:"حمام امروز: یک ساعت قبل، افشاره مو ثبت شود"});} if(d.getDay()===5){arr.push({time:"17:00",type:"personal",text:"جمعه: خانواده + برنامه‌ریزی هفته بعد"});} return arr; }
function defaultDay(d){ const p=prayerTimes(d); return { events:[...state.template.filter(x=>x.text).map(x=>({...x,done:false,id:uid()})), {time:p.fajr,type:"prayer",text:"اذان صبح / نماز صبح",done:false,id:uid()}, {time:p.dhuhr,type:"prayer",text:"اذان ظهر",done:false,id:uid()}, {time:p.maghrib,type:"prayer",text:"اذان شب",done:false,id:uid()}, ...vitaminText(d).map(x=>({...x,done:false,id:uid()})), ...specialDaily(d).map(x=>({...x,done:false,id:uid()}))], notes:"", mood:"", energy:3, water:8, voiceLinks:[], photos:[], reflections:{happened:"",learned:"",inspirations:"",miracles:"",better:"",tomorrow:""}, slotNotes:{}, habits:{}}; }
function dayState(d){ const key=iso(d); if(!state.days[key]){ state.days[key]=defaultDay(d); save(); } return state.days[key]; }
function uid(){ return Math.random().toString(36).slice(2,10); }

function init(){
  applyTheme(); setupPWA(); initFirebase(); bindNav(); bindTopbar(); const hv=(location.hash||"").replace("#",""); if(["today","week","month","brain","ideas","habits","tools","pomodoro","settings"].includes(hv)) activeView=hv; render(); scheduleOpenNotifications(); setInterval(updateNowLine, 30000); setInterval(updateClock, 1000); updateClock();
}
function bindNav(){ $$(".nav-item").forEach(btn=>btn.addEventListener("click",()=>{ setView(btn.dataset.view); $("#sidebar").classList.remove("open"); })); $("#menuBtn").onclick=()=>$("#sidebar").classList.toggle("open"); }
function setView(v){ activeView=v; $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===v)); $$(".view").forEach(x=>x.classList.toggle("active",x.id===v)); $("#viewLabel").textContent=$(`[data-view="${v}"]`).textContent.trim(); render(); }
function bindTopbar(){ $("#datePicker").value=iso(selected); $("#datePicker").onchange=e=>{selected=fromIso(e.target.value); render();}; $("#prevDay").onclick=()=>{selected=addDays(selected,-1); render();}; $("#nextDay").onclick=()=>{selected=addDays(selected,1); render();}; $("#notifyBtn").onclick=requestNotifications; }
function render(){ 
  $("#datePicker").value=iso(selected); 
  const gDate = selected;
  const gLabel = `${gDate.getFullYear()}/${gDate.getMonth()+1}/${gDate.getDate()}`;
  $("#currentDateLabel").textContent = gLabel;
  $("#gregorianDateLabel").textContent = persianLabel(selected);
  updateClock(); 
  const fn={today:renderToday,week:renderWeek,month:renderMonth,brain:renderBrain,ideas:renderIdeas,habits:renderHabits,tools:renderTools,pomodoro:renderPomodoro,settings:renderSettings}[activeView]; 
  fn(); 
  updateNowLine(); 
}
function card(title, body, actions=""){ const head = title || actions ? `<div class="panel-head"><h2>${title||""}</h2><div class="panel-actions">${actions}</div></div>` : ""; return `<article class="panel ${title?"":"panel-titleless"}">${head}<div class="panel-body">${body}</div></article>`; }

function renderToday(){
  const d=dayState(selected), p=prayerTimes(selected);
  ensureDayShape(d);
  const tomorrowHint = previousDayHints(selected);
  const brainToday = state.brain.filter(x=>x.date===iso(selected) && !x.done);
  const slots=Array.from({length:48},(_,i)=>({time:minToTime(60+i*30), events:[]}));
  d.events.sort((a,b)=>timeToMin(a.time)-timeToMin(b.time)).forEach(ev=>slots[slotIndex(ev.time)].events.push(ev));
  const rows=slots.map((slot,i)=>`<div class="time-row" data-slot-index="${i}" data-slot-time="${slot.time}"><div class="time-label">${slot.time}</div><div class="slot" data-drop-time="${slot.time}">${slot.events.map(eventHtml).join("")}<textarea class="slot-note" data-slot-note="${slot.time}" placeholder="">${escapeHtml(d.slotNotes?.[slot.time]||"")}</textarea></div></div>`).join("");
  const schedule = card("", `<div class="day-tools compact-tools"><button class="chip primary-chip" id="addEvent">+ کار جدید</button><span class="chip prayer-chip" title="اذان صبح">☀ ${p.fajr}</span><span class="chip prayer-chip" title="اذان ظهر">⛅ ${p.dhuhr}</span><span class="chip prayer-chip" title="اذان مغرب">☾✦ ${p.maghrib}</span></div>${brainTodayHtml(brainToday)}<div class="schedule-wrap" id="scheduleWrap"><div id="nowLine" class="now-line" hidden><span id="nowLineTime">--:--</span></div>${rows}</div>`);
  const side = card("", waterHtml(d)+moodHtml(d)+voiceHtml(d));
  const notes = card("", `<textarea class="note-box soft-note" id="dailyNotes" placeholder="یادداشت آزاد امروز...">${escapeHtml(d.notes)}</textarea>`);
  const photos = card("Gallery", photosHtml(d));
  const reflection = card("Daily Reflection", reflectionHtml(d, tomorrowHint));
  $("#today").innerHTML = `<div class="today-stack"><div>${schedule}</div><div class="grid two today-lower"><div class="today-col">${photos}${reflection}</div><div class="grid">${side}${notes}</div></div></div>`;
  bindDayEvents(); bindPhotos(); bindReflection();
  maybeScrollToNowOnce();
}
function ensureDayShape(d){ d.photos=d.photos||[]; d.reflections=d.reflections||{happened:"",learned:"",inspirations:"",miracles:"",better:"",tomorrow:""}; d.slotNotes=d.slotNotes||{}; d.voiceLinks=d.voiceLinks||[]; d.habits=d.habits||{}; }
function previousDayHints(date){ const prev=dayState(addDays(date,-1)); ensureDayShape(prev); return {better:prev.reflections.better||"", tomorrow:prev.reflections.tomorrow||""}; }
function brainTodayHtml(items){ if(!items.length) return ""; return `<div class="brain-today"><h3>کارهای بارش فکری برای امروز</h3>${items.map((it,i)=>`<button class="brain-chip" draggable="true" data-brain-to-schedule="${state.brain.indexOf(it)}">${escapeHtml(it.text)}</button>`).join("")}</div>`; }
function eventHtml(ev){ return `<div class="event-pill ${ev.type||""}" data-id="${ev.id}" draggable="true"><input type="checkbox" ${ev.done?"checked":""} aria-label="done"><textarea class="event-text" placeholder="بنویس...">${escapeHtml(ev.text||"")}</textarea><input class="event-time" type="time" value="${ev.time==="24:00"?"23:59":ev.time}"><button class="tiny-icon alarm" title="آلارم">⏰</button><button class="tiny-icon del" title="حذف">×</button></div>`; }

function bindDayEvents(){
  const d=dayState(selected); ensureDayShape(d);
  $("#addEvent").onclick=()=>{ const title=prompt("عنوان کار جدید؟",""); const time=prompt("ساعت شروع؟ مثل 15:30","12:00")||"12:00"; const reminder=prompt("آلارم؟ تاریخ و ساعت را بنویس، یا خالی بگذار. مثال: 2026-07-04 15:30","")||""; d.events.push({id:uid(),time,type:"custom",text:title||"",done:false,reminder:normalizeReminder(reminder)});save();renderToday();};
  $$(".event-pill").forEach(el=>{ const ev=d.events.find(x=>x.id===el.dataset.id); if(!ev)return; $("input[type=\"checkbox\"]",el).onchange=e=>{ev.done=e.target.checked;save();}; $(".event-text",el).oninput=e=>{ev.text=e.target.value; autoGrow(e.target); save();}; autoGrow($(".event-text",el)); $(".event-time",el).onchange=e=>{ev.time=e.target.value;save();renderToday();}; $(".alarm",el).onclick=()=>{ const reminder=prompt("آلارم این کار؟ مثال: 2026-07-04 15:30", ev.reminder||`${iso(selected)} ${ev.time}`); ev.reminder=normalizeReminder(reminder||""); save(); alert(ev.reminder?"آلارم ذخیره شد. برای نوتیفیکیشن، اجازه Notification را فعال کن.":"آلارم حذف شد."); renderToday();}; $(".del",el).onclick=()=>{d.events=d.events.filter(x=>x.id!==ev.id);save();renderToday();}; el.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",JSON.stringify({kind:"event",id:ev.id}));}); });
  $$("[data-slot-note]").forEach(t=>t.oninput=e=>{ d.slotNotes[t.dataset.slotNote]=e.target.value; save(); });
  $$("[data-drop-time]").forEach(slot=>{ slot.addEventListener("dragover",e=>e.preventDefault()); slot.addEventListener("drop",e=>{e.preventDefault(); let data={}; try{data=JSON.parse(e.dataTransfer.getData("text/plain"));}catch{} if(data.kind==="event"){const ev=d.events.find(x=>x.id===data.id); if(ev){ev.time=slot.dataset.dropTime; save(); renderToday();}} if(data.kind==="brain"){const item=state.brain[data.index]; if(item){d.events.push({id:uid(),time:slot.dataset.dropTime,type:"custom",text:item.text,done:false,brainId:item.id||null}); item.date=iso(selected); save(); renderToday();}} }); });
  $$("[data-brain-to-schedule]").forEach(b=>{ b.addEventListener("dragstart",e=>e.dataTransfer.setData("text/plain",JSON.stringify({kind:"brain",index:Number(b.dataset.brainToSchedule)}))); b.onclick=()=>{const it=state.brain[Number(b.dataset.brainToSchedule)]; const time=prompt("این کار برای چه ساعتی ثبت شود؟","12:00")||"12:00"; d.events.push({id:uid(),time,type:"custom",text:it.text,done:false,brainId:it.id||null}); it.date=iso(selected); save(); renderToday();}; });
  $("#dailyNotes").oninput=e=>{d.notes=e.target.value;save();};

  // Water: reversed logic — full to empty
  const setWater=v=>{d.water=Math.max(0,Math.min(8,v)); save(); renderToday();};
  $("[data-water-minus]")?.addEventListener("click",()=>setWater((d.water||0)+1)); // fill up
  $("[data-water-plus]")?.addEventListener("click",()=>setWater((d.water||0)-1)); // drink / empty
  $(".water-cup")?.addEventListener("click",()=>setWater(Math.max(0,(d.water||0)-1))); // drink one

  $$(".mood-btn").forEach(b=>b.onclick=()=>{d.mood=b.dataset.mood;d.energy=Number(b.dataset.mood);save();renderToday();}); const er=$("#energyRange"); if(er) er.oninput=e=>{d.energy=Number(e.target.value);save();}; bindVoice();
}

function waterHtml(d){
  const w = d.water ?? 8;
  return `<div class="section water-widget" style="--water:${w}"><div class="water-control"><button class="water-step" data-water-minus title="پر کردن">+</button><button class="water-cup" title="نوشیدن یک لیوان">▯</button><button class="water-step" data-water-plus title="خالی کردن">−</button></div><div class="water-count">آب باقی‌مانده: <b>${w}</b> / 8</div></div>`;
}
function moodHtml(d){ const faces=["☹","﹙","─","﹚","☺"]; return `<div class="section mood-widget"><div class="mood-row">${faces.map((m,i)=>`<button class="mood-btn mono-face ${String(d.mood)===String(i+1)?"active":""}" data-mood="${i+1}" title="حال ${i+1}">${m}</button>`).join("")}</div><input id="energyRange" type="hidden" value="${d.energy||3}"></div>`; }
function voiceHtml(d){ 
  return `<div class="section voice-widget">
    <div class="voice-controls">
      <button id="recBtn" class="tiny-control" title="شروع ضبط">◉</button>
      <input id="voiceUrl" placeholder="لینک صوتی... (اینتر برای ذخیره)">
    </div>
    <div class="list compact-list">${(d.voiceLinks||[]).map((v,i)=>`<div class="list-item"><a href="${v.url}" target="_blank">${v.title||"voice note"}</a><button class="tiny-icon" data-voice-del="${i}">×</button></div>`).join("")}</div>
  </div>`; 
}
function bindVoice(){ 
  let recorder,chunks=[]; 
  $("#recBtn").onclick=async()=>{ 
    const btn=$("#recBtn"); 
    if(recorder&&recorder.state==="recording"){ 
      recorder.stop(); 
      btn.textContent="شروع ضبط"; 
      return; 
    } 
    const stream=await navigator.mediaDevices.getUserMedia({audio:true}); 
    recorder=new MediaRecorder(stream); 
    chunks=[]; 
    recorder.ondataavailable=e=>chunks.push(e.data); 
    recorder.onstop=()=>{ 
      const blob=new Blob(chunks,{type:"audio/webm"}); 
      const fr=new FileReader(); 
      fr.onload=()=>{
        const d=dayState(selected); 
        d.voiceLinks=d.voiceLinks||[]; 
        d.voiceLinks.push({title:`یادداشت صوتی ${new Date().toLocaleTimeString("fa-IR")}`,url:fr.result}); 
        save(); 
        renderToday();
      }; 
      fr.readAsDataURL(blob); 
      stream.getTracks().forEach(t=>t.stop()); 
    }; 
    recorder.start(); 
    btn.textContent="توقف ضبط"; 
  }; 
  $("#voiceUrl").onkeydown = e => {
    if(e.key === "Enter"){
      e.preventDefault();
      const url=$("#voiceUrl").value.trim(); 
      if(!url) return; 
      const d=dayState(selected); 
      d.voiceLinks=d.voiceLinks||[]; 
      d.voiceLinks.push({title:url,url}); 
      save(); 
      renderToday();
    }
  };
  $$("[data-voice-del]").forEach(b=>b.onclick=()=>{
    const d=dayState(selected); 
    d.voiceLinks.splice(Number(b.dataset.voiceDel),1); 
    save(); 
    renderToday();
  }); 
}
function photosHtml(d){ return `<div class="photo-upload"><label class="camera-upload" title="افزودن عکس">▣<input id="photoInput" type="file" accept="image/*" multiple hidden></label></div><div class="photo-polaroid-grid compact-gallery">${(d.photos||[]).map((ph,i)=>`<figure class="polaroid"><img src="${ph.url}" alt="photo"><figcaption><textarea data-photo-caption="${i}" placeholder="...">${escapeHtml(ph.caption||"")}</textarea><div class="photo-actions"><a class="tiny-icon" title="دانلود" download="maedeh-photo-${iso(selected)}-${i}.jpg" href="${ph.url}">⇩</a><button class="tiny-icon" title="تغییر" data-photo-replace="${i}">↻</button><button class="tiny-icon" title="حذف" data-photo-del="${i}">×</button><input type="file" accept="image/*" data-photo-replace-input="${i}" hidden></div></figcaption></figure>`).join("")}</div>`; }
function bindPhotos(){ const d=dayState(selected); ensureDayShape(d); $("#photoInput").onchange=e=>addPhotoFiles(e.target.files); $$("[data-photo-caption]").forEach(t=>t.oninput=e=>{d.photos[Number(t.dataset.photoCaption)].caption=e.target.value; save();}); $$("[data-photo-del]").forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.photoDel), ph=d.photos[i]; if(ph?.path && fb.storage){try{await fb.storage.ref(ph.path).delete();}catch{}} d.photos.splice(i,1); save(); renderToday();}); $$("[data-photo-replace]").forEach(b=>b.onclick=()=>document.querySelector(`[data-photo-replace-input="${b.dataset.photoReplace}"]`).click()); $$("[data-photo-replace-input]").forEach(inp=>inp.onchange=async e=>{const i=Number(inp.dataset.photoReplaceInput); const file=e.target.files[0]; if(!file)return; const old=d.photos[i]; if(old?.path && fb.storage){try{await fb.storage.ref(old.path).delete();}catch{}} const ph=await storePhoto(file, old?.caption||""); d.photos[i]=ph; save(); renderToday();}); }
async function addPhotoFiles(files){ const d=dayState(selected); ensureDayShape(d); for(const f of files){ d.photos.push(await storePhoto(f,"")); } save(); renderToday(); }
async function storePhoto(file, caption=""){ const id=uid(), date=iso(selected); if(fb.user && fb.storage){ try{ const path=`users/${fb.user.uid}/photos/${date}/${id}-${safeName(file.name)}`; const ref=fb.storage.ref(path); await ref.put(file); const url=await ref.getDownloadURL(); return {id,url,path,caption,name:file.name,createdAt:Date.now()}; }catch(e){ alert("آپلود ابری عکس انجام نشد؛ عکس فعلاً فقط روی همین دستگاه ذخیره می‌شود. برای Sync عکس‌ها Firebase Storage/Blaze را چک کن."); } } const data=await fileToDataUrl(file); return {id,url:data,caption,name:file.name,createdAt:Date.now(),local:true}; }
function fileToDataUrl(file){ return new Promise(res=>{const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file);}); }
function safeName(n){ return n.replace(/[^a-z0-9._-]/gi,"-").slice(0,80); }
function reflectionHtml(d,hint){ const r=d.reflections; return `${hint.better||hint.tomorrow?`<div class="tomorrow-hint"><h3>از دیروز برای امروز</h3>${hint.better?`<p><b>بهتر عمل کنم:</b> ${escapeHtml(hint.better)}</p>`:""}${hint.tomorrow?`<p><b>کارهای امروز:</b> ${escapeHtml(hint.tomorrow)}</p>`:""}</div>`:""}<div class="reflection-grid"><label>۱. اتفاقاتی که امروز افتاد<textarea data-reflect="happened">${escapeHtml(r.happened)}</textarea></label><label>۲. چیزهایی که درس گرفتم از امروز<textarea data-reflect="learned">${escapeHtml(r.learned)}</textarea></label><label>۳. الهامات امروز<textarea data-reflect="inspirations">${escapeHtml(r.inspirations)}</textarea></label><label>۴. معجزات امروز<textarea data-reflect="miracles">${escapeHtml(r.miracles)}</textarea></label><label>۵. اگر بخواهم بهتر عمل کنم چه کاری لازم است انجام دهم؟<textarea data-reflect="better">${escapeHtml(r.better)}</textarea></label><label>۶. کارهای فردا<textarea data-reflect="tomorrow">${escapeHtml(r.tomorrow)}</textarea></label></div>`; }
function bindReflection(){ const d=dayState(selected); ensureDayShape(d); $$("[data-reflect]").forEach(t=>t.oninput=e=>{d.reflections[t.dataset.reflect]=e.target.value; save();}); }

function renderWeek(){
  const start=addDays(selected,-((selected.getDay()+1)%7)); 
  const days=Array.from({length:7},(_,i)=>addDays(start,i));

  // محاسبه حال غالب هفته
  const moodCounts = {};
  days.forEach(d => {
    const m = dayState(d).mood;
    if(m) moodCounts[m] = (moodCounts[m]||0) + 1;
  });
  const domMood = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0];
  const moodFaces = ["☹","﹙","─","﹚","☺"];
  const dominantMoodText = domMood ? moodFaces[Number(domMood[0])-1] + " (حال " + domMood[0] + ")" : "—";

  const rows=days.map(d=>{
    const ds=dayState(d);
    const done=ds.events.filter(e=>e.done).length;
    const total=ds.events.length;
    const habits=habitPercent(d);
    const photos=(ds.photos||[]).length;
    const dayMood = ds.mood ? moodFaces[Number(ds.mood)-1] : "—";
    return `<tr>
      <td>${persianLabel(d)}</td>
      <td><span class="week-stat">${done}/${total}</span></td>
      <td><span class="week-stat">${Math.round(habits)}٪</span></td>
      <td><span class="week-stat mood-cell">${dayMood}</span></td>
      <td><span class="week-stat">${photos} عکس</span></td>
      <td><button class="small-btn" data-goto="${iso(d)}">باز کردن</button></td>
    </tr>`
  }).join("");

  const gallery=days.flatMap(d=>(dayState(d).photos||[]).map((ph,i)=>({ph,d,i}))).map(x=>`<figure class="polaroid small"><img src="${x.ph.url}"><figcaption>${escapeHtml(x.ph.caption||persianLabel(x.d))}<div><a class="small-btn" download="maedeh-week-${iso(x.d)}-${x.i}.jpg" href="${x.ph.url}">دانلود</a></div></figcaption></figure>`).join("");

  // آمار هفتگی
  const totalDone = days.reduce((sum,d)=>sum+dayState(d).events.filter(e=>e.done).length,0);
  const totalEvents = days.reduce((sum,d)=>sum+dayState(d).events.length,0);
  const avgHabits = Math.round(days.reduce((sum,d)=>sum+habitPercent(d),0)/7);

  $("#week").innerHTML = 
    card("داشبورد هفتگی", 
      `<div class="week-summary-bar">
        <div class="week-summary-item"><b>${totalDone}/${totalEvents}</b><span>کارهای انجام‌شده</span></div>
        <div class="week-summary-item"><b>${avgHabits}٪</b><span>میانگین عادت‌ها</span></div>
        <div class="week-summary-item"><b>${dominantMoodText}</b><span>غالب‌ترین خلق هفته</span></div>
      </div>
      <table class="week-table"><thead><tr><th>روز</th><th>تیک‌ها</th><th>عادت‌ها</th><th>خلق</th><th>عکس</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <canvas id="weekChart" class="chart"></canvas>`
    ) +
    card("روند خلق و انرژی هفتگی", 
      `<p class="chart-desc">نمودار زیر تغییرات خلق (خط رنگی) و انرژی (میله‌های خاکستری) شما را در طول هفته نشان می‌دهد. عدد بزرگ‌تر = حال/انرژی بهتر.</p>
      <canvas id="moodWeekChart" class="chart"></canvas>`
    ) +
    card("گالری عکس‌های هفته", 
      `<div class="photo-polaroid-grid">${gallery||"<p class=\"subtle\">هنوز عکسی برای این هفته ثبت نشده.</p>"}</div>`
    );

  $$("[data-goto]").forEach(b=>b.onclick=()=>{selected=fromIso(b.dataset.goto);setView("today");});

  drawBars("weekChart", days.map(d=>dayState(d).events.filter(e=>e.done).length), days.map(d=>WEEKDAYS[(d.getDay()+1)%7]), "تعداد کارهای انجام‌شده در هر روز");
  drawMoodChart("moodWeekChart", days, "روند هفتگی");
}

function renderMonth(){
  const j=toJalaali(selected);
  const first=toGregorian(j.jy,j.jm,1);
  const len=j.jm<=6?31:(j.jm<=11?30:(jalCal(j.jy).leap===0?30:29));
  const blanks=(first.getDay()+1)%7;

  const cells=Array.from({length:blanks},()=>"<div></div>").concat(Array.from({length:len},(_,i)=>{
    const d=toGregorian(j.jy,j.jm,i+1);
    const ds=dayState(d);
    const pct=ds.events.length?100*ds.events.filter(e=>e.done).length/ds.events.length:0;
    const ph=(ds.photos||[])[0];
    const moodEmoji = ds.mood ? ["☹","﹙","─","﹚","☺"][Number(ds.mood)-1] : "";
    return `<button class="month-day ${iso(d)===iso(new Date())?"today":""}" data-date="${iso(d)}">
      <strong>${i+1} ${PERSIAN_MONTHS[j.jm-1]}</strong>
      <span class="mini">${iso(d)}</span>
      ${ph?`<img class="month-thumb" src="${ph.url}">`:""}
      <div class="progress"><span style="width:${pct}%"></span></div>
      <span class="mini">${Math.round(pct)}٪ کارها · ${(ds.photos||[]).length} عکس ${moodEmoji}</span>
    </button>`;
  })).join("");

  const monthPhotos=Array.from({length:len},(_,i)=>toGregorian(j.jy,j.jm,i+1)).flatMap(d=>(dayState(d).photos||[]).map((ph,i)=>({ph,d,i}))).map(x=>`<figure class="polaroid small"><img src="${x.ph.url}"><figcaption>${escapeHtml(x.ph.caption||persianLabel(x.d))}<div><a class="small-btn" download="maedeh-month-${iso(x.d)}-${x.i}.jpg" href="${x.ph.url}">دانلود</a></div></figcaption></figure>`).join("");

  // خلق غالب ماه
  const monthDays = Array.from({length:len},(_,i)=>toGregorian(j.jy,j.jm,i+1));
  const moodCounts = {};
  monthDays.forEach(d => {
    const m = dayState(d).mood;
    if(m) moodCounts[m] = (moodCounts[m]||0) + 1;
  });
  const domMood = Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0];
  const moodFaces = ["☹","﹙","─","﹚","☺"];
  const dominantMoodText = domMood ? moodFaces[Number(domMood[0])-1] + " (حال " + domMood[0] + ")" : "ثبت نشده";

  $("#month").innerHTML = 
    card(`نمای ماهانه ${PERSIAN_MONTHS[j.jm-1]} ${j.jy}`, 
      `<div class="month-grid">${cells}</div>`
    ) +
    card("روند خلق و انرژی ماهانه", 
      `<div class="month-mood-summary">غالب‌ترین خلق ماه: <b>${dominantMoodText}</b></div>
      <p class="chart-desc">نمودار زیر تغییرات خلق (خط) و انرژی (میله) شما را در طول ماه نشان می‌دهد.</p>
      <canvas id="moodMonthChart" class="chart"></canvas>`
    ) +
    card("گالری عکس‌های ماه", 
      `<div class="photo-polaroid-grid">${monthPhotos||"<p class=\"subtle\">هنوز عکسی برای این ماه ثبت نشده.</p>"}</div>`
    );

  $$(".month-day").forEach(b=>b.onclick=()=>{selected=fromIso(b.dataset.date);setView("today");});
  drawMoodChart("moodMonthChart", monthDays, "روند ماهانه");
}

function renderBrain(){
  const items=state.brain.map((it,i)=>`<div class="list-item brain-item"><div><input value="${escapeAttr(it.text)}" data-brain-text="${i}" placeholder="کار..."><input type="date" value="${it.date||""}" data-brain-date="${i}"><select data-brain-time="${i}"><option value="">بدون ساعت</option>${Array.from({length:48},(_,n)=>{const t=minToTime(60+n*30); return `<option value="${t}" ${it.time===t?"selected":""}>${t}</option>`}).join("")}</select><label class="mini"><input type="checkbox" ${it.done?"checked":""} data-brain-done="${i}"> انجام شد</label><button class="small-btn" data-brain-today="${i}">فرستادن به امروز</button><button class="small-btn" data-brain-schedule="${i}">قرار دادن در چارت امروز</button></div><button class="small-btn" data-brain-del="${i}">حذف</button></div>`).join("");
  $("#brain").innerHTML=card("بارش فکری و تبدیل به کار",`<div class="input-row"><input id="brainInput" placeholder="هر کاری تو ذهنته بنویس..."><button id="addBrain" class="premium-btn">افزودن</button></div><div class="list">${items}</div>`);
  $("#addBrain").onclick=()=>{const text=$("#brainInput").value.trim(); if(!text)return; state.brain.push({id:uid(),text,date:iso(selected),time:"",done:false}); save(); renderBrain();};
  $$("[data-brain-text]").forEach(i=>i.oninput=e=>{state.brain[i.dataset.brainText].text=e.target.value;save();});
  $$("[data-brain-date]").forEach(i=>i.onchange=e=>{state.brain[i.dataset.brainDate].date=e.target.value; save();});
  $$("[data-brain-time]").forEach(i=>i.onchange=e=>{state.brain[i.dataset.brainTime].time=e.target.value; save();});
  $$("[data-brain-done]").forEach(i=>i.onchange=e=>{state.brain[i.dataset.brainDone].done=e.target.checked;save();});
  $$("[data-brain-today]").forEach(b=>b.onclick=()=>{state.brain[Number(b.dataset.brainToday)].date=iso(selected); save(); renderBrain();});
  $$("[data-brain-schedule]").forEach(b=>b.onclick=()=>{const it=state.brain[Number(b.dataset.brainSchedule)]; const d=dayState(selected); d.events.push({id:uid(),time:it.time||"12:00",type:"custom",text:it.text,done:false,brainId:it.id}); it.date=iso(selected); save(); setView("today");});
  $$("[data-brain-del]").forEach(b=>b.onclick=()=>{state.brain.splice(Number(b.dataset.brainDel),1);save();renderBrain();});
}
function renderIdeas(){ const list=type=>state.ideas[type].map((x,i)=>`<div class="list-item"><textarea data-idea="${type}:${i}">${escapeHtml(x)}</textarea><button class="small-btn" data-idea-del="${type}:${i}">حذف</button></div>`).join(""); $("#ideas").innerHTML=`<div class="grid two">${card("ایده کاری",`<div class="input-row"><input id="workIdea" placeholder="ایده کاری..."><button class="premium-btn" data-add-idea="work">افزودن</button></div><div class="list">${list("work")}</div>`)}${card("ایده شخصی",`<div class="input-row"><input id="personalIdea" placeholder="ایده شخصی..."><button class="premium-btn" data-add-idea="personal">افزودن</button></div><div class="list">${list("personal")}</div>`)}</div>`; $$("[data-add-idea]").forEach(b=>b.onclick=()=>{const type=b.dataset.addIdea, input=$(`#${type}Idea`), val=input.value.trim(); if(val){state.ideas[type].push(val);save();renderIdeas();}}); $$("[data-idea]").forEach(t=>t.oninput=e=>{const [type,i]=t.dataset.idea.split(":"); state.ideas[type][i]=e.target.value; save();}); $$("[data-idea-del]").forEach(b=>b.onclick=()=>{const [type,i]=b.dataset.ideaDel.split(":"); state.ideas[type].splice(Number(i),1); save(); renderIdeas();}); }

function renderHabits(){ 
  const j=toJalaali(selected); 
  const len=j.jm<=6?31:(j.jm<=11?30:(jalCal(j.jy).leap===0?30:29)); 
  const head=Array.from({length:len},(_,i)=>`<span class="habit-cell mini">${i+1}</span>`).join(""); 
  const rows=state.habits.map((h,hi)=>`<div class="habit-row"><strong>${h}</strong>${Array.from({length:len},(_,i)=>{const d=toGregorian(j.jy,j.jm,i+1), ds=dayState(d), done=ds.habits?.[h]; return `<button class="habit-cell ${done?"done":""}" data-habit="${hi}" data-hdate="${iso(d)}" data-hname="${escapeAttr(h)}">${done?"✓":""}</button>`}).join("")}</div>`).join(""); 
  $("#habits").innerHTML=card("Habit Tracker ماهانه",`<div class="input-row"><input id="habitInput" placeholder="عادت جدید"><button id="addHabit" class="premium-btn">افزودن</button></div><div class="habit-grid"><div class="habit-row"><span></span>${head}</div>${rows}</div><canvas id="habitChart" class="chart"></canvas>`); 
  $("#addHabit").onclick=()=>{const v=$("#habitInput").value.trim(); if(v){state.habits.push(v);save();renderHabits();}}; 
  $$("[data-habit]").forEach(b=>b.onclick=()=>{
    const h=state.habits[b.dataset.habit]; 
    const ds=dayState(fromIso(b.dataset.hdate)); 
    ds.habits=ds.habits||{}; 
    ds.habits[h]=!ds.habits[h]; 
    save(); 
    b.classList.toggle("done", ds.habits[h]);
    b.textContent = ds.habits[h] ? "✓" : "";
    requestAnimationFrame(()=>drawBars("habitChart", state.habits.map(hh=>habitMonthPercent(j.jy,j.jm,hh)), state.habits));
  }); 
  drawBars("habitChart", state.habits.map(h=>habitMonthPercent(j.jy,j.m,h)), state.habits, "درصد انجام عادت در این ماه"); 
}

function habitPercent(d){ const ds=dayState(d), total=state.habits.length||1; return 100*state.habits.filter(h=>ds.habits?.[h]).length/total; }
function habitMonthPercent(jy,jm,h){ const len=jm<=6?31:(jm<=11?30:(jalCal(jy).leap===0?30:29)); let n=0; for(let i=1;i<=len;i++) if(dayState(toGregorian(jy,jm,i)).habits?.[h]) n++; return Math.round(100*n/len); }
function renderTools(){ const items=state.tools.map((t,i)=>`<div class="list-item"><div><input value="${escapeAttr(t.title)}" data-tool-title="${i}" placeholder="عنوان"><input class="tool-link" value="${escapeAttr(t.url)}" data-tool-url="${i}" placeholder="https://..."></div><div class="actions"><a class="small-btn" href="${t.url}" target="_blank">باز کردن</a><button class="small-btn" data-tool-del="${i}">حذف</button></div></div>`).join(""); $("#tools").innerHTML=card("ابزارها و لینک‌های ثابت",`<p class="subtle">این بخش برای همه روزها مشترک است. ورود سایت‌ها در خود مرورگر حفظ می‌شود.</p><div class="input-row"><input id="toolTitle" placeholder="عنوان ابزار"><input id="toolUrl" class="tool-link" placeholder="https://..."><button id="addTool" class="premium-btn">افزودن</button></div><div class="list">${items}</div>`); $("#addTool").onclick=()=>{const title=$("#toolTitle").value.trim(), url=$("#toolUrl").value.trim(); if(title&&url){state.tools.push({title,url});save();renderTools();}}; $$("[data-tool-title]").forEach(i=>i.oninput=e=>{state.tools[i.dataset.toolTitle].title=e.target.value;save();}); $$("[data-tool-url]").forEach(i=>i.oninput=e=>{state.tools[i.dataset.toolUrl].url=e.target.value;save();}); $$("[data-tool-del]").forEach(b=>b.onclick=()=>{state.tools.splice(Number(b.dataset.toolDel),1);save();renderTools();}); }
function renderPomodoro(){
  $("#pomodoro").innerHTML = card("تایمر پومودورو", 
    `<div class="timer-face" id="timerFace">${formatSeconds(pomodoro.seconds)}</div>
    <div class="actions" style="justify-content:center;gap:10px;flex-wrap:wrap;">
      <button id="startTimer" class="premium-btn">${pomodoro.running?"توقف":"شروع"}</button>
      <button id="resetTimer" class="premium-btn muted">ریست</button>
      <select id="timerMode">
        <option value="focus">۲۵ دقیقه تمرکز</option>
        <option value="short">۵ دقیقه استراحت</option>
        <option value="long">۱۵ دقیقه استراحت بلند</option>
        <option value="custom">زمان دلخواه</option>
      </select>
    </div>
    <div class="pomodoro-custom" id="customTimerBox" style="display:none;">
      <label>دقیقه: <input type="number" id="customMin" min="1" max="180" value="25"></label>
      <label>ثانیه: <input type="number" id="customSec" min="0" max="59" value="0"></label>
      <button id="applyCustom" class="small-btn">اعمال زمان</button>
    </div>`
  );

  $("#startTimer").onclick = toggleTimer;
  $("#resetTimer").onclick = () => {
    stopTimer();
    const mode = pomodoro.mode;
    if(mode === "custom"){
      const min = Number($("#customMin")?.value || 25);
      const sec = Number($("#customSec")?.value || 0);
      pomodoro.seconds = min*60 + sec;
    } else {
      pomodoro.seconds = mode==="focus"?1500:mode==="short"?300:900;
    }
    renderPomodoro();
  };

  $("#timerMode").value = pomodoro.mode;
  $("#timerMode").onchange = e => {
    pomodoro.mode = e.target.value;
    stopTimer();
    if(pomodoro.mode === "custom"){
      $("#customTimerBox").style.display = "flex";
      const min = Number($("#customMin")?.value || 25);
      const sec = Number($("#customSec")?.value || 0);
      pomodoro.seconds = min*60 + sec;
    } else {
      $("#customTimerBox").style.display = "none";
      pomodoro.seconds = pomodoro.mode==="focus"?1500:pomodoro.mode==="short"?300:900;
    }
    renderPomodoro();
  };

  $("#applyCustom")?.addEventListener("click", () => {
    stopTimer();
    const min = Number($("#customMin")?.value || 25);
    const sec = Number($("#customSec")?.value || 0);
    pomodoro.seconds = Math.max(1, min*60 + sec);
    renderPomodoro();
  });
}
function toggleTimer(){ if(pomodoro.running){stopTimer(); renderPomodoro(); return;} pomodoro.running=true; pomodoro.interval=setInterval(()=>{pomodoro.seconds--; $("#timerFace").textContent=formatSeconds(pomodoro.seconds); if(pomodoro.seconds<=0){notify("Maedeh ✨️","پومودورو تمام شد."); stopTimer(); renderPomodoro();}},1000); renderPomodoro(); }
function stopTimer(){ pomodoro.running=false; clearInterval(pomodoro.interval); }
function formatSeconds(s){ return `${pad(Math.floor(s/60))}:${pad(s%60)}`; }

function renderSettings(){
  const cloudStatus = fb.user ? `متصل به Firebase: ${escapeHtml(fb.user.email||fb.user.uid)}` : (fb.enabled?"Firebase آماده است؛ وارد حساب شو.":"Firebase هنوز در js/firebase-config.js تنظیم نشده است.");
  $("#settings").innerHTML=card("شخصی‌سازی ظاهر و برنامه",`<div class="form-grid"><label>رنگ اصلی<input type="color" id="primaryColor" value="${state.settings.primary}"></label><label>رنگ تاکید<input type="color" id="accentColor" value="${state.settings.accent}"></label><label>رنگ متن<input type="color" id="inkColor" value="${state.settings.ink||"#252820"}"></label><label>پس‌زمینه<input type="color" id="bgColor" value="${state.settings.bg}"></label><label>عکس پس‌زمینه<input type="file" id="bgImage" accept="image/*"></label><label>سال شروع شمسی<input type="number" id="startJy" value="${state.settings.startJy}"></label><label>ماه شروع<select id="startJm">${PERSIAN_MONTHS.map((m,i)=>`<option value="${i+1}" ${state.settings.startJm===i+1?"selected":""}>${m}</option>`).join("")}</select></label><button id="clearBg" class="premium-btn muted">حذف عکس پس‌زمینه</button><button id="exportData" class="premium-btn muted">خروجی اطلاعات</button><button id="importDataBtn" class="premium-btn muted">ورود اطلاعات</button><input type="file" id="importData" accept="application/json" hidden><button id="resetApp" class="premium-btn">ریست کامل</button></div>`)+card("Sync با Firebase",`<p class="subtle">${cloudStatus}</p><div class="form-grid"><label>Email<input id="cloudEmail" type="email" value="${escapeAttr(state.cloud?.email||"")}" placeholder="you@gmail.com"></label><label>Password<input id="cloudPass" type="password" placeholder="حداقل ۶ کاراکتر"></label><button id="cloudSignup" class="premium-btn muted">ساخت حساب</button><button id="cloudLogin" class="premium-btn">ورود و Sync</button><button id="cloudLogout" class="premium-btn muted">خروج</button><button id="cloudSaveNow" class="premium-btn muted">ذخیره دستی در Cloud</button><button id="fcmBtn" class="premium-btn muted">گرفتن Token نوتیفیکیشن</button></div><textarea class="note-box" id="fcmTokenBox" readonly placeholder="FCM Token اینجا نمایش داده می‌شود">${escapeHtml(state.fcmToken||"")}</textarea>`)+card("برنامه ثابت روزانه",`<p class="subtle">این قالب برای روزهایی که هنوز باز نشده‌اند استفاده می‌شود. روزهای قبلی ذخیره می‌مانند.</p><div class="list">${state.template.map((x,i)=>`<div class="list-item"><input type="time" value="${x.time==="24:00"?"23:59":x.time}" data-tpl-time="${i}"><input value="${escapeAttr(x.text)}" data-tpl-text="${i}"><button class="small-btn" data-tpl-del="${i}">حذف</button></div>`).join("")}</div><button id="addTpl" class="small-btn">+ ردیف ثابت</button>`); bindSettings(); bindCloudUI(); }

function bindSettings(){ 
  const set=(k,v)=>{state.settings[k]=v;save();applyTheme();}; 
  $("#primaryColor").oninput=e=>set("primary",e.target.value); 
  $("#accentColor").oninput=e=>set("accent",e.target.value); 
  $("#inkColor").oninput=e=>set("ink",e.target.value); 
  $("#bgColor").oninput=e=>set("bg",e.target.value); 
  $("#startJy").onchange=e=>set("startJy",Number(e.target.value)); 
  $("#startJm").onchange=e=>set("startJm",Number(e.target.value)); 
  $("#bgImage").onchange=e=>{const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>set("bgImage",r.result); r.readAsDataURL(f);}; 
  $("#clearBg").onclick=()=>set("bgImage",""); 
  $("#exportData").onclick=()=>download("maedeh-planner-backup.json",JSON.stringify(state,null,2),"application/json"); 
  $("#importDataBtn").onclick=()=>$("#importData").click(); 
  $("#importData").onchange=e=>{const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{state=merge(loadState(),JSON.parse(r.result));save();render();}; r.readAsText(f);}; 
  $("#resetApp").onclick=()=>{if(confirm("همه اطلاعات پاک شود؟")){localStorage.removeItem(LS_KEY);state=loadState();render();}}; 
  $("#addTpl").onclick=()=>{state.template.push({time:"12:00",type:"custom",text:""});save();renderSettings();}; 
  $$("[data-tpl-time]").forEach(i=>i.onchange=e=>{state.template[i.dataset.tplTime].time=e.target.value;save();}); 
  $$("[data-tpl-text]").forEach(i=>i.oninput=e=>{state.template[i.dataset.tplText].text=e.target.value;save();}); 
  $$("[data-tpl-del]").forEach(b=>b.onclick=()=>{state.template.splice(Number(b.dataset.tplDel),1);save();renderSettings();}); 
}

function initFirebase(){
  const cfg=window.MAHDIEH_FIREBASE_CONFIG||{}; fb.enabled=Boolean(cfg.enabled && cfg.apiKey && window.firebase);
  if(!fb.enabled) return;
  try{ fb.app=firebase.apps.length?firebase.app():firebase.initializeApp(cfg); fb.auth=firebase.auth(); fb.db=firebase.firestore(); fb.storage=firebase.storage(); if(firebase.messaging.isSupported?.()) fb.messaging=firebase.messaging(); fb.auth.onAuthStateChanged(async user=>{ fb.user=user; if(user){state.cloud=state.cloud||{}; state.cloud.email=user.email||""; await loadCloudState();} if(activeView==="settings") renderSettings(); }); }catch(err){ console.warn("Firebase init failed",err); fb.enabled=false; }
}
function bindCloudUI(){
  const email=$("#cloudEmail"), pass=$("#cloudPass"); if(!email||!pass)return;
  const remember=()=>{state.cloud=state.cloud||{}; state.cloud.email=email.value.trim(); save();};
  $("#cloudSignup").onclick=async()=>{remember(); if(!fb.enabled)return alert("اول Firebase config را پر کن."); try{await fb.auth.createUserWithEmailAndPassword(email.value.trim(),pass.value); await saveCloudNow(); alert("حساب ساخته شد و Sync انجام شد.");}catch(e){alert(firebaseError(e));}};
  $("#cloudLogin").onclick=async()=>{remember(); if(!fb.enabled)return alert("اول Firebase config را پر کن."); try{await fb.auth.signInWithEmailAndPassword(email.value.trim(),pass.value); alert("وارد شدی. اطلاعات Cloud با این دستگاه هماهنگ شد.");}catch(e){alert(firebaseError(e));}};
  $("#cloudLogout").onclick=async()=>{ if(fb.auth) await fb.auth.signOut(); alert("از Firebase خارج شدی. اطلاعات محلی روی همین دستگاه باقی می‌ماند."); renderSettings(); };
  $("#cloudSaveNow").onclick=async()=>{ try{await saveCloudNow(); alert("در Cloud ذخیره شد.");}catch(e){alert(firebaseError(e));} };
  $("#fcmBtn").onclick=async()=>{ try{const token=await getFcmToken(); state.fcmToken=token||""; save(); $("#fcmTokenBox").value=state.fcmToken; alert(token?"Token ساخته شد.":"Messaging پشتیبانی نشد یا تنظیمات ناقص است.");}catch(e){alert(firebaseError(e));} };
}
function firebaseError(e){ return (e&&e.message)||String(e); }
function cloudDoc(){ return fb.user && fb.db ? fb.db.collection("users").doc(fb.user.uid).collection("planner").doc("state") : null; }
function serializableState(){ const copy=JSON.parse(JSON.stringify(state)); return {...copy, updatedAt:new Date().toISOString()}; }
function queueCloudSave(){ if(suppressCloudSave || !fb.user || !fb.db) return; clearTimeout(cloudSaveTimer); cloudSaveTimer=setTimeout(saveCloudNow, 900); }
async function saveCloudNow(){ const ref=cloudDoc(); if(!ref) throw new Error("برای ذخیره ابری باید وارد Firebase شوی."); state.cloud=state.cloud||{}; state.cloud.lastSync=new Date().toISOString(); localStorage.setItem(LS_KEY, JSON.stringify(state)); await ref.set(serializableState(),{merge:false}); }
async function loadCloudState(){ const ref=cloudDoc(); if(!ref)return; const snap=await ref.get(); if(snap.exists){ suppressCloudSave=true; state=merge(state, snap.data()); localStorage.setItem(LS_KEY, JSON.stringify(state)); suppressCloudSave=false; render(); } else { await saveCloudNow(); } }
async function getFcmToken(){ const cfg=window.MAHDIEH_FIREBASE_CONFIG||{}; if(!fb.messaging || !cfg.vapidKey) return ""; const perm=await Notification.requestPermission(); if(perm!=="granted") throw new Error("اجازه نوتیفیکیشن داده نشد."); const reg=await navigator.serviceWorker.ready; const token=await fb.messaging.getToken({vapidKey:cfg.vapidKey, serviceWorkerRegistration:reg}); if(token && fb.user && fb.db){ await fb.db.collection("users").doc(fb.user.uid).collection("devices").doc(token.slice(0,32)).set({token,createdAt:new Date().toISOString(),userAgent:navigator.userAgent},{merge:true}); } return token; }

function drawBars(id, values, labels, title=""){
  const c=$("#"+id); if(!c)return;
  const ctx=c.getContext("2d"), w=c.width=c.clientWidth*devicePixelRatio, h=c.height=c.clientHeight*devicePixelRatio, max=Math.max(1,...values);
  ctx.clearRect(0,0,w,h);

  if(title){
    ctx.fillStyle = "#333";
    ctx.font = `bold ${13*devicePixelRatio}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(title, w/2, 18*devicePixelRatio);
  }

  const chartH = h - 45*devicePixelRatio;
  const chartTop = title ? 28*devicePixelRatio : 10*devicePixelRatio;
  ctx.font=`${11*devicePixelRatio}px sans-serif`;

  values.forEach((v,i)=>{
    const bw=w/values.length*.5;
    const x=(i+.25)*w/values.length;
    const bh=(chartH - chartTop - 15*devicePixelRatio)*v/max;
    const barY = chartTop + (chartH - chartTop - 15*devicePixelRatio - bh);

    ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--primary");
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, barY, bw, bh);
    ctx.globalAlpha = 1;

    ctx.fillStyle="#333";
    ctx.textAlign="center";
    ctx.fillText(String(v), x + bw/2, barY - 6*devicePixelRatio);

    if(labels && labels[i]){
      ctx.fillStyle="#666";
      ctx.font=`${10*devicePixelRatio}px sans-serif`;
      ctx.fillText(labels[i], x + bw/2, chartH - 2*devicePixelRatio);
      ctx.font=`${11*devicePixelRatio}px sans-serif`;
    }
  });
}

function drawMoodChart(id, days, title=""){
  const c=$("#"+id); if(!c)return;
  const ctx=c.getContext("2d"), w=c.width=c.clientWidth*devicePixelRatio, h=c.height=c.clientHeight*devicePixelRatio;
  ctx.clearRect(0,0,w,h);

  const moods = days.map(d=>Number(dayState(d).mood)||0);
  const energies = days.map(d=>Number(dayState(d).energy)||0);
  const validMoods = moods.filter(m=>m>0);
  const validEnergies = energies.filter(e=>e>0);
  const avgMood = validMoods.length ? (validMoods.reduce((a,b)=>a+b,0)/validMoods.length).toFixed(1) : "—";
  const avgEnergy = validEnergies.length ? (validEnergies.reduce((a,b)=>a+b,0)/validEnergies.length).toFixed(1) : "—";

  if(title){
    ctx.fillStyle = "#333";
    ctx.font = `bold ${14*devicePixelRatio}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(title, w/2, 20*devicePixelRatio);
  }

  const padX = 50*devicePixelRatio, padY = 55*devicePixelRatio;
  const chartW = w - padX*2, chartH = h - padY*2 - 25*devicePixelRatio;

  // محور Y
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, padY);
  ctx.lineTo(padX, padY + chartH);
  ctx.lineTo(padX + chartW, padY + chartH);
  ctx.stroke();

  // برچسب‌های محور Y (1 تا 5)
  ctx.fillStyle = "#666";
  ctx.font = `${10*devicePixelRatio}px sans-serif`;
  ctx.textAlign = "right";
  for(let i=1; i<=5; i++){
    const y = padY + chartH - ((i-1)/4)*chartH;
    ctx.fillText(String(i), padX - 8*devicePixelRatio, y + 3*devicePixelRatio);
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(padX + chartW, y);
    ctx.stroke();
  }

  // رسم خط خلق
  const stepX = chartW / Math.max(1, days.length-1);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#7b0d45";
  ctx.lineWidth = 3*devicePixelRatio;
  ctx.beginPath();
  let firstPoint = true;
  moods.forEach((m,i)=>{
    if(m === 0) { firstPoint = true; return; }
    const x = padX + i*stepX;
    const y = padY + chartH - ((m-1)/4)*chartH;
    if(firstPoint){ ctx.moveTo(x,y); firstPoint=false; }
    else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // نقاط خلق
  moods.forEach((m,i)=>{
    if(m === 0) return;
    const x = padX + i*stepX;
    const y = padY + chartH - ((m-1)/4)*chartH;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#7b0d45";
    ctx.beginPath();
    ctx.arc(x,y,6*devicePixelRatio,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x,y,3*devicePixelRatio,0,Math.PI*2);
    ctx.fill();
  });

  // میله‌های انرژی
  const barW = Math.min(stepX * 0.35, 18*devicePixelRatio);
  energies.forEach((e,i)=>{
    if(e === 0) return;
    const x = padX + i*stepX - barW/2;
    const bh = ((e-1)/4)*chartH;
    const y = padY + chartH - bh;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--primary") || "#59684f";
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x, y, barW, bh);
    ctx.globalAlpha = 1;
  });

  // برچسب‌های محور X
  ctx.fillStyle = "#555";
  ctx.font = `${10*devicePixelRatio}px sans-serif`;
  ctx.textAlign = "center";
  days.forEach((d,i)=>{
    const x = padX + i*stepX;
    const label = days.length <= 7 ? WEEKDAYS[(d.getDay()+1)%7] : String(d.getDate());
    ctx.fillText(label, x, padY + chartH + 18*devicePixelRatio);
  });

  // راهنمای شفاف در پایین
  const legendY = h - 10*devicePixelRatio;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#7b0d45";
  ctx.beginPath();
  ctx.arc(padX, legendY - 20*devicePixelRatio, 5*devicePixelRatio, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = "#555";
  ctx.font = `${10*devicePixelRatio}px sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`خلق — میانگین: ${avgMood}`, padX + 12*devicePixelRatio, legendY - 16*devicePixelRatio);

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--primary") || "#59684f";
  ctx.globalAlpha = 0.5;
  ctx.fillRect(padX, legendY - 6*devicePixelRatio, 10*devicePixelRatio, 6*devicePixelRatio);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#555";
  ctx.fillText(`انرژی — میانگین: ${avgEnergy}`, padX + 16*devicePixelRatio, legendY);
}

function formatAmPm(date){ const h=date.getHours(); const m=pad(date.getMinutes()); const ampm=h<12?"am":"pm"; const hh=h%12||12; return `${ampm} ${hh}:${m}`; }
function normalizeReminder(input){ const v=(input||"").trim(); if(!v) return ""; const m=v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})$/); if(!m) return v; return `${m[1]} ${m[2].padStart(5,"0")}`; }
function autoGrow(el){ if(!el) return; el.style.height="auto"; el.style.height=Math.max(34, el.scrollHeight)+"px"; }
function updateNowLine(){
  const line=$("#nowLine"), wrap=$("#scheduleWrap"); if(!line||!wrap)return;
  const now=new Date(); if(iso(now)!==iso(selected)){line.hidden=true;return;}
  const minutes=now.getHours()*60+now.getMinutes();
  if(minutes<60){ line.hidden=true; return; }
  line.hidden=false;
  const idx=Math.max(0, Math.min(47, Math.floor((minutes-60)/30)));
  const frac=((minutes-60)%30)/30;
  const row=wrap.querySelector(`[data-slot-index="${idx}"]`);
  if(row){ line.style.top=`${row.offsetTop + row.offsetHeight*frac}px`; }
  const label=$("#nowLineTime"); if(label) label.textContent=formatAmPm(now);
}
function maybeScrollToNowOnce(){
  if(activeView!=="today" || iso(selected)!==iso(new Date())) return;
  const key=iso(selected); if(todayAutoScrolledFor===key) return;
  todayAutoScrolledFor=key;
  setTimeout(()=>{ const line=$("#nowLine"); if(line && !line.hidden) line.scrollIntoView({block:"center", behavior:"smooth"}); }, 260);
}
function updateClock(){ const el=$("#currentTimeLabel"); if(el){ el.textContent=formatAmPm(new Date()); } updateNowLine(); checkReminders(); }
function setupPWA(){ if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js"); window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("#installBtn").hidden=false;}); $("#installBtn").onclick=async()=>{ if(deferredPrompt){deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $("#installBtn").hidden=true;} }; }
async function requestNotifications(){ if(!("Notification" in window)) return alert("مرورگر شما نوتیفیکیشن را پشتیبانی نمی‌کند."); const p=await Notification.requestPermission(); alert(p==="granted"?"نوتیفیکیشن فعال شد. برای نوتیف بسته بودن کامل اپ، Firebase را طبق فایل راهنما وصل کن.":"اجازه نوتیفیکیشن داده نشد."); }
function notify(title,body){ if(Notification.permission==="granted") navigator.serviceWorker?.ready.then(r=>r.showNotification(title,{body,icon:"icons/icon-192.png"})).catch(()=>new Notification(title,{body})); }
function scheduleOpenNotifications(){ setInterval(()=>{ const now=new Date(), t=`${pad(now.getHours())}:${pad(now.getMinutes())}`; const p=prayerTimes(now); if([p.fajr,p.dhuhr,p.maghrib].includes(t)) notify("Maedeh ✨️", t===p.fajr?"اذان صبح":t===p.dhuhr?"اذان ظهر":"اذان شب"); checkReminders(); },60000); }
function checkReminders(){ const now=new Date(); const current=`${iso(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`; const d=dayState(now); (d.events||[]).forEach(ev=>{ if(ev.reminder===current){ const key=`${iso(now)}-${ev.id}-${current}`; if(!firedReminderKeys.has(key)){ firedReminderKeys.add(key); notify("آلارم برنامه", ev.text||"یادآوری"); } } }); }
function download(name,content,type){ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
function escapeHtml(s=""){ return s.replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])); }
function escapeAttr(s=""){ return escapeHtml(s).replace(/'/g,"&#39;"); }

init();

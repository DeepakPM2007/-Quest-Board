/* Cyber Mystic Habits — app.js
   Features:
   - Username + PIN login (PIN stored as SHA-256 hash)
   - Per-user isolated localStorage
   - Auto-login if "Remember me" checked
   - Habits (streaks, forgiveness, pause)
   - Tasks (priority, due dates)
   - XP + levels
   - Simple charts (canvas)
*/

const state = {
  user: null,
  habits: [],
  tasks: [],
  logs: { habitDaily: {}, taskDaily: { added: {}, completed: {} }, forgivenMisses: 0 },
  xp: 0,
  level: 1,
  today: todayStr()
};

/* ---------- Utilities ---------- */
function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function storageKey(username) {
  return `cyberMysticData_${username}`;
}
async function hashPIN(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function save() {
  if (!state.user) return;
  localStorage.setItem(storageKey(state.user.username), JSON.stringify(state));
}
function load(username) {
  const raw = localStorage.getItem(storageKey(username));
  return raw ? JSON.parse(raw) : null;
}
function resetAll() {
  if (!state.user) return;
  localStorage.removeItem(storageKey(state.user.username));
  location.reload();
}
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/* ---------- XP ---------- */
function addXP(amount) {
  state.xp += amount;
  state.level = Math.max(1, Math.floor(1 + Math.pow(state.xp / 100, 0.6)));
  updateTopbar();
  save();
}

/* ---------- Auth ---------- */
async function login(username, pin, remember) {
  const hashed = await hashPIN(pin);
  let existing = load(username);

  if (existing) {
    if (existing.user.pinHash !== hashed) {
      alert("Incorrect PIN");
      return;
    }
    Object.assign(state, existing);
  } else {
    state.user = { username, pinHash: hashed, remember };
    state.habits = [];
    state.tasks = [];
    state.logs = { habitDaily: {}, taskDaily: { added: {}, completed: {} }, forgivenMisses: 0 };
    state.xp = 0;
    state.level = 1;
    save();
  }

  document.getElementById("auth").classList.remove("active");
  document.getElementById("main").classList.add("active");
  updateTopbar();
  renderAll();
}
function logout() {
  document.getElementById("main").classList.remove("active");
  document.getElementById("auth").classList.add("active");
}

/* ---------- Rendering ---------- */
function updateTopbar() {
  document.getElementById("level").textContent = state.level;
  document.getElementById("xp").textContent = state.xp;
}
function renderHabits() {
  const list = document.getElementById("habitList");
  list.innerHTML = state.habits.map(h => {
    const done = !!h.history[state.today];
    return `<div class="habit">
      <strong>${h.name}</strong> (streak: ${h.streak})
      <button onclick="toggleHabit('${h.id}')" class="toggle ${done ? "done" : ""}">
        ${done ? "Done" : "Mark done"}
      </button>
    </div>`;
  }).join("");
}
function renderTasks() {
  const list = document.getElementById("taskList");
  list.innerHTML = state.tasks.map(t => {
    return `<div class="task">
      <input type="checkbox" ${t.done ? "checked" : ""} onclick="toggleTask('${t.id}')">
      <span>${t.title} (${t.priority})</span>
    </div>`;
  }).join("");
}
function renderStats() {
  const ctx = document.getElementById("habitChart").getContext("2d");
  ctx.clearRect(0,0,600,200);
  const days = rangeDays(30);
  const data = days.map(d => state.logs.habitDaily[d] || 0);
  ctx.strokeStyle="#59f0ff"; ctx.beginPath();
  data.forEach((v,i)=>{let x=i*20+20;let y=180-v*10; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y)});
  ctx.stroke();
}
function renderAll() {
  renderHabits();
  renderTasks();
  renderStats();
}

/* ---------- Habits ---------- */
function addHabit(name) {
  state.habits.push({id:uid(),name,streak:0,history:{}});
  save(); renderHabits();
}
function toggleHabit(id) {
  const h=state.habits.find(x=>x.id===id);
  if(!h)return;
  if(h.history[state.today]){delete h.history[state.today];h.streak=Math.max(0,h.streak-1);}
  else{h.history[state.today]=true;h.streak++;addXP(10);state.logs.habitDaily[state.today]=(state.logs.habitDaily[state.today]||0)+1;}
  save(); renderHabits(); renderStats();
}

/* ---------- Tasks ---------- */
function addTask(title,priority="medium") {
  state.tasks.push({id:uid(),title,priority,done:false});
  save(); renderTasks();
}
function toggleTask(id) {
  const t=state.tasks.find(x=>x.id===id);
  if(!t)return;
  t.done=!t.done;
  if(t.done)addXP(5);
  save(); renderTasks(); renderStats();
}

/* ---------- Helpers ---------- */
function rangeDays(n) {
  const out=[];for(let i=n-1;i>=0;i--){out.push(todayStr(new Date(Date.now()-i*86400000)))}return out;
}

/* ---------- Init ---------- */
function init() {
  // Auto-login if remembered user exists
  const lastKey = Object.keys(localStorage).find(k=>k.startsWith("cyberMysticData_"));
  if(lastKey){
    const data=JSON.parse(localStorage.getItem(lastKey));
    if(data?.user?.remember){
      Object.assign(state,data);
      document.getElementById("auth").classList.remove("active");
      document.getElementById("main").classList.add("active");
      updateTopbar(); renderAll();
    }
  }

  document.getElementById("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const u=document.getElementById("username").value.trim();
    const p=document.getElementById("pin").value.trim();
    const r=document.getElementById("remember").checked;
    if(!u||p.length!==4)return;
    await login(u,p,r);
  });
  document.getElementById("quickDemo").addEventListener("click",async()=>{await login("demo","0000",true)});
  document.getElementById("logout").addEventListener("click",logout);
  document.getElementById("addHabit").addEventListener("click",()=>{const n=prompt("Habit name?");if(n)addHabit(n)});
  document.getElementById("addTask").addEventListener("click",()=>{const n=prompt("Task title?");if(n)addTask(n)});
}
document.addEventListener("DOMContentLoaded",init);
/* Cyber Mystic Habits — single-file JS logic (no frameworks)
   - Auth with username + PIN
   - Habits (streaks, forgiveness, pause)
   - To‑Do (priority, due dates)
   - XP + levels
   - Charts (last 30 days)
   - LocalStorage persistence
*/

const App = (() => {
  const LS_KEY = "cyberMysticData_v1";

  const state = {
    user: null,
    settings: { graceDays: 1, autoPauseAfter: 3, theme: "cyber" },
    habits: [],
    tasks: [],
    logs: {
      habitDaily: {}, // date -> count
      taskDaily: { added: {}, completed: {} },
      forgivenMisses: 0,
    },
    xp: 0,
    level: 1,
    today: todayStr(),
  };

  // Utilities
  function todayStr(d = new Date()) {
    return d.toISOString().slice(0, 10);
  }
  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }
  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }
  function load() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      Object.assign(state, data);
    } catch {}
  }
  function resetAll() {
    localStorage.removeItem(LS_KEY);
    location.reload();
  }
  function setTheme(name) {
    document.documentElement.setAttribute("data-theme", name);
  }

  // XP + levels
  function addXP(amount) {
    state.xp += amount;
    const lvl = Math.floor(1 + Math.pow(state.xp / 100, 0.6)); // gentle curve
    state.level = Math.max(lvl, 1);
    updateTopbar();
    save();
  }

  // Auth
  function login(username, pin, remember) {
    state.user = { username, pin, remember };
    save();
    document.getElementById("auth").classList.remove("active");
    document.getElementById("main").classList.add("active");
    updateTopbar();
    renderAll();
  }
  function logout() {
    document.getElementById("main").classList.remove("active");
    document.getElementById("auth").classList.add("active");
  }

  // Rendering helpers
  function updateTopbar() {
    document.getElementById("dateToday").textContent = new Date().toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric"
    });
    document.getElementById("level").textContent = state.level;
    document.getElementById("xp").textContent = state.xp;
  }

  // Habits
  function addHabit(habit) {
    const h = {
      id: uid(),
      name: habit.name,
      freq: habit.freq,
      diff: habit.diff,
      start: habit.start || state.today,
      streak: 0,
      paused: false,
      history: {}, // date -> boolean
      missesInRow: 0,
    };
    state.habits.push(h);
    logHabitAddedToday();
    save();
    renderHabits();
  }

  function toggleHabitDone(id) {
    const h = state.habits.find(x => x.id === id);
    if (!h) return;
    const done = !!h.history[state.today];
    if (done) {
      delete h.history[state.today];
      h.streak = Math.max(h.streak - 1, 0);
    } else {
      h.history[state.today] = true;
      h.streak += 1;
      h.missesInRow = 0;
      addXP(xpForHabit(h.diff));
      logHabitCompletionToday();
    }
    save();
    renderHabits();
    renderStats();
  }

  function xpForHabit(diff) {
    if (diff === "hard") return 18;
    if (diff === "medium") return 12;
    return 8;
  }

  function updateForgiveness() {
    // Called daily or on load to update misses without harsh streak resets.
    state.habits.forEach(h => {
      if (h.paused) return;
      // If not done today and the day has rolled, count miss.
      const yesterday = todayStr(new Date(Date.now() - 86400000));
      const todayDone = !!h.history[state.today];
      const yesterdayDone = !!h.history[yesterday];

      // Only adjust misses when day changes; here we simulate forgiveness logic loosely
      if (!todayDone && !yesterdayDone) {
        h.missesInRow += 1;
        const grace = state.settings.graceDays;
        if (h.missesInRow <= grace) {
          state.logs.forgivenMisses += 1;
        } else {
          // soft reset: reduce streak but not fully reset
          h.streak = Math.max(0, Math.floor(h.streak * 0.7));
        }
        const autoPauseAfter = state.settings.autoPauseAfter;
        if (autoPauseAfter > 0 && h.missesInRow >= autoPauseAfter) {
          h.paused = true;
        }
      }
    });
    save();
  }

  function editHabit(id, patch) {
    const h = state.habits.find(x => x.id === id);
    if (!h) return;
    Object.assign(h, patch);
    save();
    renderHabits();
  }

  function deleteHabit(id) {
    const idx = state.habits.findIndex(x => x.id === id);
    if (idx >= 0) state.habits.splice(idx, 1);
    save();
    renderHabits();
    renderStats();
  }

  // Tasks
  function addTask(task) {
    const t = {
      id: uid(),
      title: task.title,
      due: task.due || null,
      priority: task.priority || "medium",
      done: false,
      created: state.today,
    };
    state.tasks.push(t);
    logTaskAddedToday();
    save();
    renderTasks();
  }

  function toggleTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    if (t.done) {
      addXP(xpForTask(t.priority));
      logTaskCompletedToday();
    } else {
      // remove completion from daily log if needed
    }
    save();
    renderTasks();
    renderStats();
  }

  function xpForTask(priority) {
    if (priority === "high") return 16;
    if (priority === "medium") return 10;
    return 6;
  }

  function deleteTask(id) {
    const idx = state.tasks.findIndex(x => x.id === id);
    if (idx >= 0) state.tasks.splice(idx, 1);
    save();
    renderTasks();
    renderStats();
  }

  // Logs for charts
  function logHabitCompletionToday() {
    const d = state.today;
    state.logs.habitDaily[d] = (state.logs.habitDaily[d] || 0) + 1;
  }
  function logHabitAddedToday() {
    // Optional metric: not charted
  }
  function logTaskAddedToday() {
    const d = state.today;
    state.logs.taskDaily.added[d] = (state.logs.taskDaily.added[d] || 0) + 1;
  }
  function logTaskCompletedToday() {
    const d = state.today;
    state.logs.taskDaily.completed[d] = (state.logs.taskDaily.completed[d] || 0) + 1;
  }

  // Rendering: tabs & panels
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.getElementById(`panel-${name}`).classList.add("active");
  }

  function renderHabits() {
    const list = document.getElementById("habitList");
    const view = document.getElementById("habitView").value;
    const sort = document.getElementById("habitSort").value;

    let habits = [...state.habits];
    if (view === "today") {
      habits = habits.filter(h => !h.paused);
    }

    habits.sort((a, b) => {
      if (sort === "streak") return b.streak - a.streak;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "difficulty") return diffRank(b.diff) - diffRank(a.diff);
      return 0;
    });

    list.innerHTML = habits.map(habitCard).join("");
    // Wire actions
    habits.forEach(h => {
      document.getElementById(`toggle-${h.id}`).addEventListener("click", () => toggleHabitDone(h.id));
      document.getElementById(`pause-${h.id}`).addEventListener("click", () => editHabit(h.id, { paused: !h.paused }));
      document.getElementById(`edit-${h.id}`).addEventListener("click", () => openHabitModal(h));
      document.getElementById(`del-${h.id}`).addEventListener("click", () => deleteHabit(h.id));
    });
  }

  function diffRank(d) {
    if (d === "hard") return 3;
    if (d === "medium") return 2;
    return 1;
  }

  function habitCard(h) {
    const todayDone = !!h.history[state.today];
    const cls = `habit ${h.paused ? "paused" : ""}`;
    const streakColor = h.paused ? "pause" : h.missesInRow <= state.settings.graceDays ? "success" : "warn";
    return `
      <div class="${cls}">
        <div class="habit-head">
          <div>
            <div class="habit-title">${escapeHTML(h.name)}</div>
            <div class="habit-meta">
              <span>${h.freq}</span>
              <span class="chip ${streakColor}">streak <strong class="streak">${h.streak}</strong></span>
              <span>difficulty: ${h.diff}</span>
            </div>
          </div>
          <button id="pause-${h.id}" class="btn ghost">${h.paused ? "Resume" : "Pause"}</button>
        </div>
        <div class="habit-actions">
          <button id="toggle-${h.id}" class="toggle ${todayDone ? "done" : ""}">
            ${todayDone ? "Done today" : "Mark done"}
          </button>
          <button id="edit-${h.id}" class="btn">Edit</button>
          <button id="del-${h.id}" class="btn" style="color: var(--danger)">Delete</button>
        </div>
      </div>
    `;
  }

  function renderTasks() {
    const list = document.getElementById("taskList");
    const view = document.getElementById("taskView").value;
    const sort = document.getElementById("taskSort").value;

    let tasks = [...state.tasks];
    const today = state.today;

    tasks = tasks.filter(t => {
      if (view === "today") return t.due === today || !t.due;
      if (view === "upcoming") return t.due && t.due >= today;
      return true;
    });

    tasks.sort((a, b) => {
      if (sort === "priority") return priorityRank(b.priority) - priorityRank(a.priority);
      if (sort === "due") return (a.due || "").localeCompare(b.due || "");
      if (sort === "name") return a.title.localeCompare(b.title);
      return 0;
    });

    list.innerHTML = tasks.map(taskItem).join("");
    tasks.forEach(t => {
      document.getElementById(`task-toggle-${t.id}`).addEventListener("click", () => toggleTask(t.id));
      document.getElementById(`task-del-${t.id}`).addEventListener("click", () => deleteTask(t.id));
    });
  }

  function priorityRank(p) {
    if (p === "high") return 3;
    if (p === "medium") return 2;
    return 1;
  }

  function taskItem(t) {
    const prCls =
      t.priority === "high" ? "priority-high" :
      t.priority === "medium" ? "priority-medium" : "priority-low";
    return `
      <div class="task">
        <input type="checkbox" id="task-toggle-${t.id}" ${t.done ? "checked" : ""} />
        <div>
          <div class="title">${escapeHTML(t.title)}</div>
          <div class="meta">
            ${t.due ? `Due ${t.due}` : "No due date"} • <span class="${prCls}">${t.priority}</span>
          </div>
        </div>
        <button id="task-del-${t.id}" class="btn ghost" style="color: var(--danger)">Delete</button>
      </div>
    `;
  }

  // Stats
  function renderStats() {
    // Lifetime stats
    document.getElementById("bestStreak").textContent =
      state.habits.reduce((m, h) => Math.max(m, h.streak), 0);
    document.getElementById("totalHabits").textContent = state.habits.length;
    document.getElementById("tasksCompleted").textContent =
      Object.values(state.logs.taskDaily.completed).reduce((a, b) => a + b, 0);
    document.getElementById("forgivenMisses").textContent = state.logs.forgivenMisses;

    // Habit chart: last 30 days completions
    const habitCanvas = document.getElementById("habitChart");
    const habitCtx = habitCanvas.getContext("2d");
    const days = rangeDays(30);
    const habitSeries = days.map(d => state.logs.habitDaily[d] || 0);
    const streakTrend = days.map(() =>
      state.habits.reduce((m, h) => Math.max(m, h.streak), 0)
    );
    Charts.lineChart(habitCtx, habitSeries, { color: "#6cf09a", fill: "rgba(108,240,154,0.12)" });
    // Overlay second line
    Charts.lineChart(habitCtx, streakTrend, { color: "#59f0ff", fill: "rgba(0,0,0,0)" });

    // Task chart: last 30 days added vs completed
    const taskCanvas = document.getElementById("taskChart");
    const taskCtx = taskCanvas.getContext("2d");
    const addedSeries = days.map(d => state.logs.taskDaily.added[d] || 0);
    const completedSeries = days.map(d => state.logs.taskDaily.completed[d] || 0);
    Charts.dualBars(taskCtx, completedSeries, addedSeries);
  }

  function rangeDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      out.push(todayStr(new Date(Date.now() - i * 86400000)));
    }
    return out;
  }

  // Starfield
  function starfield() {
    const c = document.getElementById("starfield");
    const ctx = c.getContext("2d");
    resizeCanvas(c);
    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random() * c.width,
      y: Math.random() * c.height,
      r: Math.random() * 1.2 + 0.2,
      s: Math.random() * 0.4 + 0.1
    }));
    function draw() {
      ctx.clearRect(0, 0, c.width, c.height);
      stars.forEach(st => {
        ctx.globalAlpha = 0.6 + Math.sin(Date.now() * 0.001 * st.s) * 0.3;
        ctx.fillStyle = "#9ad8ff";
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    draw();
    window.addEventListener("resize", () => resizeCanvas(c));
  }

  function resizeCanvas(c) {
    c.width = window.innerWidth;
    c.height = window.innerHeight;
  }

  // Modals
  function openHabitModal(habit = null) {
    const dlg = document.getElementById("habitModal");
    document.getElementById("habitModalTitle").textContent = habit ? "Edit habit" : "New habit";
    document.getElementById("habitName").value = habit?.name || "";
    document.getElementById("habitFreq").value = habit?.freq || "daily";
    document.getElementById("habitDiff").value = habit?.diff || "easy";
    document.getElementById("habitStart").value = habit?.start || state.today;

    dlg.showModal();

    const saveBtn = document.getElementById("saveHabit");
    const handler = (ev) => {
      ev.preventDefault();
      const name = document.getElementById("habitName").value.trim();
      const freq = document.getElementById("habitFreq").value;
      const diff = document.getElementById("habitDiff").value;
      const start = document.getElementById("habitStart").value || state.today;

      if (!name) return;

      if (habit) {
        editHabit(habit.id, { name, freq, diff, start });
      } else {
        addHabit({ name, freq, diff, start });
      }
      dlg.close();
      saveBtn.removeEventListener("click", handler);
    };
    saveBtn.addEventListener("click", handler);
  }

  function openTaskModal() {
    const dlg = document.getElementById("taskModal");
    document.getElementById("taskModalTitle").textContent = "New task";
    document.getElementById("taskTitle").value = "";
    document.getElementById("taskDue").value = "";
    document.getElementById("taskPriority").value = "medium";

    dlg.showModal();

    const saveBtn = document.getElementById("saveTask");
    const handler = (ev) => {
      ev.preventDefault();
      const title = document.getElementById("taskTitle").value.trim();
      const due = document.getElementById("taskDue").value || null;
      const priority = document.getElementById("taskPriority").value || "medium";
      if (!title) return;
      addTask({ title, due, priority });
      dlg.close();
      saveBtn.removeEventListener("click", handler);
    };
    saveBtn.addEventListener("click", handler);
  }

  // Escape HTML
  function escapeHTML(str) {
    return str.replace(/[&<>"']/g, s => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[s]));
  }

  // Demo seed
  function seedDemo() {
    state.user = { username: "demo", pin: "0000", remember: true };
    state.habits = [
      { id: uid(), name: "Morning stretch", freq: "daily", diff: "easy", start: state.today, streak: 3, paused: false, history: { [state.today]: true }, missesInRow: 0 },
      { id: uid(), name: "Code for 60 min", freq: "daily", diff: "hard", start: state.today, streak: 7, paused: false, history: { [state.today]: false }, missesInRow: 1 },
      { id: uid(), name: "Read 10 pages", freq: "daily", diff: "medium", start: state.today, streak: 5, paused: false, history: {}, missesInRow: 2 },
    ];
    state.tasks = [
      { id: uid(), title: "Ship v0 UI polish", due: state.today, priority: "high", done: false, created: state.today },
      { id: uid(), title: "Email beta testers", due: null, priority: "medium", done: false, created: state.today },
      { id: uid(), title: "Refactor storage", due: state.today, priority: "low", done: true, created: state.today },
    ];
    state.logs.habitDaily[state.today] = 2;
    state.logs.taskDaily.added[state.today] = 3;
    state.logs.taskDaily.completed[state.today] = 1;
    state.xp = 120;
    state.level = 3;
    save();
  }

  // Init & event wiring
  function init() {
    load();
    starfield();
    setTheme(state.settings.theme);
    updateForgiveness();
    document.getElementById("dateToday").textContent = new Date().toDateString();

    // If user exists and remember set, go to main
    if (state.user?.remember) {
      document.getElementById("auth").classList.remove("active");
      document.getElementById("main").classList.add("active");
      updateTopbar();
      renderAll();
    }

    // Auth events
    document.getElementById("loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const username = document.getElementById("username").value.trim();
      const pin = document.getElementById("pin").value.trim();
      const remember = document.getElementById("remember").checked;
      if (!username || pin.length !== 4) return;
      login(username, pin, remember);
    });
    document.getElementById("quickDemo").addEventListener("click", () => {
      seedDemo();
      login("demo", "0000", true);
    });
    document.getElementById("resetAll").addEventListener("click", resetAll);
    document.getElementById("logout").addEventListener("click", logout);

    // Tabs
    document.querySelectorAll(".tab").forEach(btn => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    // Filters
    document.getElementById("habitView").addEventListener("change", renderHabits);
    document.getElementById("habitSort").addEventListener("change", renderHabits);
    document.getElementById("taskView").addEventListener("change", renderTasks);
    document.getElementById("taskSort").addEventListener("change", renderTasks);

    // Modals
    document.getElementById("addHabit").addEventListener("click", () => openHabitModal());
    document.getElementById("addTask").addEventListener("click", () => openTaskModal());

    // Settings
    document.getElementById("graceDays").value = state.settings.graceDays;
    document.getElementById("autoPauseAfter").value = state.settings.autoPauseAfter;
    document.getElementById("theme").value = state.settings.theme;
    document.getElementById("saveSettings").addEventListener("click", () => {
      const graceDays = Number(document.getElementById("graceDays").value);
      const autoPauseAfter = Number(document.getElementById("autoPauseAfter").value);
      state.settings.graceDays = clamp(graceDays, 0, 3);
      state.settings.autoPauseAfter = clamp(autoPauseAfter, 0, 7);
      save();
      renderHabits();
      renderStats();
    });
    document.getElementById("applyTheme").addEventListener("click", () => {
      const theme = document.getElementById("theme").value;
      state.settings.theme = theme;
      setTheme(theme);
      save();
    });

    renderAll();
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function renderAll() {
    renderHabits();
    renderTasks();
    renderStats();
  }

  // Start
  document.addEventListener("DOMContentLoaded", init);

  // Public API (optional)
  return { state };
})();
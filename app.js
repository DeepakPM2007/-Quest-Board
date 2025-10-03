/* Cyber Mystic — Habits & Tasks (mobile-optimized)
   - Beautiful dropdowns and multi-theme support (cyber/midnight/sunset)
   - Secure auth: username + PIN (SHA-256 hash), per-user isolated storage
   - Remember me for auto-login on the same device
   - Smooth mobile spacing and touch-first UI
   - Clean charts with axes, ticks, readable labels (RTL timeline)
   - Task toggle: single XP per day; prevents XP inflation on repeated toggling
   - Custom due date picker bottom sheet; repeat days chips
*/

const STORAGE_LAST_USER = "cm_lastUser";

const App = (() => {
  const state = {
    user: null,
    settings: { graceDays: 1, autoPauseAfter: 3, theme: "cyber" },
    habits: [],
    tasks: [],
    logs: {
      habitDaily: {},
      taskDaily: { added: {}, completed: {} },
      forgivenMisses: 0,
    },
    xp: 0,
    level: 1,
    today: todayStr(),
  };

  /* ---------- Utilities ---------- */
  function todayStr(d = new Date()) {
    return d.toISOString().slice(0, 10);
  }
  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }
  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }
  function escapeHTML(str) {
    return str.replace(
      /[&<>"']/g,
      (s) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[s])
    );
  }

  /* ---------- Storage ---------- */
  function storageKey(username) {
    return `cyberMysticData_${username}`;
  }
  function save() {
    if (!state.user) return;
    localStorage.setItem(
      storageKey(state.user.username),
      JSON.stringify(state)
    );
  }
  function load(username) {
    const raw = localStorage.getItem(storageKey(username));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  async function hashPIN(pin) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(pin)
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /* ---------- Auth ---------- */
  async function login(username, pin, remember) {
    const hashed = await hashPIN(pin);
    const existing = load(username);

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
      state.logs = {
        habitDaily: {},
        taskDaily: { added: {}, completed: {} },
        forgivenMisses: 0,
      };
      state.xp = 0;
      state.level = 1;
      save();
    }

    if (remember) localStorage.setItem(STORAGE_LAST_USER, username);
    enterApp();
  }

  function enterApp() {
    document.getElementById("auth").classList.remove("active");
    document.getElementById("main").classList.add("active");
    setTheme(state.settings.theme);
    updateTopbar();
    renderAll();
  }

  function logout() {
    document.getElementById("main").classList.remove("active");
    document.getElementById("auth").classList.add("active");
    const last = localStorage.getItem(STORAGE_LAST_USER);
    if (last === state.user?.username)
      localStorage.removeItem(STORAGE_LAST_USER);
    state.user = null;
  }

  function resetAll() {
    if (!state.user) return;
    localStorage.removeItem(storageKey(state.user.username));
    const last = localStorage.getItem(STORAGE_LAST_USER);
    if (last === state.user.username)
      localStorage.removeItem(STORAGE_LAST_USER);
    location.reload();
  }

  /* ---------- XP & Levels ---------- */
  function addXP(amount) {
    state.xp += amount;
    state.level = Math.max(1, Math.floor(1 + Math.pow(state.xp / 100, 0.6)));
    updateTopbar();
    save();
  }
  function removeXP(amount) {
    state.xp = Math.max(0, state.xp - amount);
    state.level = Math.max(1, Math.floor(1 + Math.pow(state.xp / 100, 0.6)));
    updateTopbar();
    save();
  }

  /* ---------- Habits ---------- */
  function addHabit(habit) {
    state.habits.push({
      id: uid(),
      name: habit.name,
      freq: habit.freq,
      diff: habit.diff,
      start: habit.start || state.today,
      streak: 0,
      paused: false,
      history: {},
      missesInRow: 0,
      lastCompletionDate: null,
      xpAwardedToday: 0,
    });
    save();
    renderHabits();
  }

  function toggleHabitDone(id, checked) {
    const h = state.habits.find((x) => x.id === id);
    if (!h) return;

    if (checked) {
      // Mark done today; award XP only once per day
      if (h.lastCompletionDate !== state.today) {
        h.history[state.today] = true;
        h.lastCompletionDate = state.today;
        h.streak += 1;
        h.missesInRow = 0;
        const xpGain = xpForHabit(h.diff);
        addXP(xpGain);
        h.xpAwardedToday = xpGain;
        logHabitCompletionToday();
      } else {
        // Already completed today; do nothing
      }
    } else {
      // Unmark today's completion; revert counters and XP if it was today
      if (h.lastCompletionDate === state.today) {
        delete h.history[state.today];
        h.lastCompletionDate = null;
        h.streak = Math.max(h.streak - 1, 0);
        // Revert logs and XP only if awarded today
        if (h.xpAwardedToday > 0) {
          removeXP(h.xpAwardedToday);
          h.xpAwardedToday = 0;
          unlogHabitCompletionToday();
        }
      }
    }

    save();
    renderHabits();
    renderStats();
  }

  function editHabit(id, patch) {
    const h = state.habits.find((x) => x.id === id);
    if (!h) return;
    Object.assign(h, patch);
    save();
    renderHabits();
  }
  function deleteHabit(id) {
    const i = state.habits.findIndex((x) => x.id === id);
    if (i >= 0) state.habits.splice(i, 1);
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
    const yesterday = todayStr(new Date(Date.now() - 86400000));
    state.habits.forEach((h) => {
      if (h.paused) return;
      const todayDone = !!h.history[state.today];
      const yesterdayDone = !!h.history[yesterday];
      if (!todayDone && !yesterdayDone) {
        h.missesInRow += 1;
        if (h.missesInRow <= state.settings.graceDays)
          state.logs.forgivenMisses += 1;
        else h.streak = Math.max(0, Math.floor(h.streak * 0.7));
        if (
          state.settings.autoPauseAfter > 0 &&
          h.missesInRow >= state.settings.autoPauseAfter
        )
          h.paused = true;
      }
    });
    save();
  }

  /* ---------- Tasks ---------- */
  function addTask(task) {
    state.tasks.push({
      id: uid(),
      title: task.title,
      due: task.due || null,
      repeat: task.repeat || [], // ['mon','wed']
      priority: task.priority || "medium",
      done: false,
      created: state.today,
      lastCompletionDate: null,
      xpAwardedToday: 0,
    });
    logTaskAddedToday();
    save();
    renderTasks();
  }

  function toggleTask(id, checked) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = checked;

    if (checked) {
      // Award XP only once per day per task
      if (t.lastCompletionDate !== state.today) {
        const xpGain = xpForTask(t.priority);
        addXP(xpGain);
        t.lastCompletionDate = state.today;
        t.xpAwardedToday = xpGain;
        logTaskCompletedToday();
      }
    } else {
      // Unmark today's completion: revert logs & XP only if it was today
      if (t.lastCompletionDate === state.today) {
        t.lastCompletionDate = null;
        if (t.xpAwardedToday > 0) {
          removeXP(t.xpAwardedToday);
          t.xpAwardedToday = 0;
          unlogTaskCompletedToday();
        }
      }
    }

    save();
    renderTasks();
    renderStats();
  }

  function xpForTask(p) {
    if (p === "high") return 16;
    if (p === "medium") return 10;
    return 6;
  }
  function deleteTask(id) {
    const i = state.tasks.findIndex((x) => x.id === id);
    if (i >= 0) state.tasks.splice(i, 1);
    save();
    renderTasks();
    renderStats();
  }

  /* ---------- Logs ---------- */
  function logHabitCompletionToday() {
    const d = state.today;
    state.logs.habitDaily[d] = (state.logs.habitDaily[d] || 0) + 1;
  }
  function unlogHabitCompletionToday() {
    const d = state.today;
    state.logs.habitDaily[d] = Math.max(0, (state.logs.habitDaily[d] || 0) - 1);
  }
  function logTaskAddedToday() {
    const d = state.today;
    state.logs.taskDaily.added[d] = (state.logs.taskDaily.added[d] || 0) + 1;
  }
  function logTaskCompletedToday() {
    const d = state.today;
    state.logs.taskDaily.completed[d] =
      (state.logs.taskDaily.completed[d] || 0) + 1;
  }
  function unlogTaskCompletedToday() {
    const d = state.today;
    state.logs.taskDaily.completed[d] = Math.max(
      0,
      (state.logs.taskDaily.completed[d] || 0) - 1
    );
  }

  /* ---------- Rendering ---------- */
  function updateTopbar() {
    document.getElementById("dateToday").textContent =
      new Date().toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    document.getElementById("level").textContent = state.level;
    document.getElementById("xp").textContent = state.xp;
  }

  function switchTab(name) {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document
      .querySelectorAll(".panel")
      .forEach((p) => p.classList.remove("active"));
    document.getElementById(`panel-${name}`).classList.add("active");
  }

  function renderHabits() {
    const list = document.getElementById("habitList");
    const view = document.getElementById("habitView").value;
    const sort = document.getElementById("habitSort").value;

    let habits = [...state.habits];
    if (view === "today") habits = habits.filter((h) => !h.paused);

    habits.sort((a, b) => {
      if (sort === "streak") return b.streak - a.streak;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "difficulty") return diffRank(b.diff) - diffRank(a.diff);
      return 0;
    });

    list.innerHTML = habits.map(habitCard).join("");
    habits.forEach((h) => {
      const checkboxId = `toggle-${h.id}`;
      document
        .getElementById(checkboxId)
        .addEventListener("change", (e) =>
          toggleHabitDone(h.id, e.target.checked)
        );
      document
        .getElementById(`pause-${h.id}`)
        .addEventListener("click", () =>
          editHabit(h.id, { paused: !h.paused })
        );
      document
        .getElementById(`edit-${h.id}`)
        .addEventListener("click", () => openHabitModal(h));
      document
        .getElementById(`del-${h.id}`)
        .addEventListener("click", () => deleteHabit(h.id));
    });
  }
  function diffRank(d) {
    return d === "hard" ? 3 : d === "medium" ? 2 : 1;
  }

  function habitCard(h) {
    const todayDone = h.lastCompletionDate === state.today;
    return `
      <div class="habit ${h.paused ? "paused" : ""}">
        <div class="habit-head">
          <div>
            <div class="habit-title">${escapeHTML(h.name)}</div>
            <div class="habit-meta">
              <span>${h.freq}</span>
              <span>streak <strong class="streak">${h.streak}</strong></span>
              <span>difficulty: ${h.diff}</span>
            </div>
          </div>
          <button id="pause-${h.id}" class="btn ghost">${
      h.paused ? "Resume" : "Pause"
    }</button>
        </div>
        <div class="habit-actions">
          <label class="toggle ${todayDone ? "done" : ""}">
            <input type="checkbox" id="toggle-${h.id}" ${
      todayDone ? "checked" : ""
    } />
            <span>${todayDone ? "Done today" : "Mark done"}</span>
          </label>
          <button id="edit-${h.id}" class="btn">Edit</button>
          <button id="del-${
            h.id
          }" class="btn" style="color: var(--danger)">Delete</button>
        </div>
      </div>
    `;
  }

  function renderTasks() {
    const list = document.getElementById("taskList");
    const view = document.getElementById("taskView").value;
    const sort = document.getElementById("taskSort").value;
    const today = state.today;

    let tasks = [...state.tasks];
    tasks = tasks.filter((t) => {
      if (view === "today") return t.due === today || !t.due;
      if (view === "upcoming") return t.due && t.due >= today;
      return true;
    });

    tasks.sort((a, b) => {
      if (sort === "priority")
        return priorityRank(b.priority) - priorityRank(a.priority);
      if (sort === "due") return (a.due || "").localeCompare(b.due || "");
      if (sort === "name") return a.title.localeCompare(b.title);
      return 0;
    });

    list.innerHTML = tasks.map(taskItem).join("");
    tasks.forEach((t) => {
      document
        .getElementById(`task-toggle-${t.id}`)
        .addEventListener("change", (e) => toggleTask(t.id, e.target.checked));
      document
        .getElementById(`task-del-${t.id}`)
        .addEventListener("click", () => deleteTask(t.id));
    });
  }
  function priorityRank(p) {
    return p === "high" ? 3 : p === "medium" ? 2 : 1;
  }

  function taskItem(t) {
    const prCls =
      t.priority === "high"
        ? "priority-high"
        : t.priority === "medium"
        ? "priority-medium"
        : "priority-low";
    const repeatText = t.repeat?.length
      ? ` • repeats: ${t.repeat.join(", ")}`
      : "";
    return `
      <div class="task">
        <input type="checkbox" id="task-toggle-${t.id}" ${
      t.done ? "checked" : ""
    } />
        <div>
          <div class="title">${escapeHTML(t.title)}</div>
          <div class="meta">
            ${
              t.due ? `Due ${t.due}` : "No due date"
            } • <span class="${prCls}">${t.priority}</span>${repeatText}
          </div>
        </div>
        <button id="task-del-${
          t.id
        }" class="btn ghost" style="color: var(--danger)">Delete</button>
      </div>
    `;
  }

  /* ---------- Stats (RTL timeline, clean charts) ---------- */
  function renderStats() {
    // Lifetime stats (optional: add elements if needed)
    const days = rangeDays(60); // chronological
    const reversedDays = [...days].reverse(); // show recent on right

    // Habit
    const habitCanvas = document.getElementById("habitChart");
    habitCanvas.width = Math.max(1200, reversedDays.length * 28);
    const habitCtx = habitCanvas.getContext("2d");

    const habitSeries = reversedDays.map((d) => state.logs.habitDaily[d] || 0);
    const streakTrend = reversedDays.map(() =>
      state.habits.reduce((m, h) => Math.max(m, h.streak), 0)
    );

    Charts.lineChart(habitCtx, habitSeries, reversedDays, {
      color: "#6cf09a",
      gridColor: "rgba(255,255,255,0.08)",
      labelColor: "rgba(255,255,255,0.6)",
    });
    Charts.lineChart(habitCtx, streakTrend, reversedDays, {
      color: "#59f0ff",
      gridColor: "transparent",
      labelColor: "transparent",
      point: 0,
    });

    // Task
    const taskCanvas = document.getElementById("taskChart");
    taskCanvas.width = Math.max(1200, reversedDays.length * 28);
    const taskCtx = taskCanvas.getContext("2d");
    const completedSeries = reversedDays.map(
      (d) => state.logs.taskDaily.completed[d] || 0
    );
    const addedSeries = reversedDays.map(
      (d) => state.logs.taskDaily.added[d] || 0
    );

    Charts.barDual(taskCtx, completedSeries, addedSeries, reversedDays, {
      colorA: "#c48dff",
      colorB: "#ffb36b",
      gridColor: "rgba(255,255,255,0.08)",
      labelColor: "rgba(255,255,255,0.6)",
    });
  }

  function rangeDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--)
      out.push(todayStr(new Date(Date.now() - i * 86400000)));
    return out;
  }

  /* ---------- Starfield ---------- */
  function starfield() {
    const c = document.getElementById("starfield");
    const ctx = c.getContext("2d");
    resizeCanvas(c);
    const stars = Array.from({ length: 140 }, () => ({
      x: Math.random() * c.width,
      y: Math.random() * c.height,
      r: Math.random() * 1.2 + 0.2,
      s: Math.random() * 0.4 + 0.1,
    }));
    function draw() {
      ctx.clearRect(0, 0, c.width, c.height);
      stars.forEach((st) => {
        ctx.globalAlpha = 0.6 + Math.sin(Date.now() * 0.001 * st.s) * 0.3;
        ctx.fillStyle = "#9ad8ff";
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    draw();
    window.addEventListener("resize", () => resizeCanvas(c), { passive: true });
  }
  function resizeCanvas(c) {
    c.width = window.innerWidth;
    c.height = window.innerHeight;
  }

  /* ---------- Modals ---------- */
  function openHabitModal(habit = null) {
    const dlg = document.getElementById("habitModal");
    document.getElementById("habitModalTitle").textContent = habit
      ? "Edit habit"
      : "New habit";
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

      if (habit) editHabit(habit.id, { name, freq, diff, start });
      else addHabit({ name, freq, diff, start });
      dlg.close();
      saveBtn.removeEventListener("click", handler);
    };
    saveBtn.addEventListener("click", handler);
  }

  function openTaskModal(task = null) {
    const dlg = document.getElementById("taskModal");
    document.getElementById("taskModalTitle").textContent = task
      ? "Edit task"
      : "New task";
    document.getElementById("taskTitle").value = task?.title || "";
    document.getElementById("taskDue").value = task?.due || "";
    document.getElementById("taskPriority").value = task?.priority || "medium";

    // Repeat chips
    const repeatRow = document.getElementById("repeatDays");
    repeatRow.querySelectorAll(".chip").forEach((ch) => {
      ch.classList.toggle(
        "active",
        (task?.repeat || []).includes(ch.dataset.day)
      );
      ch.onclick = () => ch.classList.toggle("active");
    });

    // Mini calendar bottom sheet
    setupMiniCalendar();

    dlg.showModal();
    const saveBtn = document.getElementById("saveTask");
    const handler = (ev) => {
      ev.preventDefault();
      const title = document.getElementById("taskTitle").value.trim();
      const due = document.getElementById("taskDue").value || null;
      const priority =
        document.getElementById("taskPriority").value || "medium";
      const repeat = Array.from(repeatRow.querySelectorAll(".chip.active")).map(
        (ch) => ch.dataset.day
      );
      if (!title) return;

      if (task) {
        Object.assign(task, { title, due, priority, repeat });
      } else {
        addTask({ title, due, priority, repeat });
      }
      dlg.close();
      saveBtn.removeEventListener("click", handler);
    };
    saveBtn.addEventListener("click", handler);
  }

  /* ---------- Mini Calendar (custom days picker) ---------- */
  function setupMiniCalendar() {
    const openBtn = document.getElementById("openDatePicker");
    const sheet = document.getElementById("miniCalendar");
    const label = document.getElementById("calLabel");
    const grid = document.getElementById("calGrid");
    const btnPrev = document.getElementById("calPrev");
    const btnNext = document.getElementById("calNext");
    const btnClose = document.getElementById("calClose");
    const btnApply = document.getElementById("calApply");
    const input = document.getElementById("taskDue");

    let current = new Date(input.value || Date.now());
    let selected = input.value ? new Date(input.value) : null;

    function fmt(d) {
      return d.toISOString().slice(0, 10);
    }
    function ymd(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getDate()).padStart(2, "0")}`;
    }

    function renderCal() {
      const year = current.getFullYear();
      const month = current.getMonth();
      label.textContent = current.toLocaleString(undefined, {
        month: "long",
        year: "numeric",
      });
      grid.innerHTML = "";

      // Weekday headers (optional): we’ll show only days
      const first = new Date(year, month, 1);
      const startIdx = first.getDay(); // 0..6
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // pads
      for (let i = 0; i < startIdx; i++) {
        const pad = document.createElement("div");
        grid.appendChild(pad);
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const cell = document.createElement("div");
        cell.className = "cal-day";
        cell.textContent = String(day);
        if (fmt(d) === state.today) cell.classList.add("today");
        if (selected && fmt(d) === fmt(selected))
          cell.classList.add("selected");
        cell.onclick = () => {
          selected = d;
          renderCal();
        };
        grid.appendChild(cell);
      }
    }

    btnPrev.onclick = () => {
      current.setMonth(current.getMonth() - 1);
      renderCal();
    };
    btnNext.onclick = () => {
      current.setMonth(current.getMonth() + 1);
      renderCal();
    };
    btnClose.onclick = () => sheet.classList.add("hidden");
    btnApply.onclick = () => {
      if (selected) input.value = ymd(selected);
      sheet.classList.add("hidden");
    };

    openBtn.onclick = () => {
      sheet.classList.remove("hidden");
      renderCal();
    };
  }

  /* ---------- Theme ---------- */
  function setTheme(name) {
    document.documentElement.setAttribute("data-theme", name);
  }

  /* ---------- Init ---------- */
  function init() {
    starfield();

    // Auto-login if remembered:
    const lastUser = localStorage.getItem(STORAGE_LAST_USER);
    if (lastUser) {
      const data = load(lastUser);
      if (data?.user?.remember) {
        Object.assign(state, data);
        enterApp();
      }
    }

    document.getElementById("dateToday").textContent =
      new Date().toLocaleDateString();

    // Auth events
    document
      .getElementById("loginForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("username").value.trim();
        const pin = document.getElementById("pin").value.trim();
        const remember = document.getElementById("remember").checked;
        if (!username || pin.length !== 4) return;
        await login(username, pin, remember);
      });
    document.getElementById("quickDemo").addEventListener("click", () => {
      seedDemo();
      enterApp();
    });
    document.getElementById("resetAll").addEventListener("click", resetAll);
    document.getElementById("logout").addEventListener("click", logout);

    // Tabs
    document
      .querySelectorAll(".tab")
      .forEach((btn) =>
        btn.addEventListener("click", () => switchTab(btn.dataset.tab))
      );

    // Filters
    document
      .getElementById("habitView")
      .addEventListener("change", renderHabits);
    document
      .getElementById("habitSort")
      .addEventListener("change", renderHabits);
    document.getElementById("taskView").addEventListener("change", renderTasks);
    document.getElementById("taskSort").addEventListener("change", renderTasks);

    // Actions
    document
      .getElementById("addHabit")
      .addEventListener("click", () => openHabitModal());
    document
      .getElementById("addTask")
      .addEventListener("click", () => openTaskModal());

    // Settings
    document.getElementById("graceDays").value = state.settings.graceDays;
    document.getElementById("autoPauseAfter").value =
      state.settings.autoPauseAfter;
    document.getElementById("theme").value = state.settings.theme;
    document.getElementById("saveSettings").addEventListener("click", () => {
      const graceDays = Number(document.getElementById("graceDays").value);
      const autoPauseAfter = Number(
        document.getElementById("autoPauseAfter").value
      );
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

    // Mobile keyboard avoidance
    window.addEventListener(
      "resize",
      () => {
        const el = document.activeElement;
        if (el && (el.tagName === "INPUT" || el.tagName === "SELECT")) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      },
      { passive: true }
    );

    updateForgiveness();
    renderAll();
  }

  function renderAll() {
    renderHabits();
    renderTasks();
    renderStats();
  }

  /* ---------- Demo seed (for quick testing) ---------- */
  function seedDemo() {
    state.user = { username: "demo", pinHash: "demo", remember: true };
    state.habits = [
      {
        id: uid(),
        name: "Morning stretch",
        freq: "daily",
        diff: "easy",
        start: state.today,
        streak: 3,
        paused: false,
        history: { [state.today]: true },
        missesInRow: 0,
        lastCompletionDate: state.today,
        xpAwardedToday: 8,
      },
      {
        id: uid(),
        name: "Code for 60 min",
        freq: "daily",
        diff: "hard",
        start: state.today,
        streak: 7,
        paused: false,
        history: {},
        missesInRow: 1,
        lastCompletionDate: null,
        xpAwardedToday: 0,
      },
      {
        id: uid(),
        name: "Read 10 pages",
        freq: "daily",
        diff: "medium",
        start: state.today,
        streak: 5,
        paused: false,
        history: {},
        missesInRow: 2,
        lastCompletionDate: null,
        xpAwardedToday: 0,
      },
    ];
    state.tasks = [
      {
        id: uid(),
        title: "Ship UI polish",
        due: state.today,
        repeat: ["mon", "wed", "fri"],
        priority: "high",
        done: false,
        created: state.today,
        lastCompletionDate: null,
        xpAwardedToday: 0,
      },
      {
        id: uid(),
        title: "Email testers",
        due: null,
        repeat: [],
        priority: "medium",
        done: false,
        created: state.today,
        lastCompletionDate: null,
        xpAwardedToday: 0,
      },
      {
        id: uid(),
        title: "Refactor storage",
        due: state.today,
        repeat: [],
        priority: "low",
        done: true,
        created: state.today,
        lastCompletionDate: state.today,
        xpAwardedToday: 6,
      },
    ];
    for (let i = 0; i < 12; i++) {
      const d = todayStr(new Date(Date.now() - i * 86400000));
      state.logs.habitDaily[d] = Math.floor(Math.random() * 4);
      state.logs.taskDaily.added[d] = Math.floor(Math.random() * 3);
      state.logs.taskDaily.completed[d] = Math.floor(Math.random() * 3);
    }
    state.xp = 120;
    state.level = 3;
    save();
  }

  document.addEventListener("DOMContentLoaded", init);

  return { state };
})();

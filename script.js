/* ============================================
   SETUP: grab references to HTML elements
   and set up our data
   ============================================ */

const STORAGE_KEY = "myTasks";
const THEME_KEY = "myTasksTheme";

let tasks = [];
let currentFilter = "all";       // "all" | "active" | "completed"
let currentDateScope = "all";    // "all" | "today" | "week" | "month"
let editingTaskId = null;        // task currently in text-edit mode
let expandedTasks = new Set();   // ids of tasks whose subtask panel is open
let lastDeleted = null;          // { task, index } for undo
let undoTimer = null;            // setTimeout handle for undo expiry
let notifiedTaskIds = new Set(); // tasks we've already sent a reminder for this session

// Elements
const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const dueDateInput = document.getElementById("dueDateInput");
const priorityInput = document.getElementById("priorityInput");
const startTimeInput = document.getElementById("startTimeInput");
const endTimeInput = document.getElementById("endTimeInput");
const taskList = document.getElementById("taskList");
const emptyState = document.getElementById("emptyState");
const taskCount = document.getElementById("taskCount");
const clearCompletedBtn = document.getElementById("clearCompleted");
const filterButtons = document.querySelectorAll(".filter-btn[data-filter]");
const dateScopeButtons = document.querySelectorAll(".filter-btn[data-scope]");
const themeSelect = document.getElementById("themeSelect");
const reminderBtn = document.getElementById("reminderBtn");
const undoToast = document.getElementById("undoToast");
const undoMessage = document.getElementById("undoMessage");
const undoBtn = document.getElementById("undoBtn");


/* ============================================
   LOCALSTORAGE — TASKS
   ============================================ */

function loadTasks() {
  const saved = localStorage.getItem(STORAGE_KEY);
  tasks = saved ? JSON.parse(saved) : [];
  // Make sure older saved tasks (from before this update) still have the new fields
  tasks.forEach(task => {
    if (task.priority === undefined) task.priority = "medium";
    if (task.subtasks === undefined) task.subtasks = [];
    if (task.startTime === undefined) task.startTime = null;
    if (task.endTime === undefined) task.endTime = null;
  });
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}


/* ============================================
   LOCALSTORAGE — THEME
   ============================================ */

function loadTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(savedTheme);
  themeSelect.value = savedTheme;
}

function applyTheme(theme) {
  document.body.classList.remove("theme-dark", "theme-ocean", "theme-forest");
  if (theme !== "light") {
    document.body.classList.add("theme-" + theme);
  }
  localStorage.setItem(THEME_KEY, theme);
}


/* ============================================
   TASK ACTIONS
   ============================================ */

function addTask() {
  const text = taskInput.value.trim();
  const dueDate = dueDateInput.value;
  const priority = priorityInput.value;
  const startTime = startTimeInput.value;
  const endTime = endTimeInput.value;

  if (text === "") {
    return; // prevent empty tasks
  }

  const newTask = {
    id: Date.now(),
    text: text,
    completed: false,
    dueDate: dueDate || null,
    priority: priority,
    subtasks: [],
    startTime: startTime || null,
    endTime: endTime || null
  };

  tasks.push(newTask);
  saveTasks();
  taskInput.value = "";
  dueDateInput.value = "";
  priorityInput.value = "medium";
  startTimeInput.value = "";
  endTimeInput.value = "";
  renderTasks();
}

// Deletes a task, but keeps it around for a few seconds so it can be undone
function deleteTask(id) {
  const index = tasks.findIndex(task => task.id === id);
  if (index === -1) return;

  lastDeleted = { task: tasks[index], index: index };
  tasks.splice(index, 1);
  saveTasks();
  renderTasks();
  showUndoToast(`"${lastDeleted.task.text}" deleted`);
}

// Restores the most recently deleted task, if it hasn't expired yet
function undoDelete() {
  if (!lastDeleted) return;

  tasks.splice(lastDeleted.index, 0, lastDeleted.task);
  lastDeleted = null;
  clearTimeout(undoTimer);
  hideUndoToast();
  saveTasks();
  renderTasks();
}

function showUndoToast(message) {
  undoMessage.textContent = message;
  undoToast.classList.add("show");

  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    lastDeleted = null; // deletion becomes permanent
    hideUndoToast();
  }, 5000);
}

function hideUndoToast() {
  undoToast.classList.remove("show");
}

function toggleTask(id) {
  tasks = tasks.map(task =>
    task.id === id ? { ...task, completed: !task.completed } : task
  );
  saveTasks();
  renderTasks();
}

function clearCompleted() {
  tasks = tasks.filter(task => !task.completed);
  saveTasks();
  renderTasks();
}

function startEditingTask(id) {
  editingTaskId = id;
  renderTasks();
}

function saveEditedTask(id, newText) {
  const trimmed = newText.trim();

  if (trimmed === "") {
    editingTaskId = null;
    deleteTask(id);
    return;
  }

  tasks = tasks.map(task =>
    task.id === id ? { ...task, text: trimmed } : task
  );

  editingTaskId = null;
  saveTasks();
  renderTasks();
}

function updatePriority(id, newPriority) {
  tasks = tasks.map(task =>
    task.id === id ? { ...task, priority: newPriority } : task
  );
  saveTasks();
  renderTasks();
}


/* ============================================
   SUBTASKS
   ============================================ */

function toggleSubtaskPanel(taskId) {
  if (expandedTasks.has(taskId)) {
    expandedTasks.delete(taskId);
  } else {
    expandedTasks.add(taskId);
  }
  renderTasks();
}

function addSubtask(taskId, text) {
  const trimmed = text.trim();
  if (trimmed === "") return;

  tasks = tasks.map(task => {
    if (task.id === taskId) {
      const newSubtask = { id: Date.now(), text: trimmed, completed: false };
      return { ...task, subtasks: [...task.subtasks, newSubtask] };
    }
    return task;
  });

  saveTasks();
  renderTasks();
}

function toggleSubtask(taskId, subtaskId) {
  tasks = tasks.map(task => {
    if (task.id === taskId) {
      const updatedSubtasks = task.subtasks.map(sub =>
        sub.id === subtaskId ? { ...sub, completed: !sub.completed } : sub
      );
      return { ...task, subtasks: updatedSubtasks };
    }
    return task;
  });
  saveTasks();
  renderTasks();
}

function deleteSubtask(taskId, subtaskId) {
  tasks = tasks.map(task => {
    if (task.id === taskId) {
      return { ...task, subtasks: task.subtasks.filter(sub => sub.id !== subtaskId) };
    }
    return task;
  });
  saveTasks();
  renderTasks();
}


/* ============================================
   FILTERING
   ============================================ */

function filterTasks() {
  let result = tasks;

  // 1. Filter by status (All / Active / Completed)
  if (currentFilter === "active") {
    result = result.filter(task => !task.completed);
  } else if (currentFilter === "completed") {
    result = result.filter(task => task.completed);
  }

  // 2. Filter by due-date range (All dates / Today / This Week / This Month)
  //    This is recalculated from the REAL current date every time, so a task
  //    automatically appears under "Today" on the day it's due — nothing
  //    needs to be moved or re-typed manually.
  if (currentDateScope !== "all") {
    result = result.filter(task => {
      if (!task.dueDate) return false; // tasks with no due date only show under "All dates"
      const due = new Date(task.dueDate + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (currentDateScope === "today") {
        // today's tasks, plus anything overdue that still needs attention
        return due <= today;
      }
      if (currentDateScope === "week") {
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return due <= weekEnd;
      }
      if (currentDateScope === "month") {
        const monthEnd = new Date(today);
        monthEnd.setDate(monthEnd.getDate() + 29);
        return due <= monthEnd;
      }
      return true;
    });
  }

  return result;
}


/* ============================================
   DUE DATE HELPERS
   ============================================ */

function getDueDateStatus(dueDate) {
  if (!dueDate) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");

  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "due-today";
  return "";
}

function formatDueDate(dueDate) {
  const due = new Date(dueDate + "T00:00:00");
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Turns "16:00" into "4:00 PM"
function formatTime(time24) {
  const [hours, minutes] = time24.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  const paddedMinutes = minutes.toString().padStart(2, "0");
  return `${hours12}:${paddedMinutes} ${period}`;
}


/* ============================================
   REMINDERS (browser notifications)
   ============================================ */

function updateReminderButton() {
  if (!("Notification" in window)) {
    reminderBtn.textContent = "🔕 Reminders not supported in this browser";
    reminderBtn.classList.add("blocked");
    reminderBtn.disabled = true;
    return;
  }

  if (Notification.permission === "granted") {
    reminderBtn.textContent = "🔔 Reminders on";
    reminderBtn.classList.add("enabled");
    reminderBtn.classList.remove("blocked");
  } else if (Notification.permission === "denied") {
    reminderBtn.textContent = "🔕 Reminders blocked — enable in browser settings";
    reminderBtn.classList.add("blocked");
  } else {
    reminderBtn.textContent = "🔔 Enable due-date reminders";
    reminderBtn.classList.remove("enabled", "blocked");
  }
}

function requestReminderPermission() {
  if (!("Notification" in window)) return;

  Notification.requestPermission().then(() => {
    updateReminderButton();
  });
}

// Checks all tasks and sends a notification for anything due today or overdue,
// once per task per session (so it doesn't spam the same reminder every minute)
function checkDueReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  tasks.forEach(task => {
    if (task.completed) return;
    const status = getDueDateStatus(task.dueDate);
    if ((status === "overdue" || status === "due-today") && !notifiedTaskIds.has(task.id)) {
      const title = status === "overdue" ? "Task overdue" : "Task due today";
      new Notification(title, { body: task.text });
      notifiedTaskIds.add(task.id);
    }
  });
}


/* ============================================
   RENDERING
   ============================================ */

function renderTasks() {
  const visibleTasks = filterTasks();
  taskList.innerHTML = "";
  emptyState.style.display = visibleTasks.length === 0 ? "block" : "none";

  visibleTasks.forEach(task => {
    li_buildTaskItem(task);
  });

  updateTaskCount();
}

function li_buildTaskItem(task) {
  const li = document.createElement("li");
  li.className = "task-item" + (task.completed ? " completed" : "");

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-checkbox";
  checkbox.checked = task.completed;
  checkbox.setAttribute("aria-label", "Mark task as completed");
  checkbox.addEventListener("change", () => toggleTask(task.id));

  // Main column
  const main = document.createElement("div");
  main.className = "task-main";

  const textRow = document.createElement("div");
  textRow.className = "task-text-row";

  if (editingTaskId === task.id) {
    const editInput = document.createElement("input");
    editInput.type = "text";
    editInput.className = "task-edit-input";
    editInput.value = task.text;
    editInput.maxLength = 120;

    editInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveEditedTask(task.id, editInput.value);
      if (e.key === "Escape") { editingTaskId = null; renderTasks(); }
    });
    editInput.addEventListener("blur", () => saveEditedTask(task.id, editInput.value));

    textRow.appendChild(editInput);
    setTimeout(() => { editInput.focus(); editInput.select(); }, 0);

  } else {
    const span = document.createElement("span");
    span.className = "task-text";
    span.textContent = task.text;
    span.title = "Double-click to edit";
    span.addEventListener("dblclick", () => startEditingTask(task.id));
    textRow.appendChild(span);
  }

  main.appendChild(textRow);

  // Meta row: priority badge + due date badge + subtask toggle
  const metaRow = document.createElement("div");
  metaRow.className = "meta-row";

  const prioritySelect = document.createElement("select");
  prioritySelect.className = "priority-badge priority-" + task.priority;
  ["low", "medium", "high"].forEach(level => {
    const opt = document.createElement("option");
    opt.value = level;
    opt.textContent = level === "low" ? "🟢 Low" : level === "medium" ? "🟡 Medium" : "🔴 High";
    if (level === task.priority) opt.selected = true;
    prioritySelect.appendChild(opt);
  });
  prioritySelect.addEventListener("change", (e) => updatePriority(task.id, e.target.value));
  metaRow.appendChild(prioritySelect);

  // Time range badge (e.g. "4:00 PM – 6:00 PM")
  if (task.startTime || task.endTime) {
    const timeBadge = document.createElement("span");
    timeBadge.className = "time-badge";
    const startLabel = task.startTime ? formatTime(task.startTime) : "?";
    const endLabel = task.endTime ? formatTime(task.endTime) : "?";
    timeBadge.textContent = `🕒 ${startLabel} – ${endLabel}`;
    metaRow.appendChild(timeBadge);
  }

  if (task.dueDate) {
    const status = getDueDateStatus(task.dueDate);
    const badge = document.createElement("span");
    badge.className = "due-date-badge" + (status ? " " + status : "");
    const prefix = status === "overdue" ? "Overdue: " : status === "due-today" ? "Due today" : "Due ";
    badge.textContent = status === "due-today" ? prefix : prefix + formatDueDate(task.dueDate);
    metaRow.appendChild(badge);
  }

  const subtaskDoneCount = task.subtasks.filter(s => s.completed).length;
  const subtaskToggle = document.createElement("button");
  subtaskToggle.type = "button";
  subtaskToggle.className = "subtask-toggle";
  const isExpanded = expandedTasks.has(task.id);
  const arrow = isExpanded ? "▾" : "▸";
  subtaskToggle.textContent = task.subtasks.length > 0
    ? `${arrow} Subtasks (${subtaskDoneCount}/${task.subtasks.length})`
    : `${arrow} Add subtasks`;
  subtaskToggle.addEventListener("click", () => toggleSubtaskPanel(task.id));
  metaRow.appendChild(subtaskToggle);

  main.appendChild(metaRow);

  // Subtasks panel (only built when expanded)
  if (isExpanded) {
    main.appendChild(buildSubtasksPanel(task));
  }

  // Action buttons
  const actions = document.createElement("div");
  actions.className = "task-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "task-edit";
  editBtn.innerHTML = "&#9998;";
  editBtn.setAttribute("aria-label", "Edit task");
  editBtn.addEventListener("click", () => startEditingTask(task.id));

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "task-delete";
  deleteBtn.innerHTML = "&times;";
  deleteBtn.setAttribute("aria-label", "Delete task");
  deleteBtn.addEventListener("click", () => deleteTask(task.id));

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  li.appendChild(checkbox);
  li.appendChild(main);
  li.appendChild(actions);
  taskList.appendChild(li);
}

function buildSubtasksPanel(task) {
  const panel = document.createElement("div");
  panel.className = "subtasks-panel";

  task.subtasks.forEach(sub => {
    const row = document.createElement("div");
    row.className = "subtask-item" + (sub.completed ? " completed" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "subtask-checkbox";
    checkbox.checked = sub.completed;
    checkbox.addEventListener("change", () => toggleSubtask(task.id, sub.id));

    const text = document.createElement("span");
    text.className = "subtask-text";
    text.textContent = sub.text;

    const del = document.createElement("button");
    del.className = "subtask-delete";
    del.innerHTML = "&times;";
    del.setAttribute("aria-label", "Delete subtask");
    del.addEventListener("click", () => deleteSubtask(task.id, sub.id));

    row.appendChild(checkbox);
    row.appendChild(text);
    row.appendChild(del);
    panel.appendChild(row);
  });

  // Row to add a new subtask
  const addRow = document.createElement("div");
  addRow.className = "subtask-add-row";

  const addInput = document.createElement("input");
  addInput.type = "text";
  addInput.className = "subtask-add-input";
  addInput.placeholder = "Add a subtask...";
  addInput.maxLength = 100;

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "subtask-add-btn";
  addBtn.textContent = "Add";

  const submitSubtask = () => {
    addSubtask(task.id, addInput.value);
  };

  addBtn.addEventListener("click", submitSubtask);
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitSubtask();
    }
  });

  addRow.appendChild(addInput);
  addRow.appendChild(addBtn);
  panel.appendChild(addRow);

  return panel;
}

function updateTaskCount() {
  const activeCount = tasks.filter(task => !task.completed).length;
  taskCount.textContent = `${activeCount} task${activeCount === 1 ? "" : "s"} left`;
}


/* ============================================
   EVENT LISTENERS
   ============================================ */

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addTask();
});

clearCompletedBtn.addEventListener("click", clearCompleted);

themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));

reminderBtn.addEventListener("click", requestReminderPermission);

undoBtn.addEventListener("click", undoDelete);

filterButtons.forEach(button => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filterButtons.forEach(btn => {
      btn.classList.remove("active");
      btn.setAttribute("aria-selected", "false");
    });
    button.classList.add("active");
    button.setAttribute("aria-selected", "true");
    renderTasks();
  });
});

dateScopeButtons.forEach(button => {
  button.addEventListener("click", () => {
    currentDateScope = button.dataset.scope;
    dateScopeButtons.forEach(btn => {
      btn.classList.remove("active");
      btn.setAttribute("aria-selected", "false");
    });
    button.classList.add("active");
    button.setAttribute("aria-selected", "true");
    renderTasks();
  });
});


/* ============================================
   START THE APP
   ============================================ */

loadTheme();
loadTasks();
renderTasks();
updateReminderButton();
checkDueReminders();
setInterval(checkDueReminders, 60000); // re-check every minute while the app is open

// Register the service worker so the app can be installed and work offline.
// This only works when the app is served over http(s) — not when opened
// directly as a local file — so we check for that first.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.log("Service worker registration failed:", err);
    });
  });
}

const $ = (selector) => document.querySelector(selector);

const today = new Date();
today.setHours(0, 0, 0, 0);

const starterTask = {
  id: crypto.randomUUID(),
  name: "Read for 20 minutes",
  icon: "📖",
  goal: 365,
  completions: [],
};

let tasks = JSON.parse(localStorage.getItem("daymark-tasks") || "null") || [starterTask];

// Replace the original, unclear demo task without touching customized tasks.
tasks = tasks.map((task) => {
  const isUntouchedOriginal =
    task.name === "Morning pages" &&
    task.goal === 365 &&
    task.completions.length === 0;

  return isUntouchedOriginal
    ? { ...task, name: "Read for 20 minutes", icon: "📖" }
    : task;
});

let activeTaskId = localStorage.getItem("daymark-active") || tasks[0].id;
let displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedIcon = "📖";
let editingTaskId = null;
let pendingPastDate = null;
let notes = JSON.parse(localStorage.getItem("daymark-notes") || "null") || [];
let taskNoteTimer = null;
let editingNoteId = null;

// Storage and date helpers

function saveTasks() {
  localStorage.setItem("daymark-tasks", JSON.stringify(tasks));
  localStorage.setItem("daymark-active", activeTaskId);
}

function saveNotes() {
  localStorage.setItem("daymark-notes", JSON.stringify(notes));
}

function getActiveTask() {
  return tasks.find((task) => task.id === activeTaskId) || tasks[0];
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

function calculateStreaks(task) {
  const completedDates = new Set(task.completions);
  const orderedDates = [...completedDates]
    .map(parseDateKey)
    .sort((first, second) => first - second);

  let bestStreak = 0;
  let runningStreak = 0;
  let previousDate = null;

  orderedDates.forEach((date) => {
    const followsPreviousDay = previousDate && date - previousDate === 86_400_000;
    runningStreak = followsPreviousDay ? runningStreak + 1 : 1;
    bestStreak = Math.max(bestStreak, runningStreak);
    previousDate = date;
  });

  let currentStreak = 0;
  const cursor = new Date(today);

  // The current streak remains alive until today has ended.
  if (!completedDates.has(getDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (completedDates.has(getDateKey(cursor))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { current: currentStreak, best: bestStreak };
}

// Rendering

function showTracker() {
  $("#mainContent").hidden = false;
  $("#notesPage").hidden = true;
  $("#notesNavButton").classList.remove("active");
}

function showNotes() {
  $("#mainContent").hidden = true;
  $("#notesPage").hidden = false;
  $("#notesNavButton").classList.add("active");
  renderNotes();
}

function renderTaskList() {
  $("#taskList").innerHTML = tasks
    .map(
      (task) => `
        <button class="task-item ${task.id === activeTaskId ? "active" : ""}" data-id="${task.id}">
          <span class="mini-icon">${task.icon}</span>
          <span>${escapeHtml(task.name)}</span>
        </button>`,
    )
    .join("");

  document.querySelectorAll(".task-item").forEach((button) => {
    button.addEventListener("click", () => {
      activeTaskId = button.dataset.id;
      showTracker();
      saveTasks();
      renderApp();
    });
  });
}

function renderCalendar() {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const task = getActiveTask();

  $("#monthTitle").textContent = displayedMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // Convert JavaScript's Sunday-first day index to Monday-first.
  const mondayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const firstCalendarDate = new Date(year, month, 1 - mondayOffset);
  const dayCells = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(firstCalendarDate);
    date.setDate(firstCalendarDate.getDate() + index);

    const key = getDateKey(date);
    const isCompleted = task.completions.includes(key);
    const isToday = key === getDateKey(today);
    const isOutsideMonth = date.getMonth() !== month;
    const isFuture = date > today;

    const classes = [
      "day",
      isCompleted && "completed",
      isToday && "today",
      isOutsideMonth && "other",
      isFuture && "future",
    ].filter(Boolean).join(" ");

    dayCells.push(`
      <button
        class="${classes}"
        data-date="${key}"
        ${isFuture ? "disabled" : ""}
        aria-label="${date.toDateString()}${isCompleted ? ", completed" : ""}"
      >
        <span class="day-num">${date.getDate()}</span>
        ${isCompleted ? '<span class="check">✓</span>' : ""}
      </button>`);
  }

  $("#calendarGrid").innerHTML = dayCells.join("");

  document.querySelectorAll(".day:not(.future)").forEach((button) => {
    button.addEventListener("click", () => toggleDay(button.dataset.date));
  });
}

function renderNotes() {
  const orderedNotes = [...notes].sort((first, second) => {
    if (!first.date) return 1;
    if (!second.date) return -1;
    return new Date(first.date) - new Date(second.date);
  });

  $("#notesList").innerHTML = orderedNotes
    .map((note) => {
      const date = note.date ? new Date(note.date) : null;
      const dateLabel = date
        ? date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "";
      const timeLabel = date
        ? date.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })
        : "";

      return `
        <article class="note-item">
          <div class="note-date ${date ? "" : "no-date"}">
            ${date ? `<strong>${dateLabel}</strong><span>${timeLabel}</span>` : "NOTE"}
          </div>
          <div class="note-content">
            <strong>${escapeHtml(note.title)}</strong>
            ${note.body ? `<p>${escapeHtml(note.body)}</p>` : ""}
          </div>
          <div class="note-actions">
            <button class="edit-note" data-note-id="${note.id}" aria-label="Edit ${escapeHtml(note.title)}">Edit</button>
            <button class="delete-note" data-note-id="${note.id}" aria-label="Delete ${escapeHtml(note.title)}">×</button>
          </div>
        </article>`;
    })
    .join("");

  $("#emptyNotes").hidden = notes.length > 0;

  document.querySelectorAll(".edit-note").forEach((button) => {
    button.addEventListener("click", () => {
      const note = notes.find((item) => item.id === button.dataset.noteId);
      if (!note) return;

      editingNoteId = note.id;
      $("#noteTitleInput").value = note.title;
      $("#noteDateInput").value = note.date || "";
      $("#noteBodyInput").value = note.body || "";
      $("#saveNoteButton").textContent = "Save changes";
      $("#cancelNoteEdit").hidden = false;
      $("#noteTitleInput").focus();
      $("#noteForm").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  document.querySelectorAll(".delete-note").forEach((button) => {
    button.addEventListener("click", () => {
      notes = notes.filter((note) => note.id !== button.dataset.noteId);
      if (editingNoteId === button.dataset.noteId) resetNoteForm();
      saveNotes();
      renderNotes();
      showToast("Note deleted");
    });
  });
}

function renderApp() {
  if (!tasks.length) {
    tasks = [{ ...starterTask, id: crypto.randomUUID() }];
    activeTaskId = tasks[0].id;
    saveTasks();
  }

  const task = getActiveTask();
  const totalDays = new Set(task.completions).size;
  const percentage = Math.min(100, Math.round((totalDays / task.goal) * 100));
  const streaks = calculateStreaks(task);

  $("#taskNoteInput").value = task.note || "";
  $("#taskNoteStatus").textContent = "Saved";
  $("#taskIcon").textContent = task.icon;
  $("#taskTitle").textContent = task.name;
  $("#goalText").textContent = `Goal: ${task.goal.toLocaleString()} days`;
  $("#percentText").textContent = `${percentage}%`;
  $("#progressFill").style.width = `${percentage}%`;
  $("#currentStreak").textContent = streaks.current;
  $("#bestStreak").textContent = streaks.best;
  $("#totalDays").textContent = totalDays;
  $("#totalGoal").textContent = `/ ${task.goal.toLocaleString()}`;

  $("#encouragementTitle").textContent = streaks.current
    ? `${streaks.current} day${streaks.current === 1 ? "" : "s"} strong. Keep the rhythm.`
    : "Your journey starts today.";

  $("#encouragementText").textContent = totalDays >= task.goal
    ? "You reached your goal. That is something to celebrate."
    : "Show up for yourself—one day at a time.";

  renderTaskList();
  renderCalendar();
}

// Task and calendar actions

function toggleDay(key) {
  const task = getActiveTask();
  const completionIndex = task.completions.indexOf(key);

  if (completionIndex >= 0) {
    task.completions.splice(completionIndex, 1);
    showToast("Check-in removed");
    saveTasks();
    renderApp();
    return;
  }

  if (key !== getDateKey(today)) {
    openPastDayModal(key);
    return;
  }

  markDayComplete(key);
}

function markDayComplete(key) {
  getActiveTask().completions.push(key);
  saveTasks();
  renderApp();
  showToast("Day marked complete — nice work!");
}

function openPastDayModal(key) {
  pendingPastDate = key;
  const readableDate = parseDateKey(key).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  $("#pastDayMessage").textContent = `You are about to record ${readableDate} as completed. Only continue if you completed this task on that day.`;
  $("#pastDayConfirmation").value = "";
  $("#confirmPastDay").disabled = true;
  $("#pastDayModal").classList.add("open");
  setTimeout(() => $("#pastDayConfirmation").focus(), 50);
}

function closePastDayModal() {
  $("#pastDayModal").classList.remove("open");
  $("#pastDayConfirmation").value = "";
  $("#confirmPastDay").disabled = true;
  pendingPastDate = null;
}

function openTaskModal(editExistingTask = false) {
  editingTaskId = editExistingTask ? activeTaskId : null;
  const task = editExistingTask ? getActiveTask() : null;

  selectedIcon = task?.icon || "📖";
  $("#modalTitle").textContent = editExistingTask ? "Edit your task" : "Create a new task";
  $("#submitTask").textContent = editExistingTask ? "Save changes" : "Start tracking";
  $("#taskNameInput").value = task?.name || "";
  $("#goalInput").value = task?.goal || 365;
  $("#goalUnit").value = "days";
  $("#goalUnit").disabled = editExistingTask;

  document.querySelectorAll("#iconPicker button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.icon === selectedIcon);
  });

  $("#taskModal").classList.add("open");
  setTimeout(() => $("#taskNameInput").focus(), 50);
}

function closeTaskModal() {
  $("#taskModal").classList.remove("open");
  editingTaskId = null;
  $("#goalUnit").disabled = false;
}

function showToast(message) {
  $("#toast p").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(window.toastTimer);

  window.toastTimer = setTimeout(() => {
    $("#toast").classList.remove("show");
  }, 2400);
}

// Event listeners

$("#taskNoteInput").addEventListener("input", (event) => {
  getActiveTask().note = event.target.value;
  $("#taskNoteStatus").textContent = "Saving...";
  clearTimeout(taskNoteTimer);
  taskNoteTimer = setTimeout(() => {
    saveTasks();
    $("#taskNoteStatus").textContent = "Saved";
  }, 350);
});

function resetNoteForm() {
  editingNoteId = null;
  $("#noteForm").reset();
  $("#saveNoteButton").textContent = "Add note";
  $("#cancelNoteEdit").hidden = true;
}

$("#cancelNoteEdit").addEventListener("click", resetNoteForm);

$("#noteForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const title = $("#noteTitleInput").value.trim();
  const body = $("#noteBodyInput").value.trim();
  const date = $("#noteDateInput").value;
  if (!title) return;

  if (editingNoteId) {
    const note = notes.find((item) => item.id === editingNoteId);
    if (!note) return;

    note.title = title;
    note.body = body;
    note.date = date;
    note.updatedAt = new Date().toISOString();
  } else {
    notes.push({
      id: crypto.randomUUID(),
      title,
      body,
      date,
      createdAt: new Date().toISOString(),
    });
  }

  const message = editingNoteId ? "Note updated" : "Note added";
  saveNotes();
  renderNotes();
  resetNoteForm();
  showToast(message);
});

$("#taskForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const name = $("#taskNameInput").value.trim();
  const unit = $("#goalUnit").value;
  let goal = Number($("#goalInput").value);

  if (!name || goal < 1) return;

  if (editingTaskId) {
    const task = getActiveTask();
    task.name = name;
    task.icon = selectedIcon;
    task.goal = goal;
    showToast("Task updated");
  } else {
    const unitMultipliers = { days: 1, weeks: 7, months: 30, years: 365 };
    goal *= unitMultipliers[unit];

    const newTask = {
      id: crypto.randomUUID(),
      name,
      icon: selectedIcon,
      goal,
      completions: [],
    };

    tasks.push(newTask);
    activeTaskId = newTask.id;
    showToast("New task created");
  }

  saveTasks();
  closeTaskModal();
  renderApp();
});

$("#newTaskButton").addEventListener("click", () => {
  showTracker();
  openTaskModal();
});
$("#addTaskLink").addEventListener("click", () => {
  showTracker();
  openTaskModal();
});
$("#notesNavButton").addEventListener("click", showNotes);
$("#closeModal").addEventListener("click", closeTaskModal);

$("#taskModal").addEventListener("click", (event) => {
  if (event.target === $("#taskModal")) closeTaskModal();
});

$("#pastDayConfirmation").addEventListener("input", (event) => {
  $("#confirmPastDay").disabled = event.target.value.trim() !== "Continue";
});

$("#pastDayForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if ($("#pastDayConfirmation").value.trim() !== "Continue" || !pendingPastDate) return;

  const confirmedDate = pendingPastDate;
  closePastDayModal();
  markDayComplete(confirmedDate);
});

$("#closePastDayModal").addEventListener("click", closePastDayModal);
$("#cancelPastDay").addEventListener("click", closePastDayModal);
$("#pastDayModal").addEventListener("click", (event) => {
  if (event.target === $("#pastDayModal")) closePastDayModal();
});

$("#iconPicker").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  selectedIcon = button.dataset.icon;
  document.querySelectorAll("#iconPicker button").forEach((iconButton) => {
    iconButton.classList.toggle("selected", iconButton === button);
  });
});

$("#prevMonth").addEventListener("click", () => {
  displayedMonth.setMonth(displayedMonth.getMonth() - 1);
  renderCalendar();
});

$("#nextMonth").addEventListener("click", () => {
  displayedMonth.setMonth(displayedMonth.getMonth() + 1);
  renderCalendar();
});

$("#todayButton").addEventListener("click", () => {
  displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  renderCalendar();
});

$("#moreButton").addEventListener("click", () => {
  $("#taskMenu").classList.toggle("open");
});

$("#editTaskButton").addEventListener("click", () => {
  $("#taskMenu").classList.remove("open");
  openTaskModal(true);
});

$("#resetTaskButton").addEventListener("click", () => {
  if (confirm("Clear all completed days for this task?")) {
    getActiveTask().completions = [];
    saveTasks();
    renderApp();
    showToast("Check-ins cleared");
  }

  $("#taskMenu").classList.remove("open");
});

$("#restoreStarterButton").addEventListener("click", () => {
  const shouldRestore = confirm(
    "Restore the starter setup? This will permanently delete every task and check-in on this device.",
  );

  if (!shouldRestore) return;

  const restoredTask = { ...starterTask, id: crypto.randomUUID() };
  tasks = [restoredTask];
  activeTaskId = restoredTask.id;
  displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  saveTasks();
  renderApp();
  $("#taskMenu").classList.remove("open");
  showToast("Starter setup restored");
});
$("#deleteTaskButton").addEventListener("click", () => {
  if (tasks.length === 1) {
    showToast("Keep at least one task");
    return;
  }

  if (confirm(`Delete “${getActiveTask().name}”?`)) {
    tasks = tasks.filter((task) => task.id !== activeTaskId);
    activeTaskId = tasks[0].id;
    saveTasks();
    renderApp();
    showToast("Task deleted");
  }

  $("#taskMenu").classList.remove("open");
});

$("#themeButton").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const theme = document.body.classList.contains("dark") ? "dark" : "light";
  localStorage.setItem("daymark-theme", theme);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTaskModal();
    closePastDayModal();
    $("#taskMenu").classList.remove("open");
  }
});

// Initial setup

if (localStorage.getItem("daymark-theme") === "dark") {
  document.body.classList.add("dark");
}

renderApp();
renderNotes();

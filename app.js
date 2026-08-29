function $(selector) {
  return document.querySelector(selector);
}

const today = new Date();
today.setHours(0, 0, 0, 0);

const starterTask = {
  id: crypto.randomUUID(),
  name: "Read for 20 minutes",
  icon: "📖",
  goal: 365,
  goalMode: "cumulative",
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
let goals = JSON.parse(localStorage.getItem("daymark-goals") || "null") || [];
let editingGoalId = null;
let draggedTaskId = null;

// Storage and date helpers

function saveTasks() {
  localStorage.setItem("daymark-tasks", JSON.stringify(tasks));
  localStorage.setItem("daymark-active", activeTaskId);
}

function saveNotes() {
  localStorage.setItem("daymark-notes", JSON.stringify(notes));
}

function saveGoals() {
  localStorage.setItem("daymark-goals", JSON.stringify(goals));
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

function setActivePage(page) {
  $("#mainContent").hidden = page !== "tracker";
  $("#notesPage").hidden = page !== "notes";
  $("#goalsPage").hidden = page !== "goals";
  $("#notesNavButton").classList.toggle("active", page === "notes");
  $("#goalsNavButton").classList.toggle("active", page === "goals");

  document.querySelectorAll(".task-item").forEach((button) => {
    button.classList.toggle(
      "active",
      page === "tracker" && button.dataset.id === activeTaskId,
    );
  });
}

function showTracker() {
  setActivePage("tracker");
}

function showNotes() {
  setActivePage("notes");
  renderNotes();
}

function showGoals() {
  setActivePage("goals");
  renderGoals();
}
function renderTaskList() {
  $("#taskList").innerHTML = tasks
    .map((task) => {
      const totalDays = new Set(task.completions).size;
      const goalMode = task.goalMode || "cumulative";
      const progressDays =
        goalMode === "consecutive"
          ? calculateStreaks(task).current
          : totalDays;
      const percentage = Math.min(
        100,
        Math.round((progressDays / task.goal) * 100),
      );

      return `
        <button class="task-item ${task.id === activeTaskId ? "active" : ""}" data-id="${task.id}" draggable="true" title="Drag to reorder; Alt + Up/Down also works">
          <span class="mini-icon">${task.icon}</span>
          <span class="task-item-info">
            <span class="task-item-label">
              <span class="task-item-name">${escapeHtml(task.name)}</span>
              <span class="task-item-percent">${percentage}%</span>
            </span>
            <span class="task-item-progress" role="progressbar" aria-label="${escapeHtml(task.name)} progress" aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100">
              <i style="width: ${percentage}%"></i>
            </span>
            <span class="task-item-mode ${goalMode}">${goalMode}</span>
          </span>
        </button>`;
    })
    .join("");

  document.querySelectorAll(".task-item").forEach((button) => {
    button.addEventListener("click", () => {
      activeTaskId = button.dataset.id;
      showTracker();
      saveTasks();
      renderApp();
    });

    button.addEventListener("dragstart", (event) => {
      draggedTaskId = button.dataset.id;
      button.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedTaskId);
    });

    button.addEventListener("dragover", (event) => {
      if (!draggedTaskId || draggedTaskId === button.dataset.id) return;
      event.preventDefault();
      document.querySelectorAll(".task-item.drag-over").forEach((item) => {
        item.classList.remove("drag-over", "drop-after");
      });
      const placeAfter = event.clientY > button.getBoundingClientRect().top + button.offsetHeight / 2;
      button.classList.add("drag-over");
      button.classList.toggle("drop-after", placeAfter);
    });

    button.addEventListener("drop", (event) => {
      event.preventDefault();
      if (!draggedTaskId || draggedTaskId === button.dataset.id) return;
      const placeAfter = event.clientY > button.getBoundingClientRect().top + button.offsetHeight / 2;
      reorderTask(draggedTaskId, button.dataset.id, placeAfter);
    });

    button.addEventListener("dragend", clearTaskDragState);

    button.addEventListener("keydown", (event) => {
      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      moveTask(button.dataset.id, event.key === "ArrowUp" ? -1 : 1);
    });
  });
}

function reorderTask(taskId, targetId, placeAfter) {
  const sourceIndex = tasks.findIndex((task) => task.id === taskId);
  if (sourceIndex < 0) return;

  const [movedTask] = tasks.splice(sourceIndex, 1);
  const targetIndex = tasks.findIndex((task) => task.id === targetId);
  tasks.splice(targetIndex + (placeAfter ? 1 : 0), 0, movedTask);
  saveTasks();
  clearTaskDragState();
  renderTaskList();
}

function moveTask(taskId, direction) {
  const currentIndex = tasks.findIndex((task) => task.id === taskId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= tasks.length) return;

  [tasks[currentIndex], tasks[nextIndex]] = [tasks[nextIndex], tasks[currentIndex]];
  saveTasks();
  renderTaskList();
  document.querySelector(`.task-item[data-id="${taskId}"]`)?.focus();
}

function clearTaskDragState() {
  draggedTaskId = null;
  document.querySelectorAll(".task-item").forEach((item) => {
    item.classList.remove("dragging", "drag-over", "drop-after");
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
  const sortNotes = (items) => [...items].sort((first, second) => {
    if (!first.date && !second.date) {
      return new Date(second.createdAt) - new Date(first.createdAt);
    }
    if (!first.date) return 1;
    if (!second.date) return -1;
    return new Date(first.date) - new Date(second.date);
  });

  const activeNotes = sortNotes(notes.filter((note) => !note.completed));
  const completedNotes = sortNotes(notes.filter((note) => note.completed));

  const createNoteMarkup = (note, isCompleted) => {
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
    const completedDate = note.completedAt ? new Date(note.completedAt) : null;
    const completedLabel = completedDate
      ? completedDate.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Date unavailable";

    return `
      <article class="note-item ${isCompleted ? "completed-note" : ""}">
        <div class="note-date ${date ? "" : "no-date"}">
          ${date ? `<strong>${dateLabel}</strong><span>${timeLabel}</span>` : "NOTE"}
        </div>
        <div class="note-content">
          <strong>${escapeHtml(note.title)}</strong>
          ${note.body ? `<p>${escapeHtml(note.body)}</p>` : ""}
          ${isCompleted ? `<span class="note-completed-date">Completed ${completedLabel}</span>` : ""}
        </div>
        <div class="note-actions">
          <button class="toggle-note" data-note-id="${note.id}">${isCompleted ? "Restore" : "Complete"}</button>
          ${isCompleted ? "" : `<button class="edit-note" data-note-id="${note.id}" aria-label="Edit ${escapeHtml(note.title)}">Edit</button>`}
          <button class="delete-note" data-note-id="${note.id}" aria-label="Delete ${escapeHtml(note.title)}">×</button>
        </div>
      </article>`;
  };

  $("#notesList").innerHTML = activeNotes
    .map((note) => createNoteMarkup(note, false))
    .join("");
  $("#completedNotesList").innerHTML = completedNotes
    .map((note) => createNoteMarkup(note, true))
    .join("");

  $("#emptyNotes").hidden = activeNotes.length > 0;
  $("#completedNotesSection").hidden = completedNotes.length === 0;
  $("#completedNotesCount").textContent =
    `${completedNotes.length} note${completedNotes.length === 1 ? "" : "s"}`;

  document.querySelectorAll(".toggle-note").forEach((button) => {
    button.addEventListener("click", () => {
      const note = notes.find((item) => item.id === button.dataset.noteId);
      if (!note) return;

      note.completed = !note.completed;
      note.completedAt = note.completed ? new Date().toISOString() : null;
      if (editingNoteId === note.id) resetNoteForm();
      saveNotes();
      renderNotes();
      showToast(note.completed ? "Note completed" : "Note restored");
    });
  });

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
function renderGoals() {
  const sortGoals = (items) => [...items].sort((first, second) => {
    if (!first.targetDate && !second.targetDate) {
      return new Date(second.createdAt) - new Date(first.createdAt);
    }
    if (!first.targetDate) return 1;
    if (!second.targetDate) return -1;
    return new Date(first.targetDate) - new Date(second.targetDate);
  });

  const activeGoals = sortGoals(goals.filter((goal) => !goal.completed));
  const completedGoals = sortGoals(goals.filter((goal) => goal.completed));

  const createGoalMarkup = (goal, isCompleted) => {
    const targetDate = goal.targetDate
      ? new Date(`${goal.targetDate}T00:00:00`)
      : null;
    const targetLabel = targetDate
      ? targetDate.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "No target date";
    const completedLabel = goal.completedAt
      ? new Date(goal.completedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "";

    return `
      <article class="goal-item ${isCompleted ? "completed-goal" : ""}">
        <div class="goal-target-date">
          <span>${isCompleted ? "ACHIEVED" : "TARGET"}</span>
          <strong>${isCompleted ? completedLabel : targetLabel}</strong>
        </div>
        <div class="goal-content">
          <strong>${escapeHtml(goal.title)}</strong>
          ${goal.body ? `<p>${escapeHtml(goal.body)}</p>` : ""}
        </div>
        <div class="goal-actions">
          <button class="toggle-goal" data-goal-id="${goal.id}">${isCompleted ? "Restore" : "Complete"}</button>
          ${isCompleted ? "" : `<button class="edit-goal" data-goal-id="${goal.id}">Edit</button>`}
          <button class="delete-goal" data-goal-id="${goal.id}" aria-label="Delete ${escapeHtml(goal.title)}">×</button>
        </div>
      </article>`;
  };

  $("#goalsList").innerHTML = activeGoals
    .map((goal) => createGoalMarkup(goal, false))
    .join("");
  $("#completedGoalsList").innerHTML = completedGoals
    .map((goal) => createGoalMarkup(goal, true))
    .join("");
  $("#emptyGoals").hidden = activeGoals.length > 0;
  $("#completedGoalsSection").hidden = completedGoals.length === 0;
  $("#completedGoalsCount").textContent =
    `${completedGoals.length} goal${completedGoals.length === 1 ? "" : "s"}`;

  document.querySelectorAll(".toggle-goal").forEach((button) => {
    button.addEventListener("click", () => {
      const goal = goals.find((item) => item.id === button.dataset.goalId);
      if (!goal) return;
      goal.completed = !goal.completed;
      goal.completedAt = goal.completed ? new Date().toISOString() : null;
      if (editingGoalId === goal.id) resetGoalForm();
      saveGoals();
      renderGoals();
      showToast(goal.completed ? "Goal completed" : "Goal restored");
    });
  });

  document.querySelectorAll(".edit-goal").forEach((button) => {
    button.addEventListener("click", () => {
      const goal = goals.find((item) => item.id === button.dataset.goalId);
      if (!goal) return;
      editingGoalId = goal.id;
      $("#goalTitleInput").value = goal.title;
      $("#goalDateInput").value = goal.targetDate || "";
      $("#goalBodyInput").value = goal.body || "";
      $("#saveGoalButton").textContent = "Save changes";
      $("#cancelGoalEdit").hidden = false;
      $("#goalTitleInput").focus();
      $("#goalForm").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  document.querySelectorAll(".delete-goal").forEach((button) => {
    button.addEventListener("click", () => {
      goals = goals.filter((goal) => goal.id !== button.dataset.goalId);
      if (editingGoalId === button.dataset.goalId) resetGoalForm();
      saveGoals();
      renderGoals();
      showToast("Goal deleted");
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
  const streaks = calculateStreaks(task);
  const goalMode = task.goalMode || "cumulative";
  const progressDays = goalMode === "consecutive" ? streaks.current : totalDays;
  const percentage = Math.min(100, Math.round((progressDays / task.goal) * 100));

  $("#taskNoteInput").value = task.note || "";
  $("#taskNoteStatus").textContent = "Saved";
  $("#taskIcon").textContent = task.icon;
  $("#taskTitle").textContent = task.name;
  $("#goalText").textContent = `Goal: ${task.goal.toLocaleString()} ${goalMode} days`;
  $("#percentText").textContent = `${percentage}%`;
  $("#progressFill").style.width = `${percentage}%`;
  $("#currentStreak").textContent = streaks.current;
  $("#bestStreak").textContent = streaks.best;
  $("#totalDays").textContent = totalDays;
  $("#totalGoal").textContent = goalMode === "consecutive" ? "all time" : `/ ${task.goal.toLocaleString()}`;

  $("#encouragementTitle").textContent = streaks.current
    ? `${streaks.current} day${streaks.current === 1 ? "" : "s"} strong. Keep the rhythm.`
    : "Your journey starts today.";

  $("#encouragementText").textContent = progressDays >= task.goal
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
  $("#goalModeInput").value = task?.goalMode || "cumulative";
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

function resetGoalForm() {
  editingGoalId = null;
  $("#goalForm").reset();
  $("#saveGoalButton").textContent = "Add goal";
  $("#cancelGoalEdit").hidden = true;
}

$("#cancelGoalEdit").addEventListener("click", resetGoalForm);

$("#goalForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("#goalTitleInput").value.trim();
  const targetDate = $("#goalDateInput").value;
  const body = $("#goalBodyInput").value.trim();
  if (!title) return;

  if (editingGoalId) {
    const goal = goals.find((item) => item.id === editingGoalId);
    if (!goal) return;
    goal.title = title;
    goal.targetDate = targetDate;
    goal.body = body;
    goal.updatedAt = new Date().toISOString();
  } else {
    goals.push({
      id: crypto.randomUUID(),
      title,
      targetDate,
      body,
      completed: false,
      createdAt: new Date().toISOString(),
    });
  }

  const message = editingGoalId ? "Goal updated" : "Goal added";
  saveGoals();
  renderGoals();
  resetGoalForm();
  showToast(message);
});

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
      completed: false,
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
  const goalMode = $("#goalModeInput").value;
  let goal = Number($("#goalInput").value);

  if (!name || goal < 1) return;

  if (editingTaskId) {
    const task = getActiveTask();
    task.name = name;
    task.icon = selectedIcon;
    task.goal = goal;
    task.goalMode = goalMode;
    showToast("Task updated");
  } else {
    const unitMultipliers = { days: 1, weeks: 7, months: 30, years: 365 };
    goal *= unitMultipliers[unit];

    const newTask = {
      id: crypto.randomUUID(),
      name,
      icon: selectedIcon,
      goal,
      goalMode,
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
$("#goalsNavButton").addEventListener("click", showGoals);
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
renderGoals();

const $ = (selector) => document.querySelector(selector);

const today = new Date();
today.setHours(0, 0, 0, 0);

const starterTask = {
  id: crypto.randomUUID(),
  name: "Morning pages",
  icon: "✦",
  goal: 365,
  completions: [],
};

let tasks = JSON.parse(localStorage.getItem("daymark-tasks") || "null") || [starterTask];
let activeTaskId = localStorage.getItem("daymark-active") || tasks[0].id;
let displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedIcon = "✦";
let editingTaskId = null;

// Storage and date helpers

function saveTasks() {
  localStorage.setItem("daymark-tasks", JSON.stringify(tasks));
  localStorage.setItem("daymark-active", activeTaskId);
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
  } else {
    task.completions.push(key);
    showToast("Day marked complete — nice work!");
  }

  saveTasks();
  renderApp();
}

function openTaskModal(editExistingTask = false) {
  editingTaskId = editExistingTask ? activeTaskId : null;
  const task = editExistingTask ? getActiveTask() : null;

  selectedIcon = task?.icon || "✦";
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

$("#newTaskButton").addEventListener("click", () => openTaskModal());
$("#addTaskLink").addEventListener("click", () => openTaskModal());
$("#closeModal").addEventListener("click", closeTaskModal);

$("#taskModal").addEventListener("click", (event) => {
  if (event.target === $("#taskModal")) closeTaskModal();
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
    $("#taskMenu").classList.remove("open");
  }
});

// Initial setup

if (localStorage.getItem("daymark-theme") === "dark") {
  document.body.classList.add("dark");
}

renderApp();

const defaultHabits = [
  { id: 1, name: "Wake up early", sticker: "🌅", completed: {} },
  { id: 2, name: "Exercise", sticker: "🏋️", completed: {} },
  { id: 3, name: "Read 20 minutes", sticker: "📚", completed: {} },
  { id: 4, name: "Drink 8 glasses of water", sticker: "💧", completed: {} },
  { id: 5, name: "Plan tomorrow", sticker: "📝", completed: {} }
];

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const viewSizes = ["micro", "tiny", "compact", "comfortable", "large"];

let today = new Date();
let todayKey = getDateKey(today);

const habitRows = document.getElementById("habitRows");
const weekHeaders = document.getElementById("weekHeaders");
const dayHeaders = document.getElementById("dayHeaders");
const dayProgressHeaders = document.getElementById("dayProgressHeaders");
const chartMenuButton = document.getElementById("chartMenuButton");
const chartMenu = document.getElementById("chartMenu");
const habitModal = document.getElementById("habitModal");
const habitForm = document.getElementById("habitForm");
const habitName = document.getElementById("habitName");
const detailsModal = document.getElementById("habitDetailsModal");
const confirmModal = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancelButton = document.getElementById("confirmCancel");
const confirmAcceptButton = document.getElementById("confirmAccept");
const detailsTitle = document.getElementById("detailsTitle");
const taskConfirmModal = document.getElementById("taskConfirmModal");
const taskConfirmMessage = document.getElementById("taskConfirmMessage");
const taskConfirmList = document.getElementById("taskConfirmList");
const acceptTaskConfirmButton = document.getElementById("acceptTaskConfirm");
const detailsChecklist = document.getElementById("detailsChecklist");
const detailsForm = document.getElementById("detailsForm");
const showDetailsFormButton = document.getElementById("showDetailsForm");
const detailInput = document.getElementById("detailInput");
const cancelDetailButton = document.getElementById("cancelDetailButton");
const barChart = document.getElementById("barChart");
const installButton = document.getElementById("installButton");

let deferredInstallPrompt = null;
let appInstalled = false;
let detailsHabitId = null;
let habitColumnResize = null;
let holdTimer = null;
let progressPanelVisible = false;
let habitZoomIndex = getSavedZoom();
const savedChartMode = readStorage("consistencyChartMode", "daily");
let chartMode = ["daily", "weekly", "monthly"].includes(savedChartMode)
  ? savedChartMode
  : "daily";
let viewedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let monthDates = getMonthDates(viewedMonth);
let habitMonths = getSavedHabitMonths();
let habits = getHabitsForMonth(viewedMonth);

updateCurrentDate();

function readStorage(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}

function showConfirmation(message, title = "Are you sure?", acceptLabel = "Delete") {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    let finished = false;

    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmAcceptButton.textContent = acceptLabel;
    confirmModal.classList.remove("hidden");

    const finish = (confirmed) => {
      if (finished) return;
      finished = true;
      confirmModal.classList.add("hidden");
      confirmCancelButton.removeEventListener("click", cancel);
      confirmAcceptButton.removeEventListener("click", accept);
      confirmModal.removeEventListener("click", dismissBackdrop);
      confirmModal.removeEventListener("keydown", trapFocus);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
      resolve(confirmed);
    };
    const cancel = () => finish(false);
    const accept = () => finish(true);
    const dismissBackdrop = (event) => {
      if (event.target === confirmModal) cancel();
    };
    const trapFocus = (event) => {
      if (event.key !== "Tab") return;
      if (event.shiftKey && document.activeElement === confirmCancelButton) {
        event.preventDefault();
        confirmAcceptButton.focus();
      } else if (!event.shiftKey && document.activeElement === confirmAcceptButton) {
        event.preventDefault();
        confirmCancelButton.focus();
      }
    };

    confirmCancelButton.addEventListener("click", cancel);
    confirmAcceptButton.addEventListener("click", accept);
    confirmModal.addEventListener("click", dismissBackdrop);
    confirmModal.addEventListener("keydown", trapFocus);
    confirmCancelButton.focus();
  });
}

function createDefaultHabits() {
  return defaultHabits.map((habit) => ({
    ...habit,
    completed: {}
  }));
}

function updateCurrentDate() {
  document.getElementById("currentDate").textContent = today.toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", year: "numeric" }
  );
}

function refreshToday() {
  const currentDate = new Date();
  const currentKey = getDateKey(currentDate);

  if (currentKey === todayKey) return;

  today = currentDate;
  todayKey = currentKey;
  updateCurrentDate();

  if (
    viewedMonth.getFullYear() === today.getFullYear() &&
    viewedMonth.getMonth() === today.getMonth()
  ) {
    renderMonth();
  } else {
    updateStats();
  }

  if (!detailsModal.classList.contains("hidden")) renderDetailsChecklist();
}

function getSavedZoom() {
  const storedZoom = readStorage("consistencyHabitZoom");
  if (storedZoom === null || storedZoom.trim() === "") return 2;

  const savedZoom = Number(storedZoom);
  if (!Number.isInteger(savedZoom)) return 2;

  return Math.max(0, Math.min(viewSizes.length - 1, savedZoom));
}

function normalizeHabits(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((habit) => habit && typeof habit.name === "string")
    .map((habit, index) => ({
      id: habit.id ?? `${Date.now()}-${index}`,
      name: habit.name.trim(),
      sticker: habit.sticker || getSticker(habit.name),
      completed:
        habit.completed && typeof habit.completed === "object"
          ? habit.completed
          : {},
      details: Array.isArray(habit.details)
        ? habit.details
            .filter((detail) => detail && typeof detail.text === "string")
            .map((detail, detailIndex) => ({
              id: detail.id ?? `${Date.now()}-${index}-${detailIndex}`,
              text: detail.text.trim(),
              completed: detail.completed && typeof detail.completed === "object"
                ? detail.completed
                : {}
            }))
            .filter((detail) => detail.text)
        : []
    }))
    .filter((habit) => habit.name);
}

function getSavedHabitMonths() {
  try {
    const savedMonths = JSON.parse(readStorage("consistencyHabitMonths", "null"));

    if (savedMonths && typeof savedMonths === "object") {
      return Object.fromEntries(
        Object.entries(savedMonths).map(([key, value]) => [key, normalizeHabits(value)])
      );
    }

    const oldHabits = JSON.parse(readStorage("consistencyHabits", "null"));
    return { [getMonthKey(viewedMonth)]: normalizeHabits(oldHabits).length
      ? normalizeHabits(oldHabits)
      : createDefaultHabits() };
  } catch {
    return { [getMonthKey(viewedMonth)]: createDefaultHabits() };
  }
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getHabitsForMonth(date) {
  const key = getMonthKey(date);
  if (!habitMonths[key]) habitMonths[key] = [];
  return habitMonths[key];
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getProgressDates() {
  const isCurrentMonth =
    viewedMonth.getFullYear() === today.getFullYear() &&
    viewedMonth.getMonth() === today.getMonth();

  return isCurrentMonth
    ? monthDates.filter((dateKey) => dateKey <= todayKey)
    : monthDates;
}

function getMonthDates(date) {
  const dates = [];
  const daysInMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0
  ).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(getDateKey(new Date(date.getFullYear(), date.getMonth(), day)));
  }

  return dates;
}

function saveHabits() {
  habitMonths[getMonthKey(viewedMonth)] = habits;
  writeStorage("consistencyHabitMonths", JSON.stringify(habitMonths));
}

function setHabitColumnWidth(width) {
  const safeWidth = Math.max(145, Math.min(205, Number(width) || 165));
  document.body.style.setProperty("--habit-column-width", `${safeWidth}px`);
  document.querySelector(".habit-column-resizer")?.setAttribute("aria-valuenow", String(safeWidth));
  writeStorage("consistencyHabitColumnWidth", String(safeWidth));
}

function setHabitSize(index) {
  habitZoomIndex = Math.max(0, Math.min(viewSizes.length - 1, index));

  document.body.classList.remove(
    "view-micro",
    "view-tiny",
    "view-compact",
    "view-comfortable",
    "view-large"
  );

  document.body.classList.add(`view-${viewSizes[habitZoomIndex]}`);
  writeStorage("consistencyHabitZoom", String(habitZoomIndex));

  document.getElementById("zoomOut").disabled = habitZoomIndex === 0;
  document.getElementById("zoomIn").disabled =
    habitZoomIndex === viewSizes.length - 1;
}

function renderMonth() {
  habits = getHabitsForMonth(viewedMonth);
  monthDates = getMonthDates(viewedMonth);

  document.getElementById("monthTitle").textContent =
    viewedMonth.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    });

  renderHeaders();
  renderHabits();
  renderChart();
}

function renderHeaders() {
  weekHeaders.innerHTML = '<th class="habit-column habit-heading"><span>Habit</span><button class="habit-column-resizer" type="button" role="separator" aria-orientation="vertical" aria-label="Resize habit name panel" aria-valuemin="145" aria-valuemax="205" title="Drag to resize habit name panel"></button><button id="progressPanelToggle" class="progress-toggle" type="button" aria-expanded="false" aria-label="Show habit progress" title="Show habit progress">▾</button></th>';
  const resizeHandle = document.querySelector(".habit-column-resizer");
  resizeHandle.setAttribute("aria-valuenow", String(parseFloat(getComputedStyle(document.body).getPropertyValue("--habit-column-width")) || 165));
  dayHeaders.innerHTML = '<th class="habit-column">Days</th>';
  dayProgressHeaders.innerHTML = '<th class="habit-column">Progress</th>';
  document.querySelector(".table-wrapper").classList.toggle("has-progress", progressPanelVisible);
  document.querySelector(".habit-table").classList.toggle("with-progress", progressPanelVisible);

  if (progressPanelVisible) {
    weekHeaders.insertAdjacentHTML("beforeend", '<th class="progress-column" rowspan="2"><span class="progress-heading-title">Habit completion rate</span><small class="progress-heading-subtitle">Completed days out of days in view</small></th>');
    dayProgressHeaders.insertAdjacentHTML("beforeend", '<td class="progress-column" aria-hidden="true"></td>');
  }

  const progressPanelToggle = document.getElementById("progressPanelToggle");
  progressPanelToggle.setAttribute("aria-expanded", String(progressPanelVisible));
  progressPanelToggle.setAttribute("aria-label", `${progressPanelVisible ? "Hide" : "Show"} habit progress`);
  progressPanelToggle.title = `${progressPanelVisible ? "Hide" : "Show"} habit progress`;
  progressPanelToggle.textContent = progressPanelVisible ? "▴" : "▾";
  progressPanelToggle.addEventListener("click", () => {
    progressPanelVisible = !progressPanelVisible;
    renderHeaders();
    renderHabits();
  });

  for (let start = 0; start < monthDates.length; start += 7) {
    const weekHeader = document.createElement("th");
    const weekNumber = Math.floor(start / 7) + 1;
    const daysInWeek = Math.min(7, monthDates.length - start);

    weekHeader.className = "week-header";
    weekHeader.colSpan = daysInWeek;
    weekHeader.textContent = `${weekNumber}${getOrdinal(weekNumber)} week`;
    weekHeaders.appendChild(weekHeader);
  }

  monthDates.forEach((dateKey, index) => {
    const date = new Date(`${dateKey}T12:00:00`);
    const th = document.createElement("th");

    th.className = [
      dateKey === todayKey ? "today" : "",
      index % 7 === 0 ? "week-start" : "",
      index % 7 === 6 || index === monthDates.length - 1 ? "week-end" : ""
    ].filter(Boolean).join(" ");

    th.innerHTML = `
      <span class="day-name">${dayNames[date.getDay()]}</span>
      <span>${date.getDate()}</span>
    `;

    dayHeaders.appendChild(th);

    const progressCell = document.createElement("th");
    const completedCount = habits.filter((habit) => habit.completed[dateKey]).length;
    const progress = habits.length ? Math.round((completedCount / habits.length) * 100) : 0;
    const progressCircle = document.createElement("span");
    const progressText = document.createElement("span");

    progressCircle.className = "day-progress";
    progressCircle.style.background = `conic-gradient(var(--green) 0deg ${progress * 3.6}deg, #173452 ${progress * 3.6}deg 360deg)`;
    progressText.textContent = `${progress}%`;
    progressCircle.appendChild(progressText);
    progressCell.appendChild(progressCircle);
    progressCell.className = th.className;
    dayProgressHeaders.appendChild(progressCell);
  });

}

function renderHabits() {
  habitRows.innerHTML = "";

  habits.forEach((habit) => {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");

    nameCell.className = "habit-name";
    nameCell.innerHTML = `
      <span class="habit-sticker">${escapeHtml(habit.sticker)}</span>
      <span class="habit-title" title="${escapeHtml(habit.name)}">${escapeHtml(habit.name)}</span>
      <button class="delete-habit" data-id="${escapeHtml(String(habit.id))}" title="Delete habit" aria-label="Delete ${escapeHtml(habit.name)}">×</button>
    `;

    nameCell.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      openHabitDetails(habit.id);
    });
    nameCell.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => openHabitDetails(habit.id), 2000);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
      nameCell.addEventListener(eventName, () => clearTimeout(holdTimer));
    });
    nameCell.addEventListener("contextmenu", (event) => event.preventDefault());

    row.appendChild(nameCell);

    if (progressPanelVisible) {
      const elapsedDates = getProgressDates();
      const completedCount = elapsedDates.filter((dateKey) => habit.completed[dateKey]).length;
      const progressPercent = elapsedDates.length
        ? Math.round((completedCount / elapsedDates.length) * 100)
        : 0;
      const progressCell = document.createElement("td");
      const progressBar = document.createElement("span");
      const progressFill = document.createElement("span");
      const progressLabel = document.createElement("span");

      progressCell.className = "habit-progress-cell";
      progressBar.className = "habit-progress";
      progressBar.setAttribute("role", "progressbar");
      progressBar.setAttribute("aria-label", `${habit.name} progress`);
      progressBar.setAttribute("aria-valuemin", "0");
      progressBar.setAttribute("aria-valuemax", "100");
      progressBar.setAttribute("aria-valuenow", String(progressPercent));
      progressFill.className = "habit-progress-fill";
      progressFill.style.width = `${progressPercent}%`;
      progressLabel.className = "habit-progress-label";
      progressLabel.textContent = `${progressPercent}% · ${completedCount}/${elapsedDates.length} days`;
      progressBar.appendChild(progressFill);
      progressCell.append(progressBar, progressLabel);
      row.appendChild(progressCell);
    }

    monthDates.forEach((dateKey, index) => {
      const cell = document.createElement("td");

      cell.className = [
        "check-cell",
        dateKey === todayKey ? "today" : "",
        index % 7 === 0 ? "week-start" : "",
        index % 7 === 6 || index === monthDates.length - 1 ? "week-end" : ""
      ].filter(Boolean).join(" ");

      const button = document.createElement("button");
      const completed = Boolean(habit.completed[dateKey]);

      button.className = `check-button ${completed ? "completed" : ""}`;
      button.textContent = completed ? "✓" : "";
      button.setAttribute("type", "button");
      button.setAttribute("aria-pressed", String(completed));
      button.setAttribute("aria-label", `${habit.name}: ${dateKey}`);
      button.addEventListener("click", () => toggleHabit(habit.id, dateKey));

      cell.appendChild(button);
      row.appendChild(cell);
    });

    habitRows.appendChild(row);
  });

  document.querySelectorAll(".delete-habit").forEach((button) => {
    button.addEventListener("click", () => deleteHabit(button.dataset.id));
  });

  updateStats();
}

function renderChart() {
  const isWeekly = chartMode === "weekly";
  const isYearly = chartMode === "monthly";
  const groups = isYearly
    ? Array.from({ length: 12 }, (_, monthIndex) => {
        const month = new Date(viewedMonth.getFullYear(), monthIndex, 1);
        const dates = getMonthDates(month);
        const monthHabits = habitMonths[getMonthKey(month)] || [];
        const possible = monthHabits.length * dates.length;
        const completed = monthHabits.reduce(
          (total, habit) => total + dates.filter((dateKey) => habit.completed[dateKey]).length,
          0
        );

        return {
          label: month.toLocaleDateString("en-US", { month: "short" }),
          value: possible ? (completed / possible) * 100 : 0,
          title: `${month.toLocaleDateString("en-US", { month: "long" })}: ${Math.round(possible ? (completed / possible) * 100 : 0)}% complete`
        };
      })
    : (isWeekly
        ? Array.from({ length: Math.ceil(monthDates.length / 7) }, (_, index) => monthDates.slice(index * 7, index * 7 + 7))
        : monthDates.map((dateKey) => [dateKey]));

  barChart.innerHTML = "";
  barChart.className = `bar-chart ${isYearly ? "monthly" : isWeekly ? "weekly" : "daily"}`;
  document.getElementById("chartTitle").textContent = isYearly
    ? "Monthly progress"
    : isWeekly ? "Weekly completions" : "Daily completions";
  document.getElementById("chartSubtitle").textContent = isYearly
    ? `Progress for ${viewedMonth.getFullYear()}`
    : isWeekly ? "One bar represents one week" : "One bar represents one day";
  document.querySelectorAll("[data-chart-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.chartMode === chartMode);
  });

  groups.forEach((group, groupIndex) => {
    let value;
    let labelText;
    let title;
    let dateKey;

    if (isYearly) {
      value = group.value;
      labelText = group.label;
      title = group.title;
    } else {
      dateKey = group[0];
      const completedCount = group.reduce(
        (total, key) => total + habits.filter((habit) => habit.completed[key]).length,
        0
      );
      value = habits.length
        ? (completedCount / (habits.length * group.length)) * 100
        : 0;
      const date = new Date(`${dateKey}T12:00:00`);
      labelText = isWeekly ? `W${groupIndex + 1}` : date.getDate();
      title = isWeekly
        ? `Week ${groupIndex + 1}: ${completedCount} completion${completedCount === 1 ? "" : "s"}`
        : `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${completedCount} completion${completedCount === 1 ? "" : "s"}`;
    }

    const column = document.createElement("div");
    const fill = document.createElement("div");
    const label = document.createElement("span");

    column.className = `bar-column ${isWeekly ? "weekly" : ""}`;
    fill.className = "bar-fill";
    label.className = "bar-label";
    fill.style.height = `${Math.max(value, 3)}%`;
    label.textContent = labelText;
    column.title = title;
    column.setAttribute("aria-label", title);
    column.append(fill, label);
    barChart.appendChild(column);
  });
}

function confirmHabitTasks(habit, dateKey) {
  return new Promise((resolve) => {
    const tasks = Array.isArray(habit.details) ? habit.details : [];
    const checkboxes = [];
    let finished = false;

    taskConfirmMessage.textContent = `Confirm that you completed every task for “${habit.name}”.`;
    taskConfirmList.innerHTML = "";
    acceptTaskConfirmButton.disabled = true;

    tasks.forEach((task) => {
      const item = document.createElement("li");
      const checkbox = document.createElement("input");
      const label = document.createElement("span");

      checkbox.type = "checkbox";
      checkbox.checked = Boolean(task.completed?.[dateKey]);
      checkbox.setAttribute("aria-label", task.text);
      label.textContent = task.text;
      checkbox.addEventListener("change", () => {
        acceptTaskConfirmButton.disabled = !checkboxes.every((entry) => entry.checked);
      });
      checkboxes.push(checkbox);
      item.append(checkbox, label);
      taskConfirmList.appendChild(item);
    });

    acceptTaskConfirmButton.disabled = !checkboxes.every((checkbox) => checkbox.checked);
    taskConfirmModal.classList.remove("hidden");

    const finish = (confirmed) => {
      if (finished) return;
      finished = true;
      taskConfirmModal.classList.add("hidden");
      acceptTaskConfirmButton.removeEventListener("click", accept);
      document.getElementById("cancelTaskConfirm").removeEventListener("click", cancel);
      document.getElementById("closeTaskConfirm").removeEventListener("click", cancel);
      taskConfirmModal.removeEventListener("click", dismissBackdrop);
      resolve(confirmed);
    };
    const cancel = () => finish(false);
    const accept = () => {
      if (checkboxes.some((checkbox) => !checkbox.checked)) return;
      tasks.forEach((task) => {
        task.completed = task.completed && typeof task.completed === "object"
          ? task.completed
          : {};
        task.completed[dateKey] = true;
      });
      finish(true);
    };
    const dismissBackdrop = (event) => {
      if (event.target === taskConfirmModal) cancel();
    };

    acceptTaskConfirmButton.addEventListener("click", accept);
    document.getElementById("cancelTaskConfirm").addEventListener("click", cancel);
    document.getElementById("closeTaskConfirm").addEventListener("click", cancel);
    taskConfirmModal.addEventListener("click", dismissBackdrop);
    taskConfirmList.querySelector("input:not(:checked)")?.focus();
  });
}

async function toggleHabit(habitId, dateKey) {
  const habit = habits.find((item) => String(item.id) === String(habitId));

  if (!habit) return;

  const isCompleting = !Boolean(habit.completed[dateKey]);
  if (isCompleting && habit.details?.length && !(await confirmHabitTasks(habit, dateKey))) return;

  habit.completed[dateKey] = isCompleting;
  saveHabits();
  renderHeaders();
  renderHabits();
  renderChart();
}

async function deleteHabit(habitId) {
  const habit = habits.find((item) => String(item.id) === String(habitId));
  if (!habit || !(await showConfirmation(`Delete “${habit.name}” and its history?`, "Delete habit?"))) return;

  habits = habits.filter(
    (habit) => String(habit.id) !== String(habitId)
  );
  saveHabits();
  renderHeaders();
  renderHabits();
  renderChart();
}

function openHabitDetails(habitId) {
  const habit = habits.find((item) => String(item.id) === String(habitId));
  if (!habit) return;

  detailsHabitId = String(habit.id);
  detailsTitle.textContent = `${habit.name} details`;
  renderDetailsChecklist();
  detailsForm.classList.add("hidden");
  showDetailsFormButton.setAttribute("aria-expanded", "false");
  detailsModal.classList.remove("hidden");
}

function renderDetailsChecklist() {
  const habit = habits.find((item) => String(item.id) === detailsHabitId);
  detailsChecklist.innerHTML = "";
  if (!habit) return;

  habit.details = Array.isArray(habit.details) ? habit.details : [];

  if (habit.details.length === 0) {
    const emptyMessage = document.createElement("li");
    emptyMessage.className = "details-empty-state";
    emptyMessage.textContent = "No steps yet. Tap ＋ to add your first one.";
    detailsChecklist.appendChild(emptyMessage);
    return;
  }

  habit.details.forEach((detail) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    const removeButton = document.createElement("button");
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    detail.completed = detail.completed && typeof detail.completed === "object"
      ? detail.completed
      : {};
    checkbox.checked = Boolean(detail.completed[todayKey]);
    checkbox.setAttribute("aria-label", `Complete ${detail.text} today`);
    text.textContent = detail.text;
    item.classList.toggle("done", checkbox.checked);
    checkbox.addEventListener("change", () => {
      detail.completed[todayKey] = checkbox.checked;
      item.classList.toggle("done", checkbox.checked);
      saveHabits();
    });

    removeButton.type = "button";
    removeButton.className = "detail-remove-button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove task: ${detail.text}`);
    removeButton.title = "Remove task";
    removeButton.addEventListener("click", async () => {
      if (!(await showConfirmation(`Remove “${detail.text}”?`, "Remove task?", "Remove"))) return;
      habit.details = habit.details.filter((item) => String(item.id) !== String(detail.id));
      saveHabits();
      renderDetailsChecklist();
    });

    item.append(text, removeButton, checkbox);
    detailsChecklist.appendChild(item);
  });
}

function closeHabitDetails() {
  detailsModal.classList.add("hidden");
  detailsForm.classList.add("hidden");
  detailsForm.reset();
  showDetailsFormButton.setAttribute("aria-expanded", "false");
  detailsHabitId = null;
}

function updateStats() {
  const currentMonthHabits = habitMonths[getMonthKey(today)] || [];
  const todayCompleted = currentMonthHabits.filter(
    (habit) => habit.completed[todayKey]
  ).length;

  const monthCompleted = habits.reduce(
    (total, habit) =>
      total + monthDates.filter((date) => habit.completed[date]).length,
    0
  );

  const possibleCompletions = habits.length * monthDates.length;
  const progress = possibleCompletions
    ? Math.round((monthCompleted / possibleCompletions) * 100)
    : 0;
  const elapsedDates = monthDates.filter((dateKey) => dateKey <= todayKey);
  const toDateCompleted = habits.reduce(
    (total, habit) => total + elapsedDates.filter((date) => habit.completed[date]).length,
    0
  );
  const toDatePossible = habits.length * elapsedDates.length;
  const toDateProgress = toDatePossible
    ? Math.round((toDateCompleted / toDatePossible) * 100)
    : 0;

  document.getElementById("todayCount").textContent =
    `${todayCompleted} / ${currentMonthHabits.length}`;

  document.getElementById("weeklyProgress").textContent = `${progress}%`;
  document.getElementById("toDateProgress").textContent = `${toDateProgress}%`;

  document.getElementById("completionSummary").textContent =
    `${monthCompleted} completion${monthCompleted === 1 ? "" : "s"} this month`;
}

function changeMonth(amount) {
  saveHabits();
  viewedMonth = new Date(
    viewedMonth.getFullYear(),
    viewedMonth.getMonth() + amount,
    1
  );

  renderMonth();
}

function getSticker(name) {
  const habitName = name.toLowerCase();

  if (/read|book|study|learn/.test(habitName)) return "📚";
  if (/exercise|gym|run|walk|workout|fitness/.test(habitName)) return "🏋️";
  if (/water|drink|hydrate/.test(habitName)) return "💧";
  if (/sleep|wake|morning|early/.test(habitName)) return "🌅";
  if (/food|eat|cook|meal|diet/.test(habitName)) return "🍎";
  if (/meditat|calm|mindful|pray/.test(habitName)) return "🧘";
  if (/work|task|plan|organize/.test(habitName)) return "📝";
  if (/music|instrument|sing/.test(habitName)) return "🎵";
  if (/money|save|budget/.test(habitName)) return "💰";

  return "⭐";
}

function getOrdinal(number) {
  const lastTwoDigits = number % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return "th";

  switch (number % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openModal() {
  habitModal.classList.remove("hidden");
  habitName.focus();
}

function closeModal() {
  habitModal.classList.add("hidden");
  habitForm.reset();
}

function isInstalledApp() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function updateInstallButton() {
  installButton.hidden = appInstalled || isInstalledApp();
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButton();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  appInstalled = true;
  updateInstallButton();
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    window.alert("To install, open your browser’s menu and choose ‘Add to Home Screen’ or ‘Install app’.");
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});

updateInstallButton();

chartMenuButton.addEventListener("click", () => {
  const isHidden = chartMenu.classList.toggle("hidden");
  chartMenuButton.setAttribute("aria-expanded", String(!isHidden));
});

document.querySelectorAll("[data-chart-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    chartMode = button.dataset.chartMode;
    writeStorage("consistencyChartMode", chartMode);
    chartMenu.classList.add("hidden");
    chartMenuButton.setAttribute("aria-expanded", "false");
    renderChart();
  });
});

document.addEventListener("click", (event) => {
  if (!chartMenu.contains(event.target) && event.target !== chartMenuButton) {
    chartMenu.classList.add("hidden");
    chartMenuButton.setAttribute("aria-expanded", "false");
  }
});

document.getElementById("addHabitButton").addEventListener("click", openModal);
document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("cancelButton").addEventListener("click", closeModal);
document.getElementById("closeDetailsModal").addEventListener("click", closeHabitDetails);
showDetailsFormButton.addEventListener("click", () => {
  const isOpening = detailsForm.classList.contains("hidden");
  detailsForm.classList.toggle("hidden", !isOpening);
  showDetailsFormButton.setAttribute("aria-expanded", String(isOpening));
  if (isOpening) detailInput.focus();
});
cancelDetailButton.addEventListener("click", () => {
  detailsForm.reset();
  detailsForm.classList.add("hidden");
  showDetailsFormButton.setAttribute("aria-expanded", "false");
});
detailsModal.addEventListener("click", (event) => {
  if (event.target === detailsModal) closeHabitDetails();
});

detailsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const habit = habits.find((item) => String(item.id) === detailsHabitId);
  const text = detailInput.value.trim();
  if (!habit || !text) return;

  habit.details = Array.isArray(habit.details) ? habit.details : [];
  habit.details.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    completed: {}
  });
  saveHabits();
  renderDetailsChecklist();
  detailsForm.reset();
  detailsForm.classList.add("hidden");
  showDetailsFormButton.setAttribute("aria-expanded", "false");
});

document.getElementById("previousMonth").addEventListener("click", () => {
  changeMonth(-1);
});

document.getElementById("nextMonth").addEventListener("click", () => {
  changeMonth(1);
});

document.getElementById("zoomOut").addEventListener("click", () => {
  setHabitSize(habitZoomIndex - 1);
});

document.getElementById("zoomIn").addEventListener("click", () => {
  setHabitSize(habitZoomIndex + 1);
});

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest?.(".habit-column-resizer")) return;
  event.preventDefault();
  habitColumnResize = {
    startX: event.clientX,
    startWidth: parseFloat(getComputedStyle(document.body).getPropertyValue("--habit-column-width")) || 165
  };
  document.body.classList.add("resizing-habit-column");
});

document.addEventListener("pointermove", (event) => {
  if (!habitColumnResize) return;
  setHabitColumnWidth(habitColumnResize.startWidth + event.clientX - habitColumnResize.startX);
});

function finishHabitColumnResize() {
  habitColumnResize = null;
  document.body.classList.remove("resizing-habit-column");
}

document.addEventListener("pointerup", finishHabitColumnResize);
document.addEventListener("pointercancel", finishHabitColumnResize);

document.addEventListener("keydown", (event) => {
  const resizeHandle = event.target.closest?.(".habit-column-resizer");
  if (resizeHandle && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const currentWidth = parseFloat(getComputedStyle(document.body).getPropertyValue("--habit-column-width")) || 165;
    setHabitColumnWidth(currentWidth + (event.key === "ArrowRight" ? 5 : -5));
    return;
  }

  if (event.key !== "Escape") return;
  if (!taskConfirmModal.classList.contains("hidden")) {
    document.getElementById("cancelTaskConfirm").click();
    return;
  }
  if (!confirmModal.classList.contains("hidden")) {
    confirmCancelButton.click();
    return;
  }
  if (!chartMenu.classList.contains("hidden")) {
    chartMenu.classList.add("hidden");
    chartMenuButton.setAttribute("aria-expanded", "false");
  }
  if (!detailsModal.classList.contains("hidden")) {
    closeHabitDetails();
  } else if (!habitModal.classList.contains("hidden")) {
    closeModal();
  }
});

habitModal.addEventListener("click", (event) => {
  if (event.target === habitModal) closeModal();
});

habitForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = habitName.value.trim();
  if (!name) return;

  habits.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    sticker: getSticker(name),
    completed: {}
  });

  saveHabits();
  renderHeaders();
  renderHabits();
  renderChart();
  closeModal();
});

document.getElementById("todayButton").addEventListener("click", () => {
  refreshToday();

  viewedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  renderMonth();

  const todayCell = document.querySelector(".check-cell.today");
  const tableWrapper = todayCell?.closest(".table-wrapper");

  // Keep the page position stable while bringing today into view horizontally.
  if (todayCell && tableWrapper && tableWrapper.scrollWidth > tableWrapper.clientWidth) {
    const targetLeft = todayCell.offsetLeft - (tableWrapper.clientWidth - todayCell.offsetWidth) / 2;
    tableWrapper.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: "smooth"
    });
  }
});

saveHabits();
setHabitSize(habitZoomIndex);
setHabitColumnWidth(readStorage("consistencyHabitColumnWidth", 165));
renderMonth();

window.setInterval(refreshToday, 60000);
const defaultHabits = [
  { id: 1, name: "Wake up early", sticker: "🌅", completed: {} },
  { id: 2, name: "Exercise", sticker: "🏋️", completed: {} },
  { id: 3, name: "Read 20 minutes", sticker: "📚", completed: {} },
  { id: 4, name: "Drink 8 glasses of water", sticker: "💧", completed: {} },
  { id: 5, name: "Plan tomorrow", sticker: "📝", completed: {} }
];

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const viewSizes = ["micro", "tiny", "compact", "comfortable", "large"];
const availableStickers = new Set(
  [...document.querySelectorAll("[data-sticker]")].map((button) => button.dataset.sticker)
);

let today = new Date();
let todayKey = getDateKey(today);

const habitRows = document.getElementById("habitRows");
const weekHeaders = document.getElementById("weekHeaders");
const dayHeaders = document.getElementById("dayHeaders");
const dayProgressHeaders = document.getElementById("dayProgressHeaders");
const monthMenuButton = document.getElementById("monthMenuButton");
const monthMenu = document.getElementById("monthMenu");
const monthStartModal = document.getElementById("monthStartModal");
let monthStartTargetKey = null;
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
const detailsSticker = document.getElementById("detailsSticker");
let selectedSticker = null;
const taskConfirmModal = document.getElementById("taskConfirmModal");
const taskConfirmMessage = document.getElementById("taskConfirmMessage");
const taskConfirmList = document.getElementById("taskConfirmList");
const acceptTaskConfirmButton = document.getElementById("acceptTaskConfirm");
const detailsChecklist = document.getElementById("detailsChecklist");
const detailsForm = document.getElementById("detailsForm");
const editHabitForm = document.getElementById("editHabitForm");
const habitEditModal = document.getElementById("habitEditModal");
const taskEditModal = document.getElementById("taskEditModal");
const editHabitName = document.getElementById("editHabitName");
const editHabitButton = document.getElementById("editHabitButton");
const showDetailsFormButton = document.getElementById("showDetailsForm");
const detailInput = document.getElementById("detailInput");
const detailFormLabel = document.getElementById("detailFormLabel");
const saveDetailButton = document.getElementById("saveDetailButton");
const barChart = document.getElementById("barChart");
const installButton = document.getElementById("installButton");
const taskRuleButton = document.getElementById("taskRuleButton");
const taskRuleMenu = document.getElementById("taskRuleMenu");
const taskRuleValue = document.getElementById("taskRuleValue");
const taskThresholdInput = document.getElementById("taskThreshold");
const taskThresholdLabel = document.getElementById("taskThresholdLabel");

let deferredInstallPrompt = null;
let appInstalled = false;
let detailsHabitId = null;
let editingTaskId = null;
let habitColumnResize = null;
let progressPanelVisible = false;

let habitZoomIndex = getSavedZoom();
const chartMode = "daily";
let viewedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let monthDates = getMonthDates(viewedMonth);
let habitMonths = getSavedHabitMonths();
let focusPeriod = getSavedFocusPeriod();
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
    days: ["everyday"],
    completed: {},
    details: [],
    paused: false,
    pausedAt: null,
    pausedPeriods: [],
    skipped: {},
    taskRule: "half",
    taskThreshold: 50
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

  const previousMonthKey = getMonthKey(today);
  today = currentDate;
  todayKey = currentKey;
  updateCurrentDate();

  const monthChanged = previousMonthKey !== getMonthKey(today);
  if (monthChanged && getMonthKey(viewedMonth) === previousMonthKey) {
    viewedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    renderMonth();
  } else if (
    viewedMonth.getFullYear() === today.getFullYear() &&
    viewedMonth.getMonth() === today.getMonth()
  ) {
    renderMonth();
  } else {
    updateStats();
  }

  if (!detailsModal.classList.contains("hidden")) renderDetailsChecklist();
  if (monthChanged) openMonthStartPrompt();
}

function getSavedZoom() {
  const storedZoom = readStorage("consistencyHabitZoom");
  if (storedZoom === null || storedZoom.trim() === "") return 2;

  const savedZoom = Number(storedZoom);
  if (!Number.isInteger(savedZoom)) return 2;

  return Math.max(0, Math.min(viewSizes.length - 1, savedZoom));
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeSchedule(days) {
  if (!Array.isArray(days) || days.length === 0 || days.includes("everyday")) return ["everyday"];
  const validDays = [...new Set(days.flatMap((day) => {
    if (isValidDateKey(day)) return [day];
    const weekday = Number(day);
    return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? [weekday] : [];
  }))];
  return validDays.length ? validDays : ["everyday"];
}

function isScheduled(days, dateKey) {
  const schedule = normalizeSchedule(days);
  return schedule.includes("everyday") || schedule.includes(dateKey) ||
    schedule.includes(new Date(`${dateKey}T12:00:00`).getDay());
}

function isHabitScheduled(habit, dateKey) {
  const pausedNow = habit.paused && dateKey >= (habit.pausedAt || todayKey);
  return !isHabitSkipped(habit, dateKey) && !pausedNow &&
    !(habit.pausedPeriods || []).some((period) =>
      dateKey >= period.from && dateKey <= period.to
    ) && isScheduled(habit.days, dateKey);
}

function isHabitSkipped(habit, dateKey) {
  return Boolean(habit.skipped?.[dateKey]);
}

function readDaySelector(selector) {
  if (selector.classList.contains("custom-mode")) {
    return [...selector.querySelectorAll(".custom-date-picker input:checked")]
      .map((input) => input.value);
  }

  const selected = [...selector.querySelectorAll('.weekday-options input:checked')]
    .map((input) => Number(input.value));
  return selector.querySelector('input[value="everyday"]').checked || selected.length === 0
    ? ["everyday"]
    : selected;
}

function renderCustomDatePicker(selector, selectedDates = []) {
  const picker = selector.querySelector(".custom-date-picker");
  if (!picker) return;
  const selected = new Set(
    selectedDates.filter(isValidDateKey)
  );
  picker.innerHTML = "";
  const monthHeading = document.createElement("span");
  monthHeading.className = "custom-date-heading";
  monthHeading.textContent = viewedMonth.toLocaleDateString("en-US", {
    month: "long", year: "numeric"
  });
  picker.appendChild(monthHeading);

  monthDates.forEach((dateKey) => {
    const date = new Date(`${dateKey}T12:00:00`);
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = dateKey;
    input.dataset.customDate = "true";
    input.checked = selected.has(dateKey);
    input.setAttribute("aria-label", date.toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric"
    }));
    label.className = "custom-date-option";
    label.title = input.getAttribute("aria-label");
    label.append(input, String(date.getDate()));
    picker.appendChild(label);
  });
}

function setDaySelector(selector, days) {
  const schedule = normalizeSchedule(days);
  const customDates = schedule.filter(isValidDateKey);
  const customMode = customDates.length > 0;
  selector.classList.toggle("custom-mode", customMode);
  selector.querySelectorAll(".weekday-options input").forEach((input) => {
    input.checked = !customMode && !schedule.includes("everyday") && schedule.includes(Number(input.value));
  });
  selector.querySelector('input[value="everyday"]').checked = !customMode && schedule.includes("everyday");
  selector.classList.toggle("everyday-mode", !customMode && schedule.includes("everyday"));
  renderCustomDatePicker(selector, customDates);
  const toggle = selector.querySelector(".custom-days-toggle");
  const picker = selector.querySelector(".custom-date-picker");
  toggle?.setAttribute("aria-expanded", String(customMode));
  picker?.classList.toggle("hidden", !customMode);
}

function normalizeHabits(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((habit) => habit && typeof habit.name === "string")
    .map((habit, index) => ({
      id: habit.id ?? `${Date.now()}-${index}`,
      name: habit.name.trim(),
      sticker: typeof habit.sticker === "string" && habit.sticker.trim()
        ? habit.sticker.trim()
        : getDefaultSticker(habit.name),
      days: normalizeSchedule(habit.days),
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
              days: normalizeSchedule(detail.days),
              completed: detail.completed && typeof detail.completed === "object"
                ? detail.completed
                : {}
            }))
            .filter((detail) => detail.text)
        : [],
      paused: Boolean(habit.paused),
      pausedAt: isValidDateKey(habit.pausedAt) ? habit.pausedAt : null,
      pausedPeriods: Array.isArray(habit.pausedPeriods)
        ? habit.pausedPeriods.filter((period) => period && isValidDateKey(period.from) && isValidDateKey(period.to) && period.to >= period.from)
        : [],
      skipped: habit.skipped && typeof habit.skipped === "object" ? habit.skipped : {},
      taskRule: ["half", "all", "custom"].includes(habit.taskRule) ? habit.taskRule : "half",
      taskThreshold: Math.max(1, Math.min(100, Number(habit.taskThreshold) || 50))
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

function getSavedFocusPeriod() {
  try {
    const period = JSON.parse(readStorage("consistencyFocusPeriod", "null"));
    if (!period || typeof period.name !== "string" ||
        !isValidDateKey(period.start) || !isValidDateKey(period.end) ||
        period.end < period.start) return null;
    return { name: period.name.trim(), start: period.start, end: period.end };
  } catch {
    return null;
  }
}

function updateFocusPeriodLabel() {
  const label = document.getElementById("focusPeriodLabel");
  if (!focusPeriod) {
    label.classList.add("hidden");
    label.textContent = "";
    return;
  }
  const formatDate = (dateKey) => new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
  label.textContent = `${focusPeriod.name}: ${formatDate(focusPeriod.start)} – ${formatDate(focusPeriod.end)}`;
  label.classList.remove("hidden");
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

function getHabitDayProgress(habit, dateKey) {
  if (!isHabitScheduled(habit, dateKey)) return 0;
  const tasks = (Array.isArray(habit.details) ? habit.details : [])
    .filter((task) => isScheduled(task.days, dateKey));
  if (tasks.length === 0) return habit.completed[dateKey] ? 1 : 0;

  const hasTaskHistory = tasks.some((task) =>
    Object.prototype.hasOwnProperty.call(task.completed || {}, dateKey)
  );
  if (!hasTaskHistory) return habit.completed[dateKey] ? 1 : 0;

  const completedTasks = tasks.filter((task) => task.completed?.[dateKey]).length;
  return completedTasks / tasks.length;
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
  updateFocusPeriodLabel();

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
    weekHeaders.insertAdjacentHTML("beforeend", '<th class="progress-column" rowspan="2"><span class="progress-heading-title">Habit task progress</span><small class="progress-heading-subtitle">Task-weighted progress over days in view</small></th>');
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
      focusPeriod && dateKey >= focusPeriod.start && dateKey <= focusPeriod.end ? "focus-period-day" : "",
      index % 7 === 0 ? "week-start" : "",
      index % 7 === 6 || index === monthDates.length - 1 ? "week-end" : ""
    ].filter(Boolean).join(" ");

    th.innerHTML = `
      <span class="day-name">${dayNames[date.getDay()]}</span>
      <span>${date.getDate()}</span>
    `;

    dayHeaders.appendChild(th);

    const progressCell = document.createElement("th");
    const scheduledHabits = habits.filter((habit) => isHabitScheduled(habit, dateKey));
    const completedProgress = scheduledHabits.reduce(
      (total, habit) => total + getHabitDayProgress(habit, dateKey),
      0
    );
    const progress = scheduledHabits.length
      ? Math.round((completedProgress / scheduledHabits.length) * 100)
      : 0;
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
    nameCell.addEventListener("contextmenu", (event) => event.preventDefault());

    row.appendChild(nameCell);

    if (progressPanelVisible) {
      const elapsedDates = getProgressDates().filter((dateKey) => isHabitScheduled(habit, dateKey));
      const completedProgress = elapsedDates.reduce(
        (total, dateKey) => total + getHabitDayProgress(habit, dateKey),
        0
      );
      const progressPercent = elapsedDates.length
        ? Math.round((completedProgress / elapsedDates.length) * 100)
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
      progressLabel.textContent = `${progressPercent}% task progress`;
      progressBar.appendChild(progressFill);
      progressCell.append(progressBar, progressLabel);
      row.appendChild(progressCell);
    }

    monthDates.forEach((dateKey, index) => {
      const cell = document.createElement("td");

      cell.className = [
        "check-cell",
        dateKey === todayKey ? "today" : "",
        focusPeriod && dateKey >= focusPeriod.start && dateKey <= focusPeriod.end ? "focus-period-day" : "",
        index % 7 === 0 ? "week-start" : "",
        index % 7 === 6 || index === monthDates.length - 1 ? "week-end" : ""
      ].filter(Boolean).join(" ");

      const button = document.createElement("button");
      const skipped = isHabitSkipped(habit, dateKey);
      const completed = !skipped && Boolean(habit.completed[dateKey]);
      const scheduled = isHabitScheduled(habit, dateKey);
      const notCompleted = scheduled && !completed && !skipped;

      button.className = `check-button ${completed ? "completed" : ""} ${notCompleted ? "not-completed" : ""} ${skipped ? "skipped" : ""}`;
      button.textContent = skipped ? "–" : completed ? "✓" : "";
      button.setAttribute("type", "button");
      button.setAttribute("aria-pressed", String(completed));
      const status = skipped ? "skipped" : completed ? "completed" : scheduled ? "not completed" : habit.paused ? "paused" : "not scheduled";
      button.setAttribute("aria-label", `${habit.name}: ${dateKey} (${status})`);
      button.disabled = !scheduled && !skipped;
      cell.classList.toggle("not-scheduled", !scheduled && !skipped);
      let skipTriggered = false;
      let skipPressTimer = null;
      button.title = "Tap to update; right-click or press and hold to skip this day";
      button.addEventListener("pointerdown", () => {
        if (!scheduled) return;
        skipPressTimer = window.setTimeout(() => {
          skipTriggered = true;
          button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        }, 650);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach((type) =>
        button.addEventListener(type, () => window.clearTimeout(skipPressTimer))
      );
      button.addEventListener("click", () => {
        if (skipTriggered) {
          skipTriggered = false;
          return;
        }
        toggleHabit(habit.id, dateKey);
      });
      button.addEventListener("contextmenu", (event) => {
        window.clearTimeout(skipPressTimer);
        event.preventDefault();
        if (!isScheduled(habit.days, dateKey) || habit.paused) return;
        habit.skipped = habit.skipped || {};
        if (habit.skipped[dateKey]) delete habit.skipped[dateKey];
        else {
          habit.skipped[dateKey] = true;
          delete habit.completed[dateKey];
        }
        saveHabits();
        renderHeaders();
        renderHabits();
        renderChart();
      });

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
        const possible = monthHabits.reduce(
          (total, habit) => total + dates.filter((dateKey) => isHabitScheduled(habit, dateKey)).length,
          0
        );
        const completedProgress = monthHabits.reduce(
          (total, habit) => total + dates.reduce(
            (dayTotal, dateKey) => dayTotal + getHabitDayProgress(habit, dateKey),
            0
          ),
          0
        );

        return {
          label: month.toLocaleDateString("en-US", { month: "short" }),
          value: possible ? (completedProgress / possible) * 100 : 0,
          title: `${month.toLocaleDateString("en-US", { month: "long" })}: ${Math.round(possible ? (completedProgress / possible) * 100 : 0)}% task progress`
        };
      })
    : (isWeekly
        ? Array.from({ length: Math.ceil(monthDates.length / 7) }, (_, index) => monthDates.slice(index * 7, index * 7 + 7))
        : monthDates.map((dateKey) => [dateKey]));

  barChart.innerHTML = "";
  barChart.className = `bar-chart ${isYearly ? "monthly" : isWeekly ? "weekly" : "daily"}`;
  const percentScale = barChart.parentElement.querySelector(".bar-percent-scale");
  percentScale.innerHTML = "";
  for (let percent = 100; percent >= 0; percent -= 10) {
    const mark = document.createElement("span");
    mark.textContent = `${percent}%`;
    mark.style.top = `${100 - percent}%`;
    percentScale.appendChild(mark);
  }
  document.getElementById("chartTitle").textContent = isYearly
    ? "Monthly progress"
    : isWeekly ? "Weekly progress" : "Daily progress";
  document.getElementById("chartSubtitle").textContent = isYearly
    ? `Task progress for ${viewedMonth.getFullYear()}`
    : isWeekly ? "Task progress grouped by week" : "Task progress grouped by day";
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
      const completedProgress = group.reduce(
        (total, key) => total + habits.reduce(
          (dayTotal, habit) => dayTotal + getHabitDayProgress(habit, key),
          0
        ),
        0
      );
      const possible = habits.reduce(
        (total, habit) => total + group.filter((key) => isHabitScheduled(habit, key)).length,
        0
      );
      value = possible ? (completedProgress / possible) * 100 : 0;
      const date = new Date(`${dateKey}T12:00:00`);
      labelText = isWeekly ? `W${groupIndex + 1}` : date.getDate();
      title = isWeekly
        ? `Week ${groupIndex + 1}: ${Math.round(value)}% task progress`
        : `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${Math.round(value)}% task progress`;
    }

    const column = document.createElement("div");
    const fill = document.createElement("div");
    const label = document.createElement("span");

    const isCurrentBar = isYearly
      ? viewedMonth.getFullYear() === today.getFullYear() && groupIndex === today.getMonth()
      : isWeekly ? group.includes(todayKey) : dateKey === todayKey;
    column.className = `bar-column ${isWeekly ? "weekly" : ""} ${isCurrentBar ? "today" : ""}`;
    fill.className = "bar-fill";
    label.className = "bar-label";
    fill.style.height = `${Math.max(value, 3)}%`;
    label.textContent = labelText;
    column.title = title;
    column.setAttribute("role", "img");
    column.setAttribute("aria-label", `${title}${isCurrentBar ? " (today)" : ""}`);
    column.append(fill, label);
    barChart.appendChild(column);
  });

  requestAnimationFrame(() => {
    const viewport = barChart.closest(".chart-viewport");
    const currentBar = barChart.querySelector(".bar-column.today");
    if (!viewport || !currentBar) return;
    const barRect = currentBar.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const targetLeft = viewport.scrollLeft + barRect.left - viewportRect.left +
      (barRect.width - viewport.clientWidth) / 2;
    viewport.scrollLeft = Math.max(0, targetLeft);
  });
}

function confirmHabitTasks(habit, dateKey) {
  return new Promise((resolve) => {
    const tasks = (Array.isArray(habit.details) ? habit.details : [])
      .filter((task) => isScheduled(task.days, dateKey));
    const checkboxes = [];
    let finished = false;
    const threshold = habit.taskRule === "all"
      ? 100
      : habit.taskRule === "custom"
        ? Math.max(1, Math.min(100, Number(habit.taskThreshold) || 50))
        : 50;
    const requiredTasks = Math.ceil(tasks.length * threshold / 100);

    taskConfirmMessage.textContent = `Check at least ${requiredTasks} of ${tasks.length} tasks (${threshold}%) to mark “${habit.name}” complete. Your selected task progress will be saved.`;
    taskConfirmList.innerHTML = "";
    acceptTaskConfirmButton.textContent = "Save progress";
    acceptTaskConfirmButton.disabled = false;

    tasks.forEach((task) => {
      const item = document.createElement("li");
      const checkbox = document.createElement("input");
      const label = document.createElement("span");

      checkbox.type = "checkbox";
      checkbox.checked = Boolean(task.completed?.[dateKey]);
      checkbox.setAttribute("aria-label", task.text);
      label.textContent = task.text;
      checkboxes.push(checkbox);
      item.append(checkbox, label);
      taskConfirmList.appendChild(item);
    });

    taskConfirmModal.classList.remove("hidden");

    const finish = (result) => {
      if (finished) return;
      finished = true;
      taskConfirmModal.classList.add("hidden");
      acceptTaskConfirmButton.removeEventListener("click", accept);
      document.getElementById("cancelTaskConfirm").removeEventListener("click", cancel);
      document.getElementById("closeTaskConfirm").removeEventListener("click", cancel);
      taskConfirmModal.removeEventListener("click", dismissBackdrop);
      resolve(result);
    };
    const cancel = () => finish(null);
    const accept = () => {
      const completedTasks = checkboxes.filter((checkbox) => checkbox.checked).length;

      tasks.forEach((task, index) => {
        task.completed = task.completed && typeof task.completed === "object"
          ? task.completed
          : {};
        task.completed[dateKey] = checkboxes[index].checked;
      });
      finish({ isComplete: completedTasks >= requiredTasks });
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
  if (isHabitSkipped(habit, dateKey)) {
    delete habit.skipped[dateKey];
    saveHabits();
    renderHeaders();
    renderHabits();
    renderChart();
    return;
  }
  if (!isHabitScheduled(habit, dateKey)) return;

  const isCompleting = !Boolean(habit.completed[dateKey]);
  const scheduledTasks = (habit.details || []).filter((task) => isScheduled(task.days, dateKey));
  if (scheduledTasks.length) {
    const taskResult = await confirmHabitTasks(habit, dateKey);
    if (!taskResult) return;
    habit.completed[dateKey] = taskResult.isComplete;
  } else {
    habit.completed[dateKey] = isCompleting;
  }
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

function updatePauseButton(habit) {
  const button = document.getElementById("pauseHabitButton");
  button.classList.toggle("is-paused", habit.paused);
  button.setAttribute("aria-label", habit.paused ? "Resume habit" : "Pause habit");
  button.title = habit.paused ? "Resume habit" : "Pause habit";
  button.innerHTML = habit.paused
    ? '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M8 5.5v13l10-6.5z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>';
}

function openHabitDetails(habitId) {
  const habit = habits.find((item) => String(item.id) === String(habitId));
  if (!habit) return;

  detailsHabitId = String(habit.id);
  detailsSticker.textContent = habit.sticker || getSticker(habit.name);
  detailsTitle.textContent = `${habit.name} details`;
  document.querySelector(".details-hint").textContent = `${habit.paused ? "Paused" : `Scheduled ${formatSchedule(habit.days)}`}. Small steps make this habit easier to stick with.`;
  updatePauseButton(habit);
  renderDetailsChecklist();
  editingTaskId = null;
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
    emptyMessage.textContent = "No steps yet. Tap ＋ to add one, or close this popup to finish without tasks.";
    detailsChecklist.appendChild(emptyMessage);
    return;
  }

  habit.details.forEach((detail) => {
    const item = document.createElement("li");
    const taskInfo = document.createElement("div");
    const text = document.createElement("span");
    const schedule = document.createElement("small");
    const actions = document.createElement("div");
    const editButton = document.createElement("button");
    const removeButton = document.createElement("button");

    taskInfo.className = "detail-task-info";
    text.textContent = detail.text;
    schedule.textContent = formatSchedule(detail.days);
    schedule.className = "detail-schedule";
    taskInfo.append(text, schedule);
    actions.className = "detail-task-actions";
    editButton.type = "button";
    editButton.className = "detail-edit-button";
    editButton.textContent = "✎";
    editButton.setAttribute("aria-label", `Edit task: ${detail.text}`);
    editButton.title = "Edit task and days";
    editButton.addEventListener("click", () => editTask(detail));
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
      renderHeaders();
      renderHabits();
      renderChart();
    });

    actions.append(editButton, removeButton);
    item.append(taskInfo, actions);
    detailsChecklist.appendChild(item);
  });
}

function editTask(detail) {
  editingTaskId = String(detail.id);
  detailInput.value = detail.text;
  setDaySelector(detailsForm.querySelector("[data-day-selector]"), detail.days);
  detailFormLabel.textContent = "Edit task or step";
  saveDetailButton.textContent = "Save";
  document.getElementById("taskEditPopupTitle").textContent = "Edit task";
  taskEditModal.classList.remove("hidden");
  detailInput.focus();
}

function formatSchedule(days) {
  const schedule = normalizeSchedule(days);
  if (schedule.includes("everyday")) return "Every day";
  const customDates = schedule.filter((day) => typeof day === "string");
  if (customDates.length) return `Custom dates (${customDates.length})`;
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    .filter((_, day) => schedule.includes(day)).join(", ");
}

function hasValidDaySelection(selector) {
  if (!selector.classList.contains("custom-mode")) return true;
  if (selector.querySelector(".custom-date-picker input:checked")) return true;
  window.alert("Choose at least one date, or select Everyday/a weekday instead.");
  selector.querySelector(".custom-days-toggle")?.focus();
  return false;
}

function closeTaskEditor() {
  taskEditModal.classList.add("hidden");
  detailsForm.reset();
  setDaySelector(detailsForm.querySelector("[data-day-selector]"), ["everyday"]);
  editingTaskId = null;
  showDetailsFormButton.setAttribute("aria-expanded", "false");
  detailFormLabel.textContent = "Add a task or step";
  saveDetailButton.textContent = "Add";
}

function closeHabitEditor() {
  habitEditModal.classList.add("hidden");
  taskRuleMenu.classList.add("hidden");
  taskRuleButton.setAttribute("aria-expanded", "false");
}

function closeHabitDetails() {
  detailsModal.classList.add("hidden");
  closeTaskEditor();
  closeHabitEditor();
  detailsHabitId = null;
}

function updateStats() {
  const currentMonthHabits = habitMonths[getMonthKey(today)] || [];
  const todayScheduled = currentMonthHabits.filter((habit) => isHabitScheduled(habit, todayKey));
  const todayCompleted = todayScheduled.filter((habit) => habit.completed[todayKey]).length;
  document.getElementById("todayCountLabel").textContent = "Completed today";

  const monthCompleted = habits.reduce(
    (total, habit) => total + monthDates.reduce(
      (dayTotal, dateKey) => dayTotal + getHabitDayProgress(habit, dateKey),
      0
    ),
    0
  );
  const completedHabitDays = habits.reduce(
    (total, habit) => total + monthDates.filter(
      (dateKey) => isHabitScheduled(habit, dateKey) && habit.completed[dateKey]
    ).length,
    0
  );

  const possibleCompletions = habits.reduce(
    (total, habit) => total + monthDates.filter((dateKey) => isHabitScheduled(habit, dateKey)).length,
    0
  );
  const progress = possibleCompletions
    ? Math.round((monthCompleted / possibleCompletions) * 100)
    : 0;
  const elapsedDates = monthDates.filter((dateKey) => dateKey <= todayKey);
  const toDateCompleted = habits.reduce(
    (total, habit) => total + elapsedDates.reduce(
      (dayTotal, dateKey) => dayTotal + getHabitDayProgress(habit, dateKey),
      0
    ),
    0
  );
  const toDatePossible = habits.reduce(
    (total, habit) => total + elapsedDates.filter((dateKey) => isHabitScheduled(habit, dateKey)).length,
    0
  );
  const toDateProgress = toDatePossible
    ? Math.round((toDateCompleted / toDatePossible) * 100)
    : 0;

  document.getElementById("todayCount").textContent =
    `${todayCompleted} / ${todayScheduled.length}`;

  document.getElementById("weeklyProgress").textContent = `${progress}%`;
  document.getElementById("toDateProgress").textContent = `${toDateProgress}%`;

  document.getElementById("completionSummary").textContent =
    `${completedHabitDays} completion${completedHabitDays === 1 ? "" : "s"} this month`;
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

function copyHabitsToMonth(sourceHabits, targetMonth) {
  const targetYear = targetMonth.getFullYear();
  const targetMonthIndex = targetMonth.getMonth();
  const targetLastDay = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  const copySchedule = (days) => normalizeSchedule(days).map((day) => {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
    const dayOfMonth = Math.min(Number(day.slice(-2)), targetLastDay);
    return getDateKey(new Date(targetYear, targetMonthIndex, dayOfMonth));
  });

  return sourceHabits.map((habit) => ({
    ...habit,
    days: copySchedule(habit.days),
    completed: {},
    details: (habit.details || []).map((task) => ({
      ...task,
      days: copySchedule(task.days),
      completed: {}
    })),
    paused: false,
    pausedAt: null,
    pausedPeriods: [],
    skipped: {}
  }));
}

function openMonthStartPrompt() {
  if (today.getDate() !== 1) return;
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const targetKey = getMonthKey(currentMonth);
  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousKey = getMonthKey(previousMonth);
  const priorHabits = habitMonths[previousKey];

  const savedDecision = readStorage("consistencyMonthDecision", "");
  if (!Array.isArray(priorHabits) || !priorHabits.length ||
      savedDecision === `${targetKey}:reuse` || savedDecision === `${targetKey}:fresh`) return;

  monthStartTargetKey = targetKey;
  document.getElementById("monthStartMessage").textContent =
    `Would you like to reuse ${previousMonth.toLocaleDateString("en-US", { month: "long" })}’s habits and tasks, or start ${currentMonth.toLocaleDateString("en-US", { month: "long" })} with a blank month?`;
  monthStartModal.classList.remove("hidden");
}

function finishMonthStart(choice) {
  if (!monthStartTargetKey) return;
  const targetKey = monthStartTargetKey;
  if (choice === "later") {
    monthStartModal.classList.add("hidden");
    monthStartTargetKey = null;
    return;
  }

  const [year, month] = targetKey.split("-").map(Number);
  const targetMonth = new Date(year, month - 1, 1);
  const previousMonth = new Date(year, month - 2, 1);
  habitMonths[targetKey] = choice === "reuse"
    ? copyHabitsToMonth(habitMonths[getMonthKey(previousMonth)] || [], targetMonth)
    : [];
  writeStorage("consistencyHabitMonths", JSON.stringify(habitMonths));
  writeStorage("consistencyMonthDecision", `${targetKey}:${choice}`);
  monthStartModal.classList.add("hidden");
  monthStartTargetKey = null;

  if (getMonthKey(viewedMonth) === targetKey) renderMonth();
}

function getSingleEmoji(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const firstGrapheme = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)][0]?.segment || ""
    : Array.from(text)[0] || "";
  const isEmoji = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\p{Emoji_Modifier}]/u.test(firstGrapheme) ||
    /[#*0-9]\uFE0F?\u20E3/u.test(firstGrapheme);

  return isEmoji ? firstGrapheme : "";
}

function setSelectedSticker(sticker) {
  selectedSticker = getSingleEmoji(sticker) || null;
  document.querySelectorAll("[data-sticker-picker]").forEach((picker) => {
    const input = picker.querySelector(".sticker-input");
    if (input && input.value !== (selectedSticker || "")) input.value = selectedSticker || "";
    picker.querySelectorAll("[data-sticker]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.sticker === selectedSticker));
    });
  });
}

document.querySelectorAll("[data-sticker-picker]").forEach((picker) => {
  picker.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sticker]");
    if (button) setSelectedSticker(button.dataset.sticker);
  });
  picker.querySelector(".sticker-input")?.addEventListener("input", (event) => {
    setSelectedSticker(getSingleEmoji(event.target.value));
  });
});

function getSticker(name) {
  return selectedSticker || getDefaultSticker(name);
}

function getDefaultSticker(name) {
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
  setSelectedSticker(null);
  habitModal.classList.remove("hidden");
  habitName.focus();
}

function closeModal() {
  habitModal.classList.add("hidden");
  habitForm.reset();
  setSelectedSticker(null);
  setDaySelector(habitForm.querySelector("[data-day-selector]"), ["everyday"]);
}

function isInstalledApp() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function getNotificationPermissionMessage() {
  if (!window.isSecureContext) return "Notifications require a secure HTTPS connection (or localhost).";
  if (!("Notification" in window)) return "This browser does not support notifications.";
  if (Notification.permission === "granted") return "Notifications are enabled for this site.";
  if (Notification.permission === "denied") return "Notifications are blocked. Change this site’s permission in your browser settings.";
  return "Allow notifications to receive your reminder while this app is open.";
}

function updateNotificationPermissionStatus() {
  const status = document.getElementById("reminderPermissionStatus");
  const button = document.getElementById("requestNotificationPermission");
  status.textContent = getNotificationPermissionMessage();
  button.disabled = !window.isSecureContext || !("Notification" in window) || Notification.permission !== "default";
  button.textContent = "Notification" in window && Notification.permission === "granted"
    ? "Notifications enabled"
    : "Enable notifications";
}

async function requestNotificationAccess() {
  if (!window.isSecureContext || !("Notification" in window)) {
    updateNotificationPermissionStatus();
    return null;
  }
  try {
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    updateNotificationPermissionStatus();
    return permission;
  } catch (error) {
    console.error("Notification permission could not be requested:", error);
    updateNotificationPermissionStatus();
    return null;
  }
}

function openReminderModal() {
  const currentTime = readStorage("consistencyReminderTime", "20:00");
  document.getElementById("reminderTimeInput").value = currentTime || "20:00";
  updateNotificationPermissionStatus();
  document.getElementById("reminderModal").classList.remove("hidden");
}

function closeReminderModal() {
  document.getElementById("reminderModal").classList.add("hidden");
}

async function saveReminder(event) {
  event.preventDefault();
  const time = document.getElementById("reminderTimeInput").value;
  if (!time) return;
  if (!window.isSecureContext) {
    window.alert("Notifications require a secure HTTPS connection (or localhost).");
    return;
  }
  if (!("Notification" in window)) {
    window.alert("Notifications are not supported by this browser.");
    return;
  }
  const permission = await requestNotificationAccess();
  if (permission !== "granted") {
    window.alert("Notification permission was not granted. Allow it in your browser settings and try again.");
    return;
  }
  writeStorage("consistencyReminderTime", time);
  closeReminderModal();
}

function disableReminder() {
  writeStorage("consistencyReminderTime", "");
  closeReminderModal();
}

async function checkReminder() {
  const reminderTime = readStorage("consistencyReminderTime", "");
  if (!reminderTime || !("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const todayKeyNow = getDateKey(now);
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (currentTime < reminderTime || readStorage("consistencyReminderLast", "") === todayKeyNow) return;
  const options = { body: "Take a moment to check in with your habits.", icon: "./icon.svg" };
  try {
    if (navigator.serviceWorker?.controller) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Consistency check-in", options);
    } else {
      new Notification("Consistency check-in", options);
    }
    writeStorage("consistencyReminderLast", todayKeyNow);
  } catch (error) {
    console.error("The habit reminder could not be shown:", error);
  }
}

function updateInstallButton() {
  const installed = appInstalled || isInstalledApp();
  const manualInstallAvailable = isIOSDevice();

  installButton.hidden = installed || (!deferredInstallPrompt && !manualInstallAvailable);
  installButton.textContent = deferredInstallPrompt ? "Install app" : "Add to Home Screen";
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
    if (isIOSDevice()) {
      window.alert("To add this app, tap the Share button in Safari, then choose ‘Add to Home Screen’.");
    }
    return;
  }

  const installPrompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  updateInstallButton();

  try {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice?.outcome === "accepted") appInstalled = true;
  } catch (error) {
    console.error("The install prompt could not be completed:", error);
  }

  updateInstallButton();
});

updateInstallButton();
openMonthStartPrompt();


document.querySelectorAll("[data-day-selector]").forEach((selector) => {
  selector.addEventListener("change", (event) => {
    const input = event.target;
    if (input.dataset.customDate || selector.classList.contains("custom-mode")) return;

    const everydayInput = selector.querySelector('input[value="everyday"]');
    const weekdayInputs = selector.querySelectorAll(".weekday-options input");
    if (input.value === "everyday" && input.checked) {
      weekdayInputs.forEach((day) => { day.checked = false; });
    } else if (input.value !== "everyday" && input.checked) {
      everydayInput.checked = false;
    } else if (input.value !== "everyday" &&
      !selector.querySelector(".weekday-options input:checked")) {
      everydayInput.checked = true;
    }

    selector.classList.toggle("everyday-mode", everydayInput.checked);
  });

  selector.querySelector(".custom-days-toggle")?.addEventListener("click", () => {
    const enteringCustomMode = !selector.classList.contains("custom-mode");
    selector.classList.toggle("custom-mode", enteringCustomMode);
    selector.classList.toggle("everyday-mode", !enteringCustomMode);
    const picker = selector.querySelector(".custom-date-picker");
    const toggle = selector.querySelector(".custom-days-toggle");
    toggle.setAttribute("aria-expanded", String(enteringCustomMode));
    picker.classList.toggle("hidden", !enteringCustomMode);

    if (enteringCustomMode) {
      selector.querySelector('input[value="everyday"]').checked = false;
      selector.querySelectorAll(".weekday-options input").forEach((day) => { day.checked = false; });
      renderCustomDatePicker(selector);
    } else {
      selector.querySelector('input[value="everyday"]').checked = true;
      selector.querySelectorAll(".weekday-options input").forEach((day) => { day.checked = false; });
      renderCustomDatePicker(selector);
    }
  });
});

document.getElementById("addHabitButton").addEventListener("click", openModal);
document.getElementById("reminderButton").addEventListener("click", openReminderModal);
document.getElementById("requestNotificationPermission").addEventListener("click", requestNotificationAccess);
document.getElementById("closeReminderModal").addEventListener("click", closeReminderModal);
document.getElementById("cancelReminderButton").addEventListener("click", closeReminderModal);
document.getElementById("disableReminderButton").addEventListener("click", disableReminder);
document.getElementById("reminderForm").addEventListener("submit", saveReminder);
document.getElementById("reminderModal").addEventListener("click", (event) => {
  if (event.target === document.getElementById("reminderModal")) closeReminderModal();
});
document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("cancelButton").addEventListener("click", closeModal);
document.getElementById("closeDetailsModal").addEventListener("click", closeHabitDetails);
document.getElementById("closeHabitEditModal").addEventListener("click", closeHabitEditor);
document.getElementById("cancelHabitEdit").addEventListener("click", closeHabitEditor);
document.getElementById("closeTaskEditModal").addEventListener("click", closeTaskEditor);
document.getElementById("cancelDetailButton").addEventListener("click", closeTaskEditor);
habitEditModal.addEventListener("click", (event) => {
  if (event.target === habitEditModal) closeHabitEditor();
});
taskEditModal.addEventListener("click", (event) => {
  if (event.target === taskEditModal) closeTaskEditor();
});
document.getElementById("pauseHabitButton").addEventListener("click", () => {
  const habit = habits.find((item) => String(item.id) === detailsHabitId);
  if (!habit) return;

  if (habit.paused) {
    const pausedAt = habit.pausedAt || todayKey;
    if (pausedAt < todayKey) {
      const yesterday = new Date(`${todayKey}T12:00:00`);
      yesterday.setDate(yesterday.getDate() - 1);
      habit.pausedPeriods = habit.pausedPeriods || [];
      habit.pausedPeriods.push({ from: pausedAt, to: getDateKey(yesterday) });
    }
    habit.paused = false;
    habit.pausedAt = null;
  } else {
    habit.paused = true;
    habit.pausedAt = todayKey;
  }

  saveHabits();
  openHabitDetails(habit.id);
  renderHeaders();
  renderHabits();
  renderChart();
});
function setTaskRule(rule) {
  const labels = { half: "At least half", all: "All tasks", custom: "Custom percentage" };
  const selectedRule = labels[rule] ? rule : "half";
  taskRuleButton.dataset.value = selectedRule;
  taskRuleValue.textContent = labels[selectedRule];
  taskRuleMenu.querySelectorAll("[data-task-rule]").forEach((option) => {
    option.setAttribute("aria-selected", String(option.dataset.taskRule === selectedRule));
  });
  const customRule = selectedRule === "custom";
  taskThresholdInput.classList.toggle("hidden", !customRule);
  taskThresholdLabel.classList.toggle("hidden", !customRule);
}

taskRuleButton.addEventListener("click", () => {
  const isExpanded = taskRuleButton.getAttribute("aria-expanded") === "true";
  taskRuleButton.setAttribute("aria-expanded", String(!isExpanded));
  taskRuleMenu.classList.toggle("hidden", isExpanded);
});
taskRuleMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-task-rule]");
  if (!option) return;
  setTaskRule(option.dataset.taskRule);
  taskRuleMenu.classList.add("hidden");
  taskRuleButton.setAttribute("aria-expanded", "false");
  taskRuleButton.focus();
});
document.addEventListener("click", (event) => {
  if (event.target.closest?.(".task-rule-picker")) return;
  taskRuleMenu.classList.add("hidden");
  taskRuleButton.setAttribute("aria-expanded", "false");
});
showDetailsFormButton.addEventListener("click", () => {
  editingTaskId = null;
  detailsForm.reset();
  setDaySelector(detailsForm.querySelector("[data-day-selector]"), ["everyday"]);
  detailFormLabel.textContent = "Add a task or step";
  saveDetailButton.textContent = "Add";
  document.getElementById("taskEditPopupTitle").textContent = "Add a task";
  taskEditModal.classList.remove("hidden");
  showDetailsFormButton.setAttribute("aria-expanded", "true");
  detailInput.focus();
});
editHabitButton.addEventListener("click", () => {
  const habit = habits.find((item) => String(item.id) === detailsHabitId);
  if (!habit) return;
  editHabitName.value = habit.name;
  setSelectedSticker(habit.sticker || getSticker(habit.name));
  setDaySelector(editHabitForm.querySelector("[data-day-selector]"), habit.days);
  setTaskRule(habit.taskRule || "half");
  taskThresholdInput.value = String(habit.taskThreshold || 50);
  habitEditModal.classList.remove("hidden");
  editHabitName.focus();
});
editHabitForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const daySelector = editHabitForm.querySelector("[data-day-selector]");
  if (!hasValidDaySelection(daySelector)) return;
  const habit = habits.find((item) => String(item.id) === detailsHabitId);
  const name = editHabitName.value.trim();
  if (!habit || !name) return;
  habit.name = name;
  habit.sticker = getSticker(name);
  setSelectedSticker(null);
  habit.days = readDaySelector(daySelector);
  habit.taskRule = taskRuleButton.dataset.value || "half";
  habit.taskThreshold = Math.max(1, Math.min(100, Number(taskThresholdInput.value) || 50));
  saveHabits();
  detailsSticker.textContent = habit.sticker;
  detailsTitle.textContent = `${habit.name} details`;
  document.querySelector(".details-hint").textContent = `${habit.paused ? "Paused" : `Scheduled ${formatSchedule(habit.days)}`}. Small steps make this habit easier to stick with.`;
  updatePauseButton(habit);
  habitEditModal.classList.add("hidden");
  renderHeaders();
  renderHabits();
  renderChart();
});
detailsModal.addEventListener("click", (event) => {
  if (event.target === detailsModal) closeHabitDetails();
});

detailsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const habit = habits.find((item) => String(item.id) === detailsHabitId);
  const text = detailInput.value.trim();
  if (!habit || !text) return;

  const daySelector = detailsForm.querySelector("[data-day-selector]");
  if (!hasValidDaySelection(daySelector)) return;
  habit.details = Array.isArray(habit.details) ? habit.details : [];
  const days = readDaySelector(daySelector);
  const task = habit.details.find((item) => String(item.id) === editingTaskId);
  if (task) {
    task.text = text;
    task.days = days;
  } else {
    habit.details.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      days,
      completed: {}
    });
  }
  saveHabits();
  renderDetailsChecklist();
  renderHeaders();
  renderHabits();
  renderChart();
  closeTaskEditor();
});

document.getElementById("previousMonth").addEventListener("click", () => {
  changeMonth(-1);
});

document.getElementById("nextMonth").addEventListener("click", () => {
  changeMonth(1);
});

monthMenuButton.addEventListener("click", () => {
  const isHidden = monthMenu.classList.toggle("hidden");
  monthMenuButton.setAttribute("aria-expanded", String(!isHidden));
});

document.getElementById("copyPreviousMonth").addEventListener("click", async () => {
  monthMenu.classList.add("hidden");
  monthMenuButton.setAttribute("aria-expanded", "false");
  const sourceMonth = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() - 1, 1);
  const sourceHabits = habitMonths[getMonthKey(sourceMonth)] || [];
  if (!sourceHabits.length) {
    window.alert("There are no habits saved for the previous month to copy.");
    return;
  }
  const monthName = viewedMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  if (!(await showConfirmation(`Copy ${sourceHabits.length} habit${sourceHabits.length === 1 ? "" : "s"} and their tasks into ${monthName}? Completion history will start fresh.`, "Copy previous month?", "Copy habits"))) return;
  habitMonths[getMonthKey(viewedMonth)] = copyHabitsToMonth(sourceHabits, viewedMonth);
  habits = habitMonths[getMonthKey(viewedMonth)];
  writeStorage("consistencyHabitMonths", JSON.stringify(habitMonths));
  renderMonth();
});

function openFocusPeriodModal() {
  const form = document.getElementById("focusPeriodForm");
  form.reset();
  if (focusPeriod) {
    document.getElementById("focusPeriodName").value = focusPeriod.name;
    document.getElementById("focusPeriodStart").value = focusPeriod.start;
    document.getElementById("focusPeriodEnd").value = focusPeriod.end;
  }
  document.getElementById("focusPeriodModal").classList.remove("hidden");
  document.getElementById("focusPeriodName").focus();
}

function closeFocusPeriodModal() {
  document.getElementById("focusPeriodModal").classList.add("hidden");
}

document.getElementById("setFocusPeriod").addEventListener("click", () => {
  monthMenu.classList.add("hidden");
  monthMenuButton.setAttribute("aria-expanded", "false");
  openFocusPeriodModal();
});
document.getElementById("closeFocusPeriodModal").addEventListener("click", closeFocusPeriodModal);
document.getElementById("cancelFocusPeriod").addEventListener("click", closeFocusPeriodModal);
document.getElementById("focusPeriodModal").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeFocusPeriodModal();
});
document.getElementById("focusPeriodForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("focusPeriodName").value.trim();
  const start = document.getElementById("focusPeriodStart").value;
  const end = document.getElementById("focusPeriodEnd").value;
  if (!name || !start || !end) return;
  if (end < start) {
    window.alert("The end date must be on or after the start date.");
    return;
  }
  focusPeriod = { name, start, end };
  writeStorage("consistencyFocusPeriod", JSON.stringify(focusPeriod));
  viewedMonth = new Date(`${start}T12:00:00`);
  viewedMonth.setDate(1);
  closeFocusPeriodModal();
  renderMonth();
});
document.getElementById("clearFocusPeriod").addEventListener("click", () => {
  focusPeriod = null;
  writeStorage("consistencyFocusPeriod", "null");
  closeFocusPeriodModal();
  updateFocusPeriodLabel();
});

document.getElementById("reusePreviousMonth").addEventListener("click", () => finishMonthStart("reuse"));
document.getElementById("startFreshMonth").addEventListener("click", () => finishMonthStart("fresh"));
document.getElementById("laterMonthDecision").addEventListener("click", () => finishMonthStart("later"));

document.addEventListener("click", (event) => {
  if (!monthMenu.contains(event.target) && event.target !== monthMenuButton) {
    monthMenu.classList.add("hidden");
    monthMenuButton.setAttribute("aria-expanded", "false");
  }
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
  if (!monthStartModal.classList.contains("hidden")) {
    finishMonthStart("later");
    return;
  }
  if (!taskEditModal.classList.contains("hidden")) {
    closeTaskEditor();
    return;
  }
  if (!habitEditModal.classList.contains("hidden")) {
    closeHabitEditor();
    return;
  }
  if (!document.getElementById("reminderModal").classList.contains("hidden")) {
    closeReminderModal();
    return;
  }
  if (!taskConfirmModal.classList.contains("hidden")) {
    document.getElementById("cancelTaskConfirm").click();
    return;
  }
  if (!confirmModal.classList.contains("hidden")) {
    confirmCancelButton.click();
    return;
  }
  if (!monthMenu.classList.contains("hidden")) {
    monthMenu.classList.add("hidden");
    monthMenuButton.setAttribute("aria-expanded", "false");
    return;
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
  const daySelector = habitForm.querySelector("[data-day-selector]");
  if (!name || !hasValidDaySelection(daySelector)) return;

  const newHabit = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    sticker: getSticker(name),
    days: readDaySelector(daySelector),
    completed: {},
    details: []
  };
  habits.push(newHabit);

  saveHabits();
  renderHeaders();
  renderHabits();
  renderChart();
  closeModal();
  openHabitDetails(newHabit.id);
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
openMonthStartPrompt();

window.setInterval(refreshToday, 60000);
window.setInterval(checkReminder, 20000);
checkReminder();
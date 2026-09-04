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
const habitModal = document.getElementById("habitModal");
const habitForm = document.getElementById("habitForm");
const habitName = document.getElementById("habitName");
const barChart = document.getElementById("barChart");

let habitZoomIndex = getSavedZoom();
let viewedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let monthDates = getMonthDates(viewedMonth);
let habits = getSavedHabits();

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
}

function getSavedZoom() {
  const savedZoom = Number(readStorage("consistencyHabitZoom"));

  if (!Number.isInteger(savedZoom)) return 2;

  return Math.max(0, Math.min(viewSizes.length - 1, savedZoom));
}

function getSavedHabits() {
  try {
    const savedHabits = JSON.parse(
      readStorage("consistencyHabits", "null")
    );

    if (!Array.isArray(savedHabits)) {
      return createDefaultHabits();
    }

    return savedHabits
      .filter((habit) => habit && typeof habit.name === "string")
      .map((habit, index) => ({
        id: habit.id ?? `${Date.now()}-${index}`,
        name: habit.name.trim(),
        sticker: habit.sticker || getSticker(habit.name),
        completed:
          habit.completed && typeof habit.completed === "object"
            ? habit.completed
            : {}
      }))
      .filter((habit) => habit.name);
  } catch {
    return createDefaultHabits();
  }
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
  writeStorage("consistencyHabits", JSON.stringify(habits));
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
  weekHeaders.innerHTML = '<th class="habit-column">Habit</th>';
  dayHeaders.innerHTML = '<th class="habit-column">Days</th>';

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

    row.appendChild(nameCell);

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
  const maxCompletions = Math.max(habits.length, 1);

  barChart.innerHTML = "";
  barChart.style.width = `${Math.max(100, monthDates.length * 17)}px`;

  monthDates.forEach((dateKey) => {
    const completedCount = habits.filter(
      (habit) => habit.completed[dateKey]
    ).length;

    const date = new Date(`${dateKey}T12:00:00`);
    const column = document.createElement("div");
    const fill = document.createElement("div");
    const label = document.createElement("span");

    column.className = `bar-column ${dateKey === todayKey ? "today" : ""}`;
    fill.className = "bar-fill";
    label.className = "bar-label";

    fill.style.height = `${Math.max(
      completedCount ? (completedCount / maxCompletions) * 100 : 3,
      3
    )}%`;

    label.textContent = date.getDate();
    column.title = `${date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    })}: ${completedCount} completion${completedCount === 1 ? "" : "s"}`;

    column.setAttribute("aria-label", column.title);
    column.append(fill, label);
    barChart.appendChild(column);
  });
}

function toggleHabit(habitId, dateKey) {
  const habit = habits.find((item) => String(item.id) === String(habitId));

  if (!habit) return;

  habit.completed[dateKey] = !Boolean(habit.completed[dateKey]);
  saveHabits();
  renderHabits();
  renderChart();
}

function deleteHabit(habitId) {
  if (habits.length === 1) {
    alert("Keep at least one habit in your tracker.");
    return;
  }

  habits = habits.filter(
    (habit) => String(habit.id) !== String(habitId)
  );

  saveHabits();
  renderHabits();
  renderChart();
}

function updateStats() {
  const todayCompleted = habits.filter(
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

  document.getElementById("todayCount").textContent =
    `${todayCompleted} / ${habits.length}`;

  document.getElementById("weeklyProgress").textContent = `${progress}%`;

  document.getElementById("completionSummary").textContent =
    `${monthCompleted} completion${monthCompleted === 1 ? "" : "s"} this month`;
}

function changeMonth(amount) {
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
  return div.innerHTML;
}

function openModal() {
  habitModal.classList.remove("hidden");
  habitName.focus();
}

function closeModal() {
  habitModal.classList.add("hidden");
  habitForm.reset();
}

document.getElementById("addHabitButton").addEventListener("click", openModal);
document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("cancelButton").addEventListener("click", closeModal);

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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !habitModal.classList.contains("hidden")) {
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
  renderHabits();
  renderChart();
  closeModal();
});

document.getElementById("todayButton").addEventListener("click", () => {
  refreshToday();

  viewedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  renderMonth();

  const todayCell = document.querySelector(".check-cell.today");

  if (todayCell) {
    todayCell.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center"
    });
  }
});

saveHabits();
setHabitSize(habitZoomIndex);
renderMonth();

window.setInterval(refreshToday, 60000);
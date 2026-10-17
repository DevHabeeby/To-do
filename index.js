
const STORAGE_KEY = "taskly-tasks-v1";
const THEME_KEY = "taskly-theme-v1";

const $ = (selector) => document.querySelector(selector);

const taskList = $("#taskList");
const emptyState = $("#emptyState");
const taskModal = $("#taskModal");
const taskForm = $("#taskForm");

let tasks = loadTasks();
let activeFilter = "all";
let editingId = null;
let toastTimer;

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    showToast("Unable to save tasks in this browser.");
  }
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function todayString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date);
}

function priorityName(priority) {
  return {
    high: "High priority",
    medium: "Medium priority",
    low: "Low priority"
  }[priority] || "Medium priority";
}

function dueText(task) {
  if (!task.due) return "";

  const today = todayString();

  if (task.due < today && !task.completed) {
    return `Overdue · ${formatDate(task.due)}`;
  }

  if (task.due === today) {
    return "Due today";
  }

  return `Due ${formatDate(task.due)}`;
}

function dueClass(task) {
  if (!task.due) return "";

  if (task.due < todayString() && !task.completed) {
    return "overdue";
  }

  if (task.due === todayString()) {
    return "today";
  }

  return "";
}

function getVisibleTasks() {
  const query = $("#searchInput").value.trim().toLowerCase();

  let result = tasks.filter(task => {
    const matchesSearch =
      task.title.toLowerCase().includes(query) ||
      (task.description || "").toLowerCase().includes(query);

    if (!matchesSearch) return false;

    switch (activeFilter) {
      case "today":
        return !task.completed && task.due === todayString();

      case "upcoming":
        return !task.completed && task.due > todayString();

      case "completed":
        return task.completed;

      default:
        return activeFilter === "all" || !task.completed;
    }
  });

  const sortBy = $("#sortSelect").value;

  if (sortBy === "due") {
    result.sort((a, b) =>
      (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31")
    );
  } else if (sortBy === "priority") {
    const rank = { high: 0, medium: 1, low: 2 };

    result.sort((a, b) =>
      (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1)
    );
  } else if (sortBy === "alphabetical") {
    result.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    result.sort((a, b) => b.createdAt - a.createdAt);
  }

  return result;
}

function renderTask(task) {
  const completedClass = task.completed ? " is-complete" : "";

  const description = task.description
    ? `<p class="task-description">${escapeHTML(task.description)}</p>`
    : "";

  const due = task.due
    ? `<span class="due-badge ${dueClass(task)}">◷ ${escapeHTML(dueText(task))}</span>`
    : "";

  return `
    <article class="task-item${completedClass}" data-id="${escapeHTML(task.id)}">
      <button
        class="task-check"
        data-action="toggle"
        aria-label="${task.completed ? "Mark incomplete" : "Mark complete"}"
        aria-pressed="${task.completed}"
      >${task.completed ? "✓" : ""}</button>

      <div class="task-main">
        <h3 class="task-title">${escapeHTML(task.title)}</h3>
        ${description}

        <div class="task-meta">
          <span class="priority-badge ${escapeHTML(task.priority)}">
            ● ${priorityName(task.priority)}
          </span>
          ${due}
        </div>
      </div>

      <div class="task-actions">
        <button
          class="task-action"
          data-action="edit"
          aria-label="Edit ${escapeHTML(task.title)}"
          title="Edit task"
        >✎</button>

        <button
          class="task-action delete"
          data-action="delete"
          aria-label="Delete ${escapeHTML(task.title)}"
          title="Delete task"
        >⌫</button>
      </div>
    </article>
  `;
}

function render() {
  const total = tasks.length;
  const completed = tasks.filter(task => task.completed).length;
  const remaining = total - completed;
  const progress = total ? Math.round(completed / total * 100) : 0;

  $("#allCount").textContent = total;
  $("#completedCount").textContent = completed;

  $("#totalTasks").textContent = total;
  $("#completedTasks").textContent = completed;
  $("#remainingTasks").textContent = remaining;
  $("#progressPercent").textContent = progress;

  $("#miniProgress").style.width = `${progress}%`;
  $("#mainProgress").style.width = `${progress}%`;
  $("#miniProgressText").textContent = `${progress}% completed`;

  const titles = {
    all: "All Tasks",
    today: "Today",
    upcoming: "Upcoming",
    completed: "Completed"
  };

  $("#listHeading").childNodes[0].textContent =
    `${titles[activeFilter] || "All Tasks"} `;

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.filter === activeFilter
    );
  });

  const visibleTasks = getVisibleTasks();

  $("#listCount").textContent = visibleTasks.length;
  $("#footerCount").textContent =
    `${visibleTasks.length} task${visibleTasks.length === 1 ? "" : "s"}`;

  taskList.innerHTML = visibleTasks.map(renderTask).join("");
  taskList.style.display = visibleTasks.length ? "grid" : "none";

  emptyState.classList.toggle("visible", visibleTasks.length === 0);

  $("#clearCompleted").disabled = completed === 0;
  $("#clearCompleted").style.opacity = completed === 0 ? "0.5" : "1";
}

function openModal(task = null) {
  editingId = task ? task.id : null;

  taskForm.reset();

  $("#taskTitle").value = task?.title || "";
  $("#taskDescription").value = task?.description || "";
  $("#taskDue").value = task?.due || "";
  $("#taskPriority").value = task?.priority || "medium";

  $("#modalTitle").textContent = task ? "Edit task" : "Create a task";
  $("#saveButton").textContent = task ? "Save changes →" : "Create task →";

  taskModal.classList.add("open");
  document.body.style.overflow = "hidden";

  setTimeout(() => $("#taskTitle").focus(), 50);
}

function closeModal() {
  taskModal.classList.remove("open");
  document.body.style.overflow = "";
  editingId = null;
}

function showToast(message) {
  const toast = $("#toast");

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function createId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Add a new task or save an edited task.
taskForm.addEventListener("submit", event => {
  event.preventDefault();

  const title = $("#taskTitle").value.trim();

  if (!title) {
    $("#taskTitle").focus();
    return;
  }

  const taskData = {
    title,
    description: $("#taskDescription").value.trim(),
    due: $("#taskDue").value,
    priority: $("#taskPriority").value
  };

  if (editingId) {
    tasks = tasks.map(task =>
      task.id === editingId ? { ...task, ...taskData } : task
    );

    showToast("Task updated successfully.");
  } else {
    tasks.unshift({
      id: createId(),
      ...taskData,
      completed: false,
      createdAt: Date.now()
    });

    showToast("Task added successfully!");
  }

  saveTasks();
  closeModal();
  render();
});

// Complete, edit, or delete a task.
taskList.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");

  if (!button) return;

  const article = button.closest("[data-id]");
  const task = tasks.find(item => item.id === article?.dataset.id);

  if (!task) return;

  const action = button.dataset.action;

  if (action === "toggle") {
    task.completed = !task.completed;
    saveTasks();
    render();

    showToast(
      task.completed
        ? "Great job! Task completed."
        : "Task marked as incomplete."
    );
  }

  if (action === "edit") {
    openModal(task);
  }

  if (action === "delete") {
    tasks = tasks.filter(item => item.id !== task.id);
    saveTasks();
    render();
    showToast("Task deleted.");
  }
});

// Navigation filters.
document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    render();
  });
});

// Modal buttons.
$("#openModal").addEventListener("click", () => openModal());
$("#emptyAdd").addEventListener("click", () => openModal());
$("#closeModal").addEventListener("click", closeModal);
$("#cancelModal").addEventListener("click", closeModal);

taskModal.addEventListener("click", event => {
  if (event.target === taskModal) closeModal();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeModal();

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("#searchInput").focus();
  }
});

// Search and sorting.
$("#searchInput").addEventListener("input", render);
$("#sortSelect").addEventListener("change", render);

// Remove completed tasks.
$("#clearCompleted").addEventListener("click", () => {
  const completed = tasks.filter(task => task.completed).length;

  if (!completed) return;

  const confirmed = confirm(
    `Delete all ${completed} completed task(s)?`
  );

  if (!confirmed) return;

  tasks = tasks.filter(task => !task.completed);

  saveTasks();
  render();
  showToast("Completed tasks cleared.");
});

// Dark mode.
function setTheme(theme) {
  const dark = theme === "dark";

  document.body.classList.toggle("dark", dark);

  $("#themeToggle").textContent = dark ? "☀ Light mode" : "☾ Dark mode";

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The theme still works if storage is unavailable.
  }
}

$("#themeToggle").addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("dark")
    ? "light"
    : "dark";

  setTheme(nextTheme);
});

// Greeting based on the time of day.
const hour = new Date().getHours();

$("#greeting").textContent =
  `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"} ✨`;

try {
  setTheme(localStorage.getItem(THEME_KEY) || "light");
} catch {
  setTheme("light");
}

// Display saved tasks when the app opens.
render();

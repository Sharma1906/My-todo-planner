const STORAGE_KEY = "daymark.tasks.v1";
const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const dueDateInput = document.getElementById("dueDate");
const reminderDateInput = document.getElementById("reminderDate");
const taskList = document.getElementById("taskList");
const emptyState = document.getElementById("emptyState");
const taskCount = document.getElementById("taskCount");
const formMessage = document.getElementById("formMessage");
const filterButtons = document.querySelectorAll(".filter-button");
const editCancelButton = document.getElementById("cancelEditBtn");
const saveButtonText = document.getElementById("saveButtonText");
const formTitle = document.getElementById("formTitle");
const formEyebrow = document.getElementById("formEyebrow");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const progressBar = document.getElementById("progressBar");
const todayDate = document.getElementById("todayDate");

let tasks = [];
let currentFilter = "all";
let editingTaskId = null;
const failedReminders = new Set();

todayDate.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric"
}).format(new Date());

function setMessage(message) {
    formMessage.textContent = message;
}

function loadTasks() {
    try {
        const storedTasks = localStorage.getItem(STORAGE_KEY);
        if (!storedTasks) {
            return [];
        }

        const parsedTasks = JSON.parse(storedTasks);
        if (!Array.isArray(parsedTasks)) {
            throw new Error("Saved task data is not a list.");
        }

        return parsedTasks.filter((task) =>
            task &&
            typeof task.id === "string" &&
            typeof task.text === "string" &&
            typeof task.completed === "boolean"
        );
    } catch (error) {
        console.error("Unable to load saved tasks.", error);
        setMessage("Saved tasks could not be loaded. Browser storage may be unavailable or damaged.");
        return [];
    }
}

function saveTasks() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        return true;
    } catch (error) {
        console.error("Unable to save tasks.", error);
        setMessage("Tasks could not be saved. Check your browser storage settings and try again.");
        return false;
    }
}

function createTaskId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toStoredDate(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toInputDate(value) {
    if (!value) {
        return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

function formatDate(value) {
    const date = new Date(value);
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function makeIcon(kind) {
    const paths = {
        edit: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path>',
        delete: '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="m19 6-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path>',
        reminder: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>'
    };
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = paths[kind];
    return icon;
}

function addTaskMeta(container, iconName, text, extraClass) {
    const item = document.createElement("span");
    if (extraClass) {
        item.classList.add(extraClass);
    }
    item.appendChild(makeIcon(iconName));
    const label = document.createElement("span");
    label.textContent = text;
    item.appendChild(label);
    container.appendChild(item);
}

function createTaskElement(task) {
    const item = document.createElement("li");
    item.className = `task-item${task.completed ? " completed" : ""}`;
    item.dataset.taskId = task.id;

    const checkbox = document.createElement("input");
    checkbox.className = "task-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `Mark "${task.text}" ${task.completed ? "incomplete" : "complete"}`);
    checkbox.dataset.action = "toggle";
    item.appendChild(checkbox);

    const content = document.createElement("div");
    content.className = "task-content";
    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;
    content.appendChild(text);

    if (task.dueAt || task.reminderAt) {
        const meta = document.createElement("div");
        meta.className = "task-meta";
        if (task.dueAt) {
            const isOverdue = !task.completed && new Date(task.dueAt).getTime() < Date.now();
            addTaskMeta(meta, "calendar", `Due ${formatDate(task.dueAt)}`, isOverdue ? "overdue" : "");
        }
        if (task.reminderAt) {
            addTaskMeta(meta, "reminder", `Reminder ${formatDate(task.reminderAt)}`);
        }
        content.appendChild(meta);
    }
    item.appendChild(content);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editButton = document.createElement("button");
    editButton.className = "task-action";
    editButton.type = "button";
    editButton.dataset.action = "edit";
    editButton.setAttribute("aria-label", `Edit "${task.text}"`);
    editButton.title = "Edit task";
    editButton.appendChild(makeIcon("edit"));
    actions.appendChild(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.className = "task-action delete-btn";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.setAttribute("aria-label", `Delete "${task.text}"`);
    deleteButton.title = "Delete task";
    deleteButton.appendChild(makeIcon("delete"));
    actions.appendChild(deleteButton);
    item.appendChild(actions);
    return item;
}

function visibleTasks() {
    if (currentFilter === "active") {
        return tasks.filter((task) => !task.completed);
    }
    if (currentFilter === "completed") {
        return tasks.filter((task) => task.completed);
    }
    return tasks;
}

function renderTasks() {
    const visible = visibleTasks();
    taskList.replaceChildren(...visible.map(createTaskElement));
    emptyState.hidden = visible.length > 0;
    taskCount.textContent = String(tasks.length);

    if (tasks.length === 0) {
        emptyState.querySelector("h3").textContent = "Your list is clear";
        emptyState.querySelector("p").textContent = "Add a task above and make a little progress.";
    } else if (visible.length === 0) {
        emptyState.querySelector("h3").textContent = "Nothing to show here";
        emptyState.querySelector("p").textContent = "Try another filter to see your tasks.";
    }

    const completedCount = tasks.filter((task) => task.completed).length;
    const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
    progressText.textContent = `${progress}%`;
    progressFill.style.width = `${progress}%`;
    progressBar.setAttribute("aria-valuenow", String(progress));
}

function setEditingTask(task) {
    editingTaskId = task.id;
    taskInput.value = task.text;
    dueDateInput.value = toInputDate(task.dueAt);
    reminderDateInput.value = toInputDate(task.reminderAt);
    formTitle.textContent = "Edit task";
    formEyebrow.textContent = "MAKE A QUICK UPDATE";
    saveButtonText.textContent = "Save changes";
    editCancelButton.hidden = false;
    setMessage("");
    taskInput.focus();
    taskForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetForm() {
    editingTaskId = null;
    taskForm.reset();
    formTitle.textContent = "Add a task";
    formEyebrow.textContent = "GET IT OUT OF YOUR HEAD";
    saveButtonText.textContent = "Add task";
    editCancelButton.hidden = true;
}

async function enableReminderIfNeeded() {
    if (!("Notification" in window)) {
        return "This browser does not support notifications. Your reminder is saved, but can only be checked while the page is open.";
    }
    if (!window.isSecureContext && window.location.protocol !== "file:") {
        return "Notifications require a secure connection. Your reminder is saved, but no notification can be sent here.";
    }
    if (Notification.permission === "granted") {
        return "";
    }
    if (Notification.permission === "denied") {
        return "Notifications are blocked in your browser. Your reminder is saved, but no notification can be sent.";
    }

    try {
        const permission = await Notification.requestPermission();
        return permission === "granted"
            ? ""
            : "Allow notifications in your browser to receive this reminder.";
    } catch (error) {
        console.error("Unable to request notification permission.", error);
        return "The browser could not request notification permission. Check your site settings.";
    }
}

taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = taskInput.value.trim();
    if (!text) {
        taskInput.focus();
        return;
    }

    const dueAt = toStoredDate(dueDateInput.value);
    const reminderAt = toStoredDate(reminderDateInput.value);
    const previousTasks = tasks.map((item) => ({ ...item }));
    let task;
    let successMessage;

    if (editingTaskId) {
        const existingTask = tasks.find((item) => item.id === editingTaskId);
        if (!existingTask) {
            resetForm();
            setMessage("This task could not be found. Please try again.");
            return;
        }
        const reminderChanged = existingTask.reminderAt !== reminderAt;
        task = {
            ...existingTask,
            text,
            dueAt,
            reminderAt,
            reminderSent: reminderChanged ? false : Boolean(existingTask.reminderSent)
        };
        tasks = tasks.map((item) => item.id === editingTaskId ? task : item);
        successMessage = "Task updated.";
    } else {
        task = {
            id: createTaskId(),
            text,
            dueAt,
            reminderAt,
            reminderSent: false,
            completed: false
        };
        tasks.unshift(task);
        successMessage = "Task saved.";
    }

    if (!saveTasks()) {
        tasks = previousTasks;
        renderTasks();
        return;
    }

    resetForm();
    renderTasks();
    setMessage(successMessage);

    if (task.reminderAt && !task.reminderSent) {
        const reminderMessage = await enableReminderIfNeeded();
        if (reminderMessage) {
            setMessage(`${successMessage} ${reminderMessage}`);
        } else {
            checkReminders();
        }
    }
    taskInput.focus();
});

editCancelButton.addEventListener("click", () => {
    resetForm();
    setMessage("");
    taskInput.focus();
});

filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
        currentFilter = button.dataset.filter;
        filterButtons.forEach((filterButton) => {
            const isActive = filterButton === button;
            filterButton.classList.toggle("active", isActive);
            filterButton.setAttribute("aria-pressed", String(isActive));
        });
        renderTasks();
    });
});

taskList.addEventListener("change", (event) => {
    const checkbox = event.target.closest('[data-action="toggle"]');
    if (!checkbox) {
        return;
    }
    const item = checkbox.closest("[data-task-id]");
    const task = tasks.find((entry) => entry.id === item.dataset.taskId);
    if (!task) {
        return;
    }

    task.completed = checkbox.checked;
    if (!saveTasks()) {
        task.completed = !checkbox.checked;
    }
    renderTasks();
});

taskList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
        return;
    }
    const item = button.closest("[data-task-id]");
    const task = tasks.find((entry) => entry.id === item.dataset.taskId);
    if (!task) {
        return;
    }

    if (button.dataset.action === "edit") {
        setEditingTask(task);
    } else if (button.dataset.action === "delete") {
        const previousTasks = tasks.map((entry) => ({ ...entry }));
        tasks = tasks.filter((entry) => entry.id !== task.id);
        if (!saveTasks()) {
            tasks = previousTasks;
        } else {
            if (editingTaskId === task.id) {
                resetForm();
            }
            setMessage("Task deleted.");
        }
        renderTasks();
    }
});

function checkReminders() {
    if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
    }

    const now = Date.now();
    let changed = false;
    tasks.forEach((task) => {
        if (!task.completed && task.reminderAt && !task.reminderSent &&
            !failedReminders.has(task.id) && new Date(task.reminderAt).getTime() <= now) {
            try {
                new Notification("Daymark reminder", {
                    body: task.text,
                    tag: `daymark-${task.id}`
                });
                task.reminderSent = true;
                changed = true;
            } catch (error) {
                failedReminders.add(task.id);
                console.error("Unable to display a task reminder.", error);
                setMessage("A reminder was due, but the browser could not display it. Check your notification settings.");
            }
        }
    });

    if (changed) {
        saveTasks();
        renderTasks();
    }
}

tasks = loadTasks();
renderTasks();
checkReminders();
window.setInterval(checkReminders, 15000);

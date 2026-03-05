const loginForm = document.getElementById('login-form');
const authStatus = document.getElementById('auth-status');
const sessionInfo = document.getElementById('session-info');
const sessionRow = document.getElementById('session-row');
const logoutBtn = document.getElementById('logout-btn');

const adminPanel = document.getElementById('admin-panel');
const userPanel = document.getElementById('user-panel');
const summaryPanel = document.getElementById('summary-panel');
const historyPanel = document.getElementById('history-panel');

const foodForm = document.getElementById('food-form');
const foodStatus = document.getElementById('food-status');
const foodTable = document.getElementById('food-table');
const foodSelect = document.getElementById('food-select');

const entryForm = document.getElementById('entry-form');
const entryStatus = document.getElementById('entry-status');

const summaryForm = document.getElementById('summary-form');
const summaryOutput = document.getElementById('summary-output');

const refreshHistoryBtn = document.getElementById('refresh-history');
const historyOutput = document.getElementById('history-output');

const TOKEN_KEY = 'calorie_tracker_token';
let authToken = localStorage.getItem(TOKEN_KEY) || '';
let currentUser = null;
let foodsCache = [];

const today = new Date().toISOString().slice(0, 10);
entryForm.elements.date.value = today;
summaryForm.elements.date.value = today;

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      updateUIByRole();
    }
    throw new Error(data.error || 'Something went wrong');
  }

  return data;
}

function showStatus(node, message, isError = false) {
  node.textContent = message;
  node.style.color = isError ? '#a11d1d' : '#2f6651';
}

function clearSession() {
  authToken = '';
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
}

function saveSession(token, user) {
  authToken = token;
  currentUser = user;
  localStorage.setItem(TOKEN_KEY, token);
}

function updateUIByRole() {
  const isLoggedIn = Boolean(currentUser);
  const isAdmin = isLoggedIn && currentUser.role === 'admin';

  sessionRow.classList.toggle('hidden', !isLoggedIn);
  sessionInfo.textContent = isLoggedIn ? `Logged in as ${currentUser.username} (${currentUser.role})` : '';

  adminPanel.classList.toggle('hidden', !isAdmin);
  userPanel.classList.toggle('hidden', !isLoggedIn);
  summaryPanel.classList.toggle('hidden', !isLoggedIn);
  historyPanel.classList.toggle('hidden', !isLoggedIn);

  if (!isLoggedIn) {
    summaryOutput.innerHTML = '';
    historyOutput.innerHTML = '';
    foodTable.innerHTML = '<tr><td colspan="5" class="small">Login to view items.</td></tr>';
    foodSelect.innerHTML = '<option value="">Login to view items</option>';
  }
}

function renderFoodTable(foods) {
  foodsCache = foods;
  const isAdmin = currentUser && currentUser.role === 'admin';

  if (!foods.length) {
    foodTable.innerHTML = '<tr><td colspan="5" class="small">No food items added yet.</td></tr>';
    return;
  }

  foodTable.innerHTML = foods
    .map(
      (food) =>
        `<tr>
          <td>${food.name}</td>
          <td>${food.unit}</td>
          <td>${food.calories}</td>
          <td>${food.protein}</td>
          <td>
            ${
              isAdmin
                ? `<button type="button" data-action="edit-food" data-food-id="${food.id}">Edit</button>
                   <button type="button" data-action="delete-food" data-food-id="${food.id}">Delete</button>`
                : '<span class="small">-</span>'
            }
          </td>
        </tr>`
    )
    .join('');
}

function renderFoodSelect(foods) {
  if (!foods.length) {
    foodSelect.innerHTML = '<option value="">Add food first</option>';
    return;
  }

  foodSelect.innerHTML = foods
    .map((food) => `<option value="${food.id}">${food.name} (${food.unit})</option>`)
    .join('');
}

function renderSummary(summary, targetNode) {
  const mealBlocks = Object.entries(summary.byMeal)
    .map(([meal, details]) => {
      const items = details.items.length
        ? details.items
            .map(
              (item) =>
                `<li>${item.foodName} x ${item.quantity} ${item.unit} = ${item.calories.toFixed(2)} cal, ${item.protein.toFixed(2)} g protein</li>`
            )
            .join('')
        : '<li class="small">No items</li>';

      return `
        <div class="card">
          <h4>${meal[0].toUpperCase()}${meal.slice(1)}</h4>
          <p class="small">Calories: ${details.calories.toFixed(2)} | Protein: ${details.protein.toFixed(2)} g</p>
          <ul>${items}</ul>
        </div>
      `;
    })
    .join('');

  targetNode.innerHTML = `
    <div class="card">
      <h3>${summary.date}</h3>
      <div class="kpi">
        <div><strong>Total Calories</strong><br/>${summary.totals.calories.toFixed(2)}</div>
        <div><strong>Total Protein (g)</strong><br/>${summary.totals.protein.toFixed(2)}</div>
      </div>
    </div>
    ${mealBlocks}
  `;
}

async function loadFoods() {
  const foods = await api('/api/foods');
  renderFoodTable(foods);
  renderFoodSelect(foods);
}

async function loadSummaryByDate(date) {
  const summary = await api(`/api/summary?date=${date}`);
  renderSummary(summary, summaryOutput);
}

async function loadHistory() {
  const history = await api('/api/history');

  if (!history.length) {
    historyOutput.innerHTML = '<p class="small">No history yet.</p>';
    return;
  }

  historyOutput.innerHTML = history
    .map(
      (day) => `
      <div class="card">
        <strong>${day.date}</strong><br/>
        Calories: ${day.totals.calories.toFixed(2)} | Protein: ${day.totals.protein.toFixed(2)} g
      </div>
    `
    )
    .join('');
}

async function loadPrivateData() {
  await loadFoods();
  await loadSummaryByDate(summaryForm.elements.date.value);
  await loadHistory();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const payload = {
      username: loginForm.elements.username.value,
      password: loginForm.elements.password.value
    };

    const result = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    saveSession(result.token, result.user);
    updateUIByRole();
    showStatus(authStatus, 'Login successful.');
    loginForm.reset();
    await loadPrivateData();
  } catch (error) {
    showStatus(authStatus, error.message, true);
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch (error) {
    // Ignore logout API errors and clear local session anyway.
  }

  clearSession();
  updateUIByRole();
  showStatus(authStatus, 'Logged out successfully.');
});

foodForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    name: foodForm.elements.name.value,
    unit: foodForm.elements.unit.value,
    calories: Number(foodForm.elements.calories.value),
    protein: Number(foodForm.elements.protein.value)
  };

  try {
    await api('/api/foods', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showStatus(foodStatus, 'Food added successfully.');
    foodForm.reset();
    await loadFoods();
  } catch (error) {
    showStatus(foodStatus, error.message, true);
  }
});

entryForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    date: entryForm.elements.date.value,
    mealType: entryForm.elements.mealType.value,
    foodId: Number(entryForm.elements.foodId.value),
    quantity: Number(entryForm.elements.quantity.value)
  };

  try {
    await api('/api/entries', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showStatus(entryStatus, 'Meal item added.');
    await loadSummaryByDate(payload.date);
    await loadHistory();
  } catch (error) {
    showStatus(entryStatus, error.message, true);
  }
});

summaryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const date = summaryForm.elements.date.value;

  try {
    await loadSummaryByDate(date);
  } catch (error) {
    summaryOutput.innerHTML = `<p class="small" style="color:#a11d1d;">${error.message}</p>`;
  }
});

refreshHistoryBtn.addEventListener('click', async () => {
  try {
    await loadHistory();
  } catch (error) {
    historyOutput.innerHTML = `<p class="small" style="color:#a11d1d;">${error.message}</p>`;
  }
});

foodTable.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action][data-food-id]');
  if (!button) return;

  const action = button.getAttribute('data-action');
  const foodId = Number(button.getAttribute('data-food-id'));
  const food = foodsCache.find((item) => item.id === foodId);
  if (!food) return;

  if (action === 'delete-food') {
    const shouldDelete = window.confirm(`Delete "${food.name}"?`);
    if (!shouldDelete) return;

    try {
      await api(`/api/foods/${foodId}`, { method: 'DELETE' });
      showStatus(foodStatus, 'Food deleted successfully.');
      await loadFoods();
    } catch (error) {
      showStatus(foodStatus, error.message, true);
    }
    return;
  }

  if (action === 'edit-food') {
    const name = window.prompt('Food name', food.name);
    if (name === null) return;
    const unit = window.prompt('Unit', food.unit);
    if (unit === null) return;
    const caloriesRaw = window.prompt('Calories per unit', String(food.calories));
    if (caloriesRaw === null) return;
    const proteinRaw = window.prompt('Protein per unit (g)', String(food.protein));
    if (proteinRaw === null) return;

    try {
      await api(`/api/foods/${foodId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          unit: unit.trim(),
          calories: Number(caloriesRaw),
          protein: Number(proteinRaw)
        })
      });
      showStatus(foodStatus, 'Food updated successfully.');
      await loadFoods();
    } catch (error) {
      showStatus(foodStatus, error.message, true);
    }
  }
});

(async function init() {
  updateUIByRole();

  if (!authToken) {
    return;
  }

  try {
    const me = await api('/api/me');
    currentUser = me;
    updateUIByRole();
    await loadPrivateData();
  } catch (error) {
    clearSession();
    updateUIByRole();
  }
})();

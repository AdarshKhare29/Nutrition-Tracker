import http, { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import sqlite3 from 'sqlite3';

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MEAL_TYPES = ['breakfast', 'lunch', 'snacks', 'dinner'] as const;

type MealType = (typeof MEAL_TYPES)[number];

type AuthUser = {
  id: number;
  username: string;
  role: 'admin' | 'user';
  token: string;
};

type FoodRow = {
  id: number;
  name: string;
  unit: string;
  calories: number;
  protein: number;
};

type EntryJoinedRow = {
  id: number;
  date: string;
  meal_type: MealType;
  user_id: number;
  food_id: number;
  quantity: number;
  food_name: string;
  unit: string;
  calories: number;
  protein: number;
};

const db = new sqlite3.Database(DB_PATH);

function run(sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID ?? 0, changes: this.changes ?? 0 });
    });
  });
}

function get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row as T | undefined);
    });
  });
}

function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows as T[]);
    });
  });
}

async function initDatabase(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS foods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      unit TEXT NOT NULL,
      calories REAL NOT NULL,
      protein REAL NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      food_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(food_id) REFERENCES foods(id)
    )
  `);

  const admin = await get<{ id: number }>('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!admin) {
    await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', 'admin123', 'admin']);
  }

  const user = await get<{ id: number }>('SELECT id FROM users WHERE username = ?', ['user']);
  if (!user) {
    await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['user', 'user123', 'user']);
  }
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendFile(res: ServerResponse, filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      json(res, 404, { error: 'Not found' });
      return;
    }

    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function createToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function toMealType(input: string): MealType | null {
  const lowered = input.toLowerCase();
  return (MEAL_TYPES as readonly string[]).includes(lowered) ? (lowered as MealType) : null;
}

async function getAuthUser(req: IncomingMessage): Promise<AuthUser | null> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const row = await get<{ id: number; username: string; role: 'admin' | 'user' }>(
    `
      SELECT u.id, u.username, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `,
    [token]
  );

  if (!row) return null;
  return { ...row, token };
}

async function getSummaryForDate(date: string, userId: number): Promise<unknown> {
  const rows = await all<EntryJoinedRow>(
    `
      SELECT
        e.id,
        e.date,
        e.meal_type,
        e.user_id,
        e.food_id,
        e.quantity,
        f.name AS food_name,
        f.unit,
        f.calories,
        f.protein
      FROM entries e
      JOIN foods f ON f.id = e.food_id
      WHERE e.date = ? AND e.user_id = ?
      ORDER BY e.id ASC
    `,
    [date, userId]
  );

  const byMeal: Record<MealType, { calories: number; protein: number; items: unknown[] }> = {
    breakfast: { calories: 0, protein: 0, items: [] },
    lunch: { calories: 0, protein: 0, items: [] },
    snacks: { calories: 0, protein: 0, items: [] },
    dinner: { calories: 0, protein: 0, items: [] }
  };

  let totalCalories = 0;
  let totalProtein = 0;

  for (const row of rows) {
    const calories = Number((row.calories * row.quantity).toFixed(2));
    const protein = Number((row.protein * row.quantity).toFixed(2));

    totalCalories += calories;
    totalProtein += protein;

    byMeal[row.meal_type].calories += calories;
    byMeal[row.meal_type].protein += protein;
    byMeal[row.meal_type].items.push({
      entryId: row.id,
      foodName: row.food_name,
      unit: row.unit,
      quantity: row.quantity,
      calories,
      protein
    });
  }

  return {
    date,
    totals: {
      calories: Number(totalCalories.toFixed(2)),
      protein: Number(totalProtein.toFixed(2))
    },
    byMeal
  };
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/login' && req.method === 'POST') {
      const body = await parseBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      const user = await get<{ id: number; username: string; role: 'admin' | 'user' }>(
        'SELECT id, username, role FROM users WHERE username = ? AND password = ?',
        [username, password]
      );

      if (!user) {
        json(res, 401, { error: 'Invalid username or password.' });
        return;
      }

      const token = createToken();
      await run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
      await run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', [token, user.id, new Date().toISOString()]);
      json(res, 200, { token, user });
      return;
    }

    if (pathname === '/api/me' && req.method === 'GET') {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }
      json(res, 200, { id: authUser.id, username: authUser.username, role: authUser.role });
      return;
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }
      await run('DELETE FROM sessions WHERE token = ?', [authUser.token]);
      json(res, 200, { message: 'Logged out.' });
      return;
    }

    if (pathname === '/api/foods' && req.method === 'GET') {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }

      const foods = await all<FoodRow>('SELECT id, name, unit, calories, protein FROM foods ORDER BY id ASC');
      json(res, 200, foods);
      return;
    }

    if (pathname === '/api/foods' && req.method === 'POST') {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }
      if (authUser.role !== 'admin') {
        json(res, 403, { error: 'Only admin can add food items.' });
        return;
      }

      const body = await parseBody(req);
      const name = String(body.name || '').trim();
      const unit = String(body.unit || '').trim();
      const calories = Number(body.calories);
      const protein = Number(body.protein);

      if (!name || !unit || Number.isNaN(calories) || Number.isNaN(protein) || calories < 0 || protein < 0) {
        json(res, 400, { error: 'name, unit, calories, and protein are required with valid values.' });
        return;
      }

      const duplicate = await get<{ id: number }>('SELECT id FROM foods WHERE lower(name) = lower(?)', [name]);
      if (duplicate) {
        json(res, 409, { error: 'Food item already exists.' });
        return;
      }

      const result = await run('INSERT INTO foods (name, unit, calories, protein) VALUES (?, ?, ?, ?)', [name, unit, calories, protein]);
      const food = await get<FoodRow>('SELECT id, name, unit, calories, protein FROM foods WHERE id = ?', [result.lastID]);
      json(res, 201, food);
      return;
    }

    const foodMatch = pathname.match(/^\/api\/foods\/(\d+)$/);
    if (foodMatch && req.method === 'PUT') {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }
      if (authUser.role !== 'admin') {
        json(res, 403, { error: 'Only admin can edit food items.' });
        return;
      }

      const foodId = Number(foodMatch[1]);
      const existing = await get<{ id: number }>('SELECT id FROM foods WHERE id = ?', [foodId]);
      if (!existing) {
        json(res, 404, { error: 'Food item not found.' });
        return;
      }

      const body = await parseBody(req);
      const name = String(body.name || '').trim();
      const unit = String(body.unit || '').trim();
      const calories = Number(body.calories);
      const protein = Number(body.protein);

      if (!name || !unit || Number.isNaN(calories) || Number.isNaN(protein) || calories < 0 || protein < 0) {
        json(res, 400, { error: 'name, unit, calories, and protein are required with valid values.' });
        return;
      }

      const duplicate = await get<{ id: number }>('SELECT id FROM foods WHERE id != ? AND lower(name) = lower(?)', [foodId, name]);
      if (duplicate) {
        json(res, 409, { error: 'Another food item with this name already exists.' });
        return;
      }

      await run('UPDATE foods SET name = ?, unit = ?, calories = ?, protein = ? WHERE id = ?', [name, unit, calories, protein, foodId]);
      const updated = await get<FoodRow>('SELECT id, name, unit, calories, protein FROM foods WHERE id = ?', [foodId]);
      json(res, 200, updated);
      return;
    }

    if (foodMatch && req.method === 'DELETE') {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }
      if (authUser.role !== 'admin') {
        json(res, 403, { error: 'Only admin can delete food items.' });
        return;
      }

      const foodId = Number(foodMatch[1]);
      const existing = await get<{ id: number }>('SELECT id FROM foods WHERE id = ?', [foodId]);
      if (!existing) {
        json(res, 404, { error: 'Food item not found.' });
        return;
      }

      const used = await get<{ id: number }>('SELECT id FROM entries WHERE food_id = ? LIMIT 1', [foodId]);
      if (used) {
        json(res, 409, { error: 'Cannot delete food item because it is used in meal entries.' });
        return;
      }

      await run('DELETE FROM foods WHERE id = ?', [foodId]);
      json(res, 200, { message: 'Food item deleted.' });
      return;
    }

    if (pathname === '/api/entries' && req.method === 'POST') {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }

      const body = await parseBody(req);
      const date = String(body.date || '');
      const mealType = toMealType(String(body.mealType || ''));
      const foodId = Number(body.foodId);
      const quantity = Number(body.quantity);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        json(res, 400, { error: 'date must be in YYYY-MM-DD format.' });
        return;
      }
      if (!mealType) {
        json(res, 400, { error: `mealType must be one of: ${MEAL_TYPES.join(', ')}` });
        return;
      }
      if (Number.isNaN(foodId) || Number.isNaN(quantity) || quantity <= 0) {
        json(res, 400, { error: 'foodId and quantity must be valid positive numbers.' });
        return;
      }

      const food = await get<{ id: number }>('SELECT id FROM foods WHERE id = ?', [foodId]);
      if (!food) {
        json(res, 404, { error: 'Food item not found.' });
        return;
      }

      const result = await run('INSERT INTO entries (date, meal_type, user_id, food_id, quantity) VALUES (?, ?, ?, ?, ?)', [
        date,
        mealType,
        authUser.id,
        foodId,
        quantity
      ]);

      const entry = await get<{ id: number; date: string; meal_type: string; user_id: number; food_id: number; quantity: number }>(
        'SELECT id, date, meal_type, user_id, food_id, quantity FROM entries WHERE id = ?',
        [result.lastID]
      );

      json(res, 201, {
        id: entry?.id,
        date: entry?.date,
        mealType: entry?.meal_type,
        userId: entry?.user_id,
        foodId: entry?.food_id,
        quantity: entry?.quantity
      });
      return;
    }

    if (pathname === '/api/entries' && req.method === 'GET') {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }

      const date = parsedUrl.searchParams.get('date');
      const params: unknown[] = [];
      let where = 'WHERE 1=1';

      if (authUser.role !== 'admin') {
        where += ' AND e.user_id = ?';
        params.push(authUser.id);
      }
      if (date) {
        where += ' AND e.date = ?';
        params.push(date);
      }

      const rows = await all<EntryJoinedRow>(
        `
          SELECT
            e.id,
            e.date,
            e.meal_type,
            e.user_id,
            e.food_id,
            e.quantity,
            f.name AS food_name,
            f.unit,
            f.calories,
            f.protein
          FROM entries e
          JOIN foods f ON f.id = e.food_id
          ${where}
          ORDER BY e.id ASC
        `,
        params
      );

      const payload = rows.map((r) => ({
        id: r.id,
        date: r.date,
        mealType: r.meal_type,
        userId: r.user_id,
        foodId: r.food_id,
        quantity: r.quantity,
        foodName: r.food_name,
        unit: r.unit
      }));

      json(res, 200, payload);
      return;
    }

    const entryMatch = pathname.match(/^\/api\/entries\/(\d+)$/);
    if (entryMatch && req.method === 'PUT') {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }

      const entryId = Number(entryMatch[1]);
      const existing = await get<{ id: number; user_id: number }>('SELECT id, user_id FROM entries WHERE id = ?', [entryId]);
      if (!existing) {
        json(res, 404, { error: 'Meal entry not found.' });
        return;
      }
      if (authUser.role !== 'admin' && existing.user_id !== authUser.id) {
        json(res, 403, { error: 'You can only edit your own meal entries.' });
        return;
      }

      const body = await parseBody(req);
      const date = String(body.date || '');
      const mealType = toMealType(String(body.mealType || ''));
      const foodId = Number(body.foodId);
      const quantity = Number(body.quantity);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        json(res, 400, { error: 'date must be in YYYY-MM-DD format.' });
        return;
      }
      if (!mealType) {
        json(res, 400, { error: `mealType must be one of: ${MEAL_TYPES.join(', ')}` });
        return;
      }
      if (Number.isNaN(foodId) || Number.isNaN(quantity) || quantity <= 0) {
        json(res, 400, { error: 'foodId and quantity must be valid positive numbers.' });
        return;
      }

      const food = await get<{ id: number }>('SELECT id FROM foods WHERE id = ?', [foodId]);
      if (!food) {
        json(res, 404, { error: 'Food item not found.' });
        return;
      }

      await run('UPDATE entries SET date = ?, meal_type = ?, food_id = ?, quantity = ? WHERE id = ?', [
        date,
        mealType,
        foodId,
        quantity,
        entryId
      ]);

      const updated = await get<{ id: number; date: string; meal_type: string; user_id: number; food_id: number; quantity: number }>(
        'SELECT id, date, meal_type, user_id, food_id, quantity FROM entries WHERE id = ?',
        [entryId]
      );

      json(res, 200, {
        id: updated?.id,
        date: updated?.date,
        mealType: updated?.meal_type,
        userId: updated?.user_id,
        foodId: updated?.food_id,
        quantity: updated?.quantity
      });
      return;
    }

    if (entryMatch && req.method === 'DELETE') {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }

      const entryId = Number(entryMatch[1]);
      const existing = await get<{ id: number; user_id: number }>('SELECT id, user_id FROM entries WHERE id = ?', [entryId]);
      if (!existing) {
        json(res, 404, { error: 'Meal entry not found.' });
        return;
      }
      if (authUser.role !== 'admin' && existing.user_id !== authUser.id) {
        json(res, 403, { error: 'You can only delete your own meal entries.' });
        return;
      }

      await run('DELETE FROM entries WHERE id = ?', [entryId]);
      json(res, 200, { message: 'Meal entry deleted.' });
      return;
    }

    if (pathname === '/api/summary' && req.method === 'GET') {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }

      const date = parsedUrl.searchParams.get('date') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        json(res, 400, { error: 'date query parameter is required in YYYY-MM-DD format.' });
        return;
      }

      const summary = await getSummaryForDate(date, authUser.id);
      json(res, 200, summary);
      return;
    }

    if (pathname === '/api/history' && req.method === 'GET') {
      const authUser = await getAuthUser(req);
      if (!authUser) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }

      const dates = await all<{ date: string }>('SELECT DISTINCT date FROM entries WHERE user_id = ? ORDER BY date DESC', [authUser.id]);
      const history = [];
      for (const row of dates) {
        history.push(await getSummaryForDate(row.date, authUser.id));
      }
      json(res, 200, history);
      return;
    }

    const safePath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(PUBLIC_DIR, safePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      json(res, 403, { error: 'Forbidden' });
      return;
    }

    sendFile(res, filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    json(res, 500, { error: message });
  }
});

initDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });

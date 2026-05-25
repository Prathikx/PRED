// ══════════════════════════════════════════════════════════════════════════════
// Panchayat Raj Engineering Department – Transfer Allotment System
// Node.js + MySQL Backend Server
// ══════════════════════════════════════════════════════════════════════════════

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const url     = require('url');
const mysql   = require('mysql2/promise');

// ─── CONFIG ────────────────────────────────────────────────────────────────
// Edit db.json OR set environment variables before running.
let DB_CONFIG;
try {
  DB_CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8'));
} catch (e) {
  DB_CONFIG = {
    host    : process.env.DB_HOST     || 'localhost',
    port    : parseInt(process.env.DB_PORT || '3306'),
    user    : process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'pred_transfers',
  };
}

const PORT        = process.env.PORT || 3000;
const ADMIN_USER  = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS  = process.env.ADMIN_PASS || 'admin@321';

// ─── DB POOL ───────────────────────────────────────────────────────────────
let pool;
async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...DB_CONFIG,
      waitForConnections: true,
      connectionLimit   : 10,
      timezone          : '+00:00',
      ssl               : DB_CONFIG.ssl || false,
    });
  }
  return pool;
}

// ─── INIT TABLES ──────────────────────────────────────────────────────────
async function initDB() {
  const p = await getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      sno         INT          DEFAULT 0,
      name        VARCHAR(255) NOT NULL,
      designation VARCHAR(100) DEFAULT 'Dy.E.E.',
      employee_id VARCHAR(100) NOT NULL UNIQUE,
      password    VARCHAR(255) NOT NULL,
      dob         VARCHAR(50)  DEFAULT '-',
      station     VARCHAR(255) DEFAULT '-',
      rank_order  INT          DEFAULT 0,
      created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS vacancies (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(255) NOT NULL,
      status     ENUM('vacant','allotted') DEFAULT 'vacant',
      allotted_to INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS preferences (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      pref_order INT NOT NULL,
      post_name  VARCHAR(255),
      UNIQUE KEY unique_pref (employee_id, pref_order)
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS allotments (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL UNIQUE,
      vacancy_id  INT NOT NULL,
      pref_number INT NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\`   VARCHAR(100) PRIMARY KEY,
      \`value\` TEXT
    )
  `);
  // Default allotment_done setting
  await p.query(`INSERT IGNORE INTO settings (\`key\`, \`value\`) VALUES ('allotment_done', '0')`);
  console.log('✅ Database tables ready.');
}

// ─── HELPERS ──────────────────────────────────────────────────────────────
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}
function ok(res, extra = {})  { json(res, { success: true,  ...extra }); }
function err(res, msg, s=400) { json(res, { success: false, error: msg }, s); }

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch(e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ─── ROUTER ───────────────────────────────────────────────────────────────
async function handleAPI(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname  = parsedUrl.pathname;
  const method    = req.method;
  const p         = await getPool();

  // ── Login ──
  if (pathname === '/api/login' && method === 'POST') {
    const body = await readBody(req);
    if (body.role === 'admin') {
      if (body.username === ADMIN_USER && body.password === ADMIN_PASS) {
        return ok(res, { role: 'admin', name: 'Administrator' });
      }
      return err(res, 'Invalid admin credentials.');
    } else {
      const [rows] = await p.query('SELECT * FROM employees WHERE employee_id = ?', [body.username]);
      if (!rows.length || rows[0].password !== body.password)
        return err(res, 'Invalid Employee ID or password.');
      return ok(res, { role: 'employee', empDbId: rows[0].id, name: rows[0].name });
    }
  }

  // ── Employees ──
  if (pathname === '/api/employees') {
    if (method === 'GET') {
      const [rows] = await p.query('SELECT * FROM employees ORDER BY rank_order');
      return ok(res, { employees: rows });
    }
    if (method === 'POST') {
      const body = await readBody(req);
      // Bulk import: replace all
      await p.query('DELETE FROM employees');
      await p.query('DELETE FROM preferences');
      await p.query('DELETE FROM allotments');
      await p.query("UPDATE settings SET `value`='0' WHERE `key`='allotment_done'");
      if (body.employees?.length) {
        for (const e of body.employees) {
          await p.query(
            'INSERT INTO employees (sno, name, designation, employee_id, password, dob, station, rank_order) VALUES (?,?,?,?,?,?,?,?)',
            [e.sno||0, e.name, e.designation||'Dy.E.E.', e.employeeId, e.password||'dee2026', e.dob||'-', e.station||'-', e.rank||e.sno||0]
          );
        }
      }
      return ok(res, { count: body.employees?.length || 0 });
    }
    if (method === 'DELETE') {
      await p.query('DELETE FROM employees');
      await p.query('DELETE FROM preferences');
      await p.query('DELETE FROM allotments');
      await p.query("UPDATE settings SET `value`='0' WHERE `key`='allotment_done'");
      return ok(res);
    }
  }

  // Add single employee
  if (pathname === '/api/employees/add' && method === 'POST') {
    const body = await readBody(req);
    const [existing] = await p.query('SELECT id FROM employees WHERE employee_id = ?', [body.employeeId]);
    if (existing.length) return err(res, 'Employee ID already exists.');
    const [rows] = await p.query('SELECT MAX(sno) as m, MAX(rank_order) as r FROM employees');
    const nextSno  = (rows[0].m || 0) + 1;
    const nextRank = (rows[0].r || 0) + 1;
    await p.query(
      'INSERT INTO employees (sno, name, designation, employee_id, password, dob, station, rank_order) VALUES (?,?,?,?,?,?,?,?)',
      [nextSno, body.name, body.designation||'Dy.E.E.', body.employeeId, body.password, '-', '-', nextRank]
    );
    return ok(res);
  }

  // Update ranks
  if (pathname === '/api/employees/ranks' && method === 'PUT') {
    const body = await readBody(req);
    for (const r of (body.ranks || [])) {
      await p.query('UPDATE employees SET rank_order=? WHERE id=?', [r.rank, r.id]);
    }
    return ok(res);
  }

  // Delete single employee
  const empDeleteMatch = pathname.match(/^\/api\/employees\/(\d+)$/);
  if (empDeleteMatch && method === 'DELETE') {
    const id = empDeleteMatch[1];
    await p.query('DELETE FROM employees WHERE id=?', [id]);
    await p.query('DELETE FROM preferences WHERE employee_id=?', [id]);
    await p.query('DELETE FROM allotments WHERE employee_id=?', [id]);
    return ok(res);
  }

  // ── Vacancies ──
  if (pathname === '/api/vacancies') {
    if (method === 'GET') {
      const [rows] = await p.query('SELECT * FROM vacancies ORDER BY id');
      return ok(res, { vacancies: rows });
    }
    if (method === 'POST') {
      const body = await readBody(req);
      await p.query('DELETE FROM vacancies');
      await p.query('DELETE FROM allotments');
      await p.query("UPDATE settings SET `value`='0' WHERE `key`='allotment_done'");
      if (body.vacancies?.length) {
        for (const v of body.vacancies) {
          await p.query('INSERT INTO vacancies (name, status) VALUES (?,?)', [v.name, 'vacant']);
        }
      }
      return ok(res, { count: body.vacancies?.length || 0 });
    }
    if (method === 'DELETE') {
      await p.query('DELETE FROM vacancies');
      await p.query('DELETE FROM allotments');
      await p.query("UPDATE settings SET `value`='0' WHERE `key`='allotment_done'");
      return ok(res);
    }
  }

  // Add single vacancy
  if (pathname === '/api/vacancies/add' && method === 'POST') {
    const body = await readBody(req);
    await p.query('INSERT INTO vacancies (name) VALUES (?)', [body.name]);
    return ok(res);
  }

  const vacMatch = pathname.match(/^\/api\/vacancies\/(\d+)$/);
  if (vacMatch) {
    const id = vacMatch[1];
    if (method === 'PUT') {
      const body = await readBody(req);
      await p.query('UPDATE vacancies SET name=? WHERE id=?', [body.name, id]);
      return ok(res);
    }
    if (method === 'DELETE') {
      await p.query('DELETE FROM vacancies WHERE id=?', [id]);
      await p.query('DELETE FROM allotments WHERE vacancy_id=?', [id]);
      return ok(res);
    }
  }

  // ── Preferences ──
  if (pathname === '/api/preferences' && method === 'GET') {
    const [rows] = await p.query('SELECT * FROM preferences ORDER BY employee_id, pref_order');
    const prefs = {};
    for (const r of rows) {
      if (!prefs[r.employee_id]) prefs[r.employee_id] = [];
      prefs[r.employee_id][r.pref_order] = r.post_name;
    }
    return ok(res, { preferences: prefs });
  }

  const prefMatch = pathname.match(/^\/api\/preferences\/(\d+)$/);
  if (prefMatch && method === 'POST') {
    const empId = prefMatch[1];
    const body  = await readBody(req);
    await p.query('DELETE FROM preferences WHERE employee_id=?', [empId]);
    for (let i = 0; i < body.prefs.length; i++) {
      await p.query(
        'INSERT INTO preferences (employee_id, pref_order, post_name) VALUES (?,?,?)',
        [empId, i, body.prefs[i]]
      );
    }
    return ok(res);
  }

  // ── Allotments ──
  if (pathname === '/api/allotments' && method === 'GET') {
    const [rows] = await p.query(`
      SELECT a.*, v.name as post FROM allotments a 
      LEFT JOIN vacancies v ON v.id = a.vacancy_id
    `);
    const [[setting]] = await p.query("SELECT `value` FROM settings WHERE `key`='allotment_done'");
    const allotments = {};
    for (const r of rows) {
      allotments[r.employee_id] = { post: r.post, prefNumber: r.pref_number };
    }
    return ok(res, { allotments, allotmentDone: setting?.value === '1' });
  }

  if (pathname === '/api/allotments/run' && method === 'POST') {
    // Reset previous allotments
    await p.query('DELETE FROM allotments');
    await p.query("UPDATE vacancies SET status='vacant', allotted_to=NULL");

    const [employees] = await p.query('SELECT * FROM employees ORDER BY rank_order');
    const [preferences] = await p.query('SELECT * FROM preferences ORDER BY employee_id, pref_order');
    const [vacancies]   = await p.query("SELECT * FROM vacancies WHERE status='vacant' ORDER BY id");

    // Build prefs map
    const prefMap = {};
    for (const r of preferences) {
      if (!prefMap[r.employee_id]) prefMap[r.employee_id] = [];
      prefMap[r.employee_id][r.pref_order] = r.post_name;
    }

    // Vacancy availability map
    const vacMap = {};
    for (const v of vacancies) vacMap[v.name] = v.id;

    const log = [];
    let allotCount = 0;

    for (const emp of employees) {
      const prefs = (prefMap[emp.id] || []).filter(Boolean);
      if (!prefs.length) {
        log.push({ rank: emp.rank_order, name: emp.name, post: '—', pref: '-', status: 'no-prefs' });
        continue;
      }
      let allotted = false;
      for (let i = 0; i < prefs.length; i++) {
        const pname = prefs[i];
        if (vacMap[pname] !== undefined) {
          const vid = vacMap[pname];
          await p.query(
            'INSERT INTO allotments (employee_id, vacancy_id, pref_number) VALUES (?,?,?)',
            [emp.id, vid, i + 1]
          );
          await p.query("UPDATE vacancies SET status='allotted', allotted_to=? WHERE id=?", [emp.id, vid]);
          delete vacMap[pname];
          log.push({ rank: emp.rank_order, name: emp.name, post: pname, pref: i + 1, status: 'allotted' });
          allotted = true;
          allotCount++;
          break;
        }
      }
      if (!allotted) {
        log.push({ rank: emp.rank_order, name: emp.name, post: '—', pref: '-', status: 'not-allotted' });
      }
    }

    await p.query("UPDATE settings SET `value`='1' WHERE `key`='allotment_done'");
    return ok(res, { log, allotCount, total: employees.length });
  }

  if (pathname === '/api/allotments/reset' && method === 'POST') {
    await p.query('DELETE FROM allotments');
    await p.query("UPDATE vacancies SET status='vacant', allotted_to=NULL");
    await p.query("UPDATE settings SET `value`='0' WHERE `key`='allotment_done'");
    return ok(res);
  }

  return err(res, 'Not found.', 404);
}

// ─── STATIC FILE SERVER ───────────────────────────────────────────────────
function serveStatic(req, res) {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext  = path.extname(filePath);
  const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                 '.json':'application/json', '.png':'image/png' }[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// ─── MAIN HTTP SERVER ─────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin' : '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(); return;
  }

  if (req.url.startsWith('/api/')) {
    try { await handleAPI(req, res); }
    catch (e) {
      console.error('API error:', e.message);
      err(res, e.message, 500);
    }
  } else {
    serveStatic(req, res);
  }
});

// ─── START ────────────────────────────────────────────────────────────────
(async () => {
  try {
    await initDB();
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n✅ Server running at http://0.0.0.0:${PORT}`);
      console.log(`   Open http://localhost:${PORT} in your browser`);
      console.log(`\n   Admin login: ${ADMIN_USER} / ${ADMIN_PASS}`);
      console.log('   Employee login: Use Employee ID + password set during import\n');
    });
  } catch (e) {
    console.error('❌ Failed to start:', e.message);
    console.error('   Check your db.json MySQL credentials and try again.');
    process.exit(1);
  }
})();
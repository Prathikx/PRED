# Panchayat Raj Engineering Department – Transfer Allotment System
## MySQL Edition – Multi-Device Support

---

## QUICK SETUP (5 steps)

### Step 1 – Install Node.js
Download from https://nodejs.org (LTS version recommended).

### Step 2 – Edit db.json with YOUR MySQL credentials
Open `db.json` and fill in your details:

```json
{
  "host"    : "localhost",
  "port"    : 3306,
  "user"    : "your_mysql_username",
  "password": "your_mysql_password",
  "database": "pred_transfers"
}
```

> ⚠️ The database `pred_transfers` will be created automatically if it doesn't exist —
>    BUT only if your MySQL user has CREATE DATABASE permission.
>    If not, create it manually first:
>    ```sql
>    CREATE DATABASE pred_transfers CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
>    ```

### Step 3 – Install dependencies
Open a terminal/command prompt in this folder and run:
```
npm install
```

### Step 4 – Start the server
```
npm start
```

You should see:
```
✅ Database tables ready.
✅ Server running at http://0.0.0.0:3000
```

### Step 5 – Open in browser
- **On the same machine:** http://localhost:3000
- **From other devices on the same network:** http://YOUR_SERVER_IP:3000
  (find your IP with `ipconfig` on Windows or `ifconfig` on Linux/Mac)

---

## LOGIN CREDENTIALS

| Role     | Username / ID | Password    |
|----------|---------------|-------------|
| Admin    | admin         | admin@321   |
| Employee | Employee ID   | (set during import) |

---

## CHANGING ADMIN PASSWORD

Edit `server.js`, find these lines near the top and change them:
```js
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin@321';
```

Or set environment variables before running:
```
ADMIN_USER=myuser ADMIN_PASS=mypassword node server.js
```

---

## CHANGING PORT

Default port is 3000. To change it:
```
PORT=8080 node server.js
```

---

## HOW IT WORKS (Multi-Device)

1. **Admin** imports employees and posts from Excel on their machine.
2. **Employees** open the app on their own device (phone, laptop, tablet) using the server's IP address.
3. Each employee logs in with their Employee ID and password.
4. Employees submit their post preferences — saved live to MySQL.
5. Admin can see all preference submissions in real time.
6. Admin runs the allotment — results are stored in MySQL and immediately visible to all employees.

All data is in MySQL → any device accessing the server sees the same live data.

---

## FILE STRUCTURE

```
pred-transfers/
├── server.js      ← Node.js backend (API + static server)
├── index.html     ← Frontend (auto-served by server.js)
├── db.json        ← MySQL credentials (edit this!)
├── package.json   ← Dependencies
└── README.md      ← This file
```

---

## TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| `Error: connect ECONNREFUSED` | MySQL not running, or wrong host/port in db.json |
| `Access denied for user` | Wrong MySQL username/password in db.json |
| `Unknown database` | Create the database manually (see Step 2) |
| Can't access from other devices | Check firewall; allow port 3000 |
| Employee can't login | Make sure you imported employees with correct Employee ID and password |

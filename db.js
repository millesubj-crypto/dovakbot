// db.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db;

export async function initDB() {
  db = await open({
    filename: './casino.db',
    driver: sqlite3.Database
  });

  // WAL 모드: 동시 읽기/쓰기 안정성 향상
  await db.run('PRAGMA journal_mode=WAL');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      balance INTEGER DEFAULT 1000,
      last_claim INTEGER DEFAULT 0,
      last_lottery INTEGER DEFAULT 0
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      amount INTEGER,
      reason TEXT,
      timestamp INTEGER
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS lottery_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      numbers TEXT,
      draw_date TEXT
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS bot_admins (
      user_id TEXT PRIMARY KEY,
      granted_by TEXT,
      granted_at INTEGER
    )
  `);

  console.log('✅ DB 초기화 완료');
}

// ===== 유저 조회 (없으면 생성) =====
export async function getUser(id) {
  let user = await db.get('SELECT * FROM users WHERE id = ?', id);
  if (!user) {
    await db.run(
      'INSERT OR IGNORE INTO users (id, balance, last_claim, last_lottery) VALUES (?, ?, ?, ?)',
      id, 1000, 0, 0
    );
    user = { id, balance: 1000, last_claim: 0, last_lottery: 0 };
  }
  if (user.last_lottery === undefined) user.last_lottery = 0;
  return user;
}

// ===== 잔고 업데이트 =====
// ✅ 트랜잭션 내부에서 getUser 호출 시 중첩 트랜잭션 충돌 방지
//    → 직접 SELECT로 잔고를 가져오고, INSERT OR IGNORE로 유저 없으면 생성
export async function updateBalance(userId, amount, reason) {
  await db.run('BEGIN TRANSACTION');
  try {
    // 유저 없으면 생성 (트랜잭션 내부에서 getUser 대신 직접 처리)
    await db.run(
      'INSERT OR IGNORE INTO users (id, balance, last_claim, last_lottery) VALUES (?, 1000, 0, 0)',
      userId
    );
    const user = await db.get('SELECT balance FROM users WHERE id = ?', userId);
    const actualAmount = amount < 0
      ? Math.max(amount, -user.balance) // 잔고 이상 차감 방지
      : amount;
    const newBalance = Math.max(0, user.balance + amount);

    await db.run('UPDATE users SET balance = ? WHERE id = ?', newBalance, userId);
    // ✅ 실제 반영된 금액을 기록
    await db.run(
      'INSERT INTO transactions (user_id, amount, reason, timestamp) VALUES (?, ?, ?, ?)',
      userId, actualAmount, reason, Date.now()
    );

    await db.run('COMMIT');
    return newBalance;
  } catch (err) {
    try { await db.run('ROLLBACK'); } catch {}
    console.error('💥 Balance update error:', err);
    throw err;
  }
}

// ===== 일일 기본금 체크 =====
export async function canClaimDaily(userId) {
  const user = await getUser(userId);
  const last = user.last_claim || 0;
  if (last === 0) return true;
  const today = new Date();
  const lastDate = new Date(last);
  return !(
    lastDate.getUTCFullYear() === today.getUTCFullYear() &&
    lastDate.getUTCMonth()    === today.getUTCMonth() &&
    lastDate.getUTCDate()     === today.getUTCDate()
  );
}

export async function updateClaim(userId) {
  await db.run('UPDATE users SET last_claim = ? WHERE id = ?', Date.now(), userId);
}

// ===== 복권 1일 1회 체크 =====
export async function canBuyLottery(userId) {
  const user = await getUser(userId);
  const last = user.last_lottery || 0;
  if (last === 0) return true;
  const today = new Date();
  const lastDate = new Date(last);
  return !(
    lastDate.getUTCFullYear() === today.getUTCFullYear() &&
    lastDate.getUTCMonth()    === today.getUTCMonth() &&
    lastDate.getUTCDate()     === today.getUTCDate()
  );
}

export async function updateLastLottery(userId) {
  await db.run('UPDATE users SET last_lottery = ? WHERE id = ?', Date.now(), userId);
}

// ===== 봇 관리자 =====
export async function isBotAdmin(userId) {
  const envAdmins = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()) || [];
  if (envAdmins.includes(userId)) return true;
  const row = await db.get('SELECT 1 FROM bot_admins WHERE user_id = ?', userId);
  return !!row;
}

export async function addBotAdmin(userId, grantedBy) {
  await db.run(
    'INSERT OR IGNORE INTO bot_admins (user_id, granted_by, granted_at) VALUES (?, ?, ?)',
    userId, grantedBy, Date.now()
  );
}

export async function removeBotAdmin(userId) {
  await db.run('DELETE FROM bot_admins WHERE user_id = ?', userId);
}

export async function listBotAdmins() {
  return await db.all('SELECT * FROM bot_admins ORDER BY granted_at ASC');
}

export { db };

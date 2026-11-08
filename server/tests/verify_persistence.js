import Database from 'better-sqlite3';

const path = './data/paybastion.db';
const testId = `TXN-PERSIST-CHECK-${Date.now()}`;
const testKey = `IDEMP-PERSIST-${Date.now()}`;

console.log('1. Opening persistent SQLite DB at', path);
let db = new Database(path);

console.log('2. Inserting test transaction:', testId);
db.prepare(`
  INSERT INTO transactions (
    id, idempotency_key, amount, currency, sender, recipient,
    payment_channel, transaction_state, confidence_score, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(testId, testKey, 777.77, 'INR', 'user@test', 'merchant@test', 'UPI_ONLINE', 'CONFIRMED', 99, new Date().toISOString(), new Date().toISOString());

const inserted = db.prepare('SELECT * FROM transactions WHERE id = ?').get(testId);
console.log('3. Verified inserted record:', inserted.id, 'Amount:', inserted.amount);

console.log('4. Closing database (simulating server shutdown)...');
db.close();
db = null;

console.log('5. Reopening database connection (simulating server restart)...');
const newDb = new Database(path);
const reloaded = newDb.prepare('SELECT * FROM transactions WHERE id = ?').get(testId);

if (reloaded && reloaded.amount === 777.77) {
  console.log('✅ DATABASE PERSISTENCE VERIFIED: Transaction exists after restart with exact amount:', reloaded.amount);
  newDb.close();
  process.exit(0);
} else {
  console.error('❌ PERSISTENCE FAILURE: Transaction missing after restart');
  newDb.close();
  process.exit(1);
}

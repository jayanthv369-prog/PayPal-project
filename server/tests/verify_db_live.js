import 'dotenv/config';
import mongoose from 'mongoose';
import request from 'supertest';
import assert from 'node:assert';
import app from '../index.js';
import { connectDB, disconnectDB, isDBConnected } from '../config/database.js';
import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';

async function runLiveVerification() {
  console.log('========================================================');
  console.log('  PAYBASTION LIVE MONGODB & AUTH REGISTRATION TEST SUITE');
  console.log('========================================================');

  // STEP 1 & 2: Start backend & Verify MongoDB connection
  console.log('\n[1 & 2] Verifying MongoDB Connection State...');
  assert.strictEqual(isDBConnected(), true, 'Mongoose must report connected state (1)');
  console.log(`   Connected to: ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`);
  console.log(`   Connection ReadyState: ${mongoose.connection.readyState} (1 = connected)`);

  // STEP 4 verification: Health Check Endpoint
  console.log('\n[Health Check] Testing GET /api/health...');
  const healthRes = await request(app).get('/api/health').expect(200);
  console.log('   Health response:', JSON.stringify(healthRes.body, null, 2));
  assert.strictEqual(healthRes.body.success, true);
  assert.strictEqual(healthRes.body.server, 'running');
  assert.strictEqual(healthRes.body.database, 'connected');
  assert.strictEqual(healthRes.status, 200);
  console.log('   ✔ Health check verified with HTTP 200, server: running, database: connected');

  // STEP 3: Register a new user
  const timestamp = Date.now();
  const testEmail = `fintech.user.${timestamp}@paybastion.dev`;
  const testPassword = 'StrongPassword987!#';
  const testName = 'Devika Sharma';

  console.log(`\n[3] Registering New User: ${testEmail}...`);
  const regRes = await request(app)
    .post('/api/auth/register')
    .send({
      name: testName,
      email: testEmail,
      password: testPassword,
    })
    .expect(201);

  console.log('   Registration response:', JSON.stringify(regRes.body, null, 2));
  assert.strictEqual(regRes.body.success, true);
  assert.ok(regRes.body.token, 'Must return JWT token');
  assert.strictEqual(regRes.body.user.email, testEmail);
  assert.strictEqual(regRes.body.user.name, testName);
  assert.strictEqual(regRes.body.user.passwordHash, undefined, 'Password hash must never leak in response');
  assert.strictEqual(regRes.body.wallet.balance, 5000, 'Wallet must be provisioned with ₹5,000');
  console.log('   ✔ User registration succeeded with HTTP 201');

  // STEP 4: Verify the user exists directly in MongoDB collection
  console.log('\n[4] Querying MongoDB directly to verify record persistence...');
  const dbUser = await User.findOne({ email: testEmail });
  assert.ok(dbUser, 'User record must exist in MongoDB database');
  assert.strictEqual(dbUser.email, testEmail);
  assert.strictEqual(dbUser.name, testName);
  assert.ok(dbUser.passwordHash, 'User must have bcrypt passwordHash stored');
  assert.notStrictEqual(dbUser.passwordHash, testPassword, 'Password must NOT be stored in plain text');
  console.log(`   Found MongoDB document: _id=${dbUser._id}, email=${dbUser.email}, hash=${dbUser.passwordHash.substring(0, 15)}...`);

  // STEP 10: Verify wallet provisioning directly in MongoDB
  console.log('\n[10] Verifying Wallet provisioning in MongoDB...');
  const dbWallet = await Wallet.findOne({ userId: dbUser._id });
  assert.ok(dbWallet, 'Wallet record must exist in MongoDB database');
  assert.strictEqual(dbWallet.balance, 5000);
  assert.strictEqual(dbWallet.currency, 'INR');
  assert.strictEqual(dbWallet.isSimulated, true);
  console.log(`   Found MongoDB wallet: _id=${dbWallet._id}, userId=${dbWallet.userId}, balance=₹${dbWallet.balance}`);
  console.log('   ✔ Wallet correctly provisioned and persisted in MongoDB');

  // STEP 5 & 6: Try registering the same email again -> must be rejected
  console.log('\n[5 & 6] Testing Duplicate Registration Prevention...');
  const dupRes = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Imposter User',
      email: testEmail,
      password: 'AnotherPassword456!',
    })
    .expect(409);

  console.log('   Duplicate registration response:', JSON.stringify(dupRes.body, null, 2));
  assert.strictEqual(dupRes.body.error, 'Registration failed');
  assert.strictEqual(dupRes.body.code, 'USER_EXISTS');
  console.log('   ✔ Duplicate registration rejected with HTTP 409 and code USER_EXISTS');

  // STEP 7 & 8: Restart backend and verify registered user still exists
  console.log('\n[7 & 8] Simulating Backend Restart (Disconnecting & Reconnecting)...');
  await mongoose.disconnect();
  console.log(`   Disconnected readyState: ${mongoose.connection.readyState} (0 = disconnected)`);
  assert.strictEqual(isDBConnected(), false);

  // Health check while disconnected should return HTTP 503
  const degradedHealth = await request(app).get('/api/health').expect(503);
  console.log('   Disconnected Health Check HTTP 503 response:', JSON.stringify(degradedHealth.body, null, 2));
  assert.strictEqual(degradedHealth.body.success, false);
  assert.strictEqual(degradedHealth.body.database, 'disconnected');
  console.log('   ✔ Disconnected health check correctly returned HTTP 503 with database: disconnected');

  // Reconnect
  console.log('   Reconnecting to MongoDB...');
  await connectDB();
  assert.strictEqual(isDBConnected(), true);
  console.log('   Reconnected successfully.');

  // Verify user still exists in MongoDB after reconnect
  const persistentUser = await User.findOne({ email: testEmail });
  assert.ok(persistentUser, 'User must still exist after database reconnection');
  assert.strictEqual(persistentUser.email, testEmail);
  const persistentWallet = await Wallet.findOne({ userId: persistentUser._id });
  assert.ok(persistentWallet, 'Wallet must still exist after database reconnection');
  console.log(`   ✔ Confirmed user ${persistentUser.email} and wallet still exist after backend restart!`);

  // STEP 9: Test Login
  console.log('\n[9] Testing User Login...');
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: testEmail,
      password: testPassword,
    })
    .expect(200);

  console.log('   Login response:', JSON.stringify(loginRes.body, null, 2));
  assert.strictEqual(loginRes.body.success, true);
  assert.ok(loginRes.body.token, 'Must return JWT token on login');
  assert.strictEqual(loginRes.body.user.email, testEmail);
  assert.strictEqual(loginRes.body.wallet.balance, 5000);
  console.log('   ✔ Login succeeded with HTTP 200 and issued valid JWT');

  // Test Login with invalid password
  console.log('\n[Login Security] Testing Invalid Password Rejection...');
  const badLoginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: testEmail,
      password: 'WrongPassword123!',
    })
    .expect(401);
  assert.strictEqual(badLoginRes.body.code, 'INVALID_CREDENTIALS');
  console.log('   ✔ Invalid password rejected with HTTP 401');

  // Test Authenticated /api/auth/me
  console.log('\n[Session Verification] Testing GET /api/auth/me with Bearer token...');
  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${loginRes.body.token}`)
    .expect(200);
  assert.strictEqual(meRes.body.user.email, testEmail);
  assert.strictEqual(meRes.body.wallet.balance, 5000);
  console.log('   ✔ GET /api/auth/me successfully verified authenticated session');

  console.log('\n========================================================');
  console.log('  ALL 10 VERIFICATION CHECKS PASSED WITH 100% SUCCESS!  ');
  console.log('========================================================\n');
  
  process.exit(0);
}

runLiveVerification().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});

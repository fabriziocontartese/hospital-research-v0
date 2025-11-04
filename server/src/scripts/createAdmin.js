/**
 * Upsert superadmin with an ARGON2 password hash (matches login verifier)
 * Run: cd server && node src/scripts/createAdmin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const argon2 = require('argon2');
const User = require('../models/User');

(async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI missing');

    await mongoose.connect(uri, { autoIndex: false });

    const email = 'admin@hospitalresearch.com';
    const displayName = 'God Mode';
    const rawPassword = 'SuperSecurePa55word!';
    const passwordHash = await argon2.hash(rawPassword); // <-- ARGON2

    // upsert: create if missing; overwrite passwordHash/displayName/role/status if exists
    const doc = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        email: email.toLowerCase(),
        displayName,
        passwordHash,
        role: 'superadmin',
        isActive: true,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    console.log('✅ Admin ready:', { email: doc.email, role: 'superadmin' });
    console.log('Use these creds →', { email, password: rawPassword });
    process.exit(0);
  } catch (err) {
    console.error('❌ ERROR:', err);
    process.exit(1);
  } finally {
    try { await mongoose.disconnect(); } catch {}
  }
})();

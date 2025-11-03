const request = require('supertest');
const argon2 = require('argon2');
const app = require('../src/app');
const Organization = require('../src/models/Organization');
const User = require('../src/models/User');

describe('Auth routes', () => {
  let org;

  beforeEach(async () => {
    org = await Organization.create({
      name: 'Test Org',
      country: 'US',
      contactEmail: 'org@example.com',
      status: 'approved',
    });

    await User.create({
      email: 'admin@example.com',
      passwordHash: await argon2.hash('Password123!'),
      role: 'admin',
      orgId: org._id,
      displayName: 'Admin User',
      isActive: true,
    });
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'Password123!',
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('rejects protected route without token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

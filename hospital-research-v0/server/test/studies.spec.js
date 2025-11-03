const request = require('supertest');
const argon2 = require('argon2');
const app = require('../src/app');
const Organization = require('../src/models/Organization');
const User = require('../src/models/User');

describe('Studies routes', () => {
  let org;
  let researcherToken;
  let staffToken;

  beforeEach(async () => {
    org = await Organization.create({
      name: 'Research Org',
      country: 'US',
      contactEmail: 'contact@research.org',
      status: 'approved',
    });

    await User.create({
      email: 'researcher@example.com',
      passwordHash: await argon2.hash('Password123!'),
      role: 'researcher',
      orgId: org._id,
      displayName: 'Researcher One',
      isActive: true,
    });

    await User.create({
      email: 'staff@example.com',
      passwordHash: await argon2.hash('Password123!'),
      role: 'staff',
      orgId: org._id,
      displayName: 'Staff One',
      isActive: true,
    });

    const researcherLogin = await request(app).post('/api/auth/login').send({
      email: 'researcher@example.com',
      password: 'Password123!',
    });
    researcherToken = researcherLogin.body.accessToken;

    const staffLogin = await request(app).post('/api/auth/login').send({
      email: 'staff@example.com',
      password: 'Password123!',
    });
    staffToken = staffLogin.body.accessToken;
  });

  it('allows researcher to create a study', async () => {
    const res = await request(app)
      .post('/api/studies')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        code: 'STUDY1',
        title: 'Sample Study',
        allowedVariables: ['bp', 'hr'],
      });

    expect(res.status).toBe(201);
    expect(res.body.study).toBeDefined();
    expect(res.body.study.code).toBe('STUDY1');
  });

  it('allows researcher to pause a study', async () => {
    const createRes = await request(app)
      .post('/api/studies')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        code: 'STUDY-PAUSE',
        title: 'Study to pause',
        allowedVariables: [],
      });

    expect(createRes.status).toBe(201);
    const studyId = createRes.body.study._id;

    const updateRes = await request(app)
      .patch(`/api/studies/${studyId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ status: 'paused' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.study.status).toBe('paused');
  });

  it('rejects staff creating a study', async () => {
    const res = await request(app)
      .post('/api/studies')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        code: 'STUDY2',
        title: 'Another Study',
        allowedVariables: ['bp'],
      });

    expect(res.status).toBe(403);
  });
});

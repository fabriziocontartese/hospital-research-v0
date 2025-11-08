/* eslint-disable no-console */
const argon2 = require('argon2');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../config/db');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Study = require('../models/Study');
const Form = require('../models/Form');
const Task = require('../models/Task');

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'ChangeMe123!';
const FORCE_PASSWORD_RESET =
  (process.env.SEED_FORCE_PASSWORD_RESET || process.env.SEED_RESET_PASSWORD || '').toLowerCase() === 'true';

const ensureUser = async ({ email, role, displayName, category, orgId }) => {
  const existing = await User.findOne({ email });
  if (existing) {
    let shouldSave = false;
    if (category && existing.category !== category) {
      existing.category = category;
      shouldSave = true;
    }
    if (FORCE_PASSWORD_RESET) {
      existing.passwordHash = await argon2.hash(DEFAULT_PASSWORD);
      existing.isActive = true;
      shouldSave = true;
      console.log(`Reset password for ${email} (${role}) to default ${DEFAULT_PASSWORD}`);
    }
    if (shouldSave) await existing.save();
    return existing;
  }
  const passwordHash = await argon2.hash(DEFAULT_PASSWORD);
  const user = await User.create({
    email,
    passwordHash,
    role,
    displayName,
    category,
    orgId,
    isActive: true,
  });
  console.log(`Seeded user ${email} (${role}) with password ${DEFAULT_PASSWORD}`);
  return user;
};

const seed = async () => {
  await connectDb();

  // platform superadmin
  await ensureUser({
    email: process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@example.com',
    role: 'superadmin',
    displayName: 'Platform Owner',
  });

  // baseline org
  const org = await Organization.findOneAndUpdate(
    { name: 'Pioneer Health Research' },
    {
      name: 'Pioneer Health Research',
      country: 'US',
      contactEmail: 'admin@pioneer.example',
      status: 'approved',
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const admin = await ensureUser({
    email: 'admin@pioneer.example',
    role: 'admin',
    displayName: 'Org Admin',
    category: 'Administration',
    orgId: org._id,
  });

  const researcher = await ensureUser({
    email: 'researcher@pioneer.example',
    role: 'researcher',
    displayName: 'Lead Researcher',
    category: 'Epidemiology',
    orgId: org._id,
  });

  const staff = await ensureUser({
    email: 'staff@pioneer.example',
    role: 'staff',
    displayName: 'Clinical Staff',
    category: 'Primary Care',
    orgId: org._id,
  });

  const patientIds = ['P0001', 'P0002', 'P0003', 'P0004', 'P0005'];
  for (const pid of patientIds) {
    // eslint-disable-next-line no-await-in-loop
    await Patient.findOneAndUpdate(
      { pid },
      {
        pid,
        orgId: org._id,
        category: 'General cohort',
        cohortTags: [],
        strata: [],
        assignedStaff: [staff._id],
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const study = await Study.findOneAndUpdate(
    { code: 'COHORT2025', orgId: org._id },
    {
      code: 'COHORT2025',
      title: 'Cohort Outcomes Study 2025',
      description: 'Prospective cohort tracking post-discharge recovery metrics across key sites.',
      orgId: org._id,
      status: 'active',
      allowedVariables: [],
      assignedStaff: [researcher._id, staff._id],
      assignedPatients: patientIds,
      createdBy: researcher._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const baseForm = await Form.findOneAndUpdate(
    { orgId: org._id, kind: 'base' },
    {
      orgId: org._id,
      kind: 'base',
      version: '1.0',
      schema: {
        id: 'base-form',
        title: 'Baseline Intake',
        items: [
          { linkId: 'consent-1', text: 'Consent obtained?', type: 'dropdown', options: ['Yes', 'No'], required: true },
          { linkId: 'notes-2', text: 'Initial notes', type: 'text' },
        ],
      },
      createdBy: admin._id,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (!study.baseFormId) {
    study.baseFormId = baseForm._id;
    await study.save();
  }

  const studyForm = await Form.findOneAndUpdate(
    { orgId: org._id, studyId: study._id, version: '1.0' },
    {
      orgId: org._id,
      studyId: study._id,
      kind: 'study',
      version: '1.0',
      schema: {
        id: 'study-form',
        title: 'Vitals Follow-up',
        items: [
          { linkId: 'bp-1', text: 'Blood pressure (systolic/diastolic)', type: 'text', required: true },
          { linkId: 'symptoms-2', text: 'Symptoms since last visit', type: 'checkboxes', options: ['Fatigue', 'Shortness of breath', 'Dizziness', 'Other'] },
          { linkId: 'recovery-scale-3', text: 'Recovery progress', type: 'scale', scale: { min: 1, max: 5, step: 1 }, required: true },
        ],
      },
      createdBy: researcher._id,
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Task.deleteMany({ studyId: study._id, formId: studyForm._id });
  const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 7);

  await Task.insertMany(
    patientIds.map((pid) => ({
      studyId: study._id,
      formId: studyForm._id,
      orgId: org._id,
      pid,
      assignee: staff._id,
      dueAt: dueDate,
      status: 'open',
      createdAt: new Date(),
    }))
  );

  console.log('Seed complete.');
  await disconnectDb();
  await mongoose.disconnect();
};

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});

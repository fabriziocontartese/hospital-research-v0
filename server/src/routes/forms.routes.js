const express = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validateBody } = require('../utils/validate');
const Form = require('../models/Form');
const Study = require('../models/Study');
const Patient = require('../models/Patient');
const User = require('../models/User');
const Task = require('../models/Task');
const { notifyUsers } = require('../services/notify');

const router = express.Router();

const ensureStudyWrite = (user, study) => {
  if (user.role === 'admin') return;
  const canEdit =
    study.createdBy?.toString() === user._id.toString() ||
    study.assignedStaff.some((memberId) => memberId.toString() === user._id.toString());
  if (!canEdit) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
};

const ensureFormReadAccess = async (user, form) => {
  if (!form) {
    const error = new Error('Form not found');
    error.status = 404;
    throw error;
  }

  if (form.orgId.toString() !== user.orgId.toString()) {
    const error = new Error('Forbidden');
    error.status = 403;
    throw error;
  }

  if (user.role === 'admin' || user.role === 'researcher') {
    if (!form.studyId) {
      return form;
    }
    const study = await Study.findById(form.studyId);
    if (!study) {
      const error = new Error('Study not found');
      error.status = 404;
      throw error;
    }
    ensureStudyWrite(user, study);
    return form;
  }

  if (user.role === 'staff') {
    const task = await Task.findOne({
      formId: form._id,
      assignee: user._id,
      orgId: user.orgId,
    });
    if (!task) {
      const error = new Error('Forbidden');
      error.status = 403;
      throw error;
    }
  }
  return form;
};

router.get(
  '/:id',
  auth,
  async (req, res, next) => {
    try {
      const form = await Form.findById(req.params.id);
      await ensureFormReadAccess(req.user, form);
      res.json({ form });
    } catch (error) {
      next(error);
    }
  }
);

const assignSchema = z.object({
  pid: z.array(z.string()).nonempty(),
  assignee: z.string().optional(),
  dueAt: z.string().datetime().optional(),
});

router.post(
  '/:id/assign',
  auth,
  requireRole('admin', 'researcher'),
  validateBody(assignSchema),
  async (req, res, next) => {
    try {
      const form = await Form.findOne({ _id: req.params.id, orgId: req.user.orgId });
      if (!form) {
        const error = new Error('Form not found');
        error.status = 404;
        throw error;
      }

      if (!form.studyId) {
        const error = new Error('Only study forms can be assigned');
        error.status = 400;
        throw error;
      }

      let study = null;
      if (form.studyId) {
        study = await Study.findById(form.studyId);
        if (!study) {
          const error = new Error('Study not found');
          error.status = 404;
          throw error;
        }
        ensureStudyWrite(req.user, study);
      }

      let assigneeUser = null;
      if (req.validatedBody.assignee) {
        assigneeUser = await User.findOne({
          _id: req.validatedBody.assignee,
          orgId: req.user.orgId,
          role: 'staff',
        });
        if (!assigneeUser) {
          const error = new Error('Assignee not found');
          error.status = 404;
          throw error;
        }
      }

      const dueAtDate = req.validatedBody.dueAt ? new Date(req.validatedBody.dueAt) : null;
      if (dueAtDate && Number.isNaN(dueAtDate.getTime())) {
        const error = new Error('Invalid due date');
        error.status = 400;
        throw error;
      }

      const createdTasks = [];

      // eslint-disable-next-line no-restricted-syntax
      for (const pid of req.validatedBody.pid) {
        // eslint-disable-next-line no-await-in-loop
        const patient = await Patient.findOne({ pid, orgId: req.user.orgId });
        if (!patient) {
          const error = new Error(`Patient ${pid} not found`);
          error.status = 404;
          throw error;
        }

        const assignees =
          assigneeUser?.role === 'staff'
            ? [assigneeUser]
            : patient.assignedStaff?.length
              ? await User.find({ _id: { $in: patient.assignedStaff }, role: 'staff' })
              : [];

        if (!assignees.length) {
          const error = new Error(`No staff assignment for patient ${pid}`);
          error.status = 400;
          throw error;
        }

        // eslint-disable-next-line no-restricted-syntax
        for (const staffMember of assignees) {
          // eslint-disable-next-line no-await-in-loop
          const existing = await Task.findOne({
            formId: form._id,
            pid,
            assignee: staffMember._id,
            status: 'open',
          });
          if (existing) {
            // eslint-disable-next-line no-continue
            continue;
          }

          // eslint-disable-next-line no-await-in-loop
          const task = await Task.create({
            formId: form._id,
            studyId: form.studyId,
            orgId: req.user.orgId,
            pid,
            assignee: staffMember._id,
            dueAt: dueAtDate,
            status: 'open',
          });
          createdTasks.push(task);
        }
      }

      res.status(201).json({ tasks: createdTasks });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/:id/send',
  auth,
  requireRole('admin', 'researcher'),
  async (req, res, next) => {
    try {
      const form = await Form.findOne({ _id: req.params.id, orgId: req.user.orgId });
      if (!form) {
        const error = new Error('Form not found');
        error.status = 404;
        throw error;
      }
      if (form.studyId) {
        const study = await Study.findById(form.studyId);
        if (!study) {
          const error = new Error('Study not found');
          error.status = 404;
          throw error;
        }
        ensureStudyWrite(req.user, study);
      }

      const openTasks = await Task.find({ formId: form._id, status: 'open' });
      const assignees = [...new Set(openTasks.map((task) => task.assignee.toString()))];
      if (!assignees.length) {
        return res.json({ notified: [] });
      }

      notifyUsers(assignees, `Form ${form.schema.title} assigned`);
      return res.json({ notified: assignees });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;

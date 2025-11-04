const express = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validateBody, validateQuery } = require('../utils/validate');
const Task = require('../models/Task');
const Study = require('../models/Study');
const Form = require('../models/Form');
const FormResponse = require('../models/FormResponse');
const { ensureAnswersSafe, ensureAnswersMatchSchema } = require('../utils/privacy');

const router = express.Router();

const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value._id) {
    return value._id.toString();
  }
  if (typeof value.toString === 'function') {
    return value.toString();
  }
  return null;
};

const ensureTaskWritable = async (user, task) => {
  if (!task) {
    const error = new Error('Task not found');
    error.status = 404;
    throw error;
  }

  if (user.role === 'admin') {
    return;
  }

  if (user.role === 'staff') {
    if (toIdString(task.assignee) !== user._id.toString()) {
      const error = new Error('Forbidden');
      error.status = 403;
      throw error;
    }
    return;
  }

  if (user.role === 'researcher') {
    const studyId = toIdString(task.studyId);
    if (!studyId) {
      const error = new Error('Forbidden');
      error.status = 403;
      throw error;
    }
    const study = await Study.findOne({ _id: studyId, orgId: user.orgId });
    if (
      !study ||
      (toIdString(study.createdBy) !== user._id.toString() &&
        !study.assignedStaff.some((memberId) => toIdString(memberId) === user._id.toString()))
    ) {
      const error = new Error('Forbidden');
      error.status = 403;
      throw error;
    }
  }
};

const ensureTaskReadable = async (user, task) => {
  if (!task) {
    const error = new Error('Task not found');
    error.status = 404;
    throw error;
  }

  if (user.role === 'admin') {
    return;
  }

  if (user.role === 'staff') {
    if (toIdString(task.assignee) !== user._id.toString()) {
      const error = new Error('Forbidden');
      error.status = 403;
      throw error;
    }
    return;
  }

  if (user.role === 'researcher') {
    if (toIdString(task.assignee) === user._id.toString()) {
      return;
    }
    const studyId = toIdString(task.studyId);
    if (!studyId) {
      const error = new Error('Forbidden');
      error.status = 403;
      throw error;
    }
    const study = await Study.findOne({ _id: studyId, orgId: user.orgId });
    if (
      !study ||
      (toIdString(study.createdBy) !== user._id.toString() &&
        !study.assignedStaff.some((memberId) => toIdString(memberId) === user._id.toString()))
    ) {
      const error = new Error('Forbidden');
      error.status = 403;
      throw error;
    }
  }
};

const querySchema = z.object({
  status: z.enum(['open', 'submitted', 'expired']).optional(),
  studyId: z.string().optional(),
  dueAtFrom: z.string().datetime().optional(),
  dueAtTo: z.string().datetime().optional(),
});

router.get(
  '/:taskId',
  auth,
  requireRole('admin', 'researcher', 'staff'),
  async (req, res, next) => {
    try {
      const task = await Task.findOne({
        _id: req.params.taskId,
        orgId: req.user.orgId,
      })
        .populate('assignee', 'displayName email role category')
        .populate('formId')
        .populate('studyId');

      await ensureTaskReadable(req.user, task);

      const formId = task.formId?._id || task.formId;
      const response = await FormResponse.findOne({
        formId,
        pid: task.pid,
        orgId: req.user.orgId,
      }).populate('authoredBy', 'displayName email role');

      const assigneeId = toIdString(task.assignee);
      const canSubmit =
        req.user.role === 'admin' ||
        req.user.role === 'researcher' ||
        assigneeId === req.user._id.toString();

      res.json({
        task,
        response,
        permissions: {
          canSubmit,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/',
  auth,
  requireRole('admin', 'researcher', 'staff'),
  validateQuery(querySchema),
  async (req, res, next) => {
    try {
      const filter = {
        orgId: req.user.orgId,
      };

      if (req.validatedQuery.status) {
        filter.status = req.validatedQuery.status;
      }

      if (req.validatedQuery.studyId) {
        filter.studyId = req.validatedQuery.studyId;
      }

      if (req.validatedQuery.dueAtFrom || req.validatedQuery.dueAtTo) {
        filter.dueAt = {};
        if (req.validatedQuery.dueAtFrom) {
          filter.dueAt.$gte = new Date(req.validatedQuery.dueAtFrom);
        }
        if (req.validatedQuery.dueAtTo) {
          filter.dueAt.$lte = new Date(req.validatedQuery.dueAtTo);
        }
      }

      if (req.user.role === 'staff') {
        filter.assignee = req.user._id;
      } else if (req.user.role === 'researcher') {
        const studies = await Study.find({
          orgId: req.user.orgId,
          $or: [{ createdBy: req.user._id }, { assignedStaff: req.user._id }],
        }).select('_id');
        const studyIds = studies.map((study) => study._id);
        if (req.validatedQuery.studyId) {
          if (!studyIds.map(String).includes(req.validatedQuery.studyId)) {
            return res.json({ tasks: [] });
          }
          filter.studyId = req.validatedQuery.studyId;
        } else {
          filter.studyId = { $in: studyIds };
        }
      }

      const tasks = await Task.find(filter)
        .populate('assignee', 'displayName email role category')
        .populate('formId')
        .populate('studyId');

      res.json({ tasks });
    } catch (error) {
      next(error);
    }
  }
);

const submitSchema = z.object({
  answers: z.record(z.any()),
});

router.post(
  '/:taskId/submit',
  auth,
  requireRole('admin', 'researcher', 'staff'),
  validateBody(submitSchema),
  async (req, res, next) => {
    try {
      const task = await Task.findOne({
        _id: req.params.taskId,
        orgId: req.user.orgId,
      });

      await ensureTaskReadable(req.user, task);

      const assigneeId = toIdString(task.assignee);
      const userId = req.user._id.toString();

      if (req.user.role === 'staff' && assigneeId !== userId) {
        const error = new Error('Forbidden');
        error.status = 403;
        throw error;
      }

      if (req.user.role === 'researcher' && assigneeId !== userId) {
        const studyId = toIdString(task.studyId);
        if (studyId) {
          const study = await Study.findOne({ _id: studyId, orgId: req.user.orgId });
          const researcherHasAccess =
            study &&
            (toIdString(study.createdBy) === userId ||
              study.assignedStaff.some((memberId) => toIdString(memberId) === userId));
          if (!researcherHasAccess) {
            const error = new Error('Forbidden');
            error.status = 403;
            throw error;
          }
        }
      }

      const form = await Form.findOne({ _id: task.formId, orgId: req.user.orgId });
      if (!form) {
        const error = new Error('Form not found');
        error.status = 404;
        throw error;
      }

      ensureAnswersSafe(req.validatedBody.answers);
      ensureAnswersMatchSchema(req.validatedBody.answers, form.schema);

      const response = await FormResponse.findOneAndUpdate(
        { formId: form._id, pid: task.pid, orgId: req.user.orgId },
        {
          studyId: task.studyId,
          orgId: req.user.orgId,
          pid: task.pid,
          answers: req.validatedBody.answers,
          authoredBy: req.user._id,
          authoredAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      task.status = 'submitted';
      await task.save();

      await task.populate([
        { path: 'assignee', select: 'displayName email role category' },
        { path: 'formId' },
        { path: 'studyId' },
      ]);

      res.json({ task, response });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:taskId/response',
  auth,
  requireRole('admin', 'researcher', 'staff'),
  async (req, res, next) => {
    try {
      const task = await Task.findOne({
        _id: req.params.taskId,
        orgId: req.user.orgId,
      }).populate('studyId');

      await ensureTaskWritable(req.user, task);

      const response = await FormResponse.findOne({
        formId: task.formId,
        pid: task.pid,
        orgId: req.user.orgId,
      });

      if (response) {
        await response.deleteOne();
      }

      task.status = 'open';
      await task.save();

      res.json({ task });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;

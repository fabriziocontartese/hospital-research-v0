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

const keyOf = (task) => ({
  orgId: toIdString(task.orgId),
  studyId: toIdString(task.studyId),
  formId: toIdString(task.formId),
  pid: task.pid,
});

const statusAggregate = (tasks) => {
  if (tasks.some((t) => t.status === 'submitted')) return 'submitted';
  if (tasks.some((t) => t.status === 'expired')) return 'expired';
  return 'open';
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
    // Staff can write if they are an assignee for ANY sibling in the logical group
    const count = await Task.countDocuments({
      orgId: task.orgId,
      studyId: task.studyId,
      formId: task.formId,
      pid: task.pid,
      assignee: user._id,
    });
    if (!count) {
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
    // Staff can read if they are an assignee for ANY sibling in the logical group
    const count = await Task.countDocuments({
      orgId: task.orgId,
      studyId: task.studyId,
      formId: task.formId,
      pid: task.pid,
      assignee: user._id,
    });
    if (!count) {
      const error = new Error('Forbidden');
      error.status = 403;
      throw error;
    }
    return;
  }

  if (user.role === 'researcher') {
    // If researcher is direct assignee, allow
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

      // Load all siblings that share the same logical key (orgId, studyId, formId, pid)
      const key = keyOf(task);
      const siblings = await Task.find({
        orgId: task.orgId,
        studyId: key.studyId,
        formId: key.formId,
        pid: key.pid,
      }).populate('assignee', 'displayName email role category');

      // Aggregate assignees
      const assigneesMap = new Map();
      siblings.forEach((t) => {
        const a = t.assignee;
        if (a) {
          assigneesMap.set(toIdString(a._id || a), a);
        }
      });

      // Aggregate status (submitted wins, then expired, then open)
      const aggregatedStatus = statusAggregate(siblings);

      // Use earliest due date across siblings
      const dueAt =
        siblings
          .map((t) => t.dueAt)
          .filter(Boolean)
          .sort((a, b) => a - b)[0] || task.dueAt || null;

      const formId = task.formId?._id || task.formId;
      const response = await FormResponse.findOne({
        formId,
        pid: task.pid,
        orgId: req.user.orgId,
      }).populate('authoredBy', 'displayName email role');

      let canSubmit = false;
      if (req.user.role === 'admin') {
        canSubmit = true;
      } else if (req.user.role === 'researcher') {
        canSubmit = true;
      } else if (req.user.role === 'staff') {
        const hasOwn = siblings.some(
          (t) => toIdString(t.assignee) === req.user._id.toString()
        );
        canSubmit = hasOwn;
      }

      // Attach aggregated fields onto the main task document for the response
      task.status = aggregatedStatus;
      task.dueAt = dueAt;
      task.assignees = Array.from(assigneesMap.values());

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

      const rawTasks = await Task.find(filter)
        .populate('assignee', 'displayName email role category')
        .populate('formId')
        .populate('studyId');

      // Group by logical task (orgId, studyId, formId, pid)
      const groups = new Map(); // key -> { tasks: Task[], seed: Task }
      for (const t of rawTasks) {
        const k = JSON.stringify(keyOf(t));
        if (!groups.has(k)) {
          groups.set(k, { tasks: [], seed: t });
        }
        groups.get(k).tasks.push(t);
      }

      const groupedTasks = [];
      for (const { tasks, seed } of groups.values()) {
        const assigneesMap = new Map();
        tasks.forEach((t) => {
          const a = t.assignee;
          if (a) {
            assigneesMap.set(toIdString(a._id || a), a);
          }
        });

        const aggregatedStatus = statusAggregate(tasks);
        const dueAt =
          tasks
            .map((t) => t.dueAt)
            .filter(Boolean)
            .sort((a, b) => a - b)[0] || seed.dueAt || null;

        const seedObj = seed.toObject({ virtuals: true });

        groupedTasks.push({
          ...seedObj,
          status: aggregatedStatus,
          dueAt,
          assignees: Array.from(assigneesMap.values()),
        });
      }

      res.json({ tasks: groupedTasks });
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

      const userId = req.user._id.toString();

      if (req.user.role === 'staff') {
        // Staff can submit if they are an assignee for ANY sibling
        const count = await Task.countDocuments({
          orgId: task.orgId,
          studyId: task.studyId,
          formId: task.formId,
          pid: task.pid,
          assignee: req.user._id,
        });
        if (!count) {
          const error = new Error('Forbidden');
          error.status = 403;
          throw error;
        }
      }

      if (req.user.role === 'researcher') {
        const assigneeId = toIdString(task.assignee);
        if (assigneeId !== userId) {
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

      // Mark ALL siblings as submitted for this logical task
      const k = keyOf(task);
      await Task.updateMany(
        {
          orgId: task.orgId,
          studyId: k.studyId,
          formId: k.formId,
          pid: k.pid,
        },
        { $set: { status: 'submitted' } }
      );

      // Reload siblings to build aggregated task for the response
      const siblings = await Task.find({
        orgId: task.orgId,
        studyId: k.studyId,
        formId: k.formId,
        pid: k.pid,
      })
        .populate('assignee', 'displayName email role category')
        .populate('formId')
        .populate('studyId');

      const assigneesMap = new Map();
      siblings.forEach((t) => {
        const a = t.assignee;
        if (a) {
          assigneesMap.set(toIdString(a._id || a), a);
        }
      });

      const aggregatedStatus = statusAggregate(siblings);
      const dueAt =
        siblings
          .map((t) => t.dueAt)
          .filter(Boolean)
          .sort((a, b) => a - b)[0] || null;

      const seed = siblings[0];
      const seedObj = seed.toObject({ virtuals: true });

      const aggregatedTask = {
        ...seedObj,
        status: aggregatedStatus,
        dueAt,
        assignees: Array.from(assigneesMap.values()),
      };

      res.json({ task: aggregatedTask, response });
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

      // Reset ALL siblings to open
      const k = keyOf(task);
      await Task.updateMany(
        {
          orgId: task.orgId,
          studyId: k.studyId,
          formId: k.formId,
          pid: k.pid,
        },
        { $set: { status: 'open' } }
      );

      // Reload siblings to build aggregated task for the response
      const siblings = await Task.find({
        orgId: task.orgId,
        studyId: k.studyId,
        formId: k.formId,
        pid: k.pid,
      }).populate('assignee', 'displayName email role category');

      const assigneesMap = new Map();
      siblings.forEach((t) => {
        const a = t.assignee;
        if (a) {
          assigneesMap.set(toIdString(a._id || a), a);
        }
      });

      const aggregatedStatus = statusAggregate(siblings);
      const dueAt =
        siblings
          .map((t) => t.dueAt)
          .filter(Boolean)
          .sort((a, b) => a - b)[0] || null;

      const seed = siblings[0];
      const seedObj = seed.toObject({ virtuals: true });

      const aggregatedTask = {
        ...seedObj,
        status: aggregatedStatus,
        dueAt,
        assignees: Array.from(assigneesMap.values()),
      };

      res.json({ task: aggregatedTask });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;

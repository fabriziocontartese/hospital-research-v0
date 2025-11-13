const express = require('express');
const { z } = require('zod');
const Study = require('../models/Study');
const Form = require('../models/Form');
const FormResponse = require('../models/FormResponse');
const Patient = require('../models/Patient');
const Task = require('../models/Task');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { requireRole, scopeStudyAccess } = require('../middleware/rbac');
const { validateBody } = require('../utils/validate');

const router = express.Router();

const sanitizeAllowedVariables = (items = []) =>
  [...new Set(items.map((item) => item.trim()).filter(Boolean))];

/* ------------------------ TASK BACKFILL HELPERS ------------------------ */
async function backfillTasksForStudyForm({ study, form, orgId }) {
  if (!study?.assignedPatients?.length) return;

  // assignees = study.assignedStaff ∪ { createdBy }
  const assigneesSet = new Set(
    (study.assignedStaff || []).map(String).concat(String(study.createdBy))
  );
  const assignees = Array.from(assigneesSet);

  const ops = [];
  for (const pid of study.assignedPatients) {
    for (const assignee of assignees) {
      ops.push({
        updateOne: {
          filter: { orgId, studyId: study._id, formId: form._id, pid, assignee },
          update: {
            $setOnInsert: {
              orgId,
              studyId: study._id,
              formId: form._id,
              pid,
              assignee,
              status: 'open',
              createdAt: new Date(),
            },
          },
          upsert: true,
        },
      });
    }
  }
  if (ops.length) {
    try {
      await Task.bulkWrite(ops, { ordered: false });
    } catch (e) {
      if (e && e.code !== 11000) throw e; // ignore dup key races
    }
  }
}

async function backfillTasksForStudy({ study, orgId }) {
  const forms = await Form.find({ studyId: study._id, orgId });
  for (const form of forms) {
    await backfillTasksForStudyForm({ study, form, orgId });
  }
}
/* ---------------------------------------------------------------------- */

router.get(
  '/',
  auth,
  requireRole('admin', 'researcher', 'staff'),
  async (req, res, next) => {
    try {
      const query = scopeStudyAccess(req.user, {});
      const projection =
        req.user.role === 'admin'
          ? undefined
          : 'code title status description assignedStaff assignedPatients';
      const studies = await Study.find(query, projection).populate(
        'assignedStaff',
        'displayName email role category'
      );
      res.json({ studies });
    } catch (error) {
      next(error);
    }
  }
);

const createSchema = z.object({
  code: z.string().min(2),
  title: z.string().min(3),
  description: z.string().max(500).optional(),
  allowedVariables: z.array(z.string()).default([]),
  assignedStaff: z.array(z.string()).optional(),
  notifications: z
    .array(
      z.object({
        when: z.string(),
        toRole: z.enum(['admin', 'researcher', 'staff']),
      })
    )
    .optional(),
});

router.post(
  '/',
  auth,
  requireRole('admin', 'researcher'),
  validateBody(createSchema),
  async (req, res, next) => {
    try {
      const existing = await Study.findOne({
        code: req.validatedBody.code,
        orgId: req.user.orgId,
      });
      if (existing) {
        const error = new Error('Study code already exists');
        error.status = 409;
        throw error;
      }

      const assignedStaffIds = [];
      if (req.validatedBody.assignedStaff?.length) {
        const staff = await User.find({
          _id: { $in: req.validatedBody.assignedStaff },
          orgId: req.user.orgId,
        });
        assignedStaffIds.push(...staff.map((member) => member._id));
      }

      const study = await Study.create({
        code: req.validatedBody.code,
        title: req.validatedBody.title,
        description: req.validatedBody.description,
        allowedVariables: sanitizeAllowedVariables(req.validatedBody.allowedVariables),
        assignedStaff: assignedStaffIds,
        notifications: req.validatedBody.notifications || [],
        orgId: req.user.orgId,
        createdBy: req.user._id,
      });

      if (!assignedStaffIds.some((id) => id.toString() === req.user._id.toString())) {
        study.assignedStaff.push(req.user._id);
        await study.save();
      }

      const populated = await study.populate('assignedStaff', 'displayName email role category');
      res.status(201).json({ study: populated });
    } catch (error) {
      next(error);
    }
  }
);

const ensureWritable = (user, study) => {
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

const updateSchema = z.object({
  title: z.string().min(3).optional(),
  status: z.enum(['draft', 'active', 'paused', 'closed']).optional(),
  description: z.string().max(500).optional(),
  assignedStaff: z.array(z.string()).optional(),
  assignedPatients: z.array(z.string()).optional(),
  notifications: z
    .array(
      z.object({
        when: z.string(),
        toRole: z.enum(['admin', 'researcher', 'staff']),
      })
    )
    .optional(),
});

router.patch(
  '/:id',
  auth,
  requireRole('admin', 'researcher'),
  validateBody(updateSchema),
  async (req, res, next) => {
    try {
      const study = await Study.findOne({
        _id: req.params.id,
        orgId: req.user.orgId,
      });
      if (!study) {
        const error = new Error('Study not found');
        error.status = 404;
        throw error;
      }

      ensureWritable(req.user, study);

      if (req.validatedBody.title) study.title = req.validatedBody.title;
      if (req.validatedBody.status) study.status = req.validatedBody.status;
      if (Object.prototype.hasOwnProperty.call(req.validatedBody, 'description')) {
        study.description = req.validatedBody.description;
      }
      if (req.validatedBody.notifications) study.notifications = req.validatedBody.notifications;

      if (req.validatedBody.assignedStaff) {
        const staff = await User.find({
          _id: { $in: req.validatedBody.assignedStaff },
          orgId: req.user.orgId,
        });
        study.assignedStaff = staff.map((member) => member._id);
      }

      if (req.validatedBody.assignedPatients) {
        const patients = await Patient.find({
          pid: { $in: req.validatedBody.assignedPatients },
          orgId: req.user.orgId,
        });
        study.assignedPatients = patients.map((patient) => patient.pid);
      }

      await study.save();

      // Backfill tasks when assignments change or new patients are added
      if (
        Object.prototype.hasOwnProperty.call(req.validatedBody, 'assignedPatients') ||
        Object.prototype.hasOwnProperty.call(req.validatedBody, 'assignedStaff')
      ) {
        await backfillTasksForStudy({ study, orgId: req.user.orgId });
      }

      const populated = await study.populate('assignedStaff', 'displayName email role category');
      res.json({ study: populated });
    } catch (error) {
      next(error);
    }
  }
);

const questionnaireItemSchema = z
  .object({
    linkId: z.string().min(1),
    text: z.string().min(1),
    type: z.enum(['text', 'dropdown', 'checkboxes', 'scale']),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    scale: z
      .object({
        min: z.number().int(),
        max: z.number().int(),
        step: z.number().int().min(1).optional(),
      })
      .optional(),
  })
  .superRefine((item, ctx) => {
    if (item.type === 'dropdown' || item.type === 'checkboxes') {
      if (!item.options || !item.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'Options are required for selectable questions',
        });
      }
    }
    if (item.type === 'scale') {
      if (!item.scale) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scale'],
          message: 'Scale definition required',
        });
      } else if (item.scale.min >= item.scale.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scale'],
          message: 'Scale max must be greater than min',
        });
      }
    }
  });

const formSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  items: z.array(questionnaireItemSchema).min(1),
});

const formCreateSchema = z.object({
  kind: z.enum(['base', 'study']),
  version: z.string().min(1),
  schema: formSchema,
});

const formUpdateSchema = z.object({
  version: z.string().min(1),
  schema: formSchema,
});

router.post(
  '/:id/forms',
  auth,
  requireRole('admin', 'researcher'),
  validateBody(formCreateSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { kind, version, schema } = req.validatedBody;
      let study = null;

      if (id !== 'base') {
        study = await Study.findOne({ _id: id, orgId: req.user.orgId });
        if (!study) {
          const error = new Error('Study not found');
          error.status = 404;
          throw error;
        }
        ensureWritable(req.user, study);
      }

      const form = await Form.create({
        orgId: req.user.orgId,
        studyId: study ? study._id : undefined,
        kind,
        version,
        schema,
        createdBy: req.user._id,
      });

      // Auto-assign: create tasks for all enrolled patients and all study assignees
      if (study && kind === 'study') {
        await backfillTasksForStudyForm({ study, form, orgId: req.user.orgId });
      }

      res.status(201).json({ form });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id/forms/:formId',
  auth,
  requireRole('admin', 'researcher'),
  validateBody(formUpdateSchema),
  async (req, res, next) => {
    try {
      const { id, formId } = req.params;
      const study = await Study.findOne({ _id: id, orgId: req.user.orgId });
      if (!study) {
        const error = new Error('Study not found');
        error.status = 404;
        throw error;
      }

      ensureWritable(req.user, study);

      const form = await Form.findOne({
        _id: formId,
        studyId: study._id,
        orgId: req.user.orgId,
      });
      if (!form) {
        const error = new Error('Form not found');
        error.status = 404;
        throw error;
      }

      form.version = req.validatedBody.version;
      form.schema = req.validatedBody.schema;
      await form.save();

      res.json({ form });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id/forms',
  auth,
  requireRole('admin', 'researcher'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (id === 'base') {
        const forms = await Form.find({ orgId: req.user.orgId, kind: 'base' });
        return res.json({ forms });
      }

      const study = await Study.findOne({ _id: id, orgId: req.user.orgId });
      if (!study) {
        const error = new Error('Study not found');
        error.status = 404;
        throw error;
      }
      ensureWritable(req.user, study);
      const forms = await Form.find({ studyId: id }).sort({ createdAt: -1 });
      return res.json({ forms });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  '/:id/responses',
  auth,
  requireRole('admin', 'researcher', 'staff'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const study = await Study.findOne(scopeStudyAccess(req.user, { _id: id }));
      if (!study) {
        const error = new Error('Study not found');
        error.status = 404;
        throw error;
      }

      const responses = await FormResponse.find({
        studyId: study._id,
        orgId: req.user.orgId,
      })
        .sort({ authoredAt: -1 })
        .populate('formId')
        .populate('authoredBy', 'displayName email role');

      res.json({ responses });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  auth,
  requireRole('admin', 'researcher'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const study = await Study.findOne({ _id: id, orgId: req.user.orgId });
      if (!study) {
        const error = new Error('Study not found');
        error.status = 404;
        throw error;
      }

      ensureWritable(req.user, study);

      await Promise.all([
        Form.deleteMany({ studyId: study._id }),
        Task.deleteMany({ studyId: study._id, orgId: req.user.orgId }),
        FormResponse.deleteMany({ studyId: study._id, orgId: req.user.orgId }),
      ]);

      await study.deleteOne();
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;

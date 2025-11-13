const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const Patient = require('../models/Patient');
const User = require('../models/User');
const Task = require('../models/Task');
const Study = require('../models/Study');
const FormResponse = require('../models/FormResponse');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validateBody, validateQuery } = require('../utils/validate');

const router = express.Router();

/* ---------------------------------- list ---------------------------------- */

const listQuerySchema = z.object({
  cohortTags: z.string().optional(),
  strata: z.string().optional(),
  category: z.string().optional(),
  text: z.string().optional(),
});

router.get(
  '/',
  auth,
  requireRole('admin', 'researcher', 'staff'),
  validateQuery(listQuerySchema),
  async (req, res, next) => {
    try {
      const filter = { orgId: req.user.orgId };

      if (req.user.role === 'staff') {
        filter.assignedStaff = req.user._id;
      }

      if (req.validatedQuery.cohortTags) {
        filter.cohortTags = {
          $all: req.validatedQuery.cohortTags.split(',').map((t) => t.trim()),
        };
      }
      if (req.validatedQuery.strata) {
        filter.strata = {
          $all: req.validatedQuery.strata.split(',').map((t) => t.trim()),
        };
      }
      if (req.validatedQuery.text) {
        const term = req.validatedQuery.text.trim();
        filter.pid = { $regex: term, $options: 'i' };
      }
      if (req.validatedQuery.category) {
        filter.category = { $regex: req.validatedQuery.category.trim(), $options: 'i' };
      }

      const patients = await Patient.find(filter).populate(
        'assignedStaff',
        'displayName email role category'
      );
      res.json({ patients });
    } catch (error) {
      next(error);
    }
  }
);

/* --------------------------------- create --------------------------------- */

const objectIdRegex = /^[a-f\d]{24}$/i;
const pseudoIdRegex = /^[A-Z0-9_-]{3,}$/;

const createSchema = z.object({
  pid: z.string().regex(
    pseudoIdRegex,
    'PID must be uppercase letters, digits, _ or -, length ≥ 3'
  ),
  category: z.string().max(120).optional(),
  cohortTags: z.array(z.string()).optional(),
  strata: z.array(z.string()).optional(),
  // Accept both "isActive" (preferred) and legacy "status"
  isActive: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  // Accept either single ownerId or an array of assignedStaff
  ownerId: z.string().regex(objectIdRegex, 'Invalid ownerId').optional(),
  assignedStaff: z.array(z.string().regex(objectIdRegex, 'Invalid staff id')).optional(),
});

router.post(
  '/',
  auth,
  requireRole('admin', 'researcher'),
  validateBody(createSchema),
  async (req, res, next) => {
    try {
      const pidValue = req.validatedBody.pid.trim().toUpperCase();

      const existing = await Patient.findOne({ pid: pidValue, orgId: req.user.orgId });
      if (existing) {
        const error = new Error('PID already exists');
        error.status = 409;
        throw error;
      }

      // normalize activity flag
      const isActive =
        typeof req.validatedBody.isActive === 'boolean'
          ? req.validatedBody.isActive
          : req.validatedBody.status
          ? req.validatedBody.status === 'active'
          : true;

      // collect potential staff ids (ownerId + assignedStaff)
      const candidateIds = new Set();
      if (req.validatedBody.ownerId) candidateIds.add(req.validatedBody.ownerId);
      (req.validatedBody.assignedStaff || []).forEach((id) => candidateIds.add(id));

      // fetch only valid staff/researchers from same org
      let cleanedAssignees = [];
      if (candidateIds.size > 0) {
        const ids = Array.from(candidateIds).filter((id) => objectIdRegex.test(id));
        if (ids.length > 0) {
          const staff = await User.find({
            _id: { $in: ids },
            orgId: req.user.orgId,
            role: { $in: ['staff', 'researcher'] },
          }).select('_id');
          cleanedAssignees = staff.map((m) => m._id);
        }
      }

      const patient = await Patient.create({
        pid: pidValue,
        category: req.validatedBody.category,
        cohortTags: req.validatedBody.cohortTags || [],
        strata: req.validatedBody.strata || [],
        isActive,
        orgId: req.user.orgId,
        assignedStaff: cleanedAssignees,
      });

      const populated = await patient.populate(
        'assignedStaff',
        'displayName email role category'
      );

      res.status(201).json({ patient: populated });
    } catch (error) {
      // Provide detail so the client sees why it failed
      if (error?.name === 'ValidationError') {
        error.status = 400;
        error.code = 'validation_error';
      }
      next(error);
    }
  }
);

/* --------------------------------- update --------------------------------- */

const updateSchema = z.object({
  category: z.union([z.string().max(120), z.null()]).optional(),
  cohortTags: z.array(z.string()).optional(),
  strata: z.array(z.string()).optional(),
  assignedStaff: z.array(z.string().regex(objectIdRegex, 'Invalid staff id')).optional(),
  isActive: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  newPid: z
    .string()
    .regex(pseudoIdRegex, 'PID must be uppercase letters, digits, _ or -, length ≥ 3')
    .optional(),
});

router.patch(
  '/:pid',
  auth,
  requireRole('admin', 'researcher'),
  validateBody(updateSchema),
  async (req, res, next) => {
    try {
      const patient = await Patient.findOne({ pid: req.params.pid, orgId: req.user.orgId });
      if (!patient) {
        const error = new Error('Patient not found');
        error.status = 404;
        throw error;
      }

      if (req.validatedBody.cohortTags) {
        patient.cohortTags = req.validatedBody.cohortTags;
      }
      if (req.validatedBody.strata) {
        patient.strata = req.validatedBody.strata;
      }
      if (Object.prototype.hasOwnProperty.call(req.validatedBody, 'category')) {
        patient.category = req.validatedBody.category || undefined;
      }
      if (req.validatedBody.assignedStaff) {
        const staff = await User.find({
          _id: { $in: req.validatedBody.assignedStaff },
          orgId: req.user.orgId,
          role: { $in: ['staff', 'researcher'] },
        }).select('_id');
        patient.assignedStaff = staff.map((m) => m._id);
      }

      if (Object.prototype.hasOwnProperty.call(req.validatedBody, 'isActive')) {
        patient.isActive = !!req.validatedBody.isActive;
      } else if (req.validatedBody.status) {
        patient.isActive = req.validatedBody.status === 'active';
      }

      if (req.validatedBody.newPid) {
        const nextPid = req.validatedBody.newPid.trim().toUpperCase();
        if (nextPid !== patient.pid) {
          const exists = await Patient.findOne({
            pid: nextPid,
            orgId: req.user.orgId,
            _id: { $ne: patient._id },
          });
          if (exists) {
            const error = new Error('PID already exists');
            error.status = 409;
            throw error;
          }

          const previousPid = patient.pid;
          patient.pid = nextPid;

          await Promise.all([
            Task.updateMany(
              { pid: previousPid, orgId: req.user.orgId },
              { $set: { pid: nextPid } }
            ),
            FormResponse.updateMany(
              { pid: previousPid, orgId: req.user.orgId },
              { $set: { pid: nextPid } }
            ),
            (async () => {
              const studies = await Study.find({
                orgId: req.user.orgId,
                assignedPatients: previousPid,
              });
              await Promise.all(
                studies.map(async (studyDoc) => {
                  studyDoc.assignedPatients = studyDoc.assignedPatients.map((p) =>
                    p === previousPid ? nextPid : p
                  );
                  await studyDoc.save();
                })
              );
            })(),
          ]);
        }
      }

      await patient.save();
      const populated = await patient.populate(
        'assignedStaff',
        'displayName email role category'
      );
      res.json({ patient: populated });
    } catch (error) {
      if (error?.name === 'ValidationError') {
        error.status = 400;
        error.code = 'validation_error';
      }
      next(error);
    }
  }
);

/* -------------------------------- assign ---------------------------------- */

const assignSchema = z.object({
  staffIds: z.array(z.string().regex(objectIdRegex, 'Invalid staff id')).nonempty(),
});

router.post(
  '/:pid/assign',
  auth,
  requireRole('admin', 'researcher'),
  validateBody(assignSchema),
  async (req, res, next) => {
    try {
      const patient = await Patient.findOne({ pid: req.params.pid, orgId: req.user.orgId });
      if (!patient) {
        const error = new Error('Patient not found');
        error.status = 404;
        throw error;
      }

      const staff = await User.find({
        _id: { $in: req.validatedBody.staffIds },
        orgId: req.user.orgId,
        role: { $in: ['staff', 'researcher'] },
      }).select('_id');

      const assignedSet = new Set(patient.assignedStaff.map((id) => id.toString()));
      staff.forEach((m) => assignedSet.add(m._id.toString()));
      patient.assignedStaff = Array.from(assignedSet).map((id) => new mongoose.Types.ObjectId(id));
      await patient.save();

      const populated = await patient.populate(
        'assignedStaff',
        'displayName email role category'
      );
      res.json({ patient: populated });
    } catch (error) {
      if (error?.name === 'ValidationError') {
        error.status = 400;
        error.code = 'validation_error';
      }
      next(error);
    }
  }
);

/* ------------------------------ responses list ----------------------------- */

router.get(
  '/:pid/responses',
  auth,
  requireRole('admin', 'researcher', 'staff'),
  async (req, res, next) => {
    try {
      const patient = await Patient.findOne({ pid: req.params.pid, orgId: req.user.orgId });
      if (!patient) {
        const error = new Error('Patient not found');
        error.status = 404;
        throw error;
      }

      if (
        req.user.role === 'staff' &&
        !patient.assignedStaff.some((id) => id.toString() === req.user._id.toString())
      ) {
        const error = new Error('Forbidden');
        error.status = 403;
        throw error;
      }

      const filter = { pid: req.params.pid, orgId: req.user.orgId };

      if (req.user.role === 'researcher') {
        const studies = await Study.find({
          orgId: req.user.orgId,
          $or: [{ createdBy: req.user._id }, { assignedStaff: req.user._id }],
        }).select('_id');
        filter.studyId = { $in: studies.map((s) => s._id) };
      }

      if (req.user.role === 'staff') {
        const tasks = await Task.find({ pid: req.params.pid, assignee: req.user._id }).select(
          'formId'
        );
        filter.formId = { $in: tasks.map((t) => t.formId) };
      }

      const responses = await FormResponse.find(filter).populate('formId');
      res.json({ responses });
    } catch (error) {
      next(error);
    }
  }
);

/* ---------------------------------- tasks --------------------------------- */

router.get(
  '/:pid/tasks',
  auth,
  requireRole('admin', 'researcher', 'staff'),
  async (req, res, next) => {
    try {
      const patient = await Patient.findOne({ pid: req.params.pid, orgId: req.user.orgId });
      if (!patient) {
        const error = new Error('Patient not found');
        error.status = 404;
        throw error;
      }

      if (
        req.user.role === 'staff' &&
        !patient.assignedStaff.some((id) => id.toString() === req.user._id.toString())
      ) {
        const error = new Error('Forbidden');
        error.status = 403;
        throw error;
      }

      const filter = { pid: req.params.pid, orgId: req.user.orgId };

      if (req.user.role === 'staff') {
        filter.assignee = req.user._id;
      } else if (req.user.role === 'researcher') {
        const studies = await Study.find({
          orgId: req.user.orgId,
          $or: [{ createdBy: req.user._id }, { assignedStaff: req.user._id }],
        }).select('_id');
        filter.studyId = { $in: studies.map((s) => s._id) };
      }

      const tasks = await Task.find(filter)
        .populate('formId')
        .populate('assignee', 'displayName role');
      res.json({ tasks });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;

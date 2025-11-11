const express = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const argon2 = require('argon2');

const Organization = require('../models/Organization');
const User = require('../models/User');

const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validateBody, validateQuery } = require('../utils/validate');

const router = express.Router();

/* ----------------------- Schemas ----------------------- */

const createOrgSchema = z.object({
  name: z.string().min(1),
  country: z.string().min(1),
  contactEmail: z.string().email(),
  isActive: z.boolean().optional().default(false),
  admin: z
    .object({
      email: z.string().email(),
      displayName: z.string().min(1),
      password: z.string().min(8),
    })
    .optional(),
});

const listOrgsQuery = z.object({
  isActive: z
    .preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean().optional())
    .optional(),
  search: z.string().trim().max(200).optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(1),
  country: z.string().min(1),
  contactEmail: z.string().email(),
  isActive: z.boolean(),
});

const orgIdParam = z.object({
  id: z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid org id' }),
});

const adminsQuery = z.object({
  orgId: z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid org id' }),
});

const createAdminSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  password: z.string().min(8),
});

/* ----------------------- Helpers ----------------------- */

const mapOrg = (o) => ({
  id: o._id.toString(),
  name: o.name,
  country: o.country,
  contactEmail: o.contactEmail,
  isActive: !!o.isActive,
  updatedAt: o.updatedAt,
});

const mapAdmin = (u) => ({
  id: u._id.toString(),
  email: u.email,
  displayName: u.displayName,
  isActive: !!u.isActive,
  createdAt: u.createdAt,
});

/* ----------------------- Routes ----------------------- */

router.use(auth, requireRole('superadmin'));

/**
 * GET /api/superadmin/orgs
 * Filters: search, isActive
 */
router.get(
  '/orgs',
  validateQuery(listOrgsQuery),
  async (req, res, next) => {
    try {
      const { isActive, search } = req.validatedQuery || {};
      const query = {};

      if (typeof isActive === 'boolean') {
        query.isActive = isActive;
      }
      if (search && search.trim()) {
        const s = search.trim();
        query.$or = [
          { name: { $regex: s, $options: 'i' } },
          { contactEmail: { $regex: s, $options: 'i' } },
          { country: { $regex: s, $options: 'i' } },
        ];
      }

      const organizations = await Organization.find(query).sort({ updatedAt: -1 }).lean();
      res.json({ organizations: organizations.map(mapOrg) });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * POST /api/superadmin/orgs
 * Create organization, and optionally create initial admin with hashed password.
 * New orgs default to inactive.
 */
router.post(
  '/orgs',
  validateBody(createOrgSchema),
  async (req, res, next) => {
    try {
      const { name, country, contactEmail, isActive = false, admin } = req.validatedBody;

      const org = await Organization.create({
        name,
        country,
        contactEmail,
        isActive: Boolean(isActive) && false, // force default false for new orgs
      });

      if (admin) {
        const { email, displayName, password } = admin;
        const passwordHash = await argon2.hash(password);
        await User.create({
          email: email.toLowerCase(),
          displayName,
          passwordHash,
          role: 'admin',
          orgId: org._id,
          isActive: true,
        });
      }

      res.json({ organization: mapOrg(org) });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * PATCH /api/superadmin/orgs/:id
 * Update org basic fields and activation.
 */
router.patch(
  '/orgs/:id',
  async (req, res, next) => {
    try {
      const parsedId = orgIdParam.safeParse({ id: req.params.id });
      if (!parsedId.success) {
        const err = new Error(parsedId.error.issues?.[0]?.message || 'Invalid org id');
        err.status = 400;
        throw err;
      }
      const parsedBody = updateOrgSchema.safeParse(req.body);
      if (!parsedBody.success) {
        const err = new Error(parsedBody.error.issues?.[0]?.message || 'Invalid body');
        err.status = 400;
        throw err;
      }

      const { name, country, contactEmail, isActive } = parsedBody.data;

      const org = await Organization.findByIdAndUpdate(
        req.params.id,
        { name, country, contactEmail, isActive: !!isActive },
        { new: true, runValidators: true }
      );

      if (!org) {
        const err = new Error('Organization not found');
        err.status = 404;
        throw err;
      }

      res.json({ organization: mapOrg(org) });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * DELETE /api/superadmin/orgs/:id
 * Deletes org and users in that org. Extend to cascade other collections as needed.
 */
router.delete(
  '/orgs/:id',
  async (req, res, next) => {
    try {
      const parsedId = orgIdParam.safeParse({ id: req.params.id });
      if (!parsedId.success) {
        const err = new Error(parsedId.error.issues?.[0]?.message || 'Invalid org id');
        err.status = 400;
        throw err;
      }

      const org = await Organization.findById(req.params.id);
      if (!org) {
        const err = new Error('Organization not found');
        err.status = 404;
        throw err;
      }

      await User.deleteMany({ orgId: org._id });
      await Organization.findByIdAndDelete(org._id);

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * GET /api/superadmin/admins?orgId=...
 */
router.get(
  '/admins',
  validateQuery(adminsQuery),
  async (req, res, next) => {
    try {
      const { orgId } = req.validatedQuery;
      const admins = await User.find({ orgId, role: 'admin' }).sort({ createdAt: -1 }).lean();
      res.json({ admins: admins.map(mapAdmin) });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * POST /api/superadmin/orgs/:orgId/admins
 * Create admin with argon2 passwordHash.
 */
router.post(
  '/orgs/:orgId/admins',
  async (req, res, next) => {
    try {
      const orgId = req.params.orgId;
      if (!mongoose.Types.ObjectId.isValid(orgId)) {
        const err = new Error('Invalid org id');
        err.status = 400;
        throw err;
      }

      const parsed = createAdminSchema.safeParse(req.body);
      if (!parsed.success) {
        const err = new Error(parsed.error.issues?.[0]?.message || 'Invalid body');
        err.status = 400;
        throw err;
      }

      const org = await Organization.findById(orgId);
      if (!org) {
        const err = new Error('Organization not found');
        err.status = 404;
        throw err;
      }

      const { email, displayName, password } = parsed.data;
      const passwordHash = await argon2.hash(password);

      const admin = await User.create({
        email: email.toLowerCase(),
        displayName,
        passwordHash,
        role: 'admin',
        orgId: org._id,
        isActive: true,
      });

      res.json({ admin: mapAdmin(admin) });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;

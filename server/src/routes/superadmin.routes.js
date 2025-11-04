const express = require('express');
const { z } = require('zod');
const crypto = require('crypto');
const argon2 = require('argon2');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Study = require('../models/Study');
const Form = require('../models/Form');
const Task = require('../models/Task');
const FormResponse = require('../models/FormResponse');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { validateBody, validateQuery } = require('../utils/validate');
const { revokeAllRefreshTokens } = require('../utils/jwt');

const router = express.Router();

const orgStatusEnum = ['pending', 'approved', 'rejected', 'suspended'];

const orgListQuerySchema = z.object({
  status: z.enum(orgStatusEnum).optional(),
  isActive: z
    .string()
    .transform((value) => {
      if (value === undefined) return undefined;
      return value === 'true';
    })
    .optional(),
  search: z.string().trim().max(120).optional(),
});

router.get(
  '/orgs',
  auth,
  requireRole('superadmin'),
  validateQuery(orgListQuerySchema),
  async (req, res, next) => {
    try {
      const filter = {};
      if (req.validatedQuery.status) {
        filter.status = req.validatedQuery.status;
      }
      if (typeof req.validatedQuery.isActive === 'boolean') {
        filter.isActive = req.validatedQuery.isActive;
      }
      if (req.validatedQuery.search) {
        const regex = new RegExp(req.validatedQuery.search, 'i');
        filter.$or = [{ name: regex }, { contactEmail: regex }];
      }
      const orgs = await Organization.find(filter).sort({ createdAt: -1 });

      res.json({
        organizations: orgs.map((org) => ({
          id: org._id,
          name: org.name,
          country: org.country,
          contactEmail: org.contactEmail,
          status: org.status,
          isActive: org.isActive,
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

const orgCreateSchema = z.object({
  name: z.string().min(3).max(120),
  country: z.string().min(2).max(120),
  contactEmail: z.string().email(),
  message: z.string().max(1000).optional(),
  status: z.enum(orgStatusEnum).optional(),
  isActive: z.boolean().optional(),
  admin: z
    .object({
      email: z.string().email(),
      displayName: z.string().min(2).max(120),
    })
    .optional(),
});

router.post(
  '/orgs',
  auth,
  requireRole('superadmin'),
  validateBody(orgCreateSchema),
  async (req, res, next) => {
    try {
      const payload = req.validatedBody;
      let tempPassword;
      let adminUser;

      if (payload.admin) {
        const existing = await User.findOne({ email: payload.admin.email.toLowerCase() });
        if (existing) {
          const error = new Error('Admin email already in use');
          error.status = 409;
          throw error;
        }
      }

      const organization = await Organization.create({
        name: payload.name,
        country: payload.country,
        contactEmail: payload.contactEmail,
        message: payload.message,
        status: payload.status || 'pending',
        isActive: payload.isActive ?? true,
      });

      if (payload.admin) {
        tempPassword = crypto.randomBytes(10).toString('base64url');
        const passwordHash = await argon2.hash(tempPassword);
        adminUser = await User.create({
          email: payload.admin.email.toLowerCase(),
          displayName: payload.admin.displayName,
          role: 'admin',
          orgId: organization._id,
          passwordHash,
          isActive: organization.isActive,
        });
      }

      res.status(201).json({
        organization: {
          id: organization._id,
          name: organization.name,
          country: organization.country,
          contactEmail: organization.contactEmail,
          status: organization.status,
          isActive: organization.isActive,
          message: organization.message,
        },
        admin:
          adminUser &&
          {
            id: adminUser._id,
            email: adminUser.email,
            displayName: adminUser.displayName,
            isActive: adminUser.isActive,
            tempPassword: process.env.NODE_ENV === 'production' ? undefined : tempPassword,
          },
      });
    } catch (error) {
      next(error);
    }
  }
);

const orgUpdateSchema = z.object({
  name: z.string().min(3).max(120).optional(),
  country: z.string().min(2).max(120).optional(),
  contactEmail: z.string().email().optional(),
  message: z.string().max(1000).optional(),
  status: z.enum(orgStatusEnum).optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  '/orgs/:id',
  auth,
  requireRole('superadmin'),
  validateBody(orgUpdateSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const updates = { ...req.validatedBody };

      if (Object.prototype.hasOwnProperty.call(updates, 'isActive') && updates.isActive === false) {
        updates.status = updates.status || 'suspended';
      }

      const organization = await Organization.findByIdAndUpdate(id, updates, {
        new: true,
      });

      if (!organization) {
        const error = new Error('Organization not found');
        error.status = 404;
        throw error;
      }

      if (Object.prototype.hasOwnProperty.call(req.validatedBody, 'isActive')) {
        const nextActive = req.validatedBody.isActive;
        if (nextActive === false) {
          await User.updateMany(
            { orgId: organization._id },
            { $set: { isActive: false, refreshTokens: [] } }
          );
        } else if (nextActive === true) {
          await User.updateMany({ orgId: organization._id }, { $set: { isActive: true } });
        }
      }

      res.json({
        organization: {
          id: organization._id,
          name: organization.name,
          country: organization.country,
          contactEmail: organization.contactEmail,
          status: organization.status,
          isActive: organization.isActive,
          message: organization.message,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/orgs/:id',
  auth,
  requireRole('superadmin'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const organization = await Organization.findById(id);
      if (!organization) {
        const error = new Error('Organization not found');
        error.status = 404;
        throw error;
      }

      await Promise.all([
        FormResponse.deleteMany({ orgId: organization._id }),
        Task.deleteMany({ orgId: organization._id }),
        Form.deleteMany({ orgId: organization._id }),
        Study.deleteMany({ orgId: organization._id }),
        Patient.deleteMany({ orgId: organization._id }),
        User.deleteMany({ orgId: organization._id }),
        Organization.deleteOne({ _id: organization._id }),
      ]);

      res.json({
        ok: true,
      });
    } catch (error) {
      next(error);
    }
  }
);

const adminsQuerySchema = z.object({
  orgId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid orgId').optional(),
  isActive: z
    .string()
    .transform((value) => {
      if (value === undefined) return undefined;
      return value === 'true';
    })
    .optional(),
});

router.get(
  '/admins',
  auth,
  requireRole('superadmin'),
  validateQuery(adminsQuerySchema),
  async (req, res, next) => {
    try {
      const filter = { role: 'admin' };
      if (req.validatedQuery.orgId) {
        filter.orgId = req.validatedQuery.orgId;
      }
      if (typeof req.validatedQuery.isActive === 'boolean') {
        filter.isActive = req.validatedQuery.isActive;
      }

      const admins = await User.find(filter)
        .sort({ createdAt: -1 })
        .select('-passwordHash -refreshTokens')
        .populate('orgId', 'name status isActive');

      res.json({
        admins: admins.map((admin) => ({
          id: admin._id,
          email: admin.email,
          displayName: admin.displayName,
          isActive: admin.isActive,
          role: admin.role,
          org: admin.orgId
            ? {
                id: admin.orgId._id,
                name: admin.orgId.name,
                status: admin.orgId.status,
                isActive: admin.orgId.isActive,
              }
            : null,
          createdAt: admin.createdAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

const adminCreateSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(120),
  activateOrg: z.boolean().optional(),
});

router.post(
  '/orgs/:id/admins',
  auth,
  requireRole('superadmin'),
  validateBody(adminCreateSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const org = await Organization.findById(id);
      if (!org) {
        const error = new Error('Organization not found');
        error.status = 404;
        throw error;
      }

      if (!org.isActive && !req.validatedBody.activateOrg) {
        const error = new Error('Organization is inactive. Set "activateOrg" to true to proceed.');
        error.status = 400;
        throw error;
      }

      if (req.validatedBody.activateOrg) {
        org.isActive = true;
        if (org.status === 'suspended') {
          org.status = 'approved';
        }
        await org.save();
      }

      const existingEmail = await User.findOne({ email: req.validatedBody.email.toLowerCase() });
      if (existingEmail) {
        const error = new Error('Email already in use');
        error.status = 409;
        throw error;
      }

      const tempPassword = crypto.randomBytes(10).toString('base64url');
      const passwordHash = await argon2.hash(tempPassword);

      const adminUser = await User.create({
        email: req.validatedBody.email.toLowerCase(),
        displayName: req.validatedBody.displayName,
        role: 'admin',
        orgId: org._id,
        passwordHash,
        isActive: org.isActive,
      });

      res.status(201).json({
        admin: {
          id: adminUser._id,
          email: adminUser.email,
          displayName: adminUser.displayName,
          isActive: adminUser.isActive,
          orgId: org._id,
          tempPassword: process.env.NODE_ENV === 'production' ? undefined : tempPassword,
        },
        organization: {
          id: org._id,
          name: org.name,
          status: org.status,
          isActive: org.isActive,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

const adminUpdateSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().min(2).max(120).optional(),
  isActive: z.boolean().optional(),
  resetPassword: z.boolean().optional(),
});

router.patch(
  '/admins/:id',
  auth,
  requireRole('superadmin'),
  validateBody(adminUpdateSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const adminUser = await User.findOne({ _id: id, role: 'admin' });
      if (!adminUser) {
        const error = new Error('Admin account not found');
        error.status = 404;
        throw error;
      }

      if (req.validatedBody.email) {
        const nextEmail = req.validatedBody.email.toLowerCase();
        if (nextEmail !== adminUser.email) {
          const existing = await User.findOne({ email: nextEmail, _id: { $ne: adminUser._id } });
          if (existing) {
            const error = new Error('Email already in use');
            error.status = 409;
            throw error;
          }
          adminUser.email = nextEmail;
        }
      }

      if (req.validatedBody.displayName) {
        adminUser.displayName = req.validatedBody.displayName;
      }

      let tempPassword;
      if (req.validatedBody.resetPassword) {
        tempPassword = crypto.randomBytes(10).toString('base64url');
        adminUser.passwordHash = await argon2.hash(tempPassword);
        await revokeAllRefreshTokens(adminUser);
      }

      if (Object.prototype.hasOwnProperty.call(req.validatedBody, 'isActive')) {
        adminUser.isActive = req.validatedBody.isActive;
        if (!adminUser.isActive) {
          await revokeAllRefreshTokens(adminUser);
        }
      }

      await adminUser.save();

      res.json({
        admin: {
          id: adminUser._id,
          email: adminUser.email,
          displayName: adminUser.displayName,
          isActive: adminUser.isActive,
          orgId: adminUser.orgId,
          tempPassword:
            req.validatedBody.resetPassword && process.env.NODE_ENV !== 'production'
              ? tempPassword
              : undefined,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;

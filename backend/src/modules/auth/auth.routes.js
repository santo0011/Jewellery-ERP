import { Router } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  idParamsSchema,
  loginSchema,
  registerOrganisationSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authLimiter, signupLimiter } from '../../middleware/rateLimiters.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';

const router = Router();

router.post('/register', signupLimiter, validate({ body: registerOrganisationSchema }), controller.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), controller.forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), controller.resetPassword);

router.use(authenticate);
router.get('/me', controller.me);
router.patch('/me', validate({ body: updateProfileSchema }), controller.updateProfile);
router.post('/change-password', validate({ body: changePasswordSchema }), controller.changePassword);
router.post('/logout-all', controller.logoutAll);
router.get('/sessions', controller.listSessions);
router.delete('/sessions/:id', validate({ params: idParamsSchema }), controller.revokeSession);

export default router;

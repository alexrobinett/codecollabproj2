const express = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  logout,
  logoutAll,
  refreshToken,
  changePassword,
  getActiveSessions,
  verifyEmail,
  resendVerificationEmail,
  getCurrentUser,
  requestPasswordReset,
  verifyPasswordResetToken,
  resetPassword,
} = require('../controllers/authController');
const auth = require('../middleware/auth');
const { passwordValidator } = require('../utils/passwordValidator');
const { validate, registerValidator, loginValidator } = require('../middleware/validators');

const router = express.Router();

// register/login chains are shared from middleware/validators; the chains below
// are local to these auth routes.
const resendVerificationValidation = [
  body('email').isEmail().withMessage('Please enter a valid email address').normalizeEmail(),
];

const requestPasswordResetValidation = [
  body('email').isEmail().withMessage('Please enter a valid email address').normalizeEmail(),
];

const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password')
    .custom(passwordValidator)
    .withMessage(
      'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character'
    ),
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .custom(passwordValidator)
    .withMessage(
      'New password must be at least 8 characters long and contain uppercase, lowercase, number, and special character'
    )
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),
];

// Routes
router.post('/register', registerValidator, validate, register);
router.post('/login', loginValidator, validate, login);
router.post('/refresh-token', refreshToken);
router.post('/logout', auth, logout);
router.post('/logout-all', auth, logoutAll);
router.get('/verify-email/:token', verifyEmail);
router.post(
  '/resend-verification',
  resendVerificationValidation,
  validate,
  resendVerificationEmail
);
router.get('/me', auth, getCurrentUser);

// Session management routes
router.get('/sessions', auth, getActiveSessions);
router.put('/change-password', auth, changePasswordValidation, validate, changePassword);

// Password reset routes
router.post(
  '/request-password-reset',
  requestPasswordResetValidation,
  validate,
  requestPasswordReset
);
router.get('/verify-password-reset/:token', verifyPasswordResetToken);
router.post('/reset-password', resetPasswordValidation, validate, resetPassword);

module.exports = router;

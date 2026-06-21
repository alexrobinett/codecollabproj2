const express = require('express');
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const { requireAdmin, addDebugHeaders } = require('../middleware/rbac');
const { validate } = require('../middleware/validators');
const {
  getDashboardStats,
  getAllUsers,
  getUserDetails,
  updateUserRole,
  toggleUserSuspension,
  deleteUser,
  getSystemLogs,
} = require('../controllers/adminController');

const router = express.Router();

// Apply authentication and admin role check to all routes
router.use(auth);
router.use(requireAdmin);
router.use(addDebugHeaders);

/**
 * @route GET /api/admin/dashboard
 * @desc Get admin dashboard statistics
 * @access Admin only
 */
router.get('/dashboard', getDashboardStats);

/**
 * @route GET /api/admin/users
 * @desc Get all users with filtering and pagination
 * @access Admin only
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 20)
 * @query search - Search term for username/email
 * @query role - Filter by role (user, moderator, admin)
 * @query status - Filter by status (active, suspended, inactive)
 */
router.get('/users', getAllUsers);

/**
 * @route GET /api/admin/users/:userId
 * @desc Get detailed information about a specific user
 * @access Admin only
 */
router.get('/users/:userId', getUserDetails);

/**
 * @route PUT /api/admin/users/:userId/role
 * @desc Update user role and permissions
 * @access Admin only
 */
router.put(
  '/users/:userId/role',
  [
    body('role').optional().isIn(['user', 'moderator', 'admin']).withMessage('Invalid role'),
    body('permissions').optional().isArray().withMessage('Permissions must be an array'),
    body('customPermissions')
      .optional()
      .isArray()
      .withMessage('Custom permissions must be an array'),
  ],
  validate,
  updateUserRole
);

/**
 * @route PUT /api/admin/users/:userId/suspension
 * @desc Suspend or unsuspend a user
 * @access Admin only
 */
router.put(
  '/users/:userId/suspension',
  [
    body('suspend').isBoolean().withMessage('Suspend field must be boolean'),
    body('reason')
      .if(body('suspend').equals(true))
      .notEmpty()
      .withMessage('Reason is required when suspending a user')
      .isLength({ max: 500 })
      .withMessage('Reason must not exceed 500 characters'),
    body('duration')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Duration must be a positive number (in milliseconds)'),
  ],
  validate,
  toggleUserSuspension
);

/**
 * @route DELETE /api/admin/users/:userId
 * @desc Delete or deactivate a user
 * @access Admin only
 * @query permanent - Set to 'true' for permanent deletion (default: soft delete)
 */
router.delete('/users/:userId', deleteUser);

/**
 * @route GET /api/admin/logs
 * @desc Get system logs and security events
 * @access Admin only
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 50)
 * @query type - Filter by log type
 */
router.get('/logs', getSystemLogs);

module.exports = router;

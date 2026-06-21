const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  getAllUsers,
  getUserById,
  updateProfile,
  searchUsers,
  sendMessage,
  getMessages,
  markMessageAsRead,
  deleteMessage,
  getMyProfile,
  uploadAvatar,
  deleteAvatar,
  getAvatar,
} = require('../controllers/userController');
const { validate, profileUpdateValidator, messageValidator } = require('../middleware/validators');
const auth = require('../middleware/auth');
const { FILE_UPLOAD } = require('../config/constants');

// Configure multer for avatar uploads
// Use global uploadPath from server/index.js (supports Railway volumes)
const path = require('path');
const uploadPath = global.uploadPath || path.join(__dirname, '../uploads');

// Multer configuration with callback-based API (works with both 1.x and 2.x)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = 'avatar-' + uniqueSuffix + path.extname(file.originalname);
    cb(null, filename);
  },
});

const avatarUpload = multer({
  storage: storage,
  limits: {
    fileSize: FILE_UPLOAD.MAX_FILE_SIZE,
  },
  fileFilter: function (req, file, cb) {
    // Accept any image MIME type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  },
});

// @route   GET /api/users
// @desc    Get all users (public profiles)
// @access  Private
router.get('/', auth, getAllUsers);

// @route   GET /api/users/search
// @desc    Search users by skills or name
// @access  Private
router.get('/search', auth, searchUsers);

// @route   GET /api/users/profile/me
// @desc    Get current user's profile
// @access  Private
router.get('/profile/me', auth, getMyProfile);

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, profileUpdateValidator, validate, updateProfile);

// @route   POST /api/users/avatar
// @desc    Upload user avatar
// @access  Private
router.post('/avatar', auth, avatarUpload.single('avatar'), uploadAvatar);

// @route   DELETE /api/users/avatar
// @desc    Delete user avatar
// @access  Private
router.delete('/avatar', auth, deleteAvatar);

// @route   GET /api/users/avatar/:fileId
// @desc    Serve avatar image from GridFS
// @access  Public
router.get('/avatar/:fileId', getAvatar);

// @route   POST /api/users/messages
// @desc    Send a message to another user
// @access  Private
router.post('/messages', auth, messageValidator, validate, sendMessage);

// @route   GET /api/users/messages
// @desc    Get user's messages (inbox/sent)
// @access  Private
router.get('/messages', auth, getMessages);

// @route   PUT /api/users/messages/:messageId/read
// @desc    Mark message as read
// @access  Private
router.put('/messages/:messageId/read', auth, markMessageAsRead);

// @route   DELETE /api/users/messages/:messageId
// @desc    Delete a message
// @access  Private
router.delete('/messages/:messageId', auth, deleteMessage);

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', auth, getUserById);

module.exports = router;

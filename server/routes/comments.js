const express = require('express');
const router = express.Router({ mergeParams: true }); // To access projectId from parent router
const {
  createComment,
  getProjectComments,
  updateComment,
  deleteComment,
} = require('../controllers/commentController');
const { validate, commentValidator } = require('../middleware/validators');
const auth = require('../middleware/auth');

// @route   POST /api/projects/:projectId/comments
// @desc    Create a comment on a project
// @access  Private
router.post('/', auth, commentValidator, validate, createComment);

// @route   GET /api/projects/:projectId/comments
// @desc    Get all comments for a project
// @access  Public
router.get('/', getProjectComments);

// @route   PUT /api/projects/:projectId/comments/:commentId
// @desc    Update a comment
// @access  Private (comment owner only)
router.put('/:commentId', auth, commentValidator, validate, updateComment);

// @route   DELETE /api/projects/:projectId/comments/:commentId
// @desc    Delete a comment
// @access  Private (comment owner only)
router.delete('/:commentId', auth, deleteComment);

module.exports = router;

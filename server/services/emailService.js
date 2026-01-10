const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Create transporter (you'll need to configure this with your email provider)
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    tls: {
      // Use secure defaults - rejectUnauthorized should be true in production
      ciphers: 'SSLv3',
      minVersion: 'TLSv1.2'
    }
  });
};


// Send verification email
const sendVerificationEmail = async (email, token, username) => {
  try {
    logger.info('Starting verification email send process', {
      recipientEmail: email,
      hasEmailUser: !!process.env.EMAIL_USER,
      hasEmailPassword: !!process.env.EMAIL_PASSWORD,
      hasFrontendUrl: !!process.env.FRONTEND_URL
    });

    const transporter = createTransporter();

    // Test the connection first
    logger.debug('Testing SMTP connection');
    await transporter.verify();
    logger.info('SMTP connection verified successfully');
    
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    
    const mailOptions = {
      from: `"CodeCollabProj" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify your email address - CodeCollabProj',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to CodeCollabProj!</h2>
          <p>Hi ${username},</p>
          <p>Thank you for registering with CodeCollabProj. To complete your registration, please verify your email address by clicking the button below:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
          
          <p>This link will expire in 24 hours.</p>
          
          <p>If you didn't create an account with CodeCollabProj, you can safely ignore this email.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This is an automated email from CodeCollabProj. Please do not reply to this email.
          </p>
        </div>
      `
    };

    logger.info('Sending verification email', {
      recipientEmail: email,
      hasVerificationUrl: !!verificationUrl
    });

    const result = await transporter.sendMail(mailOptions);
    logger.info('Verification email sent successfully', {
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      pending: result.pending
    });

    return true;
  } catch (error) {
    logger.error('Failed to send verification email', {
      recipientEmail: email,
      errorName: error.name || 'Unknown',
      errorMessage: error.message,
      errorCode: error.code
    });
    return false;
  }
};

// Send password reset email (bonus feature)
const sendPasswordResetEmail = async (email, token, username) => {
  try {
    const transporter = createTransporter();
    
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Reset your password - CodeCollabProj',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hi ${username},</p>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetUrl}</p>
          
          <p>This link will expire in 1 hour.</p>
          
          <p>If you didn't request a password reset, you can safely ignore this email.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This is an automated email from CodeCollabProj. Please do not reply to this email.
          </p>
        </div>
      `
    };


    logger.info('Sending password reset email', {
      recipientEmail: email,
      hasResetUrl: !!resetUrl
    });

    await transporter.sendMail(mailOptions);
    logger.info('Password reset email sent successfully', {
      recipientEmail: email
    });

    return true;
  } catch (error) {
    logger.error('Failed to send password reset email', {
      recipientEmail: email,
      errorName: error.name || 'Unknown',
      errorMessage: error.message,
      errorCode: error.code
    });
    return false;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
}; 















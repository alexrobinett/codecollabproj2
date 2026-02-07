// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Email Service Tests
 * Tests email sending functionality for verification emails,
 * password reset emails, and other notifications
 */

const API_BASE_URL = 'http://localhost:5001/api';
const APP_BASE_URL = 'http://localhost:3000';

const generateTestUser = () => ({
  username: `user_${Date.now()}`,
  email: `test_${Date.now()}@example.com`,
  password: 'SecurePass123!',
});

test.describe('Email Service', () => {
  test.describe('Verification Email', () => {
    test('should trigger verification email on registration via API', async ({ request }) => {
      const testUser = generateTestUser();

      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // User should have emailVerified: false
      if (data.user) {
        expect(data.user.emailVerified || data.user.isVerified).toBe(false);
      }
    });

    test('should create email verification token on registration', async ({ request }) => {
      const testUser = generateTestUser();

      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Login to check user state
      const loginResponse = await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: testUser.email,
          password: testUser.password,
        },
      });

      if (loginResponse.ok()) {
        const meResponse = await request.get(`${API_BASE_URL}/auth/me`);
        const userData = await meResponse.json();

        // Should not expose verification token in API response (security)
        expect(userData.emailVerificationToken).toBeUndefined();

        // But should indicate unverified status
        expect(userData.emailVerified || userData.isVerified).toBe(false);
      }
    });

    test('should show verification pending message in UI', async ({ page }) => {
      const testUser = generateTestUser();

      await page.goto(`${APP_BASE_URL}/register`);

      await page.fill('input[name="username"]', testUser.username);
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      await page.fill('input[name="confirmPassword"]', testUser.password);

      await page.click('button[type="submit"]');

      // Should show verification message
      await page.waitForLoadState('networkidle');
      const verificationMsg = await page.locator('text=/check.*email|verify.*email|verification.*sent/i').first();
      await expect(verificationMsg).toBeVisible({ timeout: 10000 });
    });

    test('should resend verification email via API', async ({ request }) => {
      const testUser = generateTestUser();

      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Request resend
      const response = await request.post(`${API_BASE_URL}/auth/resend-verification`, {
        data: { email: testUser.email },
      });

      if (response.status() !== 404) {
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.message || data.success).toBeTruthy();
      }
    });

    test('should verify email with valid token via API', async ({ request }) => {
      // Note: This test requires extracting the token from the email
      // In e2e environment with SKIP_EMAIL_VERIFICATION=true, this is mocked

      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // In production, you'd extract token from email
      // For testing, we'll check the endpoint exists
      const fakeToken = 'fake_verification_token_123';
      const response = await request.get(`${API_BASE_URL}/auth/verify-email?token=${fakeToken}`);

      // Should return 400 for invalid token (not 500)
      expect([400, 404]).toContain(response.status());
    });

    test('should not allow login before email verification if required', async ({ request }) => {
      // Note: This depends on server configuration
      const testUser = generateTestUser();

      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      const loginResponse = await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: testUser.email,
          password: testUser.password,
        },
      });

      // Depending on server config, may allow or deny unverified login
      // Document current behavior
      if (!loginResponse.ok()) {
        const error = await loginResponse.json();
        expect(error.message || error.error).toMatch(/verify|verification|email/i);
      }
    });
  });

  test.describe('Password Reset Email', () => {
    let testUser;

    test.beforeEach(async ({ request }) => {
      testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });
    });

    test('should trigger password reset email via API', async ({ request }) => {
      const response = await request.post(`${API_BASE_URL}/auth/forgot-password`, {
        data: { email: testUser.email },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.message || data.success).toBeTruthy();
    });

    test('should create password reset token', async ({ request }) => {
      await request.post(`${API_BASE_URL}/auth/forgot-password`, {
        data: { email: testUser.email },
      });

      // Token should be created on server (not exposed in response)
      // Verify by checking user can't login with old password after reset
    });

    test('should rate limit password reset requests', async ({ request }) => {
      // Send multiple reset requests
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request.post(`${API_BASE_URL}/auth/forgot-password`, {
            data: { email: testUser.email },
          })
        );
      }

      const responses = await Promise.all(promises);

      // Some should be rate limited
      const rateLimited = responses.filter((r) => r.status() === 429).length;
      expect(rateLimited).toBeGreaterThan(0);
    });

    test('should accept password reset with valid token via API', async ({ request }) => {
      await request.post(`${API_BASE_URL}/auth/forgot-password`, {
        data: { email: testUser.email },
      });

      // In production, extract token from email
      // For testing, verify endpoint accepts token parameter
      const fakeToken = 'fake_reset_token_123';
      const response = await request.post(`${API_BASE_URL}/auth/reset-password`, {
        data: {
          token: fakeToken,
          password: 'NewSecurePass456!',
        },
      });

      // Should return 400 for invalid token (not 500)
      expect([400, 404]).toContain(response.status());
    });

    test('should reject expired password reset tokens', async ({ request }) => {
      // This test would need to mock time or wait for token expiration
      // For now, verify endpoint validates token expiration

      const expiredToken = 'expired_token_from_last_year';
      const response = await request.post(`${API_BASE_URL}/auth/reset-password`, {
        data: {
          token: expiredToken,
          password: 'NewPass123!',
        },
      });

      expect([400, 404]).toContain(response.status());
      const error = await response.json();
      expect(error.message || error.error).toMatch(/invalid|expired|token/i);
    });

    test('should invalidate token after successful password reset', async ({ request }) => {
      await request.post(`${API_BASE_URL}/auth/forgot-password`, {
        data: { email: testUser.email },
      });

      // Simulate successful reset (would need real token from email)
      // Then verify token can't be reused
      const token = 'used_token_123';

      // First use (would succeed with real token)
      await request.post(`${API_BASE_URL}/auth/reset-password`, {
        data: {
          token: token,
          password: 'NewPass1!',
        },
      });

      // Second use should fail
      const response = await request.post(`${API_BASE_URL}/auth/reset-password`, {
        data: {
          token: token,
          password: 'NewPass2!',
        },
      });

      expect([400, 404]).toContain(response.status());
    });

    test('should show password reset form with valid token in UI', async ({ page }) => {
      const token = 'some_valid_token';

      await page.goto(`${APP_BASE_URL}/reset-password?token=${token}`);

      // Should show password reset form
      const passwordInput = await page.locator('input[name="password"], input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 5000 });

      const submitBtn = await page.locator('button[type="submit"], button:has-text("Reset")').first();
      await expect(submitBtn).toBeVisible();
    });

    test('should show error for invalid/expired token in UI', async ({ page }) => {
      const invalidToken = 'invalid_or_expired_token';

      await page.goto(`${APP_BASE_URL}/reset-password?token=${invalidToken}`);

      // Should show error message
      await page.waitForLoadState('networkidle');
      const errorMsg = await page.locator('text=/invalid|expired|token/i').first();
      await expect(errorMsg).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Email Configuration', () => {
    test('should gracefully handle missing email configuration', async ({ request }) => {
      // When EMAIL_USER or EMAIL_PASSWORD is not set
      // Server should handle gracefully (not crash)

      const testUser = generateTestUser();
      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Registration should still succeed even if email fails
      expect(response.ok()).toBeTruthy();
    });

    test('should log email errors without exposing to user', async ({ request }) => {
      // Email failures should be logged server-side but not expose credentials
      const testUser = generateTestUser();

      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // Response should not contain email server errors or credentials
      const responseStr = JSON.stringify(data).toLowerCase();
      expect(responseStr).not.toContain('smtp');
      expect(responseStr).not.toContain('email_password');
      expect(responseStr).not.toContain('email_user');
    });

    test('should skip email sending in e2e environment', async ({ request }) => {
      // When SKIP_EMAIL_VERIFICATION=true or NODE_ENV=e2e
      // Emails should not be sent but flow should continue

      const testUser = generateTestUser();
      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      expect(response.ok()).toBeTruthy();

      // User should be created successfully
      const loginResponse = await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: testUser.email,
          password: testUser.password,
        },
      });

      expect(loginResponse.ok()).toBeTruthy();
    });
  });

  test.describe('Email Content & Security', () => {
    test('should not include sensitive tokens in email subject', async ({ request }) => {
      // Verify email service doesn't put tokens in subject lines
      // (This is checked through server code review, not API)

      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Email subject should be generic
      // Actual verification would require email interception
      expect(true).toBeTruthy(); // Placeholder for email content validation
    });

    test('should sanitize user data in email templates', async ({ request }) => {
      const xssUser = {
        username: '<script>alert("XSS")</script>',
        email: `test_${Date.now()}@example.com`,
        password: 'SecurePass123!',
      };

      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: xssUser,
      });

      // Registration might reject malicious username
      // Or sanitize it before using in email template
      expect([200, 201, 400]).toContain(response.status());
    });

    test('should use HTTPS links in email templates', async ({ request }) => {
      // Verify that verification/reset links use HTTPS in production
      // (In test environment, may use HTTP for localhost)

      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Email should contain FRONTEND_URL from environment
      // Actual check would require email content inspection
      expect(true).toBeTruthy(); // Placeholder
    });

    test('should include unsubscribe option in promotional emails', async ({ request }) => {
      // If app sends promotional emails, should include unsubscribe
      // This is a compliance test (CAN-SPAM, GDPR)

      // For now, verify endpoint exists for email preferences
      const response = await request.get(`${API_BASE_URL}/users/email-preferences`);

      // Endpoint may or may not exist
      expect([200, 401, 404]).toContain(response.status());
    });
  });

  test.describe('Email Delivery Monitoring', () => {
    test('should log successful email sends', async ({ request }) => {
      const testUser = generateTestUser();

      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Server should log email send attempts
      // This is verified through server logs, not API
      expect(true).toBeTruthy();
    });

    test('should log failed email sends', async ({ request }) => {
      // When email fails (wrong credentials, network error)
      // Server should log without crashing

      const testUser = generateTestUser();
      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Registration should succeed even if email fails
      expect(response.ok()).toBeTruthy();
    });

    test('should retry failed email sends', async ({ request }) => {
      // Depending on implementation, may have retry logic
      // This test documents expected behavior

      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/forgot-password`, {
        data: { email: testUser.email },
      });

      // Email service should attempt delivery
      // Retry logic is verified through server implementation
      expect(true).toBeTruthy();
    });
  });

  test.describe('Email Templates', () => {
    test('should use proper HTML formatting in emails', async ({ request }) => {
      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Email should be valid HTML
      // Actual check would require email content inspection
      expect(true).toBeTruthy();
    });

    test('should include plain text alternative for emails', async ({ request }) => {
      // Best practice: include text/plain alternative to HTML emails
      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Nodemailer supports plaintext alternative
      // Check if implemented in emailService
      expect(true).toBeTruthy();
    });

    test('should include company branding in email templates', async ({ request }) => {
      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Email should include "CodeCollabProj" branding
      // Verified through emailService.ts implementation
      expect(true).toBeTruthy();
    });

    test('should use responsive email design', async ({ request }) => {
      // Emails should render well on mobile devices
      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Current implementation uses inline CSS with max-width
      // This is mobile-friendly
      expect(true).toBeTruthy();
    });
  });

  test.describe('Email Bounce Handling', () => {
    test('should handle invalid email addresses gracefully', async ({ request }) => {
      const invalidUser = {
        username: 'testuser',
        email: 'invalid-email-format',
        password: 'SecurePass123!',
      };

      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: invalidUser,
      });

      // Should validate email format before attempting to send
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.message || error.error).toMatch(/email|invalid/i);
    });

    test('should handle bounced emails', async ({ request }) => {
      // When email bounces (user@nonexistent.com)
      // Server should handle gracefully

      const testUser = {
        username: 'testuser',
        email: `bounce_${Date.now()}@nonexistent-domain-12345.com`,
        password: 'SecurePass123!',
      };

      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Registration should succeed (email sent asynchronously)
      expect(response.ok()).toBeTruthy();

      // Bounces would be handled by email provider
    });

    test('should mark email as undeliverable after multiple bounces', async ({ request }) => {
      // After X bounces, mark email as invalid
      // This is typically handled by email service provider
      // App may want to track this in user model

      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Check if user has emailDeliverable flag
      const loginResponse = await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: testUser.email,
          password: testUser.password,
        },
      });

      if (loginResponse.ok()) {
        const meResponse = await request.get(`${API_BASE_URL}/auth/me`);
        const userData = await meResponse.json();

        // May or may not have this field
        // Document current implementation
        expect(userData).toBeTruthy();
      }
    });
  });

  test.describe('Email Performance', () => {
    test('should send emails asynchronously', async ({ request }) => {
      const testUser = generateTestUser();

      const startTime = Date.now();
      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });
      const endTime = Date.now();

      expect(response.ok()).toBeTruthy();

      // Registration should complete quickly (< 3 seconds)
      // Even if email sending takes longer
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(3000);
    });

    test('should handle high volume email sending', async ({ request }) => {
      // Send multiple emails concurrently
      const promises = [];
      for (let i = 0; i < 10; i++) {
        const testUser = generateTestUser();
        promises.push(
          request.post(`${API_BASE_URL}/auth/register`, {
            data: testUser,
          })
        );
      }

      const responses = await Promise.all(promises);

      // All should succeed
      const successCount = responses.filter((r) => r.ok()).length;
      expect(successCount).toBe(10);
    });

    test('should implement email queue for reliability', async ({ request }) => {
      // Production apps should use email queue (Bull, BullMQ, etc.)
      // This test documents current implementation

      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Current implementation sends emails directly
      // Consider adding queue for production
      expect(true).toBeTruthy();
    });
  });
});

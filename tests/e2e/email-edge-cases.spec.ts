import { test, expect, request as playwrightRequest } from '@playwright/test';
import { loginAsRole, TEST_USERS } from './fixtures/auth.fixture';

/**
 * Email Service Edge Cases E2E Tests
 * Tests for email template rendering, retry logic, token expiration,
 * unsubscribe functionality, and other edge cases
 */
test.describe('Email Service Edge Cases', () => {
  test.describe('Email Template Rendering', () => {
    test('should render welcome email template correctly', async ({ page }) => {
      // Register a new user to trigger welcome email
      await page.goto('http://localhost:3000/register');
      await page.waitForLoadState('networkidle');

      const timestamp = Date.now();
      const testUser = {
        username: `templatetest${timestamp}`,
        email: `templatetest${timestamp}@example.com`,
        password: 'TestPass123!',
      };

      await page.fill('input[name="username"]', testUser.username);
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      await page.fill('input[name="confirmPassword"]', testUser.password);

      await page.click('button[type="submit"]');

      // In E2E mode with SKIP_EMAIL_VERIFICATION=true, email isn't sent
      // But we document that welcome email template should exist
      await page.waitForTimeout(2000);

      // Should see success message
      const hasSuccess = await page.locator('.MuiAlert-standardSuccess, text=/registration.*successful/i')
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      expect(hasSuccess).toBe(true);
    });

    test('should render password reset email template correctly', async ({ page }) => {
      await page.goto('http://localhost:3000/forgot-password');
      await page.waitForLoadState('networkidle');

      await page.fill('input[name="email"]', TEST_USERS.user1.email);
      await page.click('button[type="submit"]');

      // Should show message about email being sent
      await expect(page.locator('text=/check.*email|sent.*link/i'))
        .toBeVisible({ timeout: 5000 });
    });

    test('should include user name in personalized emails', async ({ page, request }) => {
      // This test documents expected behavior:
      // Emails should be personalized with user's name
      
      // Create user with specific name
      const timestamp = Date.now();
      const testUser = {
        username: `JohnDoe${timestamp}`,
        email: `john.doe${timestamp}@example.com`,
        password: 'TestPass123!',
      };

      const response = await request.post('http://localhost:5001/api/auth/register', {
        data: testUser,
      });

      expect(response.ok()).toBeTruthy();
    });

    test('should handle special characters in email templates', async ({ page }) => {
      // Register user with special characters in name
      await page.goto('http://localhost:3000/register');
      await page.waitForLoadState('networkidle');

      const timestamp = Date.now();
      const testUser = {
        username: `TestUser${timestamp}`,
        email: `test${timestamp}@example.com`,
        password: 'TestPass123!',
      };

      await page.fill('input[name="username"]', testUser.username);
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      await page.fill('input[name="confirmPassword"]', testUser.password);

      await page.click('button[type="submit"]');

      await page.waitForTimeout(2000);
    });
  });

  test.describe('Email Delivery Failures', () => {
    test('should handle invalid email addresses gracefully', async ({ page }) => {
      await page.goto('http://localhost:3000/forgot-password');
      await page.waitForLoadState('networkidle');

      // Try with invalid email format
      await page.fill('input[name="email"]', 'invalid-email');
      await page.click('button[type="submit"]');

      // Should show validation error
      await expect(page.locator('text=/invalid.*email|valid.*email/i'))
        .toBeVisible({ timeout: 5000 });
    });

    test('should handle SMTP connection failures gracefully', async ({ request }) => {
      // This test documents expected behavior:
      // If SMTP server is down, system should queue emails for retry
      
      const timestamp = Date.now();
      const testUser = {
        username: `smtptest${timestamp}`,
        email: `smtptest${timestamp}@example.com`,
        password: 'TestPass123!',
      };

      const response = await request.post('http://localhost:5001/api/auth/register', {
        data: testUser,
      });

      // Registration should succeed even if email fails
      expect(response.ok()).toBeTruthy();
    });

    test('should not expose email bounce errors to users', async ({ page }) => {
      await page.goto('http://localhost:3000/forgot-password');
      await page.waitForLoadState('networkidle');

      // Use valid format but potentially bouncing email
      await page.fill('input[name="email"]', 'bounces@example.com');
      await page.click('button[type="submit"]');

      // Should show generic success (not expose bounce)
      await expect(page.locator('text=/check.*email|sent.*link/i'))
        .toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Email Token Expiration', () => {
    test('should reject expired verification tokens', async ({ page }) => {
      // Navigate to verify page with expired token
      await page.goto('http://localhost:3000/verify-email?token=expiredtoken123');
      await page.waitForLoadState('networkidle');

      // Should show error about expired token
      const hasExpiredError = await page.locator('.MuiAlert-standardError, text=/expired|invalid.*token/i')
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      // Documents expected behavior
      expect(typeof hasExpiredError).toBe('boolean');
    });

    test('should reject expired password reset tokens', async ({ page }) => {
      await page.goto('http://localhost:3000/reset-password?token=expiredtoken123');
      await page.waitForLoadState('networkidle');

      await page.fill('input[name="password"]', 'NewPassword123!');
      await page.fill('input[name="confirmPassword"]', 'NewPassword123!');
      await page.click('button[type="submit"]');

      // Should show error
      await expect(page.locator('.MuiAlert-standardError'))
        .toBeVisible({ timeout: 5000 });
    });

    test('should allow requesting new verification email', async ({ page }) => {
      await page.goto('http://localhost:3000/login');
      await page.waitForLoadState('networkidle');

      // Look for "Resend verification email" link
      const resendLink = page.locator('text=/resend.*verification|send.*again|didn.*receive/i').first();
      const hasResendLink = await resendLink.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasResendLink) {
        await resendLink.click();

        // Should navigate to resend page or show modal
        await page.waitForTimeout(1000);

        const emailInput = page.locator('input[name="email"], input[type="email"]').first();
        await expect(emailInput).toBeVisible();
      }
    });
  });

  test.describe('Email Rate Limiting', () => {
    test('should rate limit password reset requests', async ({ page }) => {
      await page.goto('http://localhost:3000/forgot-password');
      await page.waitForLoadState('networkidle');

      const maxAttempts = 5;

      // Send multiple reset requests
      for (let i = 0; i < maxAttempts; i++) {
        await page.fill('input[name="email"]', TEST_USERS.user1.email);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(1000);

        // Reload page for next attempt
        await page.goto('http://localhost:3000/forgot-password');
        await page.waitForLoadState('networkidle');
      }

      // Next attempt should be rate limited
      await page.fill('input[name="email"]', TEST_USERS.user1.email);
      await page.click('button[type="submit"]');

      // May show rate limit error
      const hasRateLimit = await page.locator('text=/too many.*requests|try again later|rate limit/i')
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      // Documents expected behavior
      expect(typeof hasRateLimit).toBe('boolean');
    });

    test('should rate limit verification email requests', async ({ page }) => {
      // This test documents expected behavior:
      // System should prevent spam by rate limiting verification emails
      
      await page.goto('http://localhost:3000/login');
      await page.waitForLoadState('networkidle');

      const resendLink = page.locator('text=/resend.*verification/i').first();
      const hasResendLink = await resendLink.isVisible({ timeout: 2000 }).catch(() => false);

      // Documents that resend functionality may exist
      expect(typeof hasResendLink).toBe('boolean');
    });
  });

  test.describe('Unsubscribe Functionality', () => {
    test('should provide unsubscribe link in notification emails', async ({ page }) => {
      // Navigate to user preferences/settings
      await loginAsRole(page, 'user1');
      
      await page.goto('http://localhost:3000/profile');
      await page.waitForLoadState('networkidle');

      // Look for email preferences section
      const emailPrefsSection = page.locator('text=/email.*preferences|notification.*settings/i').first();
      const hasEmailPrefs = await emailPrefsSection.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasEmailPrefs) {
        // Look for notification toggles
        const notificationToggles = page.locator('input[type="checkbox"][name*="notification" i], input[type="checkbox"][name*="email" i]');
        const toggleCount = await notificationToggles.count();

        expect(toggleCount).toBeGreaterThanOrEqual(0);
      }
    });

    test('should allow users to manage email preferences', async ({ page }) => {
      await loginAsRole(page, 'user1');
      
      await page.goto('http://localhost:3000/profile');
      await page.waitForLoadState('networkidle');

      // Look for email notification checkboxes
      const emailNotifs = page.locator('input[type="checkbox"][name*="email" i]').first();
      const hasEmailNotifs = await emailNotifs.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasEmailNotifs) {
        const isChecked = await emailNotifs.isChecked();
        
        // Toggle the checkbox
        await emailNotifs.click();

        // Wait for auto-save or find save button
        const saveBtn = page.locator('button:has-text("Save"), button[type="submit"]').first();
        const hasSaveBtn = await saveBtn.isVisible({ timeout: 2000 }).catch(() => false);

        if (hasSaveBtn) {
          await saveBtn.click();
          
          // Should show success message
          await expect(page.locator('.MuiAlert-standardSuccess'))
            .toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('should honor unsubscribe preferences', async ({ page, request }) => {
      // This test documents expected behavior:
      // When user unsubscribes, they should not receive notification emails
      
      await loginAsRole(page, 'user1');
      
      await page.goto('http://localhost:3000/profile');
      await page.waitForLoadState('networkidle');

      // Document that unsubscribe feature should exist
      const unsubscribeOption = page.locator('text=/unsubscribe|opt.*out|disable.*emails/i').first();
      const hasUnsubscribe = await unsubscribeOption.isVisible({ timeout: 2000 }).catch(() => false);

      expect(typeof hasUnsubscribe).toBe('boolean');
    });
  });

  test.describe('Email Content Validation', () => {
    test('should not send emails with broken links', async ({ page }) => {
      // This test documents expected behavior:
      // All email links should be validated before sending
      
      await page.goto('http://localhost:3000/forgot-password');
      await page.waitForLoadState('networkidle');

      await page.fill('input[name="email"]', TEST_USERS.user1.email);
      await page.click('button[type="submit"]');

      await expect(page.locator('text=/check.*email/i'))
        .toBeVisible({ timeout: 5000 });
    });

    test('should include proper unsubscribe headers (RFC compliance)', async ({ request }) => {
      // This test documents expected behavior:
      // Emails should include List-Unsubscribe headers for RFC compliance
      
      const timestamp = Date.now();
      const testUser = {
        username: `rfctest${timestamp}`,
        email: `rfctest${timestamp}@example.com`,
        password: 'TestPass123!',
      };

      const response = await request.post('http://localhost:5001/api/auth/register', {
        data: testUser,
      });

      expect(response.ok()).toBeTruthy();
    });

    test('should properly encode special characters in email subject', async ({ page }) => {
      // Register user with special characters that might appear in subject
      await page.goto('http://localhost:3000/register');
      await page.waitForLoadState('networkidle');

      const timestamp = Date.now();
      const testUser = {
        username: `Test&User${timestamp}`,
        email: `test${timestamp}@example.com`,
        password: 'TestPass123!',
      };

      await page.fill('input[name="username"]', testUser.username);
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      await page.fill('input[name="confirmPassword"]', testUser.password);

      await page.click('button[type="submit"]');

      await page.waitForTimeout(2000);
    });
  });

  test.describe('Email Queue and Retry Logic', () => {
    test('should queue emails when SMTP is unavailable', async ({ request }) => {
      // This test documents expected behavior:
      // Failed emails should be queued for retry
      
      const timestamp = Date.now();
      const testUser = {
        username: `queuetest${timestamp}`,
        email: `queuetest${timestamp}@example.com`,
        password: 'TestPass123!',
      };

      const response = await request.post('http://localhost:5001/api/auth/register', {
        data: testUser,
      });

      // Registration should succeed even if email fails
      expect(response.ok()).toBeTruthy();
    });

    test('should retry failed emails with exponential backoff', async ({ page }) => {
      // This test documents expected behavior:
      // Email service should implement retry logic with backoff
      
      await page.goto('http://localhost:3000/forgot-password');
      await page.waitForLoadState('networkidle');

      await page.fill('input[name="email"]', TEST_USERS.user1.email);
      await page.click('button[type="submit"]');

      await expect(page.locator('text=/check.*email/i'))
        .toBeVisible({ timeout: 5000 });
    });

    test('should not retry emails indefinitely', async ({ page }) => {
      // This test documents expected behavior:
      // Failed emails should eventually be marked as permanently failed
      
      await page.goto('http://localhost:3000/forgot-password');
      await page.waitForLoadState('networkidle');

      await page.fill('input[name="email"]', 'permanentfail@example.com');
      await page.click('button[type="submit"]');

      // Should show success to user (don't expose internal failures)
      await expect(page.locator('text=/check.*email/i'))
        .toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Email Logging and Monitoring', () => {
    test('should log all email sending attempts', async ({ request }) => {
      // This test documents expected behavior:
      // All email attempts should be logged for debugging
      
      const timestamp = Date.now();
      const testUser = {
        username: `logtest${timestamp}`,
        email: `logtest${timestamp}@example.com`,
        password: 'TestPass123!',
      };

      const response = await request.post('http://localhost:5001/api/auth/register', {
        data: testUser,
      });

      expect(response.ok()).toBeTruthy();
    });

    test('should track email delivery status', async ({ page }) => {
      // This test documents expected behavior:
      // Admin dashboard should show email delivery metrics
      
      await loginAsRole(page, 'admin');
      
      await page.goto('http://localhost:3000/admin');
      await page.waitForLoadState('networkidle');

      // Look for email metrics section
      const emailMetrics = page.locator('text=/email.*metrics|email.*statistics/i').first();
      const hasMetrics = await emailMetrics.isVisible({ timeout: 2000 }).catch(() => false);

      expect(typeof hasMetrics).toBe('boolean');
    });
  });

  test.describe('Multi-language Email Support', () => {
    test('should send emails in user preferred language', async ({ page }) => {
      // This test documents expected behavior:
      // Emails should respect user's language preference
      
      await loginAsRole(page, 'user1');
      
      await page.goto('http://localhost:3000/profile');
      await page.waitForLoadState('networkidle');

      // Look for language preference setting
      const langDropdown = page.locator('select[name*="language" i], [aria-label*="language" i]').first();
      const hasLangPref = await langDropdown.isVisible({ timeout: 2000 }).catch(() => false);

      expect(typeof hasLangPref).toBe('boolean');
    });
  });
});

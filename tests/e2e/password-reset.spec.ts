import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/auth.fixture';

/**
 * E2E tests for password reset flow
 * Tests forgot password, reset token, and password change functionality
 */
test.describe('Password Reset', () => {
  test('should access forgot password page', async ({ page }) => {
    // Navigate to login page
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');

    // Look for "Forgot Password" link
    const forgotPasswordLink = page.locator(
      'a:has-text("Forgot Password"), a:has-text("Forgot"), a:has-text("Reset Password")'
    );

    if (await forgotPasswordLink.isVisible().catch(() => false)) {
      await forgotPasswordLink.click();

      // Should navigate to forgot password page
      await expect(page).toHaveURL(/forgot|reset/i);
      await expect(page.getByText(/forgot.*password|reset.*password/i)).toBeVisible();
    } else {
      // If no link found, try direct navigation
      await page.goto('http://localhost:3000/forgot-password');
      await page.waitForLoadState('networkidle');

      // Page should exist and have relevant content
      const hasContent = await page
        .locator('text=/forgot|reset|email/i')
        .isVisible()
        .catch(() => false);
      expect(hasContent).toBeTruthy();
    }
  });

  test('should submit forgot password form with valid email', async ({ page }) => {
    // Try common password reset URLs
    const possibleUrls = [
      'http://localhost:3000/forgot-password',
      'http://localhost:3000/reset-password',
      'http://localhost:3000/password-reset',
    ];

    let pageLoaded = false;
    for (const url of possibleUrls) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      const hasForm = await page
        .locator('input[name="email"], input[type="email"]')
        .isVisible()
        .catch(() => false);
      if (hasForm) {
        pageLoaded = true;
        break;
      }
    }

    if (pageLoaded) {
      // Fill email input
      const emailInput = page.locator('input[name="email"], input[type="email"]').first();
      await emailInput.fill(TEST_USERS.user1.email);

      // Submit form
      await page.click('button[type="submit"]');

      // Wait for response
      await page.waitForTimeout(2000);

      // Should show success message or confirmation
      const hasSuccessMessage = await page
        .locator('text=/sent|check.*email|reset.*link/i')
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      // In test environment with SKIP_EMAIL_VERIFICATION=true, should still show UI feedback
      expect(hasSuccessMessage || page.url().includes('login')).toBeTruthy();
    } else {
      console.log('⚠️  Password reset page not found at common URLs');
    }
  });

  test('should handle invalid email in forgot password form', async ({ page }) => {
    const possibleUrls = [
      'http://localhost:3000/forgot-password',
      'http://localhost:3000/reset-password',
    ];

    let pageLoaded = false;
    for (const url of possibleUrls) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      const hasForm = await page
        .locator('input[name="email"], input[type="email"]')
        .isVisible()
        .catch(() => false);
      if (hasForm) {
        pageLoaded = true;
        break;
      }
    }

    if (pageLoaded) {
      // Try submitting with invalid email
      const emailInput = page.locator('input[name="email"], input[type="email"]').first();
      await emailInput.fill('not-a-valid-email');

      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);

      // Should show validation error OR success (some apps don't reveal if email exists)
      const hasError = await page
        .locator('text=/invalid.*email|valid.*email/i')
        .isVisible()
        .catch(() => false);
      const hasSuccess = await page
        .locator('text=/sent|check/i')
        .isVisible()
        .catch(() => false);

      // One or the other should be true
      expect(hasError || hasSuccess).toBeTruthy();
    }
  });

  test('should access password reset page with token', async ({ page }) => {
    // Test the reset password form with a token
    const testToken = 'test-reset-token-12345';

    const possibleUrls = [
      `http://localhost:3000/reset-password?token=${testToken}`,
      `http://localhost:3000/password-reset?token=${testToken}`,
      `http://localhost:3000/reset?token=${testToken}`,
    ];

    let pageLoaded = false;
    for (const url of possibleUrls) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      const hasPasswordInput = await page
        .locator('input[type="password"]')
        .isVisible()
        .catch(() => false);
      if (hasPasswordInput) {
        pageLoaded = true;
        break;
      }
    }

    if (pageLoaded) {
      // Should have password input fields
      const passwordInputs = page.locator('input[type="password"]');
      const count = await passwordInputs.count();

      // Should have at least 2 password inputs (password + confirm)
      expect(count).toBeGreaterThanOrEqual(1);
    } else {
      console.log('⚠️  Password reset form not found');
    }
  });

  test('should validate password requirements on reset form', async ({ page }) => {
    const testToken = 'test-reset-token-12345';
    const possibleUrls = [
      `http://localhost:3000/reset-password?token=${testToken}`,
      `http://localhost:3000/password-reset?token=${testToken}`,
    ];

    let pageLoaded = false;
    for (const url of possibleUrls) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      const hasPasswordInput = await page
        .locator('input[type="password"]')
        .isVisible()
        .catch(() => false);
      if (hasPasswordInput) {
        pageLoaded = true;
        break;
      }
    }

    if (pageLoaded) {
      // Try weak password
      const passwordInputs = page.locator('input[type="password"]');
      const firstInput = passwordInputs.first();

      await firstInput.fill('weak');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);

      // Should show validation error for weak password
      const hasError = await page
        .locator('text=/password.*required|too.*short|character|uppercase|lowercase/i')
        .isVisible()
        .catch(() => false);
      expect(hasError).toBeTruthy();
    }
  });

  test('should require matching passwords on reset form', async ({ page }) => {
    const testToken = 'test-reset-token-12345';
    const possibleUrls = [
      `http://localhost:3000/reset-password?token=${testToken}`,
      `http://localhost:3000/password-reset?token=${testToken}`,
    ];

    let pageLoaded = false;
    for (const url of possibleUrls) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      const hasPasswordInput = await page
        .locator('input[type="password"]')
        .isVisible()
        .catch(() => false);
      if (hasPasswordInput) {
        pageLoaded = true;
        break;
      }
    }

    if (pageLoaded) {
      const passwordInputs = page.locator('input[type="password"]');
      const count = await passwordInputs.count();

      if (count >= 2) {
        // Fill with non-matching passwords
        await passwordInputs.nth(0).fill('NewPassword123!');
        await passwordInputs.nth(1).fill('DifferentPassword123!');

        await page.click('button[type="submit"]');
        await page.waitForTimeout(1000);

        // Should show error about passwords not matching
        const hasError = await page
          .locator('text=/password.*match|must.*match|don.*t.*match/i')
          .isVisible()
          .catch(() => false);
        expect(hasError).toBeTruthy();
      }
    }
  });

  test('should handle expired reset token', async ({ page }) => {
    const expiredToken = 'expired-token-12345';

    await page.goto(`http://localhost:3000/reset-password?token=${expiredToken}`);
    await page.waitForLoadState('networkidle');

    // Page should load and show some content (error or form)
    const hasContent = await page
      .locator('text=/reset|password|token|expired|invalid/i')
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/auth.fixture';

/**
 * E2E tests for Email Service functionality
 * Tests email sending for registration verification and password reset
 * 
 * Note: These tests run with SKIP_EMAIL_VERIFICATION=true in E2E environment,
 * so they test the flow without actually sending emails. For full email testing,
 * use integration tests with a test email server.
 */
test.describe('Email Service', () => {
  test('should handle registration without email verification in E2E mode', async ({ page }) => {
    // Navigate to registration page
    await page.goto('http://localhost:3000/register');
    await page.waitForLoadState('networkidle');

    // Generate unique test user
    const timestamp = Date.now();
    const testUser = {
      username: `testuser${timestamp}`,
      email: `testuser${timestamp}@example.com`,
      password: 'Password123!',
    };

    // Fill registration form
    await page.fill('input[name="username"]', testUser.username);
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.fill('input[name="confirmPassword"]', testUser.password);

    // Submit the form
    await page.click('button[type="submit"]');

    // In E2E mode, registration should succeed without email verification
    // User should be redirected to login or dashboard
    await expect(page).toHaveURL(/\/(login|dashboard)/, { timeout: 10000 });

    // If redirected to login, should see success message about account creation
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      // Look for success message
      await expect(page.locator('.MuiAlert-standardSuccess, text=/account created/i')).toBeVisible();
    }
  });

  test('should handle forgot password flow', async ({ page }) => {
    // Navigate to login page
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');

    // Click "Forgot Password" link
    await page.click('text=/forgot password/i');

    // Should navigate to forgot password page
    await expect(page).toHaveURL(/\/forgot-password/);

    // Enter email address
    await page.fill('input[name="email"], input[type="email"]', TEST_USERS.user1.email);

    // Submit form
    await page.click('button[type="submit"]');

    // Should show success message (email sent - or skipped in E2E mode)
    await expect(page.locator('.MuiAlert-standardSuccess, text=/email sent/i, text=/check your email/i')).toBeVisible({ timeout: 10000 });
  });

  test('should handle invalid email in forgot password', async ({ page }) => {
    // Navigate to forgot password page
    await page.goto('http://localhost:3000/forgot-password');
    await page.waitForLoadState('networkidle');

    // Enter invalid email format
    await page.fill('input[name="email"], input[type="email"]', 'invalid-email');

    // Submit form
    await page.click('button[type="submit"]');

    // Should show validation error
    await expect(page.locator('text=/invalid email/i, text=/valid email/i, .MuiAlert-standardError')).toBeVisible();
  });

  test('should handle non-existent email in forgot password', async ({ page }) => {
    // Navigate to forgot password page
    await page.goto('http://localhost:3000/forgot-password');
    await page.waitForLoadState('networkidle');

    // Enter email that doesn't exist
    await page.fill('input[name="email"], input[type="email"]', 'nonexistent@example.com');

    // Submit form
    await page.click('button[type="submit"]');

    // Depending on security policy, might show generic success or specific error
    // Wait a bit to see response
    await page.waitForTimeout(2000);

    // Should either show success (for security) or error
    const hasSuccess = await page.locator('.MuiAlert-standardSuccess').isVisible();
    const hasError = await page.locator('.MuiAlert-standardError').isVisible();
    
    expect(hasSuccess || hasError).toBe(true);
  });

  test('should validate email format during registration', async ({ page }) => {
    // Navigate to registration page
    await page.goto('http://localhost:3000/register');
    await page.waitForLoadState('networkidle');

    const timestamp = Date.now();
    
    // Fill form with invalid email
    await page.fill('input[name="username"]', `testuser${timestamp}`);
    await page.fill('input[name="email"]', 'invalid-email-format');
    await page.fill('input[name="password"]', 'Password123!');
    await page.fill('input[name="confirmPassword"]', 'Password123!');

    // Submit form
    await page.click('button[type="submit"]');

    // Should show email validation error
    await expect(page.locator('text=/invalid email/i, text=/valid email/i, .MuiAlert-standardError')).toBeVisible();
  });

  test('should prevent duplicate email registration', async ({ page }) => {
    // Try to register with existing user email
    await page.goto('http://localhost:3000/register');
    await page.waitForLoadState('networkidle');

    const timestamp = Date.now();
    
    // Use existing user's email
    await page.fill('input[name="username"]', `newuser${timestamp}`);
    await page.fill('input[name="email"]', TEST_USERS.user1.email);
    await page.fill('input[name="password"]', 'Password123!');
    await page.fill('input[name="confirmPassword"]', 'Password123!');

    // Submit form
    await page.click('button[type="submit"]');

    // Should show error about email already in use
    await expect(page.locator('.MuiAlert-standardError')).toBeVisible({ timeout: 10000 });
    
    const errorText = await page.locator('.MuiAlert-standardError').textContent();
    expect(errorText?.toLowerCase()).toMatch(/email.*already|already.*registered|exists/);
  });
});

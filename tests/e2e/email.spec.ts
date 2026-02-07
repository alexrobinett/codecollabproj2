import { test, expect } from '@playwright/test';

/**
 * E2E tests for Email Service functionality
 * Tests email verification flow and password reset email sending
 */
test.describe('Email Service', () => {
  test('should send verification email on user registration', async ({ page, context }) => {
    // Generate unique user credentials
    const timestamp = Date.now();
    const testUser = {
      username: `emailtest${timestamp}`,
      email: `emailtest${timestamp}@example.com`,
      password: 'EmailTest123!',
    };

    // Navigate to register page
    await page.goto('http://localhost:3000/register');

    // Fill the registration form
    await page.fill('input[name="username"]', testUser.username);
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.fill('input[name="confirmPassword"]', testUser.password);

    // Submit the form
    await page.click('button[type="submit"]');

    // Verify success message is shown
    await expect(page.getByText(/Registration Successful/i)).toBeVisible({ timeout: 10000 });

    // Verify the message mentions email verification
    await expect(page.getByText(/verify your email/i)).toBeVisible({ timeout: 5000 });
  });

  test('should show email verification required message on login before verification', async ({
    page,
  }) => {
    // Generate unique user credentials
    const timestamp = Date.now();
    const testUser = {
      username: `unverified${timestamp}`,
      email: `unverified${timestamp}@example.com`,
      password: 'Unverified123!',
    };

    // Step 1: Register the user
    await page.goto('http://localhost:3000/register');
    await page.fill('input[name="username"]', testUser.username);
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.fill('input[name="confirmPassword"]', testUser.password);
    await page.click('button[type="submit"]');

    // Wait for registration success
    await expect(page.getByText(/Registration Successful/i)).toBeVisible({ timeout: 10000 });

    // Step 2: Try to login without verifying email
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.click('button[type="submit"]');

    // Verify error message about email verification
    // The exact message may vary, but should mention email verification
    const errorAlert = page.locator('.MuiAlert-standardError, .MuiAlert-standardWarning');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
    await expect(errorAlert).toContainText(/verify|email|verification/i);
  });

  test('should navigate to email verification page with token', async ({ page }) => {
    // Test that the email verification page loads correctly
    const mockToken = 'test-verification-token-123';

    await page.goto(`http://localhost:3000/verify-email?token=${mockToken}`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // The page should either show:
    // - A loading state
    // - A success message (if token is valid)
    // - An error message (if token is invalid or expired)

    // For this test, we're just verifying the page loads and doesn't crash
    // With a mock token, we expect an error or invalid token message
    await expect(page.locator('body')).toBeVisible();

    // The page should have some feedback (success, error, or loading)
    const hasAlert = (await page.locator('.MuiAlert-root').count()) > 0;
    const hasHeading = (await page.locator('h1, h2, h3, h4, h5, h6').count()) > 0;

    // At least one of these should be present
    expect(hasAlert || hasHeading).toBe(true);
  });

  test('should show forgot password link on login page', async ({ page }) => {
    await page.goto('http://localhost:3000/login');

    // Look for forgot password link
    const forgotPasswordLink = page.getByRole('link', { name: /forgot password/i });
    await expect(forgotPasswordLink).toBeVisible();
  });

  test('should navigate to forgot password page and submit email', async ({ page }) => {
    await page.goto('http://localhost:3000/login');

    // Click forgot password link
    const forgotPasswordLink = page.getByRole('link', { name: /forgot password/i });
    await forgotPasswordLink.click();

    // Verify we're on the forgot password page
    await expect(page).toHaveURL(/.*forgot-password.*/);
    await expect(page.getByRole('heading', { name: /forgot password/i })).toBeVisible();

    // Fill in email address
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toBeVisible();
    await emailInput.fill('user1@example.com');

    // Submit the form
    const submitButton = page.getByRole('button', { name: /send reset link|submit/i });
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    // Wait for response (success or error)
    // The page should show some feedback
    await page.waitForTimeout(2000);

    // Verify some response is shown (either success alert or error)
    const alerts = page.locator('.MuiAlert-root');
    await expect(alerts.first()).toBeVisible({ timeout: 5000 });
  });
});

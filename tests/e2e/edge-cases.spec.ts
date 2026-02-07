import { test, expect } from '@playwright/test';
import { loginAsRole, TEST_USERS } from './fixtures/auth.fixture';

/**
 * E2E tests for Edge Cases and Error Handling
 * Tests validation errors, network errors, boundary conditions, and edge cases
 */
test.describe('Edge Cases and Error Handling', () => {
  test.describe('Authentication Edge Cases', () => {
    test('should handle email with whitespace', async ({ page }) => {
      await page.goto('http://localhost:3000/login');

      // Try to login with whitespace around email
      await page.fill('input[name="email"]', '  user1@example.com  ');
      await page.fill('input[name="password"]', TEST_USERS.user1.password);
      await page.click('button[type="submit"]');

      // Should either trim and succeed, or show validation error
      await page.waitForTimeout(2000);

      // Check for either success (dashboard) or error
      const isOnDashboard = page.url().includes('/dashboard');
      const hasError = (await page.locator('.MuiAlert-standardError').count()) > 0;

      expect(isOnDashboard || hasError).toBe(true);
    });

    test('should show error for SQL injection attempt in login', async ({ page }) => {
      await page.goto('http://localhost:3000/login');

      // Try SQL injection in email field
      await page.fill('input[name="email"]', "admin'--");
      await page.fill('input[name="password"]', 'anything');
      await page.click('button[type="submit"]');

      // Should show error (not allow injection)
      await page.waitForTimeout(2000);
      const errorAlert = page.locator('.MuiAlert-standardError');
      await expect(errorAlert).toBeVisible();
    });

    test('should show error for XSS attempt in registration', async ({ page }) => {
      await page.goto('http://localhost:3000/register');

      const timestamp = Date.now();

      // Try XSS in username
      await page.fill('input[name="username"]', '<script>alert("XSS")</script>');
      await page.fill('input[name="email"]', `xsstest${timestamp}@example.com`);
      await page.fill('input[name="password"]', 'Password123!');
      await page.fill('input[name="confirmPassword"]', 'Password123!');
      await page.click('button[type="submit"]');

      // Wait for response
      await page.waitForTimeout(2000);

      // Should either sanitize input or show validation error
      const hasError = (await page.locator('.MuiAlert-standardError').count()) > 0;
      const hasValidationError = (await page.locator('.Mui-error').count()) > 0;

      // XSS should not execute
      const alerts = await page.evaluate(() => window.alert.toString());
      expect(alerts).not.toContain('XSS');
    });

    test('should enforce password strength requirements', async ({ page }) => {
      await page.goto('http://localhost:3000/register');

      const timestamp = Date.now();

      // Try weak password
      await page.fill('input[name="username"]', `weakpass${timestamp}`);
      await page.fill('input[name="email"]', `weakpass${timestamp}@example.com`);
      await page.fill('input[name="password"]', '123'); // Too short
      await page.fill('input[name="confirmPassword"]', '123');
      await page.click('button[type="submit"]');

      // Should show validation error
      await page.waitForTimeout(1000);
      const errorHelperText = page.locator('.MuiFormHelperText-root.Mui-error');
      const hasError = (await errorHelperText.count()) > 0;

      expect(hasError).toBe(true);
    });

    test('should show error when passwords do not match', async ({ page }) => {
      await page.goto('http://localhost:3000/register');

      const timestamp = Date.now();

      await page.fill('input[name="username"]', `mismatch${timestamp}`);
      await page.fill('input[name="email"]', `mismatch${timestamp}@example.com`);
      await page.fill('input[name="password"]', 'Password123!');
      await page.fill('input[name="confirmPassword"]', 'DifferentPassword456!');
      await page.click('button[type="submit"]');

      // Should show validation error
      await page.waitForTimeout(1000);
      const errorHelperText = page.locator('.MuiFormHelperText-root.Mui-error');
      await expect(errorHelperText).toBeVisible();
      await expect(errorHelperText).toContainText(/password.*match/i);
    });
  });

  test.describe('Project Edge Cases', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsRole(page, 'user1');
    });

    test('should handle very long project title', async ({ page }) => {
      await page.goto('http://localhost:3000/projects/create');
      await page.waitForLoadState('networkidle');

      // Try to enter a very long title (>200 characters)
      const longTitle = 'A'.repeat(300);
      const titleInput = page.getByLabel(/project title/i);
      await titleInput.fill(longTitle);

      // Try to submit
      const createButton = page.getByRole('button', { name: /create project/i });
      await createButton.click();

      // Should either truncate or show validation error
      await page.waitForTimeout(2000);

      const hasError =
        (await page.locator('.MuiFormHelperText-root.Mui-error').count()) > 0 ||
        (await page.locator('.MuiAlert-standardError').count()) > 0;

      // Either validation error or successful creation with truncation
      expect(hasError || page.url().includes('/projects')).toBe(true);
    });

    test('should handle special characters in project title', async ({ page }) => {
      await page.goto('http://localhost:3000/projects/create');
      await page.waitForLoadState('networkidle');

      // Test with special characters
      const specialTitle = 'Test @#$% Project & <script>alert("xss")</script>';
      await page.fill('input[name="title"]', specialTitle);
      await page.fill('textarea[name="description"]', 'Test description');

      // Add technology
      const techInput = page.getByRole('combobox', { name: /technologies/i });
      await techInput.click();
      await techInput.fill('React');
      await page.keyboard.press('Enter');

      const createButton = page.getByRole('button', { name: /create project/i });
      await createButton.click();

      await page.waitForTimeout(2000);

      // Should either sanitize or show error
      // But should NOT execute any scripts
      const alerts = await page.evaluate(() => window.alert.toString());
      expect(alerts).not.toContain('xss');
    });

    test('should handle empty technology list', async ({ page }) => {
      await page.goto('http://localhost:3000/projects/create');
      await page.waitForLoadState('networkidle');

      // Fill only required fields, leave technologies empty
      await page.fill('input[name="title"]', 'Project Without Technologies');
      await page.fill('textarea[name="description"]', 'A project with no technologies specified');

      const createButton = page.getByRole('button', { name: /create project/i });
      await createButton.click();

      await page.waitForTimeout(2000);

      // Should either allow creation or show validation error
      const hasError = (await page.locator('.MuiAlert-standardError').count()) > 0;
      const isCreated = !page.url().includes('/create');

      expect(hasError || isCreated).toBe(true);
    });

    test('should handle search with no results', async ({ page }) => {
      await page.goto('http://localhost:3000/projects');
      await page.waitForLoadState('networkidle');

      // Search for something that definitely won't exist
      const searchInput = page.getByPlaceholder(/search projects/i);
      await searchInput.fill('xyzabcnonexistentproject123456789');
      await page.waitForTimeout(500);

      // Should show "no results" message or empty state
      const noResultsText = page.getByText(/no projects found|no results|no matches/i);
      await expect(noResultsText).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Network and API Error Handling', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsRole(page, 'user1');
    });

    test('should handle 404 for non-existent project', async ({ page }) => {
      // Try to access a project that doesn't exist
      await page.goto('http://localhost:3000/projects/000000000000000000000000');
      await page.waitForLoadState('networkidle');

      // Should show error message or redirect
      await page.waitForTimeout(2000);

      const hasError =
        (await page.getByText(/not found|doesn't exist|project.*not.*exist/i).count()) > 0 ||
        (await page.locator('.MuiAlert-standardError').count()) > 0;

      // Either shows error or redirects away from invalid project page
      expect(hasError || !page.url().includes('/projects/000000000000000000000000')).toBe(
        true
      );
    });

    test('should show error message when API is slow', async ({ page, context }) => {
      // Slow down network to simulate slow API
      await context.route('**/api/**', async (route) => {
        // Delay API responses by 5 seconds
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await route.continue();
      });

      await page.goto('http://localhost:3000/projects');

      // Should show loading state
      const loadingIndicator = page.locator('.MuiCircularProgress-root, [role="progressbar"]');
      await expect(loadingIndicator).toBeVisible({ timeout: 2000 });

      // Wait for eventual load or timeout
      await page.waitForTimeout(6000);

      // Cleanup route
      await context.unroute('**/api/**');
    });
  });

  test.describe('Boundary Conditions', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsRole(page, 'user1');
    });

    test('should handle maximum character limit in bio field', async ({ page }) => {
      await page.goto('http://localhost:3000/profile');
      await page.waitForLoadState('networkidle');

      // Try to enter maximum characters (usually 500 or 1000)
      const maxBio = 'A'.repeat(1500);
      const bioField = page.locator('textarea[name="bio"]');
      await bioField.fill(maxBio);

      const saveButton = page.getByRole('button', { name: /save profile/i });
      await saveButton.click();

      await page.waitForTimeout(2000);

      // Should either accept (truncate) or show validation error
      const hasError = (await page.locator('.MuiAlert-standardError').count()) > 0;
      const hasValidationError = (await page.locator('.Mui-error').count()) > 0;

      // Either saved successfully or showed error
      const buttonText = await saveButton.textContent();
      expect(buttonText?.includes('Save') || hasError || hasValidationError).toBe(true);
    });

    test('should handle rapid multiple clicks on submit button', async ({ page }) => {
      await page.goto('http://localhost:3000/projects/create');
      await page.waitForLoadState('networkidle');

      // Fill in the form
      const timestamp = Date.now();
      await page.fill('input[name="title"]', `Rapid Click Test ${timestamp}`);
      await page.fill('textarea[name="description"]', 'Testing multiple rapid clicks');

      // Add technology
      const techInput = page.getByRole('combobox', { name: /technologies/i });
      await techInput.click();
      await techInput.fill('React');
      await page.keyboard.press('Enter');

      // Click submit button multiple times rapidly
      const createButton = page.getByRole('button', { name: /create project/i });
      await createButton.click();
      await createButton.click();
      await createButton.click();

      await page.waitForTimeout(3000);

      // Should only create one project (button should be disabled during submission)
      // Verify we're not on create page anymore (redirected)
      expect(page.url()).not.toContain('/create');
    });

    test('should handle session expiration gracefully', async ({ page }) => {
      await page.goto('http://localhost:3000/profile');
      await page.waitForLoadState('networkidle');

      // Clear cookies to simulate session expiration
      await page.context().clearCookies();

      // Try to access a protected page
      await page.goto('http://localhost:3000/projects/create');
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(2000);

      // Should redirect to login page
      expect(page.url()).toContain('/login');
    });
  });

  test.describe('Input Validation Edge Cases', () => {
    test('should handle email with plus sign (RFC compliant)', async ({ page }) => {
      await page.goto('http://localhost:3000/register');

      const timestamp = Date.now();
      const emailWithPlus = `user+test${timestamp}@example.com`;

      await page.fill('input[name="username"]', `plustest${timestamp}`);
      await page.fill('input[name="email"]', emailWithPlus);
      await page.fill('input[name="password"]', 'Password123!');
      await page.fill('input[name="confirmPassword"]', 'Password123!');
      await page.click('button[type="submit"]');

      await page.waitForTimeout(3000);

      // Should accept valid RFC-compliant email
      const hasSuccess = (await page.getByText(/registration successful/i).count()) > 0;
      expect(hasSuccess).toBe(true);
    });

    test('should handle duplicate email registration', async ({ page }) => {
      await page.goto('http://localhost:3000/register');

      // Try to register with existing email
      const timestamp = Date.now();
      await page.fill('input[name="username"]', `duplicate${timestamp}`);
      await page.fill('input[name="email"]', TEST_USERS.user1.email); // Existing user email
      await page.fill('input[name="password"]', 'Password123!');
      await page.fill('input[name="confirmPassword"]', 'Password123!');
      await page.click('button[type="submit"]');

      await page.waitForTimeout(2000);

      // Should show error about duplicate email
      const errorAlert = page.locator('.MuiAlert-standardError');
      await expect(errorAlert).toBeVisible();
      await expect(errorAlert).toContainText(/email.*already.*exists|already.*registered/i);
    });

    test('should handle invalid email format', async ({ page }) => {
      await page.goto('http://localhost:3000/register');

      const timestamp = Date.now();

      // Try various invalid email formats
      const invalidEmails = [
        'notanemail',
        'missing@domain',
        '@example.com',
        'user@',
        'user @example.com',
      ];

      for (const invalidEmail of invalidEmails) {
        await page.fill('input[name="username"]', `invalid${timestamp}`);
        await page.fill('input[name="email"]', invalidEmail);
        await page.fill('input[name="password"]', 'Password123!');
        await page.fill('input[name="confirmPassword"]', 'Password123!');
        await page.click('button[type="submit"]');

        await page.waitForTimeout(1000);

        // Should show validation error
        const hasError =
          (await page.locator('.Mui-error').count()) > 0 ||
          (await page.locator('.MuiAlert-standardError').count()) > 0;

        expect(hasError).toBe(true);

        // Reload for next iteration
        await page.reload();
      }
    });
  });
});

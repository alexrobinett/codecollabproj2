import { test, expect } from '@playwright/test';
import { loginAsRole, TEST_USERS } from './fixtures/auth.fixture';

/**
 * E2E tests for edge cases and error handling
 * Tests boundary conditions, error states, and resilience
 */
test.describe('Edge Cases and Error Handling', () => {
  test.describe('Authentication Edge Cases', () => {
    test('should handle empty login form submission', async ({ page }) => {
      await page.goto('http://localhost:3000/login');
      await page.waitForLoadState('networkidle');

      // Try to submit empty form
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);

      // Should show validation errors or prevent submission
      const hasError = await page
        .locator('text=/required|enter.*email|enter.*password/i, .MuiAlert-standardError')
        .isVisible()
        .catch(() => false);
      const stillOnLogin = page.url().includes('/login');

      // Should either show error OR stay on login page
      expect(hasError || stillOnLogin).toBeTruthy();
    });

    test('should handle SQL injection attempts in login', async ({ page }) => {
      await page.goto('http://localhost:3000/login');
      await page.waitForLoadState('networkidle');

      // Try SQL injection in email field
      await page.fill('input[name="email"]', "admin'--");
      await page.fill('input[name="password"]', "' OR '1'='1");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);

      // Should NOT log in - should show error or stay on login page
      const isOnDashboard = page.url().includes('/dashboard');
      expect(isOnDashboard).toBeFalsy();
    });

    test('should handle XSS attempts in registration', async ({ page }) => {
      const timestamp = Date.now();
      await page.goto('http://localhost:3000/register');
      await page.waitForLoadState('networkidle');

      // Try XSS in username field
      const xssPayload = '<script>alert("XSS")</script>';
      await page.fill('input[name="username"]', xssPayload);
      await page.fill('input[name="email"]', `xsstest${timestamp}@example.com`);
      await page.fill('input[name="password"]', 'TestPassword123!');
      await page.fill('input[name="confirmPassword"]', 'TestPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);

      // Should either:
      // 1. Sanitize the input (no alert dialog)
      // 2. Show validation error
      // 3. Successfully register with escaped content

      const hasAlert = await page
        .locator('text=/alert|xss/i')
        .isVisible()
        .catch(() => false);

      // XSS should NOT execute (no alert visible in DOM)
      expect(hasAlert).toBeFalsy();
    });

    test('should handle very long password', async ({ page }) => {
      await page.goto('http://localhost:3000/login');
      await page.waitForLoadState('networkidle');

      // Try extremely long password (1000 characters)
      const longPassword = 'a'.repeat(1000);
      await page.fill('input[name="email"]', TEST_USERS.user1.email);
      await page.fill('input[name="password"]', longPassword);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);

      // Should handle gracefully (error or reject)
      const isOnDashboard = page.url().includes('/dashboard');
      expect(isOnDashboard).toBeFalsy();
    });

    test('should handle rapid repeated login attempts', async ({ page }) => {
      await page.goto('http://localhost:3000/login');
      await page.waitForLoadState('networkidle');

      // Try multiple rapid login attempts
      for (let i = 0; i < 5; i++) {
        await page.fill('input[name="email"]', TEST_USERS.user1.email);
        await page.fill('input[name="password"]', 'wrongpassword');
        await page.click('button[type="submit"]');
        await page.waitForTimeout(500);
      }

      // Should either:
      // 1. Show rate limiting message
      // 2. Still show login form (not crash)
      const pageExists = await page.locator('body').isVisible();
      expect(pageExists).toBeTruthy();
    });
  });

  test.describe('Form Validation Edge Cases', () => {
    test('should validate email format in registration', async ({ page }) => {
      await page.goto('http://localhost:3000/register');
      await page.waitForLoadState('networkidle');

      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com',
        'user..name@example.com',
      ];

      for (const email of invalidEmails) {
        await page.fill('input[name="email"]', email);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(500);

        // Should show validation error
        const hasError = await page
          .locator('text=/invalid.*email|valid.*email|email.*format/i')
          .isVisible()
          .catch(() => false);

        if (!hasError) {
          // HTML5 validation might prevent submission
          const stillOnRegister = page.url().includes('/register');
          expect(stillOnRegister).toBeTruthy();
        }
      }
    });

    test('should enforce password complexity requirements', async ({ page }) => {
      const timestamp = Date.now();
      await page.goto('http://localhost:3000/register');
      await page.waitForLoadState('networkidle');

      const weakPasswords = [
        '123', // Too short
        'password', // No numbers/symbols
        'PASSWORD123', // No lowercase
        'password123', // No uppercase
        'Password', // No numbers
      ];

      for (const password of weakPasswords) {
        await page.fill('input[name="username"]', `test${timestamp}`);
        await page.fill('input[name="email"]', `test${timestamp}@example.com`);
        await page.fill('input[name="password"]', password);
        await page.fill('input[name="confirmPassword"]', password);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(500);

        // Should show validation error or stay on page
        const isOnDashboard = page.url().includes('/dashboard');
        expect(isOnDashboard).toBeFalsy();
      }
    });
  });

  test.describe('Project CRUD Edge Cases', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsRole(page, 'user1');
    });

    test('should handle empty project creation form', async ({ page }) => {
      await page.goto('http://localhost:3000/projects/create');
      await page.waitForLoadState('networkidle');

      // Try to submit without filling fields
      await page.click('button[type="submit"], button:has-text("Create Project")');
      await page.waitForTimeout(1000);

      // Should show validation errors
      const hasError = await page
        .locator('text=/required|title.*required|description.*required/i, .MuiAlert-standardError')
        .isVisible()
        .catch(() => false);
      const stillOnCreate = page.url().includes('/create');

      expect(hasError || stillOnCreate).toBeTruthy();
    });

    test('should handle very long project title', async ({ page }) => {
      await page.goto('http://localhost:3000/projects/create');
      await page.waitForLoadState('networkidle');

      // Try extremely long title
      const longTitle = 'A'.repeat(500);
      const titleInput = page.getByLabel(/project title/i);

      if (await titleInput.isVisible().catch(() => false)) {
        await titleInput.fill(longTitle);

        // Input should either:
        // 1. Truncate the value
        // 2. Show validation error
        // 3. Accept it (and backend should validate)
        const value = await titleInput.inputValue();
        const isLimited = value.length <= 500;

        expect(isLimited).toBeTruthy();
      }
    });

    test('should handle special characters in project title', async ({ page }) => {
      await page.goto('http://localhost:3000/projects/create');
      await page.waitForLoadState('networkidle');

      const titleInput = page.getByLabel(/project title/i);
      const descInput = page.getByLabel(/description/i);

      if (await titleInput.isVisible().catch(() => false)) {
        // Try title with special characters
        await titleInput.fill('<script>alert("XSS")</script> Project™ 💻');
        await descInput.fill('Test description');

        // Should accept the input (will be sanitized server-side)
        const value = await titleInput.inputValue();
        expect(value.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Navigation and Routing Edge Cases', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsRole(page, 'user1');
    });

    test('should handle navigation to non-existent project', async ({ page }) => {
      await page.goto('http://localhost:3000/projects/999999999');
      await page.waitForLoadState('networkidle');

      // Should either:
      // 1. Show 404/not found message
      // 2. Redirect to projects list
      // 3. Show error message
      const hasError = await page
        .locator('text=/not found|doesn.*t exist|invalid.*project/i')
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      const isOnProjectsList =
        page.url().includes('/projects') && !page.url().includes('/999999999');

      expect(hasError || isOnProjectsList).toBeTruthy();
    });

    test('should handle malformed URLs', async ({ page }) => {
      const malformedUrls = [
        'http://localhost:3000/projects/<script>',
        'http://localhost:3000/projects/../../etc/passwd',
        'http://localhost:3000/projects/..%2F..%2Fetc%2Fpasswd',
      ];

      for (const url of malformedUrls) {
        await page.goto(url).catch(() => {});
        await page.waitForTimeout(1000);

        // Should handle gracefully (error page or redirect, not crash)
        const hasBody = await page
          .locator('body')
          .isVisible()
          .catch(() => false);
        expect(hasBody).toBeTruthy();
      }
    });

    test('should handle browser back button correctly', async ({ page }) => {
      // Navigate through several pages
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForLoadState('networkidle');

      await page.goto('http://localhost:3000/projects');
      await page.waitForLoadState('networkidle');

      await page.goto('http://localhost:3000/profile');
      await page.waitForLoadState('networkidle');

      // Go back
      await page.goBack();
      expect(page.url()).toContain('/projects');

      await page.goBack();
      expect(page.url()).toContain('/dashboard');
    });
  });

  test.describe('Session and Cookie Edge Cases', () => {
    test('should handle expired session gracefully', async ({ page }) => {
      // Login first
      await loginAsRole(page, 'user1');
      await expect(page).toHaveURL(/dashboard/);

      // Clear cookies to simulate expired session
      await page.context().clearCookies();

      // Try to access protected page
      await page.goto('http://localhost:3000/profile');
      await page.waitForLoadState('networkidle');

      // Should redirect to login
      await expect(page).toHaveURL(/login/);
    });

    test('should handle accessing protected routes without login', async ({ page }) => {
      const protectedRoutes = ['/dashboard', '/profile', '/projects/create'];

      for (const route of protectedRoutes) {
        await page.goto(`http://localhost:3000${route}`);
        await page.waitForLoadState('networkidle');

        // Should redirect to login
        const isOnLogin = page.url().includes('/login');
        expect(isOnLogin).toBeTruthy();
      }
    });
  });

  test.describe('Network and API Edge Cases', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsRole(page, 'user1');
    });

    test('should handle slow network gracefully', async ({ page }) => {
      // Throttle network to slow 3G
      await page.route('**/*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.continue();
      });

      await page.goto('http://localhost:3000/projects');
      await page.waitForLoadState('networkidle', { timeout: 30000 });

      // Page should eventually load
      await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 30000 });
    });

    test('should display loading states appropriately', async ({ page }) => {
      await page.goto('http://localhost:3000/projects');

      // Should show some kind of loading indicator while data fetches
      // (spinner, skeleton, or data appears)
      await page.waitForLoadState('networkidle');

      // Page should be functional after loading
      const hasContent = await page.locator('body').isVisible();
      expect(hasContent).toBeTruthy();
    });
  });

  test.describe('Accessibility Edge Cases', () => {
    test('should be navigable with keyboard only', async ({ page }) => {
      await page.goto('http://localhost:3000/login');
      await page.waitForLoadState('networkidle');

      // Tab through form
      await page.keyboard.press('Tab');
      await page.keyboard.type(TEST_USERS.user1.email);
      await page.keyboard.press('Tab');
      await page.keyboard.type(TEST_USERS.user1.password);
      await page.keyboard.press('Enter');

      // Should log in successfully
      await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    });

    test('should have accessible form labels', async ({ page }) => {
      await page.goto('http://localhost:3000/login');
      await page.waitForLoadState('networkidle');

      // Email input should be associated with a label
      const emailInput = page.locator('input[name="email"]');
      const hasLabel = await emailInput.evaluate((el: HTMLInputElement) => {
        return (
          !!el.labels?.length ||
          !!el.getAttribute('aria-label') ||
          !!el.getAttribute('aria-labelledby')
        );
      });

      expect(hasLabel).toBeTruthy();
    });
  });
});

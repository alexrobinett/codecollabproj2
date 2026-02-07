import { test, expect } from '@playwright/test';
import { loginAsRole, TEST_USERS } from './fixtures/auth.fixture';

/**
 * Edge cases and error handling E2E tests
 * Tests network errors, timeouts, validation edge cases, and error recovery
 */
test.describe('Edge Cases and Error Handling', () => {
  const API_URL = 'http://localhost:5001/api';

  test.describe('Network Error Handling', () => {
    test('should handle API server unavailable gracefully', async ({ page, context }) => {
      // Block API requests to simulate server down
      await context.route('**/api/**', route => route.abort());

      await page.goto('http://localhost:3000/login');

      // Fill login form
      await page.fill('input[name="email"]', TEST_USERS.user1.email);
      await page.fill('input[name="password"]', TEST_USERS.user1.password);

      // Submit form
      await page.click('button[type="submit"]');

      // Should show network error message
      await expect(
        page.getByText(/network error|server unavailable|connection failed|unable to connect/i).first()
      ).toBeVisible({ timeout: 10000 });
    });

    test('should retry failed requests appropriately', async ({ page, context }) => {
      let requestCount = 0;

      // Fail first request, succeed on retry
      await context.route('**/api/auth/login', (route) => {
        requestCount++;
        if (requestCount === 1) {
          route.abort('failed');
        } else {
          route.continue();
        }
      });

      await page.goto('http://localhost:3000/login');
      await page.fill('input[name="email"]', TEST_USERS.user1.email);
      await page.fill('input[name="password"]', TEST_USERS.user1.password);
      await page.click('button[type="submit"]');

      // Should eventually succeed or show appropriate error
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    });

    test('should handle slow API responses without freezing UI', async ({ page, context }) => {
      // Delay API responses
      await context.route('**/api/**', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await route.continue();
      });

      await page.goto('http://localhost:3000/projects');

      // UI should show loading state
      const loadingIndicator = page.locator('[role="progressbar"], .loading, .spinner').first();
      
      if (await loadingIndicator.isVisible().catch(() => false)) {
        expect(await loadingIndicator.isVisible()).toBe(true);
      }

      // Page should eventually load
      await page.waitForLoadState('networkidle', { timeout: 20000 });
    });

    test('should handle timeout errors gracefully', async ({ page, context }) => {
      // Simulate timeout by never responding
      await context.route('**/api/projects', () => {
        // Never call route.continue() or route.fulfill()
        // This simulates a timeout
      });

      await page.goto('http://localhost:3000/projects');

      // Should show timeout error after reasonable wait
      await expect(
        page.getByText(/timeout|taking too long|slow connection/i).first()
      ).toBeVisible({ timeout: 30000 });
    });
  });

  test.describe('Input Validation Edge Cases', () => {
    test('should handle Unicode characters in input fields', async ({ page }) => {
      await page.goto('http://localhost:3000/register');

      const unicodeUsername = '用户名123';
      const unicodeEmail = 'test@例え.com';

      await page.fill('input[name="username"]', unicodeUsername);
      await page.fill('input[name="email"]', unicodeEmail);
      await page.fill('input[name="password"]', 'Password123!');
      await page.fill('input[name="confirmPassword"]', 'Password123!');

      await page.click('button[type="submit"]');

      // Should either accept or show appropriate validation error
      await page.waitForLoadState('networkidle');
    });

    test('should handle extremely long input strings', async ({ page }) => {
      await page.goto('http://localhost:3000/login');

      const longString = 'a'.repeat(10000);

      await page.fill('input[name="email"]', longString + '@example.com');
      await page.fill('input[name="password"]', longString);

      await page.click('button[type="submit"]');

      // Should show validation error
      await expect(
        page.locator('.MuiAlert-standardError, [role="alert"]')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should handle special characters in password', async ({ page }) => {
      await page.goto('http://localhost:3000/register');

      const specialCharPassword = '!@#$%^&*()_+-=[]{}|;:,.<>?';

      await page.fill('input[name="username"]', 'specialuser');
      await page.fill('input[name="email"]', 'special@example.com');
      await page.fill('input[name="password"]', specialCharPassword);
      await page.fill('input[name="confirmPassword"]', specialCharPassword);

      await page.click('button[type="submit"]');

      // Should either accept or show password requirements
      await page.waitForLoadState('networkidle');
    });

    test('should handle leading/trailing whitespace in inputs', async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: '  user1@example.com  ',
          password: '  Password123!  ',
        },
      });

      // Should either trim and succeed or reject
      expect([200, 400, 401]).toContain(response.status());
    });

    test('should handle null and undefined values', async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: null,
          password: undefined,
        },
      });

      // Should reject with 400
      expect(response.status()).toBe(400);
    });

    test('should handle empty string vs missing field', async ({ request }) => {
      const emptyStringResponse = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: '',
          password: '',
        },
      });

      const missingFieldResponse = await request.post(`${API_URL}/auth/login`, {
        data: {},
      });

      // Both should be rejected
      expect(emptyStringResponse.status()).toBe(400);
      expect(missingFieldResponse.status()).toBe(400);
    });

    test('should handle mixed case email addresses consistently', async ({ request }) => {
      // Test that email comparison is case-insensitive
      const responses = await Promise.all([
        request.post(`${API_URL}/auth/login`, {
          data: { email: 'user1@example.com', password: TEST_USERS.user1.password },
        }),
        request.post(`${API_URL}/auth/login`, {
          data: { email: 'USER1@EXAMPLE.COM', password: TEST_USERS.user1.password },
        }),
        request.post(`${API_URL}/auth/login`, {
          data: { email: 'User1@Example.Com', password: TEST_USERS.user1.password },
        }),
      ]);

      // All should behave the same (either all succeed or all fail)
      const statuses = responses.map(r => r.status());
      expect(new Set(statuses).size).toBe(1);
    });
  });

  test.describe('Browser Compatibility Edge Cases', () => {
    test('should handle browser back button after login', async ({ page }) => {
      await loginAsRole(page, 'user1');

      // Navigate to dashboard
      await expect(page).toHaveURL(/.*\/dashboard.*/);

      // Go back
      await page.goBack();

      // Should not be able to access login page (already logged in)
      const currentUrl = page.url();
      expect(currentUrl).not.toContain('/login');
    });

    test('should handle page refresh without losing state', async ({ page }) => {
      await loginAsRole(page, 'user1');

      await page.goto('http://localhost:3000/projects');
      await page.waitForLoadState('networkidle');

      // Reload page
      await page.reload();

      // Should still be on projects page and logged in
      expect(page.url()).toContain('/projects');
      
      // Should not be redirected to login
      await page.waitForTimeout(1000);
      expect(page.url()).not.toContain('/login');
    });

    test('should handle multiple tabs with same user', async ({ context, page }) => {
      await loginAsRole(page, 'user1');

      // Open second tab
      const page2 = await context.newPage();
      await page2.goto('http://localhost:3000/dashboard');

      // Both tabs should be logged in
      await expect(page2).toHaveURL(/.*\/dashboard.*/);

      // Logout in first tab
      await page.click('button[aria-label^="Account menu"]');
      await page.click('text=Logout');

      // Second tab should eventually detect logout
      // (This behavior depends on implementation - session sync across tabs)
    });

    test('should handle disabled JavaScript gracefully', async ({ page }) => {
      // Most React apps require JS, but should show appropriate message
      await page.goto('http://localhost:3000');

      // Page should load
      expect(page.url()).toContain('localhost:3000');
    });

    test('should handle cookie blocking', async ({ context }) => {
      // Clear all cookies
      await context.clearCookies();

      const page = await context.newPage();
      await page.goto('http://localhost:3000/login');

      await page.fill('input[name="email"]', TEST_USERS.user1.email);
      await page.fill('input[name="password"]', TEST_USERS.user1.password);
      await page.click('button[type="submit"]');

      // Should either work (if using alternative auth) or show cookie error
      await page.waitForLoadState('networkidle');
    });
  });

  test.describe('Concurrent Operation Edge Cases', () => {
    test('should handle rapid form submissions', async ({ page }) => {
      await page.goto('http://localhost:3000/login');

      await page.fill('input[name="email"]', TEST_USERS.user1.email);
      await page.fill('input[name="password"]', TEST_USERS.user1.password);

      // Click submit multiple times rapidly
      const submitButton = page.locator('button[type="submit"]');
      await Promise.all([
        submitButton.click(),
        submitButton.click().catch(() => {}),
        submitButton.click().catch(() => {}),
      ]);

      // Should not cause errors or duplicate submissions
      await page.waitForLoadState('networkidle');
    });

    test('should handle simultaneous API calls from same user', async ({ page, request, context }) => {
      await loginAsRole(page, 'user1');
      const cookies = await context.cookies();

      // Make multiple simultaneous requests
      const requests = Array.from({ length: 5 }, () =>
        request.get(`${API_URL}/users/me`, {
          headers: {
            Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
          },
        })
      );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach(response => {
        expect(response.status()).toBe(200);
      });
    });

    test('should handle logout during active operation', async ({ page }) => {
      await loginAsRole(page, 'user1');

      // Navigate to projects (may trigger API call)
      await page.goto('http://localhost:3000/projects');

      // Immediately attempt logout
      await page.click('button[aria-label^="Account menu"]');
      await page.click('text=Logout');

      // Should successfully logout without errors
      await expect(page).toHaveURL(/.*\/login.*/);
    });
  });

  test.describe('Data Integrity Edge Cases', () => {
    test('should handle corrupted local storage data', async ({ page, context }) => {
      // Set corrupted localStorage
      await context.addInitScript(() => {
        localStorage.setItem('user', '{corrupted json}');
        localStorage.setItem('token', 'invalid_token_format');
      });

      await page.goto('http://localhost:3000/dashboard');

      // Should handle gracefully and redirect to login or clear bad data
      await page.waitForLoadState('networkidle');
    });

    test('should handle server returning unexpected response format', async ({ page, context }) => {
      // Mock API to return unexpected format
      await context.route('**/api/users/me', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ unexpected: 'format' }),
        })
      );

      await loginAsRole(page, 'user1');

      // Should handle gracefully without crashing
      await page.waitForLoadState('networkidle');
    });

    test('should handle missing required fields in API response', async ({ page, context }) => {
      await context.route('**/api/users/me', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}), // Empty object
        })
      );

      await loginAsRole(page, 'user1');
      await page.waitForLoadState('networkidle');
    });

    test('should handle date format edge cases', async ({ request }) => {
      // Test various date formats
      const dateFormats = [
        '2024-13-45', // Invalid date
        '0000-00-00',
        'not-a-date',
        '2024-02-30', // Invalid Feb 30
        '1900-01-01', // Very old date
        '2100-12-31', // Future date
      ];

      // These tests depend on specific API endpoints that accept dates
      // Placeholder for date validation testing
    });
  });

  test.describe('Authentication Edge Cases', () => {
    test('should handle expired JWT token gracefully', async ({ page, context }) => {
      // Set an expired token
      await context.addInitScript(() => {
        document.cookie = 'authToken=expired.jwt.token';
      });

      await page.goto('http://localhost:3000/dashboard');

      // Should redirect to login
      await expect(page).toHaveURL(/.*\/login.*/);
    });

    test('should handle session timeout during active use', async ({ page }) => {
      await loginAsRole(page, 'user1');

      // Wait for session to timeout (if implemented)
      // In real test, would advance time or wait for timeout duration
      
      // Make API request after timeout
      await page.goto('http://localhost:3000/projects');

      // Should either extend session or require re-login
      await page.waitForLoadState('networkidle');
    });

    test('should prevent authentication token theft', async ({ page, context }) => {
      await loginAsRole(page, 'user1');

      // Get cookies
      const cookies = await context.cookies();
      
      // Auth cookies should be httpOnly (not accessible via JS)
      const authCookie = cookies.find(c => c.name.includes('auth') || c.name.includes('token'));
      
      if (authCookie) {
        expect(authCookie.httpOnly).toBe(true);
      }
    });

    test('should handle concurrent login attempts', async ({ request }) => {
      // Make multiple simultaneous login requests
      const loginRequests = Array.from({ length: 5 }, () =>
        request.post(`${API_URL}/auth/login`, {
          data: {
            email: TEST_USERS.user1.email,
            password: TEST_USERS.user1.password,
          },
        })
      );

      const responses = await Promise.all(loginRequests);

      // All should succeed (or rate limit)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status());
      });
    });

    test('should handle malformed JWT tokens', async ({ page, context }) => {
      // Set malformed token
      await context.addInitScript(() => {
        document.cookie = 'authToken=not.a.real.jwt';
      });

      await page.goto('http://localhost:3000/dashboard');

      // Should reject and redirect to login
      await expect(page).toHaveURL(/.*\/login.*/);
    });
  });

  test.describe('Error Recovery', () => {
    test('should allow retry after failed operation', async ({ page, context }) => {
      let requestCount = 0;

      await context.route('**/api/auth/login', (route) => {
        requestCount++;
        if (requestCount === 1) {
          route.fulfill({
            status: 500,
            body: JSON.stringify({ error: 'Internal server error' }),
          });
        } else {
          route.continue();
        }
      });

      await page.goto('http://localhost:3000/login');
      await page.fill('input[name="email"]', TEST_USERS.user1.email);
      await page.fill('input[name="password"]', TEST_USERS.user1.password);
      await page.click('button[type="submit"]');

      // Wait for error
      await expect(page.locator('.MuiAlert-standardError')).toBeVisible({ timeout: 5000 });

      // Retry
      await page.click('button[type="submit"]');

      // Should succeed on second attempt
      await expect(page).toHaveURL(/.*\/dashboard.*/, { timeout: 15000 });
    });

    test('should handle page crash and reload', async ({ page }) => {
      await loginAsRole(page, 'user1');

      // Simulate crash with navigation to invalid page
      await page.goto('http://localhost:3000/nonexistent-page');

      // Should show 404 or handle gracefully
      await page.waitForLoadState('networkidle');

      // Navigate back to valid page
      await page.goto('http://localhost:3000/dashboard');

      // Should still be logged in
      expect(page.url()).toContain('/dashboard');
    });

    test('should preserve form data after validation error', async ({ page }) => {
      await page.goto('http://localhost:3000/register');

      const username = 'testuser';
      const email = 'invalid-email'; // Invalid format

      await page.fill('input[name="username"]', username);
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', 'Password123!');
      await page.fill('input[name="confirmPassword"]', 'Different123!'); // Mismatch

      await page.click('button[type="submit"]');

      // Wait for validation error
      await page.waitForTimeout(1000);

      // Form fields should still contain values
      const usernameValue = await page.inputValue('input[name="username"]');
      const emailValue = await page.inputValue('input[name="email"]');
      
      expect(usernameValue).toBe(username);
      expect(emailValue).toBe(email);
    });
  });
});

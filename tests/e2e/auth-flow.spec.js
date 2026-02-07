// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Comprehensive Authentication Flow Tests
 * Tests the complete user authentication journey including registration,
 * login, email verification, password reset, and session management
 */

const API_BASE_URL = 'http://localhost:5001/api';
const APP_BASE_URL = 'http://localhost:3000';

// Generate unique test user credentials
const generateTestUser = () => ({
  username: `testuser_${Date.now()}`,
  email: `test_${Date.now()}@example.com`,
  password: 'SecurePass123!',
});

test.describe('Authentication Flow', () => {
  test.describe('User Registration', () => {
    test('should successfully register a new user', async ({ page }) => {
      const testUser = generateTestUser();

      await page.goto(`${APP_BASE_URL}/register`);

      // Fill registration form
      await page.fill('input[name="username"]', testUser.username);
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      await page.fill('input[name="confirmPassword"]', testUser.password);

      // Submit form
      await page.click('button[type="submit"]');

      // Verify success (redirect or success message)
      await page.waitForURL(/login|verify/, { timeout: 10000 }).catch(async () => {
        // If no redirect, check for success message
        const successMsg = await page.locator('text=/success|registered|check.*email/i').first();
        await expect(successMsg).toBeVisible({ timeout: 5000 });
      });
    });

    test('should show validation errors for invalid inputs', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/register`);

      // Try submitting with weak password
      await page.fill('input[name="username"]', 'testuser');
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', '123');
      await page.fill('input[name="confirmPassword"]', '123');

      await page.click('button[type="submit"]');

      // Should show validation error
      const errorMsg = await page.locator('text=/password.*characters|weak.*password|invalid/i').first();
      await expect(errorMsg).toBeVisible({ timeout: 5000 });
    });

    test('should show error for mismatched passwords', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/register`);

      await page.fill('input[name="username"]', 'testuser');
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'SecurePass123!');
      await page.fill('input[name="confirmPassword"]', 'DifferentPass123!');

      await page.click('button[type="submit"]');

      // Should show mismatch error
      const errorMsg = await page.locator('text=/password.*match|passwords.*different/i').first();
      await expect(errorMsg).toBeVisible({ timeout: 5000 });
    });

    test('should prevent duplicate email registration via API', async ({ request }) => {
      const testUser = generateTestUser();

      // Register first time
      const firstResponse = await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Register with same email
      const secondResponse = await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      expect(secondResponse.status()).toBe(400);
      const errorData = await secondResponse.json();
      expect(errorData.message || errorData.error).toMatch(/exist|already|duplicate/i);
    });
  });

  test.describe('Login Flow', () => {
    let testUser;

    test.beforeEach(async ({ request }) => {
      // Create a test user for login tests
      testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });
    });

    test('should successfully log in with valid credentials', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);

      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);

      await page.click('button[type="submit"]');

      // Should redirect to dashboard or show logged-in state
      await page.waitForURL(/dashboard|projects|home/, { timeout: 10000 }).catch(async () => {
        // Alternative: check for logged-in UI elements
        const logoutBtn = await page.locator('text=/logout|sign.*out/i').first();
        await expect(logoutBtn).toBeVisible({ timeout: 5000 });
      });
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);

      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', 'WrongPassword123!');

      await page.click('button[type="submit"]');

      // Should show error message
      const errorMsg = await page.locator('text=/invalid.*credential|incorrect.*password|login.*failed/i').first();
      await expect(errorMsg).toBeVisible({ timeout: 5000 });
    });

    test('should show error for non-existent user', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);

      await page.fill('input[name="email"], input[type="email"]', 'nonexistent@example.com');
      await page.fill('input[name="password"], input[type="password"]', 'SomePassword123!');

      await page.click('button[type="submit"]');

      // Should show error
      const errorMsg = await page.locator('text=/not.*found|invalid|incorrect/i').first();
      await expect(errorMsg).toBeVisible({ timeout: 5000 });
    });

    test('should maintain session after page refresh', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);

      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');

      await page.waitForLoadState('networkidle');

      // Refresh page
      await page.reload();

      // Should still be logged in (check for logout button or user info)
      const loggedInIndicator = await page.locator('text=/logout|sign.*out|profile|account/i').first();
      await expect(loggedInIndicator).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Logout Flow', () => {
    let testUser;

    test.beforeEach(async ({ page, request }) => {
      // Create and login test user
      testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      await page.goto(`${APP_BASE_URL}/login`);
      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
    });

    test('should successfully log out', async ({ page }) => {
      // Find and click logout button
      const logoutBtn = await page.locator('text=/logout|sign.*out/i').first();
      await logoutBtn.click();

      // Should redirect to login or show logged-out state
      await page.waitForURL(/login|home|\/$/, { timeout: 10000 }).catch(async () => {
        // Check for login button instead
        const loginBtn = await page.locator('text=/login|sign.*in/i').first();
        await expect(loginBtn).toBeVisible({ timeout: 5000 });
      });
    });

    test('should clear authentication state after logout', async ({ page, request }) => {
      // Logout
      const logoutBtn = await page.locator('text=/logout|sign.*out/i').first();
      await logoutBtn.click();
      await page.waitForLoadState('networkidle');

      // Try to access protected endpoint
      const response = await request.get(`${API_BASE_URL}/auth/me`);
      expect(response.status()).toBe(401);
    });
  });

  test.describe('Password Reset Flow', () => {
    let testUser;

    test.beforeEach(async ({ request }) => {
      testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });
    });

    test('should request password reset via API', async ({ request }) => {
      const response = await request.post(`${API_BASE_URL}/auth/forgot-password`, {
        data: { email: testUser.email },
      });

      expect(response.ok()).toBeTruthy();
    });

    test('should show success message after requesting reset', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/forgot-password`);

      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.click('button[type="submit"]');

      // Should show success message
      const successMsg = await page.locator('text=/check.*email|sent.*link|reset.*sent/i').first();
      await expect(successMsg).toBeVisible({ timeout: 5000 });
    });

    test('should handle non-existent email gracefully', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/forgot-password`);

      await page.fill('input[name="email"], input[type="email"]', 'nonexistent@example.com');
      await page.click('button[type="submit"]');

      // Should either show success (security) or error
      // Most apps show success to prevent email enumeration
      await page.waitForLoadState('networkidle');
      const hasMessage = await page.locator('text=/check.*email|sent|not.*found/i').first().isVisible();
      expect(hasMessage).toBeTruthy();
    });
  });

  test.describe('Session Management', () => {
    let testUser;

    test.beforeEach(async ({ request }) => {
      testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });
    });

    test('should enforce maximum concurrent sessions', async ({ browser }) => {
      const maxSessions = 3; // From .env configuration

      // Create multiple contexts (sessions)
      const contexts = [];
      for (let i = 0; i < maxSessions + 1; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(`${APP_BASE_URL}/login`);
        await page.fill('input[name="email"], input[type="email"]', testUser.email);
        await page.fill('input[name="password"], input[type="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForLoadState('networkidle');

        contexts.push({ context, page });
      }

      // The first session should be invalidated
      const firstPage = contexts[0].page;
      await firstPage.reload();

      // Check if redirected to login or shows session expired
      const isLoggedOut = await firstPage.url().includes('login') ||
        await firstPage.locator('text=/session.*expired|logged.*out/i').first().isVisible();

      expect(isLoggedOut).toBeTruthy();

      // Cleanup
      for (const { context } of contexts) {
        await context.close();
      }
    });

    test('should get current user session info', async ({ request }) => {
      // Login
      const loginResponse = await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: testUser.email,
          password: testUser.password,
        },
      });

      expect(loginResponse.ok()).toBeTruthy();

      // Get session info
      const meResponse = await request.get(`${API_BASE_URL}/auth/me`);
      expect(meResponse.ok()).toBeTruthy();

      const userData = await meResponse.json();
      expect(userData.email).toBe(testUser.email);
    });
  });

  test.describe('Token Refresh', () => {
    test('should refresh access token automatically', async ({ request }) => {
      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Login
      await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: testUser.email,
          password: testUser.password,
        },
      });

      // Attempt token refresh
      const refreshResponse = await request.post(`${API_BASE_URL}/auth/refresh-token`);

      expect(refreshResponse.ok()).toBeTruthy();

      // Should have new access token in cookies
      const cookies = refreshResponse.headers()['set-cookie'];
      expect(cookies).toContain('accessToken=');
    });
  });
});

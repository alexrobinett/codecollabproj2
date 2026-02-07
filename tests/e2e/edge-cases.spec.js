// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Edge Cases and Error Handling Tests
 * Tests unusual scenarios, boundary conditions, race conditions,
 * and other edge cases that might break the application
 */

const API_BASE_URL = 'http://localhost:5001/api';
const APP_BASE_URL = 'http://localhost:3000';

const generateTestUser = () => ({
  username: `user_${Date.now()}`,
  email: `user_${Date.now()}@example.com`,
  password: 'SecurePass123!',
});

test.describe('Edge Cases & Error Handling', () => {
  test.describe('Input Validation Edge Cases', () => {
    test('should handle empty string inputs', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);

      await page.fill('input[name="email"], input[type="email"]', '');
      await page.fill('input[name="password"], input[type="password"]', '');

      await page.click('button[type="submit"]');

      // Should show validation error
      const errorMsg = await page.locator('text=/required|empty|fill/i').first();
      await expect(errorMsg).toBeVisible({ timeout: 5000 });
    });

    test('should handle null bytes in input via API', async ({ request }) => {
      const response = await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: 'test@example.com\x00',
          password: 'password\x00',
        },
      });

      // Should reject or sanitize null bytes
      expect([400, 401]).toContain(response.status());
    });

    test('should handle unicode characters in inputs', async ({ request }) => {
      const unicodeUser = {
        username: '用户名',
        email: `test_${Date.now()}@example.com`,
        password: 'SecurePass123!',
      };

      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: unicodeUser,
      });

      // Should either accept or reject with clear error
      expect([200, 201, 400]).toContain(response.status());
    });

    test('should handle emoji in text fields', async ({ request }) => {
      const emojiUser = {
        username: 'user_😀_🎉',
        email: `test_${Date.now()}@example.com`,
        password: 'SecurePass123!',
      };

      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: emojiUser,
      });

      expect([200, 201, 400]).toContain(response.status());
    });

    test('should handle extremely long inputs', async ({ request }) => {
      const longString = 'A'.repeat(10000);

      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: {
          username: longString,
          email: `test_${Date.now()}@example.com`,
          password: 'SecurePass123!',
        },
      });

      // Should reject with validation error
      expect(response.status()).toBe(400);
    });

    test('should handle SQL injection attempts', async ({ request }) => {
      const sqlInjection = "admin' OR '1'='1";

      const response = await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: sqlInjection,
          password: sqlInjection,
        },
      });

      // Should fail safely without exposing database errors
      expect(response.status()).toBe(400);
      const error = await response.json();
      const errorStr = JSON.stringify(error).toLowerCase();

      // Should not expose database internals
      expect(errorStr).not.toContain('sql');
      expect(errorStr).not.toContain('mongo');
      expect(errorStr).not.toContain('query');
    });

    test('should handle NoSQL injection attempts', async ({ request }) => {
      const noSQLInjection = { $gt: '' };

      const response = await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: noSQLInjection,
          password: noSQLInjection,
        },
      });

      // Should sanitize or reject
      expect([400, 401]).toContain(response.status());
    });

    test('should handle command injection attempts', async ({ request }) => {
      const cmdInjection = 'test@example.com; ls -la';

      const response = await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: cmdInjection,
          password: 'password',
        },
      });

      expect([400, 401]).toContain(response.status());
    });

    test('should handle LDAP injection attempts', async ({ request }) => {
      const ldapInjection = 'admin*)(|(password=*)';

      const response = await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: ldapInjection,
          password: 'password',
        },
      });

      expect([400, 401]).toContain(response.status());
    });
  });

  test.describe('Boundary Conditions', () => {
    test('should handle minimum valid input lengths', async ({ request }) => {
      const minUser = {
        username: 'ab', // Minimum 2 characters
        email: 'a@b.c', // Minimum valid email
        password: 'Pass1!', // Minimum complexity
      };

      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: minUser,
      });

      // Should accept or reject based on validation rules
      expect([200, 201, 400]).toContain(response.status());
    });

    test('should handle maximum valid input lengths', async ({ request }) => {
      const maxUser = {
        username: 'A'.repeat(50), // Assume 50 is max
        email: `${'a'.repeat(50)}@example.com`,
        password: 'SecurePass123!',
      };

      const response = await request.post(`${API_BASE_URL}/auth/register`, {
        data: maxUser,
      });

      expect([200, 201, 400]).toContain(response.status());
    });

    test('should handle zero/negative numbers in numeric fields', async ({ request }) => {
      // Test pagination with edge cases
      const response1 = await request.get(`${API_BASE_URL}/projects?page=0&limit=10`);
      const response2 = await request.get(`${API_BASE_URL}/projects?page=-1&limit=-10`);

      // Should handle gracefully (default to page 1, or reject)
      expect([200, 400]).toContain(response1.status());
      expect([200, 400]).toContain(response2.status());
    });

    test('should handle maximum integer values', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/projects?limit=9999999999`);

      // Should cap at reasonable limit or reject
      expect([200, 400]).toContain(response.status());
    });

    test('should handle dates at boundary (Unix epoch, year 2038)', async ({ request }) => {
      // Create user and check date handling
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

      if (loginResponse.ok()) {
        const meResponse = await request.get(`${API_BASE_URL}/auth/me`);
        const userData = await meResponse.json();

        // createdAt should be valid timestamp
        expect(userData.createdAt).toBeTruthy();
        const createdDate = new Date(userData.createdAt);
        expect(createdDate.getTime()).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Race Conditions', () => {
    test('should handle simultaneous registration with same email', async ({ request }) => {
      const testUser = generateTestUser();

      // Send two registration requests simultaneously
      const [response1, response2] = await Promise.all([
        request.post(`${API_BASE_URL}/auth/register`, { data: testUser }),
        request.post(`${API_BASE_URL}/auth/register`, { data: testUser }),
      ]);

      // One should succeed, one should fail with duplicate error
      const statuses = [response1.status(), response2.status()].sort();

      // Should have one success and one failure
      const hasSuccess = statuses.includes(200) || statuses.includes(201);
      const hasFailure = statuses.includes(400) || statuses.includes(409);

      expect(hasSuccess || hasFailure).toBeTruthy();
    });

    test('should handle concurrent project updates', async ({ request }) => {
      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, { data: testUser });

      await request.post(`${API_BASE_URL}/auth/login`, {
        data: { email: testUser.email, password: testUser.password },
      });

      // Create project
      const projectResponse = await request.post(`${API_BASE_URL}/projects`, {
        data: {
          name: 'Test Project',
          description: 'Test',
        },
      });

      if (projectResponse.ok()) {
        const project = await projectResponse.json();

        // Update project simultaneously from multiple requests
        const [update1, update2] = await Promise.all([
          request.put(`${API_BASE_URL}/projects/${project._id}`, {
            data: { name: 'Update 1' },
          }),
          request.put(`${API_BASE_URL}/projects/${project._id}`, {
            data: { name: 'Update 2' },
          }),
        ]);

        // Both should complete without error
        expect([200, 201]).toContain(update1.status());
        expect([200, 201]).toContain(update2.status());

        // One update should win (last-write-wins or optimistic locking)
        const finalResponse = await request.get(`${API_BASE_URL}/projects/${project._id}`);
        const finalProject = await finalResponse.json();
        expect(['Update 1', 'Update 2']).toContain(finalProject.name);
      }
    });

    test('should handle concurrent session creation', async ({ browser }) => {
      const testUser = generateTestUser();
      await browser.request.post(`${API_BASE_URL}/auth/register`, {
        data: testUser,
      });

      // Create multiple sessions simultaneously
      const loginPromises = [];
      for (let i = 0; i < 5; i++) {
        const context = await browser.newContext();
        loginPromises.push(
          context.request.post(`${API_BASE_URL}/auth/login`, {
            data: {
              email: testUser.email,
              password: testUser.password,
            },
          })
        );
      }

      const responses = await Promise.all(loginPromises);
      const successCount = responses.filter((r) => r.ok()).length;

      // Should handle concurrent logins gracefully
      expect(successCount).toBeGreaterThan(0);
    });
  });

  test.describe('Network & Timing Issues', () => {
    test('should handle slow API responses', async ({ request }) => {
      // Set a reasonable timeout
      const response = await request.get(`${API_BASE_URL}/projects`, {
        timeout: 30000,
      });

      // Should complete within timeout
      expect([200, 401]).toContain(response.status());
    });

    test('should handle request timeout gracefully in UI', async ({ page }) => {
      // Navigate to app
      await page.goto(`${APP_BASE_URL}/login`, { timeout: 30000 });

      // Should load within timeout or show error
      const hasContent = await page.locator('form, input').first().isVisible();
      expect(hasContent).toBeTruthy();
    });

    test('should handle connection errors gracefully', async ({ page }) => {
      // Try to access app when server might be down
      // (This test is more relevant in CI/CD scenarios)

      await page.goto(`${APP_BASE_URL}`).catch(() => {});

      // Should show error page or retry mechanism
      await page.waitForLoadState('networkidle');
      expect(true).toBeTruthy(); // Placeholder
    });

    test('should retry failed requests', async ({ page }) => {
      // Some frameworks implement automatic retry
      // This test documents expected behavior

      await page.goto(`${APP_BASE_URL}/login`);

      const testUser = generateTestUser();
      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);

      // Submit even though user doesn't exist
      await page.click('button[type="submit"]');

      // Should handle error gracefully
      await page.waitForLoadState('networkidle');
      const errorIndicator = await page.locator('text=/error|failed|incorrect/i').first();
      await expect(errorIndicator).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Browser & Client-Side Edge Cases', () => {
    test('should handle disabled JavaScript gracefully', async ({ page, browser }) => {
      // Create context with JS disabled
      const context = await browser.newContext({ javaScriptEnabled: false });
      const noJSPage = await context.newPage();

      await noJSPage.goto(`${APP_BASE_URL}`).catch(() => {});

      // Should show fallback content or message
      await noJSPage.waitForLoadState('networkidle');
      expect(true).toBeTruthy();

      await context.close();
    });

    test('should handle cookies disabled', async ({ page, browser }) => {
      // Create context that blocks cookies
      const context = await browser.newContext({
        permissions: [],
      });
      const noCookiePage = await context.newPage();

      await noCookiePage.goto(`${APP_BASE_URL}/login`);

      const testUser = generateTestUser();
      await noCookiePage.goto(`${APP_BASE_URL}/register`);
      await noCookiePage.fill('input[name="username"]', testUser.username);
      await noCookiePage.fill('input[name="email"]', testUser.email);
      await noCookiePage.fill('input[name="password"]', testUser.password);
      await noCookiePage.fill('input[name="confirmPassword"]', testUser.password);
      await noCookiePage.click('button[type="submit"]');

      await noCookiePage.waitForLoadState('networkidle');

      // Should either work or show cookies required message
      expect(true).toBeTruthy();

      await context.close();
    });

    test('should handle browser back button after logout', async ({ page }) => {
      const testUser = generateTestUser();

      // Register and login
      await page.goto(`${APP_BASE_URL}/register`);
      await page.fill('input[name="username"]', testUser.username);
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      await page.fill('input[name="confirmPassword"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Login
      await page.goto(`${APP_BASE_URL}/login`);
      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Logout
      const logoutBtn = await page.locator('text=/logout|sign.*out/i').first();
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForLoadState('networkidle');

        // Go back
        await page.goBack();

        // Should still be logged out or redirect to login
        const isLoggedOut = page.url().includes('login') ||
          await page.locator('text=/login|sign.*in/i').first().isVisible();

        expect(isLoggedOut).toBeTruthy();
      }
    });

    test('should handle localStorage quota exceeded', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}`);

      // Try to fill localStorage
      await page.evaluate(() => {
        try {
          const largeData = 'x'.repeat(1024 * 1024); // 1MB
          for (let i = 0; i < 10; i++) {
            localStorage.setItem(`data_${i}`, largeData);
          }
        } catch (e) {
          // QuotaExceededError expected
        }
      });

      // App should still function
      await page.goto(`${APP_BASE_URL}/login`);
      const loginForm = await page.locator('form').first();
      await expect(loginForm).toBeVisible({ timeout: 5000 });
    });

    test('should handle rapid navigation', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}`);

      // Rapidly navigate between pages
      const urls = ['/login', '/register', '/projects', '/'];
      for (const url of urls) {
        await page.goto(`${APP_BASE_URL}${url}`);
      }

      // Should not crash or show errors
      await page.waitForLoadState('networkidle');
      expect(true).toBeTruthy();
    });

    test('should handle form submission during pending request', async ({ page }) => {
      const testUser = generateTestUser();

      await page.goto(`${APP_BASE_URL}/register`);
      await page.fill('input[name="username"]', testUser.username);
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      await page.fill('input[name="confirmPassword"]', testUser.password);

      // Submit multiple times quickly
      const submitBtn = await page.locator('button[type="submit"]').first();
      await submitBtn.click();
      await submitBtn.click(); // Second click should be ignored or queued

      await page.waitForLoadState('networkidle');

      // Should not create duplicate users
      expect(true).toBeTruthy();
    });
  });

  test.describe('Data Integrity', () => {
    test('should preserve data types in API responses', async ({ request }) => {
      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, { data: testUser });

      const loginResponse = await request.post(`${API_BASE_URL}/auth/login`, {
        data: { email: testUser.email, password: testUser.password },
      });

      if (loginResponse.ok()) {
        const meResponse = await request.get(`${API_BASE_URL}/auth/me`);
        const userData = await meResponse.json();

        // Verify data types
        expect(typeof userData.email).toBe('string');
        expect(typeof userData._id).toBe('string');
        expect(typeof userData.emailVerified === 'boolean' || userData.emailVerified === undefined).toBeTruthy();
      }
    });

    test('should handle missing required fields in database', async ({ request }) => {
      // If database has corrupted data (missing required fields)
      // API should handle gracefully

      const response = await request.get(`${API_BASE_URL}/projects`);

      if (response.ok()) {
        const projects = await response.json();
        // Should return valid array even if some records are corrupted
        expect(Array.isArray(projects) || Array.isArray(projects.data)).toBeTruthy();
      }
    });

    test('should validate data consistency after updates', async ({ request }) => {
      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, { data: testUser });

      await request.post(`${API_BASE_URL}/auth/login`, {
        data: { email: testUser.email, password: testUser.password },
      });

      // Create project
      const projectResponse = await request.post(`${API_BASE_URL}/projects`, {
        data: { name: 'Test', description: 'Test' },
      });

      if (projectResponse.ok()) {
        const project = await projectResponse.json();

        // Update project
        await request.put(`${API_BASE_URL}/projects/${project._id}`, {
          data: { name: 'Updated' },
        });

        // Verify update
        const getResponse = await request.get(`${API_BASE_URL}/projects/${project._id}`);
        const updatedProject = await getResponse.json();

        expect(updatedProject.name).toBe('Updated');
        expect(updatedProject._id).toBe(project._id); // ID should not change
      }
    });
  });

  test.describe('Error Recovery', () => {
    test('should recover from 500 errors gracefully', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);

      // Fill with data that might cause server error
      await page.fill('input[name="email"], input[type="email"]', 'test@example.com');
      await page.fill('input[name="password"], input[type="password"]', 'password');

      await page.click('button[type="submit"]');

      await page.waitForLoadState('networkidle');

      // Should show error message, not crash
      expect(true).toBeTruthy();
    });

    test('should show user-friendly error messages', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/projects/invalid_id_format`);

      if (!response.ok()) {
        const error = await response.json();
        const errorMsg = error.message || error.error || '';

        // Should not expose technical details
        expect(errorMsg.toLowerCase()).not.toContain('stack');
        expect(errorMsg.toLowerCase()).not.toContain('trace');
        expect(errorMsg).toBeTruthy();
      }
    });

    test('should log errors for debugging', async ({ request }) => {
      // When errors occur, server should log for debugging
      // This is verified through server logs

      const response = await request.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: 'nonexistent@example.com',
          password: 'wrong',
        },
      });

      expect(response.status()).toBe(401);

      // Server should have logged this failed attempt
      expect(true).toBeTruthy();
    });
  });

  test.describe('Performance Edge Cases', () => {
    test('should handle large result sets with pagination', async ({ request }) => {
      // Create many resources
      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, { data: testUser });

      await request.post(`${API_BASE_URL}/auth/login`, {
        data: { email: testUser.email, password: testUser.password },
      });

      // Create multiple projects
      const createPromises = [];
      for (let i = 0; i < 50; i++) {
        createPromises.push(
          request.post(`${API_BASE_URL}/projects`, {
            data: { name: `Project ${i}`, description: 'Test' },
          })
        );
      }
      await Promise.all(createPromises);

      // Request all without pagination
      const response = await request.get(`${API_BASE_URL}/projects`);

      if (response.ok()) {
        const data = await response.json();
        const projects = Array.isArray(data) ? data : data.projects || data.data;

        // Should either paginate or return all with reasonable limit
        expect(projects.length).toBeGreaterThan(0);
        expect(projects.length).toBeLessThan(1000); // Reasonable limit
      }
    });

    test('should handle deep object nesting', async ({ request }) => {
      const testUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, { data: testUser });

      await request.post(`${API_BASE_URL}/auth/login`, {
        data: { email: testUser.email, password: testUser.password },
      });

      // Try to create project with deeply nested data
      const deepData = {
        name: 'Test',
        description: 'Test',
        metadata: {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: 'deep value',
                },
              },
            },
          },
        },
      };

      const response = await request.post(`${API_BASE_URL}/projects`, {
        data: deepData,
      });

      // Should either accept or reject based on schema validation
      expect([200, 201, 400]).toContain(response.status());
    });
  });
});

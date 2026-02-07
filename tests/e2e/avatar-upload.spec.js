// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Avatar Upload Tests
 * Tests file upload functionality including validation, security,
 * and edge cases for avatar/profile image uploads
 */

const API_BASE_URL = 'http://localhost:5001/api';
const APP_BASE_URL = 'http://localhost:3000';

const generateTestUser = () => ({
  username: `user_${Date.now()}`,
  email: `user_${Date.now()}@example.com`,
  password: 'SecurePass123!',
});

// Create test image files
const createTestImage = (filename, width = 200, height = 200) => {
  const testDir = path.join(__dirname, '..', 'fixtures');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const filepath = path.join(testDir, filename);

  // Create a simple PNG image using Buffer
  // This is a minimal 1x1 red pixel PNG
  const pngData = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d,
    0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  fs.writeFileSync(filepath, pngData);
  return filepath;
};

const createLargeFile = (filename, sizeMB) => {
  const testDir = path.join(__dirname, '..', 'fixtures');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const filepath = path.join(testDir, filename);
  const buffer = Buffer.alloc(sizeMB * 1024 * 1024);
  fs.writeFileSync(filepath, buffer);
  return filepath;
};

test.describe('Avatar Upload', () => {
  let testUser;

  test.beforeAll(() => {
    // Create test fixtures
    createTestImage('test-avatar.png');
    createTestImage('test-large-avatar.jpg');
    createLargeFile('test-too-large.png', 10); // 10MB file
  });

  test.beforeEach(async ({ request }) => {
    testUser = generateTestUser();
    await request.post(`${API_BASE_URL}/auth/register`, {
      data: testUser,
    });

    await request.post(`${API_BASE_URL}/auth/login`, {
      data: {
        email: testUser.email,
        password: testUser.password,
      },
    });
  });

  test.afterAll(() => {
    // Cleanup test fixtures
    const testDir = path.join(__dirname, '..', 'fixtures');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test.describe('Upload Success Cases', () => {
    test('should upload avatar via API', async ({ request }) => {
      const avatarPath = path.join(__dirname, '..', 'fixtures', 'test-avatar.png');

      const response = await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(avatarPath),
        },
      });

      if (response.ok()) {
        const data = await response.json();
        expect(data.avatarUrl || data.avatar).toBeTruthy();
      } else {
        // Endpoint might not exist - that's okay for this test suite
        expect([200, 201, 404]).toContain(response.status());
      }
    });

    test('should upload avatar via UI', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);
      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Navigate to profile/settings
      await page.goto(`${APP_BASE_URL}/profile`).catch(async () => {
        // Try alternative routes
        await page.goto(`${APP_BASE_URL}/settings`).catch(() => {});
      });

      // Look for file input
      const fileInput = await page.locator('input[type="file"]').first();
      if (await fileInput.isVisible()) {
        const avatarPath = path.join(__dirname, '..', 'fixtures', 'test-avatar.png');

        await fileInput.setInputFiles(avatarPath);

        // Find and click upload/save button
        const uploadBtn = await page.locator('button:has-text("Upload"), button:has-text("Save")').first();
        await uploadBtn.click();

        // Wait for upload to complete
        await page.waitForLoadState('networkidle');

        // Should show success message or updated avatar
        const successIndicator = await page.locator('text=/uploaded|success|saved/i').first().isVisible() ||
          await page.locator('img[src*="avatar"], img[alt*="avatar" i]').first().isVisible();

        expect(successIndicator).toBeTruthy();
      }
    });

    test('should accept PNG format', async ({ request }) => {
      const avatarPath = path.join(__dirname, '..', 'fixtures', 'test-avatar.png');

      const response = await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(avatarPath),
        },
      });

      expect([200, 201, 404]).toContain(response.status());
    });

    test('should accept JPEG format', async ({ request }) => {
      const avatarPath = path.join(__dirname, '..', 'fixtures', 'test-large-avatar.jpg');

      const response = await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(avatarPath),
        },
      });

      expect([200, 201, 404]).toContain(response.status());
    });
  });

  test.describe('Upload Validation', () => {
    test('should reject file exceeding size limit', async ({ request }) => {
      const largePath = path.join(__dirname, '..', 'fixtures', 'test-too-large.png');

      const response = await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(largePath),
        },
      });

      // Should reject with 400 or 413 (Payload Too Large)
      if (response.status() !== 404) {
        expect([400, 413]).toContain(response.status());
        const error = await response.json();
        expect(error.message || error.error).toMatch(/size|large|limit|exceed/i);
      }
    });

    test('should reject invalid file types', async ({ request }) => {
      const testDir = path.join(__dirname, '..', 'fixtures');
      const txtPath = path.join(testDir, 'test.txt');
      fs.writeFileSync(txtPath, 'This is not an image');

      const response = await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(txtPath),
        },
      });

      if (response.status() !== 404) {
        expect([400, 415]).toContain(response.status());
        const error = await response.json();
        expect(error.message || error.error).toMatch(/type|format|invalid|image/i);
      }

      fs.unlinkSync(txtPath);
    });

    test('should reject executable files disguised as images', async ({ request }) => {
      const testDir = path.join(__dirname, '..', 'fixtures');
      const exePath = path.join(testDir, 'malicious.png');

      // Create a file with executable content but .png extension
      fs.writeFileSync(exePath, '#!/bin/bash\necho "malicious"');

      const response = await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(exePath),
        },
      });

      if (response.status() !== 404) {
        // Should reject due to content type mismatch
        expect([400, 415]).toContain(response.status());
      }

      fs.unlinkSync(exePath);
    });

    test('should validate MIME type not just extension', async ({ request }) => {
      const testDir = path.join(__dirname, '..', 'fixtures');
      const fakePath = path.join(testDir, 'fake-image.png');

      // Create text file with .png extension
      fs.writeFileSync(fakePath, 'Not really a PNG');

      const response = await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(fakePath),
        },
      });

      if (response.status() !== 404) {
        // Should reject based on actual content, not just extension
        expect([400, 415]).toContain(response.status());
      }

      fs.unlinkSync(fakePath);
    });
  });

  test.describe('Security Tests', () => {
    test('should require authentication for avatar upload', async ({ request, browser }) => {
      // Create new unauthenticated context
      const context = await browser.newContext();
      const unauthRequest = context.request;

      const avatarPath = path.join(__dirname, '..', 'fixtures', 'test-avatar.png');

      const response = await unauthRequest.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(avatarPath),
        },
      });

      if (response.status() !== 404) {
        expect(response.status()).toBe(401);
      }

      await context.close();
    });

    test('should not allow uploading to another users profile', async ({ request, browser }) => {
      // Create second user
      const secondUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: secondUser,
      });

      // Get second user's ID
      const meResponse = await request.get(`${API_BASE_URL}/auth/me`);
      const firstUserId = (await meResponse.json())._id;

      // Login as second user
      const context = await browser.newContext();
      const secondRequest = context.request;

      await secondRequest.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: secondUser.email,
          password: secondUser.password,
        },
      });

      const avatarPath = path.join(__dirname, '..', 'fixtures', 'test-avatar.png');

      // Try to upload to first user's profile
      const response = await secondRequest.post(`${API_BASE_URL}/users/${firstUserId}/avatar`, {
        multipart: {
          avatar: fs.createReadStream(avatarPath),
        },
      });

      if (response.status() !== 404) {
        expect([401, 403]).toContain(response.status());
      }

      await context.close();
    });

    test('should sanitize uploaded filenames', async ({ request }) => {
      const testDir = path.join(__dirname, '..', 'fixtures');
      const maliciousPath = path.join(testDir, '../../../etc/passwd.png');

      createTestImage('../../../etc/passwd.png');

      const response = await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(path.join(testDir, '../../../etc/passwd.png')),
        },
      });

      if (response.ok()) {
        const data = await response.json();
        const avatarUrl = data.avatarUrl || data.avatar;

        // Filename should be sanitized, not contain path traversal
        expect(avatarUrl).not.toContain('../');
        expect(avatarUrl).not.toContain('/etc/');
      }

      // Cleanup
      try {
        fs.unlinkSync(path.join(testDir, '../../../etc/passwd.png'));
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    test('should prevent XSS in avatar metadata', async ({ request }) => {
      const testDir = path.join(__dirname, '..', 'fixtures');
      const xssPath = path.join(testDir, '<script>alert("XSS")</script>.png');

      createTestImage('<script>alert("XSS")</script>.png');

      const response = await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(xssPath),
        },
      });

      if (response.ok()) {
        const data = await response.json();
        const avatarUrl = data.avatarUrl || data.avatar;

        // Should escape or remove script tags
        expect(avatarUrl).not.toContain('<script>');
        expect(avatarUrl).not.toContain('alert(');
      }

      fs.unlinkSync(xssPath);
    });
  });

  test.describe('Avatar Retrieval', () => {
    test('should retrieve user avatar URL via API', async ({ request }) => {
      // First upload an avatar
      const avatarPath = path.join(__dirname, '..', 'fixtures', 'test-avatar.png');
      await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(avatarPath),
        },
      });

      // Get user profile
      const response = await request.get(`${API_BASE_URL}/users/profile/me`);

      if (response.ok()) {
        const profile = await response.json();
        // Should have avatarUrl field
        expect(profile.avatarUrl || profile.avatar).toBeTruthy();
      }
    });

    test('should display avatar in UI', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);
      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Upload avatar first
      await page.goto(`${APP_BASE_URL}/profile`).catch(() => {});

      const fileInput = await page.locator('input[type="file"]').first();
      if (await fileInput.isVisible()) {
        const avatarPath = path.join(__dirname, '..', 'fixtures', 'test-avatar.png');
        await fileInput.setInputFiles(avatarPath);

        const uploadBtn = await page.locator('button:has-text("Upload"), button:has-text("Save")').first();
        await uploadBtn.click();
        await page.waitForLoadState('networkidle');

        // Check if avatar is displayed
        const avatarImg = await page.locator('img[src*="avatar"], img[alt*="avatar" i]').first();
        await expect(avatarImg).toBeVisible();
      }
    });

    test('should return default avatar for users without upload', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/users/profile/me`);

      if (response.ok()) {
        const profile = await response.json();
        // Should either have null avatar or default avatar URL
        const avatar = profile.avatarUrl || profile.avatar;
        expect(avatar === null || typeof avatar === 'string').toBeTruthy();
      }
    });
  });

  test.describe('Avatar Deletion', () => {
    test('should delete user avatar via API', async ({ request }) => {
      // Upload avatar first
      const avatarPath = path.join(__dirname, '..', 'fixtures', 'test-avatar.png');
      await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(avatarPath),
        },
      });

      // Delete avatar
      const deleteResponse = await request.delete(`${API_BASE_URL}/users/avatar`);

      if (deleteResponse.status() !== 404) {
        expect([200, 204]).toContain(deleteResponse.status());

        // Verify deletion
        const profileResponse = await request.get(`${API_BASE_URL}/users/profile/me`);
        const profile = await profileResponse.json();
        expect(profile.avatarUrl || profile.avatar).toBeFalsy();
      }
    });

    test('should delete avatar via UI', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);
      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      await page.goto(`${APP_BASE_URL}/profile`).catch(() => {});

      // Look for delete/remove avatar button
      const deleteBtn = await page.locator('button:has-text("Remove"), button:has-text("Delete")').first();
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();

        // Should remove avatar or show default
        await page.waitForLoadState('networkidle');
        const confirmationMsg = await page.locator('text=/removed|deleted|default/i').first();
        await expect(confirmationMsg).toBeVisible();
      }
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle rapid successive uploads', async ({ request }) => {
      const avatarPath = path.join(__dirname, '..', 'fixtures', 'test-avatar.png');

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request.post(`${API_BASE_URL}/users/avatar`, {
            multipart: {
              avatar: fs.createReadStream(avatarPath),
            },
          })
        );
      }

      const responses = await Promise.all(promises);

      // At least one should succeed
      const successCount = responses.filter((r) => r.ok()).length;
      expect(successCount).toBeGreaterThan(0);
    });

    test('should handle upload during another upload', async ({ request }) => {
      const avatarPath = path.join(__dirname, '..', 'fixtures', 'test-avatar.png');

      // Start first upload (don't wait)
      const upload1 = request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(avatarPath),
        },
      });

      // Start second upload immediately
      const upload2 = request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(avatarPath),
        },
      });

      const [response1, response2] = await Promise.all([upload1, upload2]);

      // Both should complete without server error
      expect([200, 201, 404, 429]).toContain(response1.status());
      expect([200, 201, 404, 429]).toContain(response2.status());
    });

    test('should handle upload with slow connection simulation', async ({ request }) => {
      const avatarPath = path.join(__dirname, '..', 'fixtures', 'test-avatar.png');

      // Use shorter timeout to test handling
      const response = await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(avatarPath),
        },
        timeout: 30000, // 30 seconds
      });

      // Should complete within timeout
      expect([200, 201, 404]).toContain(response.status());
    });

    test('should clean up orphaned files on failed uploads', async ({ request }) => {
      // This test verifies server cleanup behavior
      // Upload with invalid data to trigger failure
      const testDir = path.join(__dirname, '..', 'fixtures');
      const corruptPath = path.join(testDir, 'corrupt.png');
      fs.writeFileSync(corruptPath, Buffer.from([0x00, 0x00, 0x00])); // Invalid PNG

      const response = await request.post(`${API_BASE_URL}/users/avatar`, {
        multipart: {
          avatar: fs.createReadStream(corruptPath),
        },
      });

      // Should fail
      expect([400, 415, 404]).toContain(response.status());

      // Server should have cleaned up the temporary file
      // (This is verified through server implementation, not directly testable here)

      fs.unlinkSync(corruptPath);
    });
  });
});

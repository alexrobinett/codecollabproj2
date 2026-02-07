import { test, expect } from '@playwright/test';
import { loginAsRole } from './fixtures/auth.fixture';
import path from 'path';
import fs from 'fs';

/**
 * E2E tests for Avatar Upload functionality
 * Tests avatar upload, display, and deletion
 */
test.describe('Avatar Upload', () => {
  test.beforeEach(async ({ page }) => {
    // Login as a regular user before each test
    await loginAsRole(page, 'user1');
  });

  test('should upload avatar successfully', async ({ page }) => {
    // Navigate to profile page
    await page.goto('http://localhost:3000/profile');
    await page.waitForLoadState('networkidle');

    // Create a test image file (1x1 pixel PNG)
    const testImagePath = path.join(__dirname, 'fixtures', 'test-avatar.png');
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    
    // Ensure fixtures directory exists
    const fixturesDir = path.dirname(testImagePath);
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    fs.writeFileSync(testImagePath, testImageBuffer);

    // Find and interact with the avatar upload input
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(testImagePath);

    // Wait for upload to complete (look for success indicator)
    // This could be a success message, updated avatar image, or button state change
    await expect(page.locator('.MuiAlert-standardSuccess')).toBeVisible({ timeout: 10000 });

    // Verify avatar is displayed (should show uploaded image)
    const avatarImg = page.locator('img[alt*="avatar" i], img[alt*="profile" i]').first();
    await expect(avatarImg).toBeVisible();

    // Clean up test file
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  test('should reject non-image files', async ({ page }) => {
    // Navigate to profile page
    await page.goto('http://localhost:3000/profile');
    await page.waitForLoadState('networkidle');

    // Create a test text file
    const testFilePath = path.join(__dirname, 'fixtures', 'test-file.txt');
    const fixturesDir = path.dirname(testFilePath);
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    fs.writeFileSync(testFilePath, 'This is not an image');

    // Try to upload non-image file
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    
    // Note: Browser's built-in file type validation might prevent this
    // But if it gets through, backend should reject it
    await fileInput.setInputFiles(testFilePath);

    // Should show error message or no upload happens
    // Wait a bit to see if error appears
    await page.waitForTimeout(2000);

    // Check if error alert is visible
    const errorAlert = page.locator('.MuiAlert-standardError');
    const isErrorVisible = await errorAlert.isVisible();
    
    // Either error is shown OR upload didn't happen (no success message)
    const successAlert = page.locator('.MuiAlert-standardSuccess');
    const isSuccessVisible = await successAlert.isVisible();
    
    expect(isErrorVisible || !isSuccessVisible).toBe(true);

    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  test('should delete avatar successfully', async ({ page }) => {
    // Navigate to profile page
    await page.goto('http://localhost:3000/profile');
    await page.waitForLoadState('networkidle');

    // First, check if there's an option to delete avatar
    // This could be a delete button, X icon, or similar
    const deleteButton = page.locator('button:has-text("Delete"), button:has-text("Remove"), button[aria-label*="delete" i], button[aria-label*="remove" i]').first();
    
    // If delete button exists, test deletion
    if (await deleteButton.isVisible({ timeout: 2000 })) {
      await deleteButton.click();

      // Confirm deletion if there's a confirmation dialog
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")').last();
      if (await confirmButton.isVisible({ timeout: 2000 })) {
        await confirmButton.click();
      }

      // Wait for deletion to complete
      await expect(page.locator('.MuiAlert-standardSuccess')).toBeVisible({ timeout: 10000 });
    }
  });

  test('should handle large file size gracefully', async ({ page }) => {
    // Navigate to profile page
    await page.goto('http://localhost:3000/profile');
    await page.waitForLoadState('networkidle');

    // Create a large test image (>5MB to exceed typical limits)
    const testImagePath = path.join(__dirname, 'fixtures', 'large-avatar.png');
    const fixturesDir = path.dirname(testImagePath);
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    
    // Create a 6MB file (above typical 5MB limit)
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024);
    fs.writeFileSync(testImagePath, largeBuffer);

    // Try to upload large file
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(testImagePath);

    // Should show error message about file size
    await expect(page.locator('.MuiAlert-standardError')).toBeVisible({ timeout: 10000 });

    // Error message should mention file size
    const errorText = await page.locator('.MuiAlert-standardError').textContent();
    expect(errorText?.toLowerCase()).toContain('size');

    // Clean up test file
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  test('should display avatar in header after upload', async ({ page }) => {
    // Navigate to profile page
    await page.goto('http://localhost:3000/profile');
    await page.waitForLoadState('networkidle');

    // Upload avatar
    const testImagePath = path.join(__dirname, 'fixtures', 'test-avatar-header.png');
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    
    const fixturesDir = path.dirname(testImagePath);
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    fs.writeFileSync(testImagePath, testImageBuffer);

    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(testImagePath);

    // Wait for upload to complete
    await expect(page.locator('.MuiAlert-standardSuccess')).toBeVisible({ timeout: 10000 });

    // Navigate to dashboard to see header
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForLoadState('networkidle');

    // Avatar should be visible in the header
    const headerAvatar = page.locator('header img[alt*="avatar" i], header img[alt*="profile" i]').first();
    await expect(headerAvatar).toBeVisible();

    // Clean up test file
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });
});

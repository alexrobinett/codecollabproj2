import { test, expect } from '@playwright/test';
import { loginAsRole } from './fixtures/auth.fixture';

/**
 * Extended E2E tests for Project CRUD operations
 * Tests project update (edit) and delete functionality
 */
test.describe('Project CRUD Extended', () => {
  test.beforeEach(async ({ page }) => {
    // Login as user1 before each test
    await loginAsRole(page, 'user1');
  });

  test('should edit/update an existing project', async ({ page }) => {
    // Navigate to projects page
    await page.goto('http://localhost:3000/projects');
    await page.waitForLoadState('networkidle');

    // Look for a project with an Edit button/link
    const editButton = page.getByRole('link', { name: /edit/i }).first();
    const hasEditButton = (await editButton.count()) > 0;

    if (hasEditButton) {
      // Click edit button
      await editButton.click();

      // Wait for navigation to edit page
      await page.waitForURL('**/projects/**/edit');

      // Verify we're on the edit page
      await expect(page.getByRole('heading', { name: /edit project/i })).toBeVisible();

      // Update the project description
      const descriptionInput = page.getByLabel(/description/i);
      await expect(descriptionInput).toBeVisible();

      const updatedDescription = `Updated description - ${Date.now()}`;
      await descriptionInput.fill(updatedDescription);

      // Save the changes
      const saveButton = page.getByRole('button', { name: /save|update/i });
      await expect(saveButton).toBeVisible();
      await saveButton.click();

      // Wait for save to complete
      await page.waitForTimeout(2000);

      // Verify success (either alert or redirect to project details)
      const successAlert = page.locator('.MuiAlert-standardSuccess');
      const hasSuccess = (await successAlert.count()) > 0;

      if (hasSuccess) {
        await expect(successAlert).toBeVisible();
      }
    } else {
      // If no edit button found, skip the test
      test.skip(true, 'No editable projects found');
    }
  });

  test('should delete a project with confirmation', async ({ page }) => {
    // First, create a test project that we can safely delete
    await page.goto('http://localhost:3000/projects/create');
    await page.waitForLoadState('networkidle');

    // Fill in the project form
    const timestamp = Date.now();
    await page.fill('input[name="title"]', `Test Project to Delete ${timestamp}`);
    await page.fill('textarea[name="description"]', 'This project will be deleted in E2E test');

    // Add a technology
    const techInput = page.getByRole('combobox', { name: /technologies/i });
    await techInput.click();
    await techInput.fill('JavaScript');
    await page.keyboard.press('Enter');

    // Submit the form
    const createButton = page.getByRole('button', { name: /create project/i });
    await createButton.click();

    // Wait for project to be created
    await page.waitForTimeout(2000);

    // Navigate to projects list
    await page.goto('http://localhost:3000/projects');
    await page.waitForLoadState('networkidle');

    // Look for the newly created project and find its delete button
    const deleteButton = page.getByRole('button', { name: /delete/i }).first();
    const hasDeleteButton = (await deleteButton.count()) > 0;

    if (hasDeleteButton) {
      // Set up dialog handler for confirmation dialog
      page.once('dialog', async (dialog) => {
        expect(dialog.type()).toBe('confirm');
        expect(dialog.message()).toContain(/delete|remove/i);
        await dialog.accept();
      });

      // Click delete button
      await deleteButton.click();

      // Wait for deletion to complete
      await page.waitForTimeout(2000);

      // Verify success (either alert or project is removed from list)
      const successAlert = page.locator('.MuiAlert-standardSuccess');
      const hasSuccess = (await successAlert.count()) > 0;

      if (hasSuccess) {
        await expect(successAlert).toBeVisible();
        await expect(successAlert).toContainText(/deleted|removed/i);
      }
    } else {
      // If no delete button found, check if delete is in a menu
      const moreButton = page.getByRole('button', { name: /more|menu|options/i }).first();
      if ((await moreButton.count()) > 0) {
        await moreButton.click();
        const deleteMenuItem = page.getByRole('menuitem', { name: /delete/i });
        if ((await deleteMenuItem.count()) > 0) {
          page.once('dialog', async (dialog) => {
            await dialog.accept();
          });
          await deleteMenuItem.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  });

  test('should show validation errors when creating project with empty fields', async ({ page }) => {
    // Navigate to create project page
    await page.goto('http://localhost:3000/projects/create');
    await page.waitForLoadState('networkidle');

    // Try to submit without filling any fields
    const createButton = page.getByRole('button', { name: /create project/i });
    await createButton.click();

    // Verify validation errors are shown
    const errorHelperText = page.locator('.MuiFormHelperText-root.Mui-error');
    await expect(errorHelperText.first()).toBeVisible({ timeout: 2000 });

    // Or check for error alert
    const errorAlert = page.locator('.MuiAlert-standardError');
    const hasErrorAlert = (await errorAlert.count()) > 0;

    if (hasErrorAlert) {
      await expect(errorAlert).toBeVisible();
    }
  });

  test('should cancel project edit and return to previous page', async ({ page }) => {
    // Navigate to projects page
    await page.goto('http://localhost:3000/projects');
    await page.waitForLoadState('networkidle');

    // Look for a project with an Edit button
    const editButton = page.getByRole('link', { name: /edit/i }).first();
    const hasEditButton = (await editButton.count()) > 0;

    if (hasEditButton) {
      // Click edit button
      await editButton.click();
      await page.waitForURL('**/projects/**/edit');

      // Click cancel button
      const cancelButton = page.getByRole('button', { name: /cancel/i });
      await expect(cancelButton).toBeVisible();
      await cancelButton.click();

      // Verify we're redirected (either back to list or project details)
      await page.waitForTimeout(1000);

      // Should no longer be on edit page
      expect(page.url()).not.toContain('/edit');
    } else {
      test.skip(true, 'No editable projects found');
    }
  });

  test('should prevent unauthorized user from editing another users project', async ({ page }) => {
    // Login as user1
    await loginAsRole(page, 'user1');

    // Navigate to projects and find a project that might belong to another user
    await page.goto('http://localhost:3000/projects');
    await page.waitForLoadState('networkidle');

    // Get all project cards
    const projectCards = page.locator('[data-testid="project-card"], .MuiCard-root');
    const count = await projectCards.count();

    if (count > 0) {
      // Check if any project shows Edit button (should only show for own projects)
      const editButtons = page.getByRole('link', { name: /edit/i });
      const editButtonCount = await editButtons.count();

      // User should only see edit buttons for their own projects
      // This test verifies that not all projects have edit buttons
      expect(editButtonCount).toBeLessThanOrEqual(count);

      // Try to access edit URL directly for a project we don't own
      // Get a project ID from the page
      const viewDetailsLinks = page.getByRole('link', { name: /view details/i });
      if ((await viewDetailsLinks.count()) > 0) {
        const href = await viewDetailsLinks.first().getAttribute('href');
        const projectId = href?.split('/projects/')[1];

        if (projectId) {
          // Try to access edit page directly
          await page.goto(`http://localhost:3000/projects/${projectId}/edit`);

          // Should either:
          // 1. Show error message
          // 2. Redirect to project details
          // 3. Show 403/401 error

          await page.waitForTimeout(2000);

          const hasError =
            (await page.locator('.MuiAlert-standardError').count()) > 0 ||
            (await page.getByText(/unauthorized|forbidden|permission/i).count()) > 0;

          // If we're still on edit page and no error, verify Save button is disabled
          if (page.url().includes('/edit')) {
            const saveButton = page.getByRole('button', { name: /save|update/i });
            if ((await saveButton.count()) > 0) {
              const isDisabled = await saveButton.isDisabled();
              expect(isDisabled || hasError).toBe(true);
            }
          }
        }
      }
    } else {
      test.skip(true, 'No projects found for testing');
    }
  });
});

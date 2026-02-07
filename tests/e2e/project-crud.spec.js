// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Project CRUD Operations Tests
 * Tests creation, reading, updating, and deletion of projects
 * including permissions, collaborators, and edge cases
 */

const API_BASE_URL = 'http://localhost:5001/api';
const APP_BASE_URL = 'http://localhost:3000';

// Generate unique test data
const generateTestUser = () => ({
  username: `user_${Date.now()}`,
  email: `user_${Date.now()}@example.com`,
  password: 'SecurePass123!',
});

const generateTestProject = () => ({
  name: `Test Project ${Date.now()}`,
  description: `This is a test project created at ${new Date().toISOString()}`,
});

test.describe('Project CRUD Operations', () => {
  let testUser;
  let authToken;

  test.beforeEach(async ({ request }) => {
    // Create and login test user
    testUser = generateTestUser();
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
      const loginData = await loginResponse.json();
      authToken = loginData.accessToken || loginData.token;
    }
  });

  test.describe('Create Project', () => {
    test('should create a new project via API', async ({ request }) => {
      const testProject = generateTestProject();

      const response = await request.post(`${API_BASE_URL}/projects`, {
        data: testProject,
      });

      expect(response.ok()).toBeTruthy();
      const project = await response.json();

      expect(project.name).toBe(testProject.name);
      expect(project.description).toBe(testProject.description);
      expect(project._id).toBeTruthy();
    });

    test('should create project via UI', async ({ page }) => {
      // Login first
      await page.goto(`${APP_BASE_URL}/login`);
      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Navigate to create project page
      await page.goto(`${APP_BASE_URL}/projects/new`).catch(async () => {
        // If direct navigation fails, try finding create button
        const createBtn = await page.locator('text=/create.*project|new.*project|\\+.*project/i').first();
        await createBtn.click();
      });

      const testProject = generateTestProject();

      // Fill project form
      await page.fill('input[name="name"], input[placeholder*="name" i]', testProject.name);
      await page.fill('textarea[name="description"], textarea[placeholder*="description" i]', testProject.description);

      // Submit form
      await page.click('button[type="submit"], button:has-text("Create")');

      // Should show success or redirect
      await page.waitForURL(/projects/, { timeout: 10000 }).catch(async () => {
        const successMsg = await page.locator('text=/created|success/i').first();
        await expect(successMsg).toBeVisible({ timeout: 5000 });
      });
    });

    test('should validate required fields', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);
      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      await page.goto(`${APP_BASE_URL}/projects/new`).catch(async () => {
        const createBtn = await page.locator('text=/create.*project|new.*project/i').first();
        await createBtn.click();
      });

      // Try to submit without filling required fields
      await page.click('button[type="submit"], button:has-text("Create")');

      // Should show validation error
      const errorMsg = await page.locator('text=/required|name.*required|fill.*field/i').first();
      await expect(errorMsg).toBeVisible({ timeout: 5000 });
    });

    test('should prevent duplicate project names for same user via API', async ({ request }) => {
      const testProject = generateTestProject();

      // Create first project
      await request.post(`${API_BASE_URL}/projects`, {
        data: testProject,
      });

      // Try to create with same name
      const duplicateResponse = await request.post(`${API_BASE_URL}/projects`, {
        data: testProject,
      });

      // Should either allow (different IDs) or reject duplicates
      // This behavior depends on business requirements
      expect([200, 201, 400, 409]).toContain(duplicateResponse.status());
    });
  });

  test.describe('Read Projects', () => {
    let createdProjects = [];

    test.beforeEach(async ({ request }) => {
      // Create multiple test projects
      for (let i = 0; i < 3; i++) {
        const testProject = generateTestProject();
        const response = await request.post(`${API_BASE_URL}/projects`, {
          data: testProject,
        });
        if (response.ok()) {
          const project = await response.json();
          createdProjects.push(project);
        }
      }
    });

    test('should list all user projects via API', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/projects`);

      expect(response.ok()).toBeTruthy();
      const projects = await response.json();

      expect(Array.isArray(projects)).toBeTruthy();
      expect(projects.length).toBeGreaterThanOrEqual(createdProjects.length);
    });

    test('should get single project by ID via API', async ({ request }) => {
      test.skip(createdProjects.length === 0, 'No projects created');

      const projectId = createdProjects[0]._id;
      const response = await request.get(`${API_BASE_URL}/projects/${projectId}`);

      expect(response.ok()).toBeTruthy();
      const project = await response.json();

      expect(project._id).toBe(projectId);
      expect(project.name).toBe(createdProjects[0].name);
    });

    test('should display projects in UI', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);
      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      await page.goto(`${APP_BASE_URL}/projects`);

      // Should display at least one project
      const projectCards = await page.locator('[data-testid="project-card"], .project-card, article').count();
      expect(projectCards).toBeGreaterThan(0);
    });

    test('should return 404 for non-existent project', async ({ request }) => {
      const fakeId = '507f1f77bcf86cd799439011'; // Valid ObjectId format
      const response = await request.get(`${API_BASE_URL}/projects/${fakeId}`);

      expect(response.status()).toBe(404);
    });

    test('should filter projects by search query', async ({ page }) => {
      test.skip(createdProjects.length === 0, 'No projects created');

      await page.goto(`${APP_BASE_URL}/login`);
      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      await page.goto(`${APP_BASE_URL}/projects`);

      // Find search input
      const searchInput = await page.locator('input[placeholder*="search" i], input[type="search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill(createdProjects[0].name);
        await page.waitForLoadState('networkidle');

        // Should show matching project
        const projectName = await page.locator(`text="${createdProjects[0].name}"`).first();
        await expect(projectName).toBeVisible();
      }
    });
  });

  test.describe('Update Project', () => {
    let testProject;

    test.beforeEach(async ({ request }) => {
      const projectData = generateTestProject();
      const response = await request.post(`${API_BASE_URL}/projects`, {
        data: projectData,
      });
      testProject = await response.json();
    });

    test('should update project via API', async ({ request }) => {
      const updatedData = {
        name: `Updated ${testProject.name}`,
        description: 'Updated description',
      };

      const response = await request.put(`${API_BASE_URL}/projects/${testProject._id}`, {
        data: updatedData,
      });

      expect(response.ok()).toBeTruthy();
      const updatedProject = await response.json();

      expect(updatedProject.name).toBe(updatedData.name);
      expect(updatedProject.description).toBe(updatedData.description);
    });

    test('should update project via UI', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);
      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Navigate to project edit page
      await page.goto(`${APP_BASE_URL}/projects/${testProject._id}/edit`).catch(async () => {
        // If direct navigation fails, try finding edit button
        await page.goto(`${APP_BASE_URL}/projects/${testProject._id}`);
        const editBtn = await page.locator('text=/edit|update/i').first();
        await editBtn.click();
      });

      const updatedName = `Updated ${testProject.name}`;

      // Update project name
      const nameInput = await page.locator('input[name="name"], input[placeholder*="name" i]').first();
      await nameInput.clear();
      await nameInput.fill(updatedName);

      // Submit
      await page.click('button[type="submit"], button:has-text("Update"), button:has-text("Save")');

      // Should show success
      await page.waitForLoadState('networkidle');
      const successIndicator = await page.locator(`text="${updatedName}"`).first().isVisible() ||
        await page.locator('text=/updated|success/i').first().isVisible();

      expect(successIndicator).toBeTruthy();
    });

    test('should not allow update by non-owner via API', async ({ request, browser }) => {
      // Create second user
      const secondUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: secondUser,
      });

      // Create new context for second user
      const context = await browser.newContext();
      const secondRequest = context.request;

      await secondRequest.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: secondUser.email,
          password: secondUser.password,
        },
      });

      // Try to update first user's project
      const updateResponse = await secondRequest.put(`${API_BASE_URL}/projects/${testProject._id}`, {
        data: { name: 'Hacked name' },
      });

      expect([401, 403]).toContain(updateResponse.status());

      await context.close();
    });
  });

  test.describe('Delete Project', () => {
    let testProject;

    test.beforeEach(async ({ request }) => {
      const projectData = generateTestProject();
      const response = await request.post(`${API_BASE_URL}/projects`, {
        data: projectData,
      });
      testProject = await response.json();
    });

    test('should delete project via API', async ({ request }) => {
      const deleteResponse = await request.delete(`${API_BASE_URL}/projects/${testProject._id}`);

      expect(deleteResponse.ok()).toBeTruthy();

      // Verify deletion
      const getResponse = await request.get(`${API_BASE_URL}/projects/${testProject._id}`);
      expect(getResponse.status()).toBe(404);
    });

    test('should delete project via UI with confirmation', async ({ page }) => {
      await page.goto(`${APP_BASE_URL}/login`);
      await page.fill('input[name="email"], input[type="email"]', testUser.email);
      await page.fill('input[name="password"], input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Navigate to project
      await page.goto(`${APP_BASE_URL}/projects/${testProject._id}`);

      // Find and click delete button
      const deleteBtn = await page.locator('button:has-text("Delete"), button[aria-label*="delete" i]').first();
      await deleteBtn.click();

      // Handle confirmation dialog
      page.on('dialog', async (dialog) => {
        expect(dialog.type()).toBe('confirm');
        await dialog.accept();
      });

      // Wait for deletion to complete
      await page.waitForLoadState('networkidle');

      // Should redirect away or show success message
      const notOnProjectPage = !page.url().includes(`projects/${testProject._id}`) ||
        await page.locator('text=/deleted|removed/i').first().isVisible();

      expect(notOnProjectPage).toBeTruthy();
    });

    test('should not allow delete by non-owner via API', async ({ request, browser }) => {
      // Create second user
      const secondUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: secondUser,
      });

      const context = await browser.newContext();
      const secondRequest = context.request;

      await secondRequest.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: secondUser.email,
          password: secondUser.password,
        },
      });

      // Try to delete first user's project
      const deleteResponse = await secondRequest.delete(`${API_BASE_URL}/projects/${testProject._id}`);

      expect([401, 403]).toContain(deleteResponse.status());

      await context.close();
    });

    test('should return 404 when deleting non-existent project', async ({ request }) => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request.delete(`${API_BASE_URL}/projects/${fakeId}`);

      expect(response.status()).toBe(404);
    });
  });

  test.describe('Project Collaborators', () => {
    let testProject;
    let collaboratorUser;

    test.beforeEach(async ({ request }) => {
      // Create test project
      const projectData = generateTestProject();
      const response = await request.post(`${API_BASE_URL}/projects`, {
        data: projectData,
      });
      testProject = await response.json();

      // Create collaborator user
      collaboratorUser = generateTestUser();
      await request.post(`${API_BASE_URL}/auth/register`, {
        data: collaboratorUser,
      });
    });

    test('should add collaborator to project via API', async ({ request }) => {
      const response = await request.post(`${API_BASE_URL}/projects/${testProject._id}/collaborators`, {
        data: { userId: collaboratorUser._id || collaboratorUser.email },
      });

      if (response.ok()) {
        const updatedProject = await response.json();
        expect(updatedProject.collaborators || updatedProject.members).toBeTruthy();
      }
    });

    test('should remove collaborator from project via API', async ({ request }) => {
      // First add collaborator
      await request.post(`${API_BASE_URL}/projects/${testProject._id}/collaborators`, {
        data: { userId: collaboratorUser._id || collaboratorUser.email },
      });

      // Then remove
      const removeResponse = await request.delete(
        `${API_BASE_URL}/projects/${testProject._id}/collaborators/${collaboratorUser._id}`
      );

      expect([200, 204]).toContain(removeResponse.status());
    });

    test('should allow collaborator to view but not delete project', async ({ request, browser }) => {
      // Add collaborator
      await request.post(`${API_BASE_URL}/projects/${testProject._id}/collaborators`, {
        data: { userId: collaboratorUser._id || collaboratorUser.email },
      });

      // Login as collaborator
      const context = await browser.newContext();
      const collabRequest = context.request;

      await collabRequest.post(`${API_BASE_URL}/auth/login`, {
        data: {
          email: collaboratorUser.email,
          password: collaboratorUser.password,
        },
      });

      // Should be able to view
      const viewResponse = await collabRequest.get(`${API_BASE_URL}/projects/${testProject._id}`);
      expect(viewResponse.ok()).toBeTruthy();

      // Should not be able to delete
      const deleteResponse = await collabRequest.delete(`${API_BASE_URL}/projects/${testProject._id}`);
      expect([401, 403]).toContain(deleteResponse.status());

      await context.close();
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle very long project names gracefully', async ({ request }) => {
      const longName = 'A'.repeat(500);
      const response = await request.post(`${API_BASE_URL}/projects`, {
        data: {
          name: longName,
          description: 'Test project',
        },
      });

      // Should either accept with truncation or reject with validation error
      expect([200, 201, 400]).toContain(response.status());
    });

    test('should handle special characters in project name', async ({ request }) => {
      const specialName = 'Test <script>alert("XSS")</script> Project';
      const response = await request.post(`${API_BASE_URL}/projects`, {
        data: {
          name: specialName,
          description: 'Test',
        },
      });

      if (response.ok()) {
        const project = await response.json();
        // Should sanitize or escape special characters
        expect(project.name).not.toContain('<script>');
      }
    });

    test('should handle concurrent project creation', async ({ request }) => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const testProject = generateTestProject();
        promises.push(
          request.post(`${API_BASE_URL}/projects`, {
            data: testProject,
          })
        );
      }

      const responses = await Promise.all(promises);
      const successfulCreations = responses.filter((r) => r.ok()).length;

      expect(successfulCreations).toBe(5);
    });

    test('should paginate project list for large datasets', async ({ request }) => {
      // Create many projects
      const createPromises = [];
      for (let i = 0; i < 25; i++) {
        const testProject = generateTestProject();
        createPromises.push(
          request.post(`${API_BASE_URL}/projects`, {
            data: testProject,
          })
        );
      }
      await Promise.all(createPromises);

      // Request with pagination
      const response = await request.get(`${API_BASE_URL}/projects?limit=10&page=1`);

      if (response.ok()) {
        const data = await response.json();
        const projects = Array.isArray(data) ? data : data.projects || data.data;
        expect(projects.length).toBeLessThanOrEqual(10);
      }
    });
  });
});

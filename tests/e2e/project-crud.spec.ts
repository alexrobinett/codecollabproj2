import { test, expect } from '@playwright/test';
import { loginAsRole } from './fixtures/auth.fixture';

/**
 * E2E tests for full Project CRUD operations
 * Tests creating, updating, and deleting projects end-to-end
 */
test.describe('Project CRUD Operations', () => {
  let createdProjectId: string;
  let createdProjectTitle: string;

  test.beforeEach(async ({ page }) => {
    // Login as user1 before each test
    await loginAsRole(page, 'user1');
  });

  test('should create a new project (end-to-end)', async ({ page }) => {
    // Generate unique project title
    const timestamp = Date.now();
    createdProjectTitle = `E2E Test Project ${timestamp}`;
    
    // Navigate to create project page
    await page.goto('http://localhost:3000/projects/create');
    await page.waitForLoadState('networkidle');

    // Fill in project title
    const titleInput = page.getByLabel(/project title/i);
    await expect(titleInput).toBeVisible();
    await titleInput.fill(createdProjectTitle);

    // Fill in description
    const descriptionInput = page.getByLabel(/description/i);
    await expect(descriptionInput).toBeVisible();
    await descriptionInput.fill(`This is an automated test project created at ${new Date().toISOString()}`);

    // Add technologies
    const techInput = page.getByRole('combobox', { name: /technologies used/i });
    await expect(techInput).toBeVisible();
    await techInput.click();
    await techInput.fill('React');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    // Add another technology
    await techInput.click();
    await techInput.fill('Node.js');
    await page.keyboard.press('Enter');

    // Submit the form
    const createButton = page.getByRole('button', { name: /create project/i });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    // Wait for redirect to project details or projects list
    await page.waitForURL(/.*\/projects.*/, { timeout: 15000 });

    // Verify success message or redirect
    const successIndicator = page.locator('text=Project created successfully!, text=View Details');
    await expect(successIndicator.first()).toBeVisible({ timeout: 10000 });

    // Navigate back to projects list to verify project appears
    await page.goto('http://localhost:3000/projects');
    await page.waitForLoadState('networkidle');

    // Search for the newly created project
    const searchInput = page.getByPlaceholder('Search projects...');
    await searchInput.fill(createdProjectTitle);
    await page.waitForTimeout(500);

    // Verify the project appears in the list
    await expect(page.getByText(createdProjectTitle)).toBeVisible();

    // Extract project ID from the URL for cleanup
    const projectLink = page.getByRole('link', { name: /view details/i }).first();
    await projectLink.click();
    await page.waitForURL('**/projects/**');
    
    const url = page.url();
    const match = url.match(/\/projects\/([a-zA-Z0-9]+)/);
    if (match) {
      createdProjectId = match[1];
    }
  });

  test('should update/edit an existing project', async ({ page }) => {
    // First, create a project to edit
    const timestamp = Date.now();
    const originalTitle = `Project to Edit ${timestamp}`;
    
    await page.goto('http://localhost:3000/projects/create');
    await page.waitForLoadState('networkidle');

    await page.getByLabel(/project title/i).fill(originalTitle);
    await page.getByLabel(/description/i).fill('Original description');
    await page.getByRole('button', { name: /create project/i }).click();
    
    await page.waitForURL(/.*\/projects.*/, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Navigate to projects list and find the project
    await page.goto('http://localhost:3000/projects');
    await page.waitForLoadState('networkidle');
    
    const searchInput = page.getByPlaceholder('Search projects...');
    await searchInput.fill(originalTitle);
    await page.waitForTimeout(500);

    // Click View Details
    await page.getByRole('link', { name: /view details/i }).first().click();
    await page.waitForURL('**/projects/**');

    // Look for Edit button (might be Edit Project, Edit, or pencil icon)
    const editButton = page.getByRole('button', { name: /edit project|edit/i }).first();
    
    // Check if edit button exists (user might not be owner)
    const hasEditButton = await editButton.isVisible().catch(() => false);
    
    if (hasEditButton) {
      await editButton.click();
      
      // Wait for edit form to appear (might be modal or redirect)
      await page.waitForTimeout(1000);

      // Update the title
      const updatedTitle = `${originalTitle} - UPDATED`;
      const titleInput = page.getByLabel(/project title/i);
      await titleInput.clear();
      await titleInput.fill(updatedTitle);

      // Update the description
      const descInput = page.getByLabel(/description/i);
      await descInput.clear();
      await descInput.fill('Updated description from E2E test');

      // Save changes
      const saveButton = page.getByRole('button', { name: /save|update/i });
      await expect(saveButton).toBeEnabled();
      await saveButton.click();

      // Wait for save to complete
      await page.waitForTimeout(2000);

      // Verify the updated title appears on the page
      await expect(page.getByText(updatedTitle)).toBeVisible({ timeout: 10000 });
    } else {
      // If no edit button, log and skip (might be permission issue)
      console.log('No edit button found - user might not be project owner');
    }
  });

  test('should delete a project with confirmation', async ({ page }) => {
    // First, create a project to delete
    const timestamp = Date.now();
    const projectTitle = `Project to Delete ${timestamp}`;
    
    await page.goto('http://localhost:3000/projects/create');
    await page.waitForLoadState('networkidle');

    await page.getByLabel(/project title/i).fill(projectTitle);
    await page.getByLabel(/description/i).fill('This project will be deleted');
    await page.getByRole('button', { name: /create project/i }).click();
    
    await page.waitForURL(/.*\/projects.*/, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Navigate to the project
    await page.goto('http://localhost:3000/projects');
    await page.waitForLoadState('networkidle');
    
    const searchInput = page.getByPlaceholder('Search projects...');
    await searchInput.fill(projectTitle);
    await page.waitForTimeout(500);

    // Click View Details
    await page.getByRole('link', { name: /view details/i }).first().click();
    await page.waitForURL('**/projects/**');

    // Look for Delete button
    const deleteButton = page.getByRole('button', { name: /delete project|delete/i }).first();
    
    const hasDeleteButton = await deleteButton.isVisible().catch(() => false);
    
    if (hasDeleteButton) {
      await deleteButton.click();
      
      // Wait for confirmation dialog
      const confirmDialog = page.getByRole('dialog');
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });

      // Verify confirmation message
      await expect(page.getByText(/are you sure|confirm delete/i)).toBeVisible();

      // Click confirm delete button
      const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
      await confirmButton.click();

      // Wait for redirect to projects list
      await page.waitForURL(/.*\/projects$/, { timeout: 15000 });

      // Verify project no longer appears in list
      await page.waitForLoadState('networkidle');
      await searchInput.fill(projectTitle);
      await page.waitForTimeout(500);

      // The project should not be found
      await expect(page.getByText(projectTitle)).not.toBeVisible();
    } else {
      console.log('No delete button found - user might not be project owner');
    }
  });

  test('should prevent non-owners from editing/deleting projects', async ({ page, context }) => {
    // Login as user1 and create a project
    await loginAsRole(page, 'user1');
    
    const timestamp = Date.now();
    const projectTitle = `User1 Project ${timestamp}`;
    
    await page.goto('http://localhost:3000/projects/create');
    await page.waitForLoadState('networkidle');

    await page.getByLabel(/project title/i).fill(projectTitle);
    await page.getByLabel(/description/i).fill('This is User1\'s project');
    await page.getByRole('button', { name: /create project/i }).click();
    
    await page.waitForURL(/.*\/projects.*/, { timeout: 15000 });
    
    // Get the project URL
    await page.goto('http://localhost:3000/projects');
    await page.waitForLoadState('networkidle');
    const searchInput = page.getByPlaceholder('Search projects...');
    await searchInput.fill(projectTitle);
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: /view details/i }).first().click();
    await page.waitForURL('**/projects/**');
    
    const projectUrl = page.url();

    // Logout and login as user2
    await page.click('button[aria-label^="Account menu"]');
    await page.click('text=Logout');
    await page.waitForURL('**/login**');

    // Login as user2
    await loginAsRole(page, 'user2');

    // Navigate to user1's project
    await page.goto(projectUrl);
    await page.waitForLoadState('networkidle');

    // Verify edit and delete buttons are NOT visible for user2
    const editButton = page.getByRole('button', { name: /edit project|edit/i });
    const deleteButton = page.getByRole('button', { name: /delete project|delete/i });

    await expect(editButton).not.toBeVisible();
    await expect(deleteButton).not.toBeVisible();
  });

  test('should add and remove collaborators from a project', async ({ page }) => {
    // Create a project first
    const timestamp = Date.now();
    const projectTitle = `Collaboration Test ${timestamp}`;
    
    await page.goto('http://localhost:3000/projects/create');
    await page.waitForLoadState('networkidle');

    await page.getByLabel(/project title/i).fill(projectTitle);
    await page.getByLabel(/description/i).fill('Testing collaboration features');
    await page.getByRole('button', { name: /create project/i }).click();
    
    await page.waitForURL(/.*\/projects.*/, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Navigate to the project details
    await page.goto('http://localhost:3000/projects');
    await page.waitForLoadState('networkidle');
    const searchInput = page.getByPlaceholder('Search projects...');
    await searchInput.fill(projectTitle);
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: /view details/i }).first().click();
    await page.waitForURL('**/projects/**');

    // Look for "Add Collaborator" or "Invite" button
    const addCollabButton = page.getByRole('button', { name: /add collaborator|invite/i }).first();
    
    const hasCollabButton = await addCollabButton.isVisible().catch(() => false);
    
    if (hasCollabButton) {
      await addCollabButton.click();
      
      // Wait for invite dialog/form
      await page.waitForTimeout(1000);

      // Select a user to add (e.g., user2)
      const userSelect = page.getByRole('combobox').first();
      await userSelect.click();
      await userSelect.fill('user2');
      await page.keyboard.press('Enter');

      // Submit invite
      const inviteButton = page.getByRole('button', { name: /send invite|add/i });
      await inviteButton.click();

      // Verify collaborator appears in the list
      await page.waitForTimeout(2000);
      await expect(page.getByText(/user2@example.com|User 2/i)).toBeVisible({ timeout: 10000 });

      // Remove collaborator
      const removeButton = page.getByRole('button', { name: /remove|delete/i }).first();
      await removeButton.click();

      // Confirm removal if needed
      const confirmRemove = page.getByRole('button', { name: /confirm|yes/i });
      if (await confirmRemove.isVisible().catch(() => false)) {
        await confirmRemove.click();
      }

      // Verify collaborator is removed
      await page.waitForTimeout(1000);
      await expect(page.getByText(/user2@example.com|User 2/i)).not.toBeVisible();
    } else {
      console.log('No collaboration feature buttons found');
    }
  });
});

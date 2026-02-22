import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProjectDetail from './ProjectDetail';

const mockNavigate = vi.fn();
const mockDeleteMutate = vi.fn();
let mockUser: { id: string; username: string } | null = { id: 'owner-1', username: 'ownerUser' };

const mockProject = {
  _id: 'project-1',
  title: 'Demo Project',
  description: 'A test project',
  status: 'planning',
  owner: { _id: 'owner-1', username: 'ownerUser' },
  collaborators: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  technologies: [],
  requiredSkills: [],
  tags: [],
  resources: [],
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: 'project-1' }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../hooks/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('../../hooks/comments', () => ({
  useComments: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useCreateComment: () => ({ isPending: false, error: null, mutate: vi.fn() }),
}));

vi.mock('../../hooks/projects', () => ({
  useProject: () => ({ data: mockProject, isLoading: false, error: null, refetch: vi.fn() }),
  useRequestCollaboration: () => ({ isPending: false, mutate: vi.fn() }),
  useHandleCollaborationRequest: () => ({ isPending: false, mutate: vi.fn() }),
  useDeleteProject: () => ({
    isPending: false,
    mutate: mockDeleteMutate,
  }),
}));

describe('ProjectDetail deletion flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'owner-1', username: 'ownerUser' };
  });

  it('shows delete action only for owner', () => {
    render(<ProjectDetail />);
    expect(screen.getByLabelText(/delete project/i)).toBeInTheDocument();
  });

  it('hides delete action for non-owner', () => {
    mockUser = { id: 'different-user', username: 'otherUser' };
    render(<ProjectDetail />);
    expect(screen.queryByLabelText(/delete project/i)).not.toBeInTheDocument();
  });

  it('cancel closes dialog and does not call delete API', async () => {
    render(<ProjectDetail />);

    fireEvent.click(screen.getByLabelText(/delete project/i));
    expect(screen.getByText(/are you sure you want to delete this project/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(
        screen.queryByText(/are you sure you want to delete this project/i)
      ).not.toBeInTheDocument();
    });
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it('confirm delete calls delete mutation and redirects on success', async () => {
    mockDeleteMutate.mockImplementation((_id: string, options: { onSuccess?: () => void }) => {
      options.onSuccess?.();
    });

    render(<ProjectDetail />);

    fireEvent.click(screen.getByLabelText(/delete project/i));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(mockDeleteMutate).toHaveBeenCalledTimes(1);
    expect(mockDeleteMutate).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/projects');
  });

  it('shows error and does not redirect when delete fails', async () => {
    mockDeleteMutate.mockImplementation(
      (_id: string, options: { onError?: (error: Error) => void }) => {
        options.onError?.(new Error('Delete failed due to server error'));
      }
    );

    render(<ProjectDetail />);

    fireEvent.click(screen.getByLabelText(/delete project/i));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(await screen.findByText(/delete failed due to server error/i)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

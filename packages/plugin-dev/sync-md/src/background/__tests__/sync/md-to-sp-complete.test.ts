import { mdToSp } from '../../sync/md-to-sp';
import { parseMarkdown } from '../../sync/markdown-parser';
import { generateTaskOperations } from '../../sync/generate-task-operations';
import { Task } from '@super-productivity/plugin-api';

// Mock dependencies
jest.mock('../../sync/markdown-parser');
jest.mock('../../sync/generate-task-operations');

// Mock PluginAPI
const mockPluginAPI = {
  getTasks: jest.fn(),
  batchUpdateForProject: jest.fn(),
  getAllProjects: jest.fn(),
};

(global as any).PluginAPI = mockPluginAPI;

describe('MD to SP Sync - Complete Tests', () => {
  const mockProjectId = 'test-project';
  const mockMarkdownContent = `- [ ] Task 1
  - [ ] Subtask 1
- [x] Task 2`;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    mockPluginAPI.getTasks.mockResolvedValue([]);
    mockPluginAPI.batchUpdateForProject.mockResolvedValue(undefined);
    mockPluginAPI.getAllProjects.mockResolvedValue([
      { id: mockProjectId, title: 'Test Project' },
    ]);
  });

  describe('mdToSp', () => {
    it('should successfully sync markdown to SP', async () => {
      const mockParsedTasks = [
        {
          id: 'task1',
          title: 'Task 1',
          completed: false,
          isSubtask: false,
          parentId: null,
        },
        {
          id: 'subtask1',
          title: 'Subtask 1',
          completed: false,
          isSubtask: true,
          parentId: 'task1',
        },
        {
          id: 'task2',
          title: 'Task 2',
          completed: true,
          isSubtask: false,
          parentId: null,
        },
      ];

      const mockOperations = [
        { type: 'create', data: { title: 'Task 1', projectId: mockProjectId } },
        {
          type: 'create',
          data: { title: 'Subtask 1', projectId: mockProjectId, parentId: 'task1' },
        },
        {
          type: 'create',
          data: { title: 'Task 2', projectId: mockProjectId, isDone: true },
        },
      ];

      (parseMarkdown as jest.Mock).mockReturnValue(mockParsedTasks);
      (generateTaskOperations as jest.Mock).mockReturnValue(mockOperations);

      await mdToSp(mockMarkdownContent, mockProjectId);

      expect(parseMarkdown).toHaveBeenCalledWith(mockMarkdownContent);
      expect(mockPluginAPI.getTasks).toHaveBeenCalledWith();
      expect(generateTaskOperations).toHaveBeenCalledWith(
        mockParsedTasks,
        [],
        mockProjectId,
      );
      expect(mockPluginAPI.batchUpdateForProject).toHaveBeenCalledWith({
        projectId: mockProjectId,
        operations: mockOperations,
      });
    });

    it('should handle empty markdown content', async () => {
      (parseMarkdown as jest.Mock).mockReturnValue([]);
      (generateTaskOperations as jest.Mock).mockReturnValue([]);

      await mdToSp('', mockProjectId);

      expect(parseMarkdown).toHaveBeenCalledWith('');
      // batchUpdateForProject won't be called with empty operations
      expect(mockPluginAPI.batchUpdateForProject).not.toHaveBeenCalled();
    });

    it('should handle markdown with only whitespace', async () => {
      const whitespaceContent = '   \n\n   \t   ';

      (parseMarkdown as jest.Mock).mockReturnValue([]);
      (generateTaskOperations as jest.Mock).mockReturnValue([]);

      await mdToSp(whitespaceContent, mockProjectId);

      expect(parseMarkdown).toHaveBeenCalledWith(whitespaceContent);
      // batchUpdateForProject won't be called with empty operations
      expect(mockPluginAPI.batchUpdateForProject).not.toHaveBeenCalled();
    });

    it('should handle existing tasks in SP', async () => {
      const existingTasks: Task[] = [
        {
          id: 'existing1',
          title: 'Existing Task',
          isDone: false,
          projectId: mockProjectId,
        } as Task,
      ];

      const mockParsedTasks = [
        {
          id: 'existing1',
          title: 'Updated Task',
          completed: true,
          isSubtask: false,
          parentId: null,
        },
        {
          id: 'new1',
          title: 'New Task',
          completed: false,
          isSubtask: false,
          parentId: null,
        },
      ];

      const mockOperations = [
        {
          type: 'update',
          taskId: 'existing1',
          updates: { title: 'Updated Task', isDone: true },
        },
        { type: 'create', data: { title: 'New Task', projectId: mockProjectId } },
      ];

      mockPluginAPI.getTasks.mockResolvedValue(existingTasks);
      (parseMarkdown as jest.Mock).mockReturnValue(mockParsedTasks);
      (generateTaskOperations as jest.Mock).mockReturnValue(mockOperations);

      await mdToSp(mockMarkdownContent, mockProjectId);

      expect(generateTaskOperations).toHaveBeenCalledWith(
        mockParsedTasks,
        existingTasks,
        mockProjectId,
      );
    });

    it('should handle project not found', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockPluginAPI.getAllProjects.mockResolvedValue([]);

      await mdToSp(mockMarkdownContent, mockProjectId);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Project test-project not found'),
      );
      expect(mockPluginAPI.batchUpdateForProject).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle getTasks error', async () => {
      const error = new Error('Failed to get tasks');

      mockPluginAPI.getTasks.mockRejectedValue(error);

      await expect(mdToSp(mockMarkdownContent, mockProjectId)).rejects.toThrow(error);

      expect(mockPluginAPI.batchUpdateForProject).not.toHaveBeenCalled();
    });

    it('should handle parseMarkdown error', async () => {
      const error = new Error('Parse error');

      (parseMarkdown as jest.Mock).mockImplementation(() => {
        throw error;
      });

      await expect(mdToSp(mockMarkdownContent, mockProjectId)).rejects.toThrow(error);

      expect(mockPluginAPI.batchUpdateForProject).not.toHaveBeenCalled();
    });

    it('should handle batchUpdateForProject error', async () => {
      const error = new Error('Update failed');
      const parsedTasks = [
        {
          id: 'task1',
          title: 'Task 1',
          completed: false,
          isSubtask: false,
          parentId: null,
        },
      ];

      (parseMarkdown as jest.Mock).mockReturnValue(parsedTasks);
      (generateTaskOperations as jest.Mock).mockReturnValue([
        { type: 'create', data: { title: 'test' } },
      ]);
      mockPluginAPI.batchUpdateForProject.mockRejectedValue(error);

      await expect(mdToSp(mockMarkdownContent, mockProjectId)).rejects.toThrow(error);
    });

    it('should handle very large markdown content', async () => {
      const largeTasks = Array.from({ length: 1000 }, (_, i) => ({
        id: `task${i}`,
        title: `Task ${i}`,
        completed: i % 2 === 0,
        isSubtask: false,
        parentId: null,
      }));

      const largeOperations = largeTasks.map((task) => ({
        type: 'create' as const,
        data: {
          title: task.title,
          projectId: mockProjectId,
          isDone: task.completed,
        },
      }));

      (parseMarkdown as jest.Mock).mockReturnValue(largeTasks);
      (generateTaskOperations as jest.Mock).mockReturnValue(largeOperations);

      await mdToSp('large content', mockProjectId);

      expect(mockPluginAPI.batchUpdateForProject).toHaveBeenCalledWith({
        projectId: mockProjectId,
        operations: largeOperations,
      });
    });

    it('should preserve task order from markdown', async () => {
      const orderedTasks = [
        {
          id: 'task3',
          title: 'Third',
          completed: false,
          isSubtask: false,
          parentId: null,
          line: 2,
        },
        {
          id: 'task1',
          title: 'First',
          completed: false,
          isSubtask: false,
          parentId: null,
          line: 0,
        },
        {
          id: 'task2',
          title: 'Second',
          completed: false,
          isSubtask: false,
          parentId: null,
          line: 1,
        },
      ];

      (parseMarkdown as jest.Mock).mockReturnValue(orderedTasks);
      (generateTaskOperations as jest.Mock).mockImplementation((tasks) => {
        // Verify tasks are passed in the correct order
        expect(tasks).toEqual(orderedTasks);
        return [];
      });

      await mdToSp(mockMarkdownContent, mockProjectId);

      expect(generateTaskOperations).toHaveBeenCalled();
    });

    it('should handle tasks with special characters', async () => {
      const specialTasks = [
        {
          id: 'task1',
          title: 'Task with "quotes"',
          completed: false,
          isSubtask: false,
          parentId: null,
        },
        {
          id: 'task2',
          title: 'Task with <html> tags',
          completed: false,
          isSubtask: false,
          parentId: null,
        },
        {
          id: 'task3',
          title: 'Task with emoji 🚀',
          completed: false,
          isSubtask: false,
          parentId: null,
        },
      ];

      (parseMarkdown as jest.Mock).mockReturnValue(specialTasks);
      (generateTaskOperations as jest.Mock).mockReturnValue([]);

      await mdToSp(mockMarkdownContent, mockProjectId);

      expect(generateTaskOperations).toHaveBeenCalledWith(
        specialTasks,
        [],
        mockProjectId,
      );
    });

    it('should handle deeply nested tasks', async () => {
      const nestedTasks = [
        { id: 'root', title: 'Root', completed: false, isSubtask: false, parentId: null },
        {
          id: 'child1',
          title: 'Child 1',
          completed: false,
          isSubtask: true,
          parentId: 'root',
        },
        {
          id: 'child2',
          title: 'Child 2',
          completed: false,
          isSubtask: true,
          parentId: 'root',
        },
        {
          id: 'grandchild',
          title: 'Grandchild',
          completed: false,
          isSubtask: true,
          parentId: 'child1',
        },
      ];

      (parseMarkdown as jest.Mock).mockReturnValue(nestedTasks);
      (generateTaskOperations as jest.Mock).mockReturnValue([]);

      await mdToSp(mockMarkdownContent, mockProjectId);

      expect(generateTaskOperations).toHaveBeenCalledWith(nestedTasks, [], mockProjectId);
    });

    it('should skip sync when no operations are needed', async () => {
      (parseMarkdown as jest.Mock).mockReturnValue([]);
      (generateTaskOperations as jest.Mock).mockReturnValue([]);

      await mdToSp(mockMarkdownContent, mockProjectId);

      // batchUpdateForProject should not be called with empty operations
      expect(mockPluginAPI.batchUpdateForProject).not.toHaveBeenCalled();
    });

    it('should handle null projectId gracefully', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await mdToSp(mockMarkdownContent, null as any);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Project null not found'),
      );
      expect(mockPluginAPI.batchUpdateForProject).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle undefined projectId gracefully', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await mdToSp(mockMarkdownContent, undefined as any);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Project undefined not found'),
      );
      expect(mockPluginAPI.batchUpdateForProject).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});

import { initSyncManager } from '../../sync/sync-manager';
import { LocalUserCfg } from '../../local-config';
import * as fileWatcher from '../../sync/file-watcher';
import * as fileUtils from '../../helper/file-utils';
import { spToMd } from '../../sync/sp-to-md';
import { mdToSp } from '../../sync/md-to-sp';
import { verifySyncState, logSyncVerification } from '../../sync/verify-sync';
import { PluginHooks } from '@super-productivity/plugin-api';

// Mock dependencies
jest.mock('../../sync/file-watcher');
jest.mock('../../helper/file-utils');
jest.mock('../../sync/sp-to-md');
jest.mock('../../sync/md-to-sp');
jest.mock('../../sync/verify-sync');

describe('Sync Manager - Edge Cases', () => {
  const mockConfig: LocalUserCfg = {
    filePath: '/test/tasks.md',
    projectId: 'test-project',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup basic mocks
    (fileUtils.getFileStats as jest.Mock).mockResolvedValue(null);
    (fileUtils.readTasksFile as jest.Mock).mockResolvedValue('- [ ] Test task');
    (fileUtils.ensureDirectoryExists as jest.Mock).mockResolvedValue(undefined);
    (spToMd as jest.Mock).mockResolvedValue(undefined);
    (mdToSp as jest.Mock).mockResolvedValue(undefined);
    (verifySyncState as jest.Mock).mockResolvedValue({ isInSync: true, differences: [] });
    (logSyncVerification as jest.Mock).mockReturnValue(undefined);
    (fileWatcher.startFileWatcher as jest.Mock).mockImplementation(() => {});
    (fileWatcher.stopFileWatcher as jest.Mock).mockImplementation(() => {});

    // Mock PluginAPI
    (global as any).PluginAPI = {
      registerHook: jest.fn(),
      onWindowFocusChange: jest.fn(),
      getTasks: jest.fn().mockResolvedValue([]),
      getAllProjects: jest
        .fn()
        .mockResolvedValue([{ id: 'test-project', title: 'Test Project' }]),
      batchUpdateForProject: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Basic Functionality', () => {
    it('should initialize sync manager components', () => {
      initSyncManager(mockConfig);

      // Should set up file watcher
      expect(fileWatcher.startFileWatcher).toHaveBeenCalledWith(
        mockConfig.filePath,
        expect.any(Function),
      );

      // Should register SP hooks
      expect(PluginAPI.registerHook).toHaveBeenCalled();
    });

    it('should handle missing onWindowFocusChange API', () => {
      delete (global as any).PluginAPI.onWindowFocusChange;

      // Should not throw
      expect(() => initSyncManager(mockConfig)).not.toThrow();
    });

    it('should handle readTasksFile returning null', async () => {
      (fileUtils.getFileStats as jest.Mock).mockResolvedValue({ mtime: new Date() });
      (fileUtils.readTasksFile as jest.Mock).mockResolvedValue(null);

      initSyncManager(mockConfig);

      // Let async operations settle
      await Promise.resolve();

      // Should not call mdToSp with null content
      expect(mdToSp).not.toHaveBeenCalled();
    });
  });
});

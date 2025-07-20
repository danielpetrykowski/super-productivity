import { mapArchiveToWorklogWeeks } from './map-archive-to-worklog-weeks';
import { EntityState } from '@ngrx/entity';
import { Task } from '../../tasks/task.model';
import { taskAdapter } from '../../tasks/store/task.adapter';

describe('mapArchiveToWorklogWeeks timezone test', () => {
  describe('_getTimeSpentOnDay function behavior', () => {
    it('should handle task creation date correctly across timezones', () => {
      // Test case: Task created at a specific UTC time
      const taskCreatedTime = new Date('2025-01-17T06:00:00Z').getTime(); // 6 AM UTC

      const taskState: EntityState<Task> = taskAdapter.addOne(
        {
          id: 'task1',
          created: taskCreatedTime,
          timeSpentOnDay: {}, // Empty, so it will use created date
          subTaskIds: [],
          title: 'Test Task',
          isDone: false,
          projectId: null,
          attachments: [],
          timeEstimate: 0,
          _showSubTasksMode: 2,
        } as any,
        taskAdapter.getInitialState(),
      );

      const result = mapArchiveToWorklogWeeks(
        taskState,
        [],
        { workStart: {}, workEnd: {} },
        1,
        'en-US',
      );

      console.log('mapArchiveToWorklogWeeks task creation test:', {
        taskCreatedTime: new Date(taskCreatedTime).toISOString(),
        resultYears: Object.keys(result),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: new Date().getTimezoneOffset(),
      });

      // The task should be placed on the local date when it was created
      // In LA (UTC-8): 2025-01-16 at 10 PM local -> worklog for Jan 16
      // In Berlin (UTC+1): 2025-01-17 at 7 AM local -> worklog for Jan 17
      const tzOffset = new Date().getTimezoneOffset();
      const year2025 = result['2025'];

      if (tzOffset > 0) {
        // LA
        // Should have entry for Jan 16
        const foundEntry = year2025?.some(
          (week) =>
            week &&
            week.ent &&
            Object.values(week.ent).some((day) => day.dateStr === '2025-01-16'),
        );
        expect(foundEntry).toBe(true);
      } else {
        // Berlin
        // Should have entry for Jan 17
        const foundEntry = year2025?.some(
          (week) =>
            week &&
            week.ent &&
            Object.values(week.ent).some((day) => day.dateStr === '2025-01-17'),
        );
        expect(foundEntry).toBe(true);
      }
    });

    it('should handle parent task creation date for subtasks', () => {
      // Test case: Parent and subtask created at different times
      const parentCreatedTime = new Date('2025-01-16T23:00:00Z').getTime(); // 11 PM UTC
      const subtaskCreatedTime = new Date('2025-01-17T01:00:00Z').getTime(); // 1 AM UTC

      const taskState: EntityState<Task> = taskAdapter.addMany(
        [
          {
            id: 'parent1',
            created: parentCreatedTime,
            timeSpentOnDay: {},
            subTaskIds: ['subtask1'],
            title: 'Parent Task',
            isDone: false,
            projectId: null,
            attachments: [],
            timeEstimate: 0,
            _showSubTasksMode: 2,
          } as any,
          {
            id: 'subtask1',
            parentId: 'parent1',
            created: subtaskCreatedTime,
            timeSpentOnDay: {}, // Empty, so it will use parent's created date
            subTaskIds: [],
            title: 'Subtask',
            isDone: false,
            projectId: null,
            attachments: [],
            timeEstimate: 0,
            _showSubTasksMode: 2,
          } as any,
        ],
        taskAdapter.getInitialState(),
      );

      const result = mapArchiveToWorklogWeeks(
        taskState,
        [],
        { workStart: {}, workEnd: {} },
        1,
        'en-US',
      );

      console.log('mapArchiveToWorklogWeeks parent task test:', {
        parentCreatedTime: new Date(parentCreatedTime).toISOString(),
        subtaskCreatedTime: new Date(subtaskCreatedTime).toISOString(),
        expectedBehavior:
          'Subtask should use parent creation date when no timeSpentOnDay',
      });

      // The subtask should use parent's creation date
      // In LA (UTC-8): Parent created at Jan 16 3 PM -> worklog for Jan 16
      // In Berlin (UTC+1): Parent created at Jan 17 midnight -> worklog for Jan 17
      const tzOffset = new Date().getTimezoneOffset();
      const year2025 = result['2025'];

      if (tzOffset > 0) {
        // LA
        const foundEntry = year2025?.some(
          (week) =>
            week &&
            week.ent &&
            Object.values(week.ent).some(
              (day) =>
                day.dateStr === '2025-01-16' &&
                day.logEntries.some((entry) => entry.task.id === 'subtask1'),
            ),
        );
        expect(foundEntry).toBe(true);
      } else {
        // Berlin
        const foundEntry = year2025?.some(
          (week) =>
            week &&
            week.ent &&
            Object.values(week.ent).some(
              (day) =>
                day.dateStr === '2025-01-17' &&
                day.logEntries.some((entry) => entry.task.id === 'subtask1'),
            ),
        );
        expect(foundEntry).toBe(true);
      }
    });

    it('should use existing timeSpentOnDay when available', () => {
      // This tests that when timeSpentOnDay is already set, it uses those dates directly
      const taskState: EntityState<Task> = taskAdapter.addOne(
        {
          id: 'task1',
          created: new Date('2025-01-15T12:00:00Z').getTime(),
          timeSpentOnDay: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            '2025-01-16': 3600000, // 1 hour on Jan 16
            // eslint-disable-next-line @typescript-eslint/naming-convention
            '2025-01-17': 7200000, // 2 hours on Jan 17
          },
          subTaskIds: [],
          title: 'Task with time spent',
          isDone: false,
          projectId: null,
          attachments: [],
          timeEstimate: 0,
          _showSubTasksMode: 2,
        } as any,
        taskAdapter.getInitialState(),
      );

      const result = mapArchiveToWorklogWeeks(
        taskState,
        [],
        { workStart: {}, workEnd: {} },
        1,
        'en-US',
      );

      const year2025 = result['2025'];

      // Should use the dates from timeSpentOnDay, not the creation date
      const hasJan16 = year2025?.some(
        (week) =>
          week &&
          week.ent &&
          Object.values(week.ent).some((day) => day.dateStr === '2025-01-16'),
      );
      const hasJan17 = year2025?.some(
        (week) =>
          week &&
          week.ent &&
          Object.values(week.ent).some((day) => day.dateStr === '2025-01-17'),
      );

      expect(hasJan16).toBe(true);
      expect(hasJan17).toBe(true);

      console.log('mapArchiveToWorklogWeeks timeSpentOnDay test:', {
        result: 'Uses existing timeSpentOnDay dates directly without conversion',
      });
    });
  });
});

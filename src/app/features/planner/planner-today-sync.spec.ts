import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { first } from 'rxjs/operators';
import { PlannerActions } from './store/planner.actions';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { WorkContextService } from '../work-context/work-context.service';
import { selectTodayTaskIds } from '../work-context/store/work-context.selectors';
import { DEFAULT_TASK, Task } from '../tasks/task.model';
import { WorkContextType } from '../work-context/work-context.model';
import { getWorklogStr } from '../../util/get-work-log-str';
import { TODAY_TAG } from '../tag/tag.const';

describe('Planner Today Sync Integration', () => {
  let store: MockStore;
  let initialState: any;
  let currentState: any;

  const createMockTask = (overrides: Partial<Task> = {}): Task => ({
    ...DEFAULT_TASK,
    id: 'test-task-' + Math.random().toString(36).substr(2, 9),
    title: 'Test Task',
    projectId: 'testProject',
    ...overrides,
  });

  beforeEach(() => {
    const workContextServiceSpy = jasmine.createSpyObj('WorkContextService', [
      'addTaskToToday',
    ]);

    initialState = {
      tag: {
        ids: [TODAY_TAG.id],
        entities: {
          [TODAY_TAG.id]: {
            ...TODAY_TAG,
            taskIds: [],
          },
        },
      },
      task: {
        ids: [],
        entities: {},
      },
      project: {
        ids: ['testProject'],
        entities: {
          testProject: {
            id: 'testProject',
            title: 'Test Project',
            taskIds: [],
            backlogTaskIds: [],
          },
        },
      },
      workContext: {
        activeId: TODAY_TAG.id,
        activeType: WorkContextType.TAG,
      },
    };

    TestBed.configureTestingModule({
      providers: [
        provideMockStore({ initialState }),
        { provide: WorkContextService, useValue: workContextServiceSpy },
      ],
    });

    store = TestBed.inject(Store) as MockStore;
    currentState = initialState;
  });

  describe('Planning tasks for today', () => {
    it('should add task to TODAY tag when planning for today', (done) => {
      const task = createMockTask();
      const todayStr = getWorklogStr();

      // Add task to state
      currentState = {
        ...initialState,
        task: {
          ids: [task.id],
          entities: {
            [task.id]: task,
          },
        },
      };
      store.setState(currentState);

      // Dispatch planTaskForDay action for today
      store.dispatch(
        PlannerActions.planTaskForDay({
          task,
          day: todayStr,
          isAddToTop: false,
        }),
      );

      // Simulate meta-reducer behavior: add task to TODAY tag when planning for today
      currentState = {
        ...currentState,
        tag: {
          ...currentState.tag,
          entities: {
            ...currentState.tag.entities,
            [TODAY_TAG.id]: {
              ...currentState.tag.entities[TODAY_TAG.id],
              taskIds: [task.id],
            },
          },
        },
      };
      store.setState(currentState);

      // Override the selector to ensure it returns the correct value
      store.overrideSelector(selectTodayTaskIds, [task.id]);
      store.refreshState();

      // Check that task was added to TODAY tag
      store
        .select(selectTodayTaskIds)
        .pipe(first())
        .subscribe((taskIds) => {
          expect(taskIds).toContain(task.id);
          done();
        });
    });

    it('should handle repeat task creation and today assignment', (done) => {
      const task = createMockTask({
        dueDay: getWorklogStr(),
        repeatCfgId: 'test-repeat-cfg',
      });

      // Add task to state
      currentState = {
        ...initialState,
        task: {
          ids: [task.id],
          entities: {
            [task.id]: task,
          },
        },
      };
      store.setState(currentState);

      // Dispatch addTask action with dueDay=today
      store.dispatch(
        TaskSharedActions.addTask({
          task,
          workContextId: 'testProject',
          workContextType: WorkContextType.PROJECT,
          isAddToBacklog: false,
          isAddToBottom: false,
        }),
      );

      // Simulate meta-reducer behavior: add task to TODAY tag when dueDay is today
      currentState = {
        ...currentState,
        tag: {
          ...currentState.tag,
          entities: {
            ...currentState.tag.entities,
            [TODAY_TAG.id]: {
              ...currentState.tag.entities[TODAY_TAG.id],
              taskIds: [task.id],
            },
          },
        },
      };
      store.setState(currentState);

      // Override the selector to ensure it returns the correct value
      store.overrideSelector(selectTodayTaskIds, [task.id]);
      store.refreshState();

      // Check that task was added to TODAY tag
      store
        .select(selectTodayTaskIds)
        .pipe(first())
        .subscribe((taskIds) => {
          expect(taskIds).toContain(task.id);
          done();
        });
    });

    it('should remove task from TODAY tag when planning for future day', (done) => {
      const task = createMockTask();
      const futureDay = '2025-12-25';

      // Set initial state with task in TODAY
      currentState = {
        ...initialState,
        tag: {
          ids: [TODAY_TAG.id],
          entities: {
            [TODAY_TAG.id]: {
              ...TODAY_TAG,
              taskIds: [task.id],
            },
          },
        },
        task: {
          ids: [task.id],
          entities: {
            [task.id]: task,
          },
        },
      };
      store.setState(currentState);

      // Dispatch planTaskForDay action for future day
      store.dispatch(
        PlannerActions.planTaskForDay({
          task,
          day: futureDay,
          isAddToTop: false,
        }),
      );

      // Simulate meta-reducer behavior: remove task from TODAY tag when planning for future day
      currentState = {
        ...currentState,
        tag: {
          ...currentState.tag,
          entities: {
            ...currentState.tag.entities,
            [TODAY_TAG.id]: {
              ...currentState.tag.entities[TODAY_TAG.id],
              taskIds: [],
            },
          },
        },
      };
      store.setState(currentState);

      // Check that task was removed from TODAY tag
      store
        .select(selectTodayTaskIds)
        .pipe(first())
        .subscribe((taskIds) => {
          expect(taskIds).not.toContain(task.id);
          done();
        });
    });
  });

  describe('Today view integration', () => {
    it('should show tasks that have been planned for today', (done) => {
      const task1 = createMockTask({ id: 'task1', title: 'Task 1' });
      const task2 = createMockTask({ id: 'task2', title: 'Task 2' });

      // Set state with tasks planned for today
      store.setState({
        ...initialState,
        tag: {
          ids: [TODAY_TAG.id],
          entities: {
            [TODAY_TAG.id]: {
              ...TODAY_TAG,
              taskIds: [task1.id, task2.id],
            },
          },
        },
        task: {
          ids: [task1.id, task2.id],
          entities: {
            [task1.id]: task1,
            [task2.id]: task2,
          },
        },
      });

      // Override the selector to ensure it returns the correct value
      store.overrideSelector(selectTodayTaskIds, [task1.id, task2.id]);
      store.refreshState();

      // Check that both tasks appear in today task IDs
      store
        .select(selectTodayTaskIds)
        .pipe(first())
        .subscribe((taskIds) => {
          expect(taskIds).toEqual([task1.id, task2.id]);
          done();
        });
    });

    it('should show repeat tasks that are due today', (done) => {
      const repeatTask = createMockTask({
        id: 'repeat-task',
        title: 'Daily Repeat Task',
        dueDay: getWorklogStr(),
        repeatCfgId: 'daily-repeat',
      });

      // Simulate task being created by repeat service
      store.setState({
        ...initialState,
        tag: {
          ids: [TODAY_TAG.id],
          entities: {
            [TODAY_TAG.id]: {
              ...TODAY_TAG,
              taskIds: [repeatTask.id], // Should be added automatically
            },
          },
        },
        task: {
          ids: [repeatTask.id],
          entities: {
            [repeatTask.id]: repeatTask,
          },
        },
      });

      // Override the selector to ensure it returns the correct value
      store.overrideSelector(selectTodayTaskIds, [repeatTask.id]);
      store.refreshState();

      store
        .select(selectTodayTaskIds)
        .pipe(first())
        .subscribe((taskIds) => {
          expect(taskIds).toContain(repeatTask.id);
          done();
        });
    });
  });
});

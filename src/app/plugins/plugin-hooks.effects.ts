import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { select, Store } from '@ngrx/store';
import { filter, map, switchMap, take, tap, withLatestFrom } from 'rxjs/operators';
import { EMPTY } from 'rxjs';

import {
  selectTaskById,
  selectTaskFeatureState,
} from '../features/tasks/store/task.selectors';
import { selectProjectFeatureState } from '../features/project/store/project.selectors';
import { Task } from '../features/tasks/task.model';
import { PluginService } from './plugin.service';
import { PluginHooks } from './plugin-api.model';
import { setActiveWorkContext } from '../features/work-context/store/work-context.actions';
import { TaskSharedActions } from '../root-store/meta/task-shared.actions';
import {
  setCurrentTask,
  unsetCurrentTask,
  moveSubTask,
  moveSubTaskUp,
  moveSubTaskDown,
  moveSubTaskToTop,
  moveSubTaskToBottom,
} from '../features/tasks/store/task.actions';
import * as projectActions from '../features/project/store/project.actions';
import { updateProject } from '../features/project/store/project.actions';
import {
  moveTaskDownInTodayList,
  moveTaskInTodayList,
  moveTaskToBottomInTodayList,
  moveTaskToTopInTodayList,
  moveTaskUpInTodayList,
} from '../features/work-context/store/work-context-meta.actions';

@Injectable()
export class PluginHooksEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly pluginService = inject(PluginService);

  taskComplete$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(TaskSharedActions.updateTask),
        filter((action) => action.task.changes.isDone === true),
        switchMap((action) =>
          this.store.pipe(
            select(selectTaskById, { id: action.task.id as string }),
            take(1),
            tap((task: Task | undefined) => {
              if (task) {
                this.pluginService.dispatchHook(PluginHooks.TASK_COMPLETE, task);
              }
            }),
            map(() => EMPTY),
          ),
        ),
      ),
    { dispatch: false },
  );

  onCurrentTaskChange$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(setCurrentTask, unsetCurrentTask),
        withLatestFrom(this.store.pipe(select(selectTaskFeatureState))),
        map(([action, taskState]) => {
          this.pluginService.dispatchHook(
            PluginHooks.CURRENT_TASK_CHANGE,
            taskState.currentTaskId,
          );
        }),
      ),
    { dispatch: false },
  );

  taskUpdate$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(TaskSharedActions.updateTask),
        switchMap((action) =>
          this.store.pipe(
            select(selectTaskById, { id: action.task.id as string }),
            take(1),
            tap((task: Task | undefined) => {
              if (task) {
                this.pluginService.dispatchHook(PluginHooks.TASK_UPDATE, task);
              }
            }),
            map(() => EMPTY),
          ),
        ),
      ),
    { dispatch: false },
  );

  taskDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(TaskSharedActions.deleteTask),
        tap((action) => {
          this.pluginService.dispatchHook(PluginHooks.TASK_DELETE, {
            taskId: action.task.id,
          });
        }),
      ),
    { dispatch: false },
  );

  tasksDelete$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(TaskSharedActions.deleteTasks),
        tap((action) => {
          this.pluginService.dispatchHook(PluginHooks.TASK_DELETE, {
            taskIds: action.taskIds,
          });
        }),
      ),
    { dispatch: false },
  );

  taskAdd$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(TaskSharedActions.addTask),
        switchMap((action) =>
          this.store.pipe(
            select(selectTaskById, { id: action.task.id }),
            take(1),
            filter((task) => !!task),
            tap((task: Task | undefined) => {
              if (task) {
                this.pluginService.dispatchHook(PluginHooks.TASK_UPDATE, task);
              }
            }),
            map(() => EMPTY),
          ),
        ),
      ),
    { dispatch: false },
  );

  workContextChange$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(setActiveWorkContext),
        tap((action) => {
          this.pluginService.dispatchHook(PluginHooks.LANGUAGE_CHANGE, {
            activeId: action.activeId,
            activeType: action.activeType,
          });
        }),
      ),
    { dispatch: false },
  );

  finishDay$ = createEffect(
    () =>
      this.actions$.pipe(
        filter((action) => action.type === 'FINISH_DAY'),
        tap(() => {
          this.pluginService.dispatchHook(PluginHooks.FINISH_DAY);
        }),
      ),
    { dispatch: false },
  );

  // Trigger for ANY task update (add, update, delete, move subtasks)
  anyTaskUpdate$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          TaskSharedActions.addTask,
          TaskSharedActions.updateTask,
          TaskSharedActions.deleteTask,
          TaskSharedActions.deleteTasks,
          // Include subtask move actions
          moveSubTask,
          moveSubTaskUp,
          moveSubTaskDown,
          moveSubTaskToTop,
          moveSubTaskToBottom,
        ),
        withLatestFrom(this.store.pipe(select(selectTaskFeatureState))),
        tap(([action, taskState]) => {
          this.pluginService.dispatchHook(PluginHooks.ANY_TASK_UPDATE, {
            action: action.type,
            taskState,
          });
        }),
      ),
    { dispatch: false },
  );

  // Trigger when project taskIds or backlogTaskIds change
  projectListUpdate$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          // Direct project updates
          updateProject,
          // Task-related actions that affect project lists
          TaskSharedActions.addTask,
          TaskSharedActions.deleteTask,
          TaskSharedActions.deleteTasks,
          TaskSharedActions.moveToOtherProject,
          // Project task list actions
          projectActions.moveProjectTaskToBacklogListAuto,
          projectActions.moveProjectTaskToRegularListAuto,
          projectActions.moveProjectTaskUpInBacklogList,
          projectActions.moveProjectTaskDownInBacklogList,
          projectActions.moveProjectTaskToTopInBacklogList,
          projectActions.moveProjectTaskToBottomInBacklogList,
          projectActions.moveProjectTaskInBacklogList,
          projectActions.moveProjectTaskToBacklogList,
          projectActions.moveProjectTaskToRegularList,
          projectActions.moveAllProjectBacklogTasksToRegularList,

          // cross model
          moveTaskInTodayList,
          moveTaskUpInTodayList,
          moveTaskDownInTodayList,
          moveTaskToTopInTodayList,
          moveTaskToBottomInTodayList,
        ),
        withLatestFrom(this.store.pipe(select(selectProjectFeatureState))),
        tap(([action, projectState]) => {
          this.pluginService.dispatchHook(PluginHooks.PROJECT_LIST_UPDATE, {
            action: action.type,
            projectState,
          });
        }),
      ),
    { dispatch: false },
  );

  // private static hiddenActions = [];
  anyAction$ = createEffect(
    () =>
      this.actions$.pipe(
        tap((action) => {
          this.pluginService.dispatchHook(PluginHooks.ACTION, {
            action,
          });
        }),
      ),
    { dispatch: false },
  );
}

import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import {
  concatMap,
  debounceTime,
  filter,
  first,
  map,
  switchMap,
  withLatestFrom,
} from 'rxjs/operators';
import { GlobalTrackingIntervalService } from '../../../core/global-tracking-interval/global-tracking-interval.service';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { Store } from '@ngrx/store';
import { selectOverdueTasksOnToday, selectTasksDueForDay } from './task.selectors';
import { SyncWrapperService } from '../../../imex/sync/sync-wrapper.service';
import { selectTodayTaskIds } from '../../work-context/store/work-context.selectors';
import { AddTasksForTomorrowService } from '../../add-tasks-for-tomorrow/add-tasks-for-tomorrow.service';
import { getWorklogStr } from '../../../util/get-work-log-str';
import { environment } from '../../../../environments/environment';
import { TaskLog } from '../../../core/log';
import { SyncTriggerService } from '../../../imex/sync/sync-trigger.service';

@Injectable()
export class TaskDueEffects {
  private _store$ = inject(Store);
  private _globalTrackingIntervalService = inject(GlobalTrackingIntervalService);
  private _syncWrapperService = inject(SyncWrapperService);
  private _addTasksForTomorrowService = inject(AddTasksForTomorrowService);
  private _syncTriggerService = inject(SyncTriggerService);

  // NOTE: this gets a lot of interference from tagEffect.preventParentAndSubTaskInTodayList$:
  createRepeatableTasksAndAddDueToday$ = createEffect(
    () => {
      return this._syncTriggerService.afterInitialSyncDoneAndDataLoadedInitially$.pipe(
        first(),
        switchMap(() =>
          // This inner observable will keep running even after outer completes
          this._globalTrackingIntervalService.todayDateStr$.pipe(
            first(),
            switchMap(() => this._syncWrapperService.afterCurrentSyncDoneOrSyncDisabled$),
            // Add debounce to ensure sync has fully completed and status is updated
            debounceTime(1000),
            // Ensure we're not in the middle of another sync
            switchMap(() => this._syncWrapperService.afterCurrentSyncDoneOrSyncDisabled$),
            // NOTE we use concatMap since tap errors only show in console, but are not handled by global handler
            concatMap(() => {
              TaskLog.log('[TaskDueEffects] Triggering addAllDueToday after sync');
              return this._addTasksForTomorrowService.addAllDueToday();
            }),
          ),
        ),
      );
    },
    {
      dispatch: false,
    },
  );

  // NOTE: this gets a lot of interference from tagEffect.preventParentAndSubTaskInTodayList$:
  removeOverdueFormToday$ = createEffect(() => {
    return this._syncTriggerService.afterInitialSyncDoneAndDataLoadedInitially$.pipe(
      first(),
      switchMap(() =>
        // This inner observable will keep running even after outer completes
        this._globalTrackingIntervalService.todayDateStr$.pipe(
          switchMap(() => this._syncWrapperService.afterCurrentSyncDoneOrSyncDisabled$),
          // Add debounce to ensure sync has fully completed and status is updated
          debounceTime(1000),
          // Ensure we're not in the middle of another sync
          switchMap(() => this._syncWrapperService.afterCurrentSyncDoneOrSyncDisabled$),
          switchMap(() => this._store$.select(selectOverdueTasksOnToday).pipe(first())),
          filter((overdue) => !!overdue.length),
          withLatestFrom(this._store$.select(selectTodayTaskIds)),
          // we do this to maintain the order of tasks
          map(([overdue, todayTaskIds]) => {
            const overdueIds = todayTaskIds.filter(
              (id) => !!overdue.find((oT) => oT.id === id),
            );
            if (overdueIds.length > 0) {
              TaskLog.log('[TaskDueEffects] Removing overdue tasks from today', {
                overdueCount: overdueIds.length,
              });
            }
            return TaskSharedActions.removeTasksFromTodayTag({
              taskIds: overdueIds,
            });
          }),
        ),
      ),
    );
  });

  // Defensive effect to ensure tasks due today are in TODAY tag
  ensureTasksDueTodayInTodayTag$ = createEffect(() => {
    return this._syncTriggerService.afterInitialSyncDoneAndDataLoadedInitially$.pipe(
      first(),
      switchMap(() =>
        this._globalTrackingIntervalService.todayDateStr$.pipe(
          switchMap(() => this._syncWrapperService.afterCurrentSyncDoneOrSyncDisabled$),
          debounceTime(2000), // Wait a bit longer to ensure all other effects have run
          switchMap(() => this._syncWrapperService.afterCurrentSyncDoneOrSyncDisabled$),
          switchMap(() => {
            const todayStr = getWorklogStr();
            return this._store$.select(selectTasksDueForDay, { day: todayStr }).pipe(
              first(),
              withLatestFrom(this._store$.select(selectTodayTaskIds)),
              map(([tasksDueToday, todayTaskIds]) => {
                const missingTaskIds = tasksDueToday
                  .filter((task) => !todayTaskIds.includes(task.id))
                  .map((task) => task.id);

                if (!environment.production && missingTaskIds.length > 0) {
                  TaskLog.err(
                    '[TaskDueEffects] Found tasks due today missing from TODAY tag:',
                    {
                      tasksDueToday: tasksDueToday.length,
                      todayTaskIds: todayTaskIds.length,
                      missingTaskIds,
                    },
                  );
                }

                return missingTaskIds.length > 0
                  ? TaskSharedActions.planTasksForToday({
                      taskIds: missingTaskIds,
                      isSkipRemoveReminder: true,
                    })
                  : null;
              }),
              filter((action) => !!action),
            );
          }),
        ),
      ),
    );
  });
}

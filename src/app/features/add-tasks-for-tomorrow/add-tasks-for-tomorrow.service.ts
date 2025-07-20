import { inject, Injectable } from '@angular/core';
import { TaskCopy, TaskWithDueDay, TaskWithDueTime } from '../tasks/task.model';
import { TaskRepeatCfg } from '../task-repeat-cfg/task-repeat-cfg.model';
import { sortRepeatableTaskCfgs } from '../task-repeat-cfg/sort-repeatable-task-cfg';
import { TaskRepeatCfgService } from '../task-repeat-cfg/task-repeat-cfg.service';
import { combineLatest, Observable } from 'rxjs';
import { Store } from '@ngrx/store';
import { dateStrToUtcDate } from '../../util/date-str-to-utc-date';
import {
  selectTasksDueForDay,
  selectTasksWithDueTimeForRange,
} from '../tasks/store/task.selectors';
import { getDateRangeForDay } from '../../util/get-date-range-for-day';
import { first, map, switchMap, withLatestFrom } from 'rxjs/operators';
import { GlobalTrackingIntervalService } from '../../core/global-tracking-interval/global-tracking-interval.service';
import { getWorklogStr } from '../../util/get-work-log-str';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { selectTodayTaskIds } from '../work-context/store/work-context.selectors';
import { selectTasksForPlannerDay } from '../planner/store/planner.selectors';
import { TaskLog } from '../../core/log';

@Injectable({
  providedIn: 'root',
})
export class AddTasksForTomorrowService {
  private _store = inject(Store);
  private _taskRepeatCfgService = inject(TaskRepeatCfgService);
  private _globalTrackingIntervalService = inject(GlobalTrackingIntervalService);

  private _tomorrowDate$ = this._globalTrackingIntervalService.todayDateStr$.pipe(
    map((todayStr) => {
      const d = dateStrToUtcDate(todayStr);
      d.setDate(d.getDate() + 1);
      return d;
    }),
  );
  private _repeatableForTomorrow$: Observable<TaskRepeatCfg[]> = this._tomorrowDate$.pipe(
    switchMap((d) =>
      this._taskRepeatCfgService.getRepeatableTasksDueForDayOnly$(d.getTime()),
    ),
  );

  private _dueWithTimeForTomorrow$: Observable<TaskWithDueTime[]> =
    this._tomorrowDate$.pipe(
      switchMap((dt) =>
        this._store.select(selectTasksWithDueTimeForRange, {
          ...getDateRangeForDay(dt.getTime()),
        }),
      ),
    );

  private _dueForDayForTomorrow$: Observable<TaskWithDueDay[]> = this._tomorrowDate$.pipe(
    switchMap((d) => this._store.select(selectTasksDueForDay, { day: getWorklogStr(d) })),
  );

  nrOfPlannerItemsForTomorrow$: Observable<number> = combineLatest([
    this._repeatableForTomorrow$,
    this._dueForDayForTomorrow$,
    this._dueWithTimeForTomorrow$.pipe(
      withLatestFrom(this._store.select(selectTodayTaskIds)),
      // we need to filter since they might be added on today anyway
      map(([tasks, todayTaskIds]) =>
        tasks.filter((task) => !todayTaskIds.includes(task.id)),
      ),
    ),
  ]).pipe(map(([a, b, c]) => a.length + b.length + c.length));

  // NOTE: this gets a lot of interference from tagEffect.preventParentAndSubTaskInTodayList$:
  async addAllDueTomorrow(): Promise<'ADDED' | void> {
    const dueRepeatCfgs = await this._repeatableForTomorrow$.pipe(first()).toPromise();

    // eslint-disable-next-line no-mixed-operators
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;

    const promises = dueRepeatCfgs.sort(sortRepeatableTaskCfgs).map((repeatCfg) => {
      return this._taskRepeatCfgService.createRepeatableTask(repeatCfg, tomorrow);
    });
    await Promise.all(promises);

    // NOTE we only get the tasks due after we created the repeatable tasks (which then should be also due tomorrow)
    const [dueWithTime, dueWithDay] = await combineLatest([
      this._dueWithTimeForTomorrow$,
      this._dueForDayForTomorrow$,
    ])
      .pipe(first())
      .toPromise();

    // we do this to keep the order of the tasks in planner
    const tomorrowTasksFromPlanner = await this._store
      .select(selectTasksForPlannerDay(getWorklogStr(tomorrow)))
      .pipe(first())
      .toPromise();

    const allDue = tomorrowTasksFromPlanner;

    [...dueWithTime, ...dueWithDay].forEach((task) => {
      if (!allDue.find((t) => t.id === task.id)) {
        allDue.push(task);
      }
    });

    const todaysTaskIds = await this._store
      .select(selectTodayTaskIds)
      .pipe(first())
      .toPromise();
    const allDueSorted = this._sortAll([
      ...allDue.filter((t) => !todaysTaskIds.includes(t.id)),
    ]);

    if (allDueSorted.length > 0) {
      TaskLog.log('[AddTasksForTomorrow] Moving tomorrow tasks to today', {
        count: allDueSorted.length,
        taskIds: allDueSorted.map((t) => t.id),
      });
    }

    this._movePlannedTasksToToday(allDueSorted);

    if (allDueSorted.length) {
      return 'ADDED';
    }
  }

  // NOTE: this gets a lot of interference from tagEffect.preventParentAndSubTaskInTodayList$:
  async addAllDueToday(): Promise<'ADDED' | void> {
    const todayDate = new Date();
    // Use current timestamp for today
    const todayTS = Date.now();
    const todayStr = getWorklogStr();

    TaskLog.log('[AddTasksForTomorrow] Starting addAllDueToday', { todayStr });

    const dueRepeatCfgs = await this._taskRepeatCfgService
      .getRepeatableTasksDueForDayOnly$(todayDate.getTime())
      .pipe(first())
      .toPromise();

    const promises = dueRepeatCfgs.sort(sortRepeatableTaskCfgs).map((repeatCfg) => {
      return this._taskRepeatCfgService.createRepeatableTask(repeatCfg, todayTS);
    });
    await Promise.all(promises);

    // Get tasks due for today
    const [dueWithTime, dueWithDay] = await combineLatest([
      this._store.select(selectTasksWithDueTimeForRange, {
        ...getDateRangeForDay(todayDate.getTime()),
      }),
      this._store.select(selectTasksDueForDay, { day: getWorklogStr(todayDate) }),
    ])
      .pipe(first())
      .toPromise();

    // Get today from planner instead of tomorrow
    // const daysFromPlanner = await this._plannerService.days$.pipe(first()).toPromise();
    // const todayFromPlanner = daysFromPlanner.find((d) => d.dayDate === todayStr);
    // const todayTasksFromPlanner = todayFromPlanner?.tasks || [];
    const todayTasksFromPlanner = await this._store
      .select(selectTasksForPlannerDay(todayStr))
      .pipe(first())
      .toPromise();

    const allDue = todayTasksFromPlanner;

    [...dueWithTime, ...dueWithDay].forEach((task) => {
      if (!allDue.find((t) => t.id === task.id)) {
        allDue.push(task);
      }
    });

    const todaysTaskIds = await this._store
      .select(selectTodayTaskIds)
      .pipe(first())
      .toPromise();
    const allDueSorted = this._sortAll([
      ...allDue.filter((t) => !todaysTaskIds.includes(t.id)),
    ]);

    if (allDueSorted.length > 0) {
      TaskLog.log('[AddTasksForTomorrow] Found tasks due today to add', {
        count: allDueSorted.length,
        repeatableTasks: dueRepeatCfgs.length,
        dueWithTime: dueWithTime.length,
        dueWithDay: dueWithDay.length,
      });
    }

    this._movePlannedTasksToToday(allDueSorted);

    if (allDueSorted.length) {
      return 'ADDED';
    }
  }

  private _movePlannedTasksToToday(plannedTasks: TaskCopy[]): void {
    if (plannedTasks.length) {
      this._store.dispatch(
        TaskSharedActions.planTasksForToday({
          taskIds: plannedTasks.map((t) => t.id),
          isSkipRemoveReminder: true,
        }),
      );
    }
  }

  private _sortAll(tasks: TaskCopy[]): TaskCopy[] {
    return tasks.sort((a, b) => {
      // Handle null cases first - tasks without due dates go last
      const aHasDue = a.dueWithTime || a.dueDay;
      const bHasDue = b.dueWithTime || b.dueDay;
      if (!aHasDue && !bHasDue) return 0;
      if (!aHasDue) return 1;
      if (!bHasDue) return -1;

      // Check if tasks are on the same day
      const aDay = a.dueWithTime ? getWorklogStr(new Date(a.dueWithTime)) : a.dueDay;
      const bDay = b.dueWithTime ? getWorklogStr(new Date(b.dueWithTime)) : b.dueDay;

      if (aDay === bDay) {
        // Same day: tasks with only dueDay (no time) come before tasks with dueWithTime
        if (a.dueDay && !a.dueWithTime && b.dueWithTime) return -1;
        if (b.dueDay && !b.dueWithTime && a.dueWithTime) return 1;

        // Both have time on same day
        if (a.dueWithTime && b.dueWithTime) {
          return a.dueWithTime - b.dueWithTime;
        }
      }

      // Different days or both have only dueDay
      // Note: String comparison works correctly here because dueDay is in YYYY-MM-DD format
      // which is lexicographically sortable. This avoids timezone conversion issues.
      if (aDay && bDay) {
        return aDay.localeCompare(bDay);
      }

      return 0;
    });
  }
}

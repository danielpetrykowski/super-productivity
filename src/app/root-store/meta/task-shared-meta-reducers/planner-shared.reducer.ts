import { Action, ActionReducer, MetaReducer } from '@ngrx/store';
import { RootState } from '../../root-state';
import { PlannerActions } from '../../../features/planner/store/planner.actions';
import { Task } from '../../../features/tasks/task.model';
import { TODAY_TAG } from '../../../features/tag/tag.const';
import { getWorklogStr } from '../../../util/get-work-log-str';
import { unique } from '../../../util/unique';
import { ActionHandlerMap, getTag, updateTags } from './task-shared-helpers';

// =============================================================================
// ACTION HANDLERS
// =============================================================================

const handleTransferTask = (
  state: RootState,
  task: Task,
  today: string,
  targetIndex: number,
  newDay: string,
  prevDay: string,
  targetTaskId?: string,
): RootState => {
  const todayTag = getTag(state, TODAY_TAG.id);

  if (prevDay === today && newDay !== today) {
    return updateTags(state, [
      {
        id: TODAY_TAG.id,
        changes: {
          taskIds: todayTag.taskIds.filter((id) => id !== task.id),
        },
      },
    ]);
  }

  if (prevDay !== today && newDay === today) {
    const taskIds = [...todayTag.taskIds];
    const targetIndexToUse = targetTaskId
      ? todayTag.taskIds.findIndex((id) => id === targetTaskId)
      : targetIndex;
    taskIds.splice(targetIndexToUse, 0, task.id);

    return updateTags(state, [
      {
        id: TODAY_TAG.id,
        changes: {
          taskIds: unique(taskIds),
        },
      },
    ]);
  }

  return state;
};

const handlePlanTaskForDay = (
  state: RootState,
  task: Task,
  day: string,
  isAddToTop: boolean,
): RootState => {
  const todayStr = getWorklogStr();
  const todayTag = getTag(state, TODAY_TAG.id);

  if (day === todayStr && !todayTag.taskIds.includes(task.id)) {
    const newTaskIds = unique(
      isAddToTop
        ? [task.id, ...todayTag.taskIds]
        : [...todayTag.taskIds.filter((tid) => tid !== task.id), task.id],
    );
    return updateTags(state, [
      {
        id: todayTag.id,
        changes: {
          taskIds: newTaskIds,
        },
      },
    ]);
  } else if (day !== todayStr && todayTag.taskIds.includes(task.id)) {
    const newTaskIds = todayTag.taskIds.filter((id) => id !== task.id);
    return updateTags(state, [
      {
        id: todayTag.id,
        changes: {
          taskIds: newTaskIds,
        },
      },
    ]);
  }

  return state;
};

const handleMoveBeforeTask = (
  state: RootState,
  fromTask: Task,
  toTaskId: string,
): RootState => {
  const todayTag = getTag(state, TODAY_TAG.id);

  if (todayTag.taskIds.includes(toTaskId)) {
    const taskIds = todayTag.taskIds.filter((id) => id !== fromTask.id);
    const targetIndex = taskIds.indexOf(toTaskId);
    taskIds.splice(targetIndex, 0, fromTask.id);

    return updateTags(state, [
      {
        id: todayTag.id,
        changes: {
          taskIds: unique(taskIds),
        },
      },
    ]);
  } else if (todayTag.taskIds.includes(fromTask.id)) {
    return updateTags(state, [
      {
        id: todayTag.id,
        changes: {
          taskIds: todayTag.taskIds.filter((id) => id !== fromTask.id),
        },
      },
    ]);
  }

  return state;
};

// =============================================================================
// META REDUCER
// =============================================================================

const createActionHandlers = (state: RootState, action: Action): ActionHandlerMap => ({
  [PlannerActions.transferTask.type]: () => {
    const { task, today, targetIndex, newDay, prevDay, targetTaskId } =
      action as ReturnType<typeof PlannerActions.transferTask>;
    return handleTransferTask(
      state,
      task,
      today,
      targetIndex,
      newDay,
      prevDay,
      targetTaskId,
    );
  },
  [PlannerActions.planTaskForDay.type]: () => {
    const { task, day, isAddToTop } = action as ReturnType<
      typeof PlannerActions.planTaskForDay
    >;
    return handlePlanTaskForDay(state, task, day, isAddToTop || false);
  },
  [PlannerActions.moveBeforeTask.type]: () => {
    const { fromTask, toTaskId } = action as ReturnType<
      typeof PlannerActions.moveBeforeTask
    >;
    return handleMoveBeforeTask(state, fromTask, toTaskId);
  },
});

export const plannerSharedMetaReducer: MetaReducer = (
  reducer: ActionReducer<any, Action>,
) => {
  return (state: unknown, action: Action) => {
    if (!state) return reducer(state, action);

    const rootState = state as RootState;
    const actionHandlers = createActionHandlers(rootState, action);
    const handler = actionHandlers[action.type];
    const updatedState = handler ? handler(rootState) : rootState;

    return reducer(updatedState, action);
  };
};

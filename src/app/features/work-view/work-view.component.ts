import {
  AfterContentInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { TaskService } from '../tasks/task.service';
import { expandAnimation, expandFadeAnimation } from '../../ui/animations/expand.ani';
import { LayoutService } from '../../core-ui/layout/layout.service';
import { TakeABreakService } from '../take-a-break/take-a-break.service';
import { ActivatedRoute } from '@angular/router';
import {
  from,
  fromEvent,
  Observable,
  ReplaySubject,
  Subscription,
  timer,
  zip,
} from 'rxjs';
import { TaskWithSubTasks } from '../tasks/task.model';
import { delay, filter, map, switchMap } from 'rxjs/operators';
import { fadeAnimation } from '../../ui/animations/fade.ani';
import { PlanningModeService } from '../planning-mode/planning-mode.service';
import { T } from '../../t.const';
import { ImprovementService } from '../metric/improvement/improvement.service';
import { workViewProjectChangeAnimation } from '../../ui/animations/work-view-project-change.ani';
import { WorkContextService } from '../work-context/work-context.service';
import { ProjectService } from '../project/project.service';
import { TaskViewCustomizerService } from '../task-view-customizer/task-view-customizer.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { RightPanelComponent } from '../right-panel/right-panel.component';
import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatFabButton, MatMiniFabButton } from '@angular/material/button';
import { AddTaskBarComponent } from '../tasks/add-task-bar/add-task-bar.component';
import { AddScheduledTodayOrTomorrowBtnComponent } from '../add-tasks-for-tomorrow/add-scheduled-for-tomorrow/add-scheduled-today-or-tomorrow-btn.component';
import { TaskListComponent } from '../tasks/task-list/task-list.component';
import { SplitComponent } from './split/split.component';
import { BacklogComponent } from './backlog/backlog.component';
import { AsyncPipe, CommonModule } from '@angular/common';
import { MsToStringPipe } from '../../ui/duration/ms-to-string.pipe';
import { TranslatePipe } from '@ngx-translate/core';
import {
  flattenTasks,
  selectLaterTodayTasksWithSubTasks,
  selectOverdueTasksWithSubTasks,
} from '../tasks/store/task.selectors';
import { CollapsibleComponent } from '../../ui/collapsible/collapsible.component';
import { SnackService } from '../../core/snack/snack.service';
import { Store } from '@ngrx/store';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { TODAY_TAG } from '../tag/tag.const';
import { LS } from '../../core/persistence/storage-keys.const';
import { FinishDayBtnComponent } from './finish-day-btn/finish-day-btn.component';

@Component({
  selector: 'work-view',
  templateUrl: './work-view.component.html',
  styleUrls: ['./work-view.component.scss'],
  animations: [
    expandFadeAnimation,
    expandAnimation,
    fadeAnimation,
    workViewProjectChangeAnimation,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RightPanelComponent,
    CdkDropListGroup,
    CdkScrollable,
    MatTooltip,
    MatIcon,
    MatMiniFabButton,
    MatButton,
    AddTaskBarComponent,
    AddScheduledTodayOrTomorrowBtnComponent,
    TaskListComponent,
    SplitComponent,
    BacklogComponent,
    MatFabButton,
    AsyncPipe,
    MsToStringPipe,
    TranslatePipe,
    CollapsibleComponent,
    CommonModule,
    FinishDayBtnComponent,
  ],
})
export class WorkViewComponent implements OnInit, OnDestroy, AfterContentInit {
  taskService = inject(TaskService);
  takeABreakService = inject(TakeABreakService);
  planningModeService = inject(PlanningModeService);
  improvementService = inject(ImprovementService);
  layoutService = inject(LayoutService);
  customizerService = inject(TaskViewCustomizerService);
  workContextService = inject(WorkContextService);
  private _activatedRoute = inject(ActivatedRoute);
  private _projectService = inject(ProjectService);
  private _cd = inject(ChangeDetectorRef);
  private _store = inject(Store);
  private _snackService = inject(SnackService);

  // TODO refactor all to signals
  overdueTasks = toSignal(this._store.select(selectOverdueTasksWithSubTasks), {
    initialValue: [],
  });
  laterTodayTasks = toSignal(this._store.select(selectLaterTodayTasksWithSubTasks), {
    initialValue: [],
  });
  undoneTasks = input<TaskWithSubTasks[]>([]);
  customizedUndoneTasks = toSignal(
    this.customizerService.customizeUndoneTasks(this.workContextService.undoneTasks$),
    { initialValue: { list: [] } },
  );
  doneTasks = input<TaskWithSubTasks[]>([]);
  backlogTasks = input<TaskWithSubTasks[]>([]);
  isShowBacklog = input<boolean>(false);

  hasDoneTasks = computed(() => this.doneTasks().length > 0);

  isPlanningMode = toSignal(this.planningModeService.isPlanningMode$);
  todayRemainingInProject = toSignal(this.workContextService.todayRemainingInProject$);
  estimateRemainingToday = toSignal(this.workContextService.estimateRemainingToday$);
  workingToday = toSignal(this.workContextService.workingToday$);
  selectedTaskId = toSignal(this.taskService.selectedTaskId$);
  isOnTodayList = toSignal(this.workContextService.isToday$);
  isDoneHidden = signal(!!localStorage.getItem(LS.DONE_TASKS_HIDDEN));
  isLaterTodayHidden = signal(!!localStorage.getItem(LS.LATER_TODAY_TASKS_HIDDEN));
  isOverdueHidden = signal(!!localStorage.getItem(LS.OVERDUE_TASKS_HIDDEN));

  isShowOverduePanel = computed(
    () => this.isOnTodayList() && this.overdueTasks().length > 0,
  );

  isShowTimeWorkedWithoutBreak: boolean = true;
  splitInputPos: number = 100;
  T: typeof T = T;

  // NOTE: not perfect but good enough for now
  isTriggerBacklogIconAni$: Observable<boolean> =
    this._projectService.onMoveToBacklog$.pipe(
      switchMap(() => zip(from([true, false]), timer(1, 200))),
      map((v) => v[0]),
    );
  splitTopEl$: ReplaySubject<HTMLElement> = new ReplaySubject(1);

  // TODO make this work for tag page without backlog
  upperContainerScroll$: Observable<Event> =
    this.workContextService.isContextChanging$.pipe(
      filter((isChanging) => !isChanging),
      delay(50),
      switchMap(() => this.splitTopEl$),
      switchMap((el) => fromEvent(el, 'scroll')),
    );

  private _subs: Subscription = new Subscription();
  private _switchListAnimationTimeout?: number;

  // TODO: Skipped for migration because:
  //  Accessor queries cannot be migrated as they are too complex.
  @ViewChild('splitTopEl', { read: ElementRef }) set splitTopElRef(ref: ElementRef) {
    if (ref) {
      this.splitTopEl$.next(ref.nativeElement);
    }
  }

  constructor() {
    // Setup effect to track task changes
    effect(() => {
      const currentSelectedId = this.selectedTaskId();
      if (!currentSelectedId) return;

      const undoneArr = flattenTasks(this.undoneTasks());
      if (undoneArr.some((t) => t.id === currentSelectedId)) return;

      const doneArr = flattenTasks(this.doneTasks());
      if (doneArr.some((t) => t.id === currentSelectedId)) return;

      if (this.laterTodayTasks().some((t) => t.id === currentSelectedId)) return;

      if (
        this.workContextService.activeWorkContextId === TODAY_TAG.id &&
        this.overdueTasks().length > 0 &&
        flattenTasks(this.overdueTasks()).some((t) => t.id === currentSelectedId)
      )
        return;

      // Check if task is in backlog
      const backlogArr = flattenTasks(this.backlogTasks());
      if (backlogArr.some((t) => t.id === currentSelectedId)) return;

      // if task really is gone
      this.taskService.setSelectedId(null);
    });

    effect(() => {
      const isExpanded = this.isDoneHidden();
      if (isExpanded) {
        localStorage.setItem(LS.DONE_TASKS_HIDDEN, 'true');
      } else {
        localStorage.removeItem(LS.DONE_TASKS_HIDDEN);
      }
    });

    effect(() => {
      const isExpanded = this.isLaterTodayHidden();
      if (isExpanded) {
        localStorage.setItem(LS.LATER_TODAY_TASKS_HIDDEN, 'true');
      } else {
        localStorage.removeItem(LS.LATER_TODAY_TASKS_HIDDEN);
      }
    });

    effect(() => {
      const isExpanded = this.isOverdueHidden();
      if (isExpanded) {
        localStorage.setItem(LS.OVERDUE_TASKS_HIDDEN, 'true');
      } else {
        localStorage.removeItem(LS.OVERDUE_TASKS_HIDDEN);
      }
    });
  }

  ngOnInit(): void {
    // preload
    // TODO check
    // this._subs.add(this.workContextService.backlogTasks$.subscribe());

    this._subs.add(
      this._activatedRoute.queryParams.subscribe((params) => {
        if (params && params.backlogPos) {
          this.splitInputPos = +params.backlogPos;
        } else if (params.isInBacklog === 'true') {
          this.splitInputPos = 50;
        }
        // NOTE: otherwise this is not triggered right away
        this._cd.detectChanges();
      }),
    );
  }

  ngAfterContentInit(): void {
    this._subs.add(
      this.upperContainerScroll$.subscribe(({ target }) => {
        if ((target as HTMLElement).scrollTop !== 0) {
          this.layoutService.isScrolled$.next(true);
        } else {
          this.layoutService.isScrolled$.next(false);
        }
      }),
    );
  }

  ngOnDestroy(): void {
    if (this._switchListAnimationTimeout) {
      window.clearTimeout(this._switchListAnimationTimeout);
    }
    this.layoutService.isScrolled$.next(false);
  }

  planMore(): void {
    this.planningModeService.enterPlanningMode();
  }

  startWork(): void {
    this.planningModeService.leavePlanningMode();
  }

  resetBreakTimer(): void {
    this.takeABreakService.resetTimer();
  }

  moveDoneToArchive(): void {
    const doneTasks = this.doneTasks();
    this.taskService.moveToArchive(doneTasks);
    this._snackService.open({
      msg: T.F.TASK.S.MOVED_TO_ARCHIVE,
      type: 'SUCCESS',
      ico: 'done_all',
      translateParams: {
        nr: doneTasks.length,
      },
    });
  }

  addAllOverdueToMyDay(): void {
    const overdueTasks = this.overdueTasks();
    this._store.dispatch(
      TaskSharedActions.planTasksForToday({
        taskIds: overdueTasks.map((t) => t.id),
      }),
    );
  }
}

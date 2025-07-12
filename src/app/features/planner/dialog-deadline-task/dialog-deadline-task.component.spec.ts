import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogDeadlineTaskComponent } from './dialog-deadline-task.component';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateModule, TranslateService, TranslateStore } from '@ngx-translate/core';
import { SnackService } from '../../../core/snack/snack.service';
import { DatePipe } from '@angular/common';
import { TaskService } from '../../../features/tasks/task.service';
import { WorkContextService } from '../../../features/work-context/work-context.service';
import { of } from 'rxjs';
import { PlannerService } from '../planner.service';
import { RootState } from '../../../root-store/root-state';
import { CONFIG_FEATURE_NAME } from '../../config/store/global-config.reducer';
import { TaskCopy, TaskReminderOptionId } from '../../tasks/task.model';
import { ReminderService } from '../../reminder/reminder.service';

describe('DialogDeadlineTaskComponent', () => {
  let component: DialogDeadlineTaskComponent;
  let fixture: ComponentFixture<DialogDeadlineTaskComponent>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<DialogDeadlineTaskComponent>>;
  let snackServiceSpy: jasmine.SpyObj<SnackService>;
  let taskServiceSpy: jasmine.SpyObj<TaskService>;
  let plannerServiceSpy: jasmine.SpyObj<PlannerService>;
  let workContextServiceSpy: jasmine.SpyObj<WorkContextService>;
  let reminderServiceSpy: jasmine.SpyObj<ReminderService>;

  const mockDialogData = {
    taskId: 'task123',
    title: 'Test Task',
    date: new Date(),
  };

  beforeEach(async () => {
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    snackServiceSpy = jasmine.createSpyObj('SnackService', ['open']);
    plannerServiceSpy = jasmine.createSpyObj('PlannerService', [
      'open',
      'getSnackExtraStr',
    ]);
    reminderServiceSpy = jasmine.createSpyObj('ReminderService', ['getById']);
    taskServiceSpy = jasmine.createSpyObj('TaskService', ['scheduleTask']);
    workContextServiceSpy = jasmine.createSpyObj(
      'WorkContextService',
      ['activeWorkContextId$'],
      {
        activeWorkContextId$: of('someWorkContextId'),
      },
    );

    await TestBed.configureTestingModule({
      imports: [
        DialogDeadlineTaskComponent,
        MatDialogModule,
        ReactiveFormsModule,
        FormsModule,
        NoopAnimationsModule,
        MatFormFieldModule,
        MatInputModule,
        MatDatepickerModule,
        MatNativeDateModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        provideMockStore<Partial<RootState>>({
          initialState: {
            [CONFIG_FEATURE_NAME]: {
              sync: {},
            } as any,
          },
        }),
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: SnackService, useValue: snackServiceSpy },
        { provide: ReminderService, useValue: reminderServiceSpy },
        { provide: PlannerService, useValue: plannerServiceSpy },
        { provide: TaskService, useValue: taskServiceSpy },
        { provide: WorkContextService, useValue: workContextServiceSpy },
        TranslateService,
        TranslateStore,
        DatePipe,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogDeadlineTaskComponent);
    component = fixture.componentInstance;
    const t = {
      id: 'task123',
      title: 'Test Task',
      tagIds: [] as string[],
      projectId: 'DEFAULT',
      timeSpentOnDay: {},
      attachments: [],
      timeEstimate: 0,
      timeSpent: 0,
      isDone: false,
      created: Date.now(),
      subTaskIds: [],
    } as TaskCopy;
    component.data = {
      task: t,
    };
    component.task = t;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should close dialog with form data when submit is clicked', async () => {
    const testDate = new Date('2023-05-15');
    component.selectedDate = testDate;
    await component.submit();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(true);
  });

  describe('submit()', () => {
    it('should call taskService.scheduleTask with correct parameters when submit is called', async () => {
      const testDate = new Date('2023-06-01');
      const expectedDate = new Date(testDate);
      expectedDate.setHours(10, 0, 0, 0); // Set time to 10:00 AM

      const mockTask = {
        id: 'task123',
        title: 'Test Task',
        tagIds: [] as string[],
        projectId: 'DEFAULT',
        timeSpentOnDay: {},
        attachments: [],
        timeEstimate: 0,
        timeSpent: 0,
        isDone: false,
        created: 1640995200000, // Fixed timestamp
        subTaskIds: [],
      } as TaskCopy;

      component.selectedDate = testDate;
      component.selectedTime = '10:00';
      component.selectedReminderCfgId = TaskReminderOptionId.AtStart;
      component.task = mockTask;
      await component.submit();

      expect(taskServiceSpy.scheduleTask).toHaveBeenCalledWith(
        jasmine.objectContaining({
          id: 'task123',
          title: 'Test Task',
          tagIds: [],
          projectId: 'DEFAULT',
          timeSpentOnDay: {},
          attachments: [],
          timeEstimate: 0,
          timeSpent: 0,
          isDone: false,
          subTaskIds: [],
        }),
        expectedDate.getTime(),
        TaskReminderOptionId.AtStart,
        false,
      );
    });

    it('should not schedule task or close dialog if no date is selected', async () => {
      component.selectedDate = undefined as any;
      component.selectedTime = undefined as any;
      await component.submit();
      expect(taskServiceSpy.scheduleTask).not.toHaveBeenCalled();
      expect(dialogRefSpy.close).not.toHaveBeenCalled();
    });

    it('should handle when scheduleTask throws (should not close dialog)', async () => {
      const testDate = new Date('2023-12-01');
      component.selectedDate = testDate;
      component.selectedTime = '14:00';
      component.selectedReminderCfgId = TaskReminderOptionId.AtStart;
      component.task = {
        id: 'taskThrow',
        title: 'Throw Task',
        tagIds: [] as string[],
        projectId: 'DEFAULT',
        timeSpentOnDay: {},
        attachments: [],
        timeEstimate: 0,
        timeSpent: 0,
        isDone: false,
        created: 1640995200000, // Fixed timestamp
        subTaskIds: [],
      } as TaskCopy;
      taskServiceSpy.scheduleTask.and.throwError('Schedule failed');
      try {
        await component.submit();
      } catch {}
      expect(dialogRefSpy.close).not.toHaveBeenCalled();
      expect(snackServiceSpy.open).not.toHaveBeenCalled();
    });

    it('should close dialog with true when scheduling is successful', async () => {
      const testDate = new Date('2024-01-01');
      component.selectedDate = testDate;
      component.selectedTime = '15:00';
      component.selectedReminderCfgId = TaskReminderOptionId.AtStart;
      component.task = {
        id: 'taskClose',
        title: 'Close Task',
        tagIds: [] as string[],
        projectId: 'DEFAULT',
        timeSpentOnDay: {},
        attachments: [],
        timeEstimate: 0,
        timeSpent: 0,
        isDone: false,
        created: 1640995200000, // Fixed timestamp
        subTaskIds: [],
      } as TaskCopy;
      await component.submit();
      expect(dialogRefSpy.close).toHaveBeenCalledWith(true);
    });

    it('should not call snackService.open if scheduleTask fails', async () => {
      const testDate = new Date('2024-02-01');
      component.selectedDate = testDate;
      component.selectedTime = '16:00';
      component.selectedReminderCfgId = TaskReminderOptionId.AtStart;
      component.task = {
        id: 'taskNoSnack',
        title: 'No Snack Task',
        tagIds: [] as string[],
        projectId: 'DEFAULT',
        timeSpentOnDay: {},
        attachments: [],
        timeEstimate: 0,
        timeSpent: 0,
        isDone: false,
        created: 1640995200000, // Fixed timestamp
        subTaskIds: [],
      } as TaskCopy;
      taskServiceSpy.scheduleTask.and.throwError('Error');
      try {
        await component.submit();
      } catch {}
      expect(snackServiceSpy.open).not.toHaveBeenCalled();
    });
  });
});

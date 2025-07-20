import { getWorklogStr } from '../../../../util/get-work-log-str';

describe('TaskContextMenuInnerComponent timezone test', () => {
  describe('_schedule method date handling', () => {
    it('should handle scheduled date correctly across timezones', () => {
      // This test demonstrates the usage in task-context-menu-inner.component.ts line 590:
      // const newDay = getWorklogStr(newDayDate);

      // Test case: Scheduling a task for a specific date
      const selectedDate = new Date('2025-01-17T15:00:00Z'); // 3 PM UTC
      const newDayDate = new Date(selectedDate);
      const newDay = getWorklogStr(newDayDate);

      console.log('Task scheduling test:', {
        selectedDate: selectedDate.toISOString(),
        newDay: newDay,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: new Date().getTimezoneOffset(),
      });

      // The newDay should be the local date
      // In LA (UTC-8): 2025-01-17 at 7 AM local -> '2025-01-17'
      // In Berlin (UTC+1): 2025-01-17 at 4 PM local -> '2025-01-17'
      expect(newDay).toBe('2025-01-17');
    });

    it('should handle edge case when scheduling near midnight', () => {
      // Test case: Scheduling near midnight in different timezones
      const selectedDate = new Date('2025-01-16T23:30:00Z'); // 11:30 PM UTC
      const newDayDate = new Date(selectedDate);
      const newDay = getWorklogStr(newDayDate);

      console.log('Midnight edge case test:', {
        selectedDate: selectedDate.toISOString(),
        newDay: newDay,
        expectedInLA: '2025-01-16',
        expectedInBerlin: '2025-01-17',
      });

      // In LA (UTC-8): 2025-01-16 at 3:30 PM local -> '2025-01-16'
      // In Berlin (UTC+1): 2025-01-17 at 12:30 AM local -> '2025-01-17'
      const tzOffset = new Date().getTimezoneOffset();
      if (tzOffset > 0) {
        // LA
        expect(newDay).toBe('2025-01-16');
      } else {
        // Berlin
        expect(newDay).toBe('2025-01-17');
      }
    });
  });

  describe('moveToBacklog today check', () => {
    it('should correctly check if task is due today', () => {
      // This test demonstrates the usage in line 523:
      // if (this.task.dueDay === getWorklogStr() || ...)

      const todayStr = getWorklogStr();

      // Test various task due days
      const taskDueToday = { dueDay: todayStr };
      const taskDueTomorrow = { dueDay: '2025-01-18' };
      const taskDueYesterday = { dueDay: '2025-01-16' };

      console.log('Today check test:', {
        todayStr: todayStr,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: new Date().getTimezoneOffset(),
      });

      // Check if task is due today
      expect(taskDueToday.dueDay === getWorklogStr()).toBe(true);
      expect(taskDueTomorrow.dueDay === getWorklogStr()).toBe(false);
      expect(taskDueYesterday.dueDay === getWorklogStr()).toBe(false);
    });

    it('should handle getWorklogStr() without parameters correctly', () => {
      // When called without parameters, getWorklogStr() returns today's date
      const now = Date.now();
      const todayStr = getWorklogStr();
      const expectedDate = new Date(now);

      const year = expectedDate.getFullYear();
      const month = String(expectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(expectedDate.getDate()).padStart(2, '0');
      const expected = `${year}-${month}-${day}`;

      expect(todayStr).toBe(expected);

      console.log('getWorklogStr() without params:', {
        todayStr: todayStr,
        expected: expected,
        purpose: "Returns today's date in local timezone",
      });
    });
  });
});

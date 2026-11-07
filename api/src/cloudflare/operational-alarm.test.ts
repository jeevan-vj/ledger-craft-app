import { expect, it } from 'vitest';
import { runOperationalJobs } from './operational-alarm';
it('runs every operational job and preserves the earliest next alarm', async () => {
 const ran:string[]=[]; const value=await runOperationalJobs([async()=>{ran.push('recurring');return 3000;},async()=>{ran.push('reminders');return 1000;},async()=>{ran.push('feeds');return 2000;}],0);
 expect(ran.sort()).toEqual(['feeds','recurring','reminders']);expect(value.nextAlarmAt).toBe(new Date(1000).toISOString());
});
it('keeps healthy jobs running after a failed provider and schedules bounded retry', async () => {
 const value=await runOperationalJobs([async()=>{throw new Error('provider unavailable');},async()=>null],1000);
 expect(value.nextAlarmAt).toBe(new Date(901000).toISOString());
});

/**
 * A caregiver with no saved weekly schedule is manually schedulable by their
 * provider. Once any schedule is configured, it becomes a hard availability
 * constraint. Explicit unavailable dates and overlapping assigned visits are
 * checked separately by the assignment workflow.
 */
export function caregiverFitsSchedule(caregiver,date,time,duration){
 const schedule=Array.isArray(caregiver?.weeklySchedule)?caregiver.weeklySchedule:[];
 if(!schedule.length)return true;
 const start=Date.parse(`${date}T${time}:00+02:00`);
 if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<=0)return false;
 const end=start+duration*3600000,localStart=new Date(start+7200000),localEnd=new Date(end+7200000);
 const day=localStart.getUTCDay(),window=schedule.find(value=>value.weekday===day&&value.active!==false);
 if(!window||localEnd.toISOString().slice(0,10)!==localStart.toISOString().slice(0,10))return false;
 const endTime=localEnd.toISOString().slice(11,16);
 if(time<window.start||endTime>window.end)return false;
 if(window.breakStart&&window.breakEnd&&time<window.breakEnd&&endTime>window.breakStart)return false;
 return true;
}

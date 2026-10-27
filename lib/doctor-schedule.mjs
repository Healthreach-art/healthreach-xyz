const clock = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const format = value => String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');

export const doctorWeekdays = [
  { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' }, { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

function subtractBreaks(rule, breaks, weekday) {
  let ranges = [[minutes(rule.start), minutes(rule.end)]];
  for (const pause of breaks.filter(value => value.weekdays?.includes(weekday) && (value.mode === 'All' || value.mode === rule.mode))) {
    const start = minutes(pause.start), end = minutes(pause.end);
    ranges = ranges.flatMap(([from, to]) => start < to && end > from
      ? [[from, Math.min(start, to)], [Math.max(end, from), to]].filter(([a, b]) => b > a)
      : [[from, to]]);
  }
  return ranges.map(([start, end]) => ({ mode: rule.mode || 'All', start: format(start), end: format(end) }));
}

/** Convert saved weekly rules into a simple per-day editor without widening legacy slots. */
export function weeklyPeriodsFromDoctor(doctor) {
  const result = Object.fromEntries(doctorWeekdays.map(({ value }) => [value, []]));
  const calendar = doctor.calendar;
  if (calendar?.rules?.length) {
    for (const weekday of doctorWeekdays.map(day => day.value)) {
      result[weekday] = calendar.rules.filter(rule => rule.weekdays?.includes(weekday))
        .flatMap(rule => subtractBreaks(rule, calendar.breaks || [], weekday))
        .sort((a, b) => a.start.localeCompare(b.start));
    }
    return result;
  }

  const duration = Number(doctor.durationMinutes || 30);
  if (Array.isArray(doctor.slots) && doctor.slots.length) {
    const legacyDays = doctor.weekdays?.length ? doctor.weekdays : doctor.slots.map(() => null);
    for (const weekday of doctorWeekdays.map(day => day.value)) {
      if (!legacyDays.includes(weekday)) continue;
      result[weekday] = doctor.slots.filter(clock).sort().map(start => ({ mode: 'All', start, end: format(minutes(start) + duration) }));
    }
    return result;
  }

  for (const weekday of doctor.weekdays || []) {
    if (clock(doctor.openTime) && clock(doctor.closeTime) && doctor.openTime < doctor.closeTime)
      result[weekday] = [{ mode: 'All', start: doctor.openTime, end: doctor.closeTime }];
  }
  return result;
}

/** Convert the simple editor back to the existing persisted rules shape and reject overlaps. */
export function rulesFromWeeklyPeriods(weekly) {
  const rules = [];
  for (const { value: weekday } of doctorWeekdays) {
    const periods = weekly?.[weekday] || [];
    const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
    for (let index = 0; index < sorted.length; index++) {
      const period = sorted[index];
      if (!clock(period.start) || !clock(period.end) || period.start >= period.end)
        throw new Error('Choose a valid start and end time for every working period.');
      if (index && sorted[index - 1].end > period.start)
        throw new Error('Working periods on the same day cannot overlap.');
      rules.push({ mode: period.mode || 'All', weekdays: [weekday], start: period.start, end: period.end });
    }
  }
  if (!rules.length) throw new Error('Add at least one working period before saving.');
  return rules;
}

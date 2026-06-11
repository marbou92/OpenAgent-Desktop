/**
 * OpenAgent-Desktop - Cron Expression Humanizer
 *
 * Converts standard 5-field cron expressions to human-readable text.
 * Format: minute hour day-of-month month day-of-week
 *
 * Examples:
 *   "0 9 * * 1"       -> Every Monday at 9:00 AM
 *   "every-30-min"    -> Every 30 minutes
 *   "0 0 1 * *"       -> At midnight on the 1st of every month
 *   "0 9 * * *"       -> Every day at 9:00 AM
 *   "0 9 * * 1-5"     -> Every weekday at 9:00 AM
 *   "0 every-2h * * *" -> Every 2 hours
 *   "15 9 * * *"      -> Every day at 9:15 AM
 *   "0 0 1 1 *"       -> At midnight on January 1st
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour === 12) return '12:00 PM';
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

function formatTime(hour: number, minute: number): string {
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? 'AM' : 'PM';
  if (minute === 0) return `${h}:00 ${ampm}`;
  return `${h}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

function formatOrdinals(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function parseListOrRange(field: string): number[] | null {
  // Handle comma-separated values: "1,3,5"
  if (field.includes(',')) {
    const parts = field.split(',');
    const result: number[] = [];
    for (const part of parts) {
      const parsed = parseListOrRange(part.trim());
      if (!parsed) return null;
      result.push(...parsed);
    }
    return result;
  }

  // Handle ranges: "1-5"
  if (field.includes('-')) {
    const [startStr, endStr] = field.split('-');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(end)) return null;
    const result: number[] = [];
    for (let i = start; i <= end; i++) {
      result.push(i);
    }
    return result;
  }

  // Handle step values like "*/5" or "1-10/2"
  if (field.includes('/')) {
    return null; // handled separately
  }

  // Single value
  const val = parseInt(field, 10);
  if (isNaN(val)) return null;
  return [val];
}

export function humanizeCron(expression: string): string {
  if (!expression || typeof expression !== 'string') {
    return 'Invalid schedule';
  }

  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return expression; // not a standard 5-field cron, return as-is
  }

  const [minuteStr, hourStr, dayOfMonthStr, monthStr, dayOfWeekStr] = parts;

  // ─── Parse minute ──────────────────────────────────────────────────────────
  let minuteEvery = false;
  let minuteInterval = 0;
  let minuteValues: number[] = [];

  if (minuteStr === '*') {
    minuteEvery = true;
  } else if (minuteStr.startsWith('*/')) {
    minuteInterval = parseInt(minuteStr.slice(2), 10);
    if (isNaN(minuteInterval) || minuteInterval <= 0) return expression;
  } else {
    const parsed = parseListOrRange(minuteStr);
    if (parsed) {
      minuteValues = parsed;
    } else {
      return expression;
    }
  }

  // ─── Parse hour ────────────────────────────────────────────────────────────
  let hourEvery = false;
  let hourInterval = 0;
  let hourValues: number[] = [];

  if (hourStr === '*') {
    hourEvery = true;
  } else if (hourStr.startsWith('*/')) {
    hourInterval = parseInt(hourStr.slice(2), 10);
    if (isNaN(hourInterval) || hourInterval <= 0) return expression;
  } else {
    const parsed = parseListOrRange(hourStr);
    if (parsed) {
      hourValues = parsed;
    } else {
      return expression;
    }
  }

  // ─── Parse day of month ────────────────────────────────────────────────────
  let dayOfMonthEvery = true;
  let dayOfMonthValues: number[] = [];

  if (dayOfMonthStr === '*') {
    dayOfMonthEvery = true;
  } else {
    const parsed = parseListOrRange(dayOfMonthStr);
    if (parsed) {
      dayOfMonthEvery = false;
      dayOfMonthValues = parsed;
    }
  }

  // ─── Parse month ───────────────────────────────────────────────────────────
  let monthEvery = true;
  let monthValues: number[] = [];

  if (monthStr === '*') {
    monthEvery = true;
  } else {
    const parsed = parseListOrRange(monthStr);
    if (parsed) {
      monthEvery = false;
      monthValues = parsed;
    }
  }

  // ─── Parse day of week ─────────────────────────────────────────────────────
  let dayOfWeekEvery = true;
  let dayOfWeekValues: number[] = [];

  if (dayOfWeekStr === '*') {
    dayOfWeekEvery = true;
  } else {
    const parsed = parseListOrRange(dayOfWeekStr);
    if (parsed) {
      dayOfWeekEvery = false;
      dayOfWeekValues = parsed;
    }
  }

  // ─── Construct human-readable string ───────────────────────────────────────

  // Case: Every N minutes (e.g., "*/30 * * * *")
  if (minuteInterval > 0 && hourEvery && dayOfMonthEvery && monthEvery && dayOfWeekEvery) {
    return `Every ${minuteInterval} minute${minuteInterval > 1 ? 's' : ''}`;
  }

  // Case: Every N hours (e.g., "0 */2 * * *")
  if (hourInterval > 0 && (minuteValues.length === 1 && minuteValues[0] === 0 || minuteEvery && minuteValues.length === 0) && dayOfMonthEvery && monthEvery && dayOfWeekEvery) {
    return `Every ${hourInterval} hour${hourInterval > 1 ? 's' : ''}`;
  }

  // Case: Every day at a specific time (e.g., "0 9 * * *")
  if (!minuteEvery && minuteValues.length === 1 && !hourEvery && hourValues.length === 1 && dayOfMonthEvery && monthEvery && dayOfWeekEvery) {
    return `Every day at ${formatTime(hourValues[0], minuteValues[0])}`;
  }

  // Case: Specific weekdays at a time (e.g., "0 9 * * 1" or "0 9 * * 1-5")
  if (!minuteEvery && minuteValues.length === 1 && !hourEvery && hourValues.length === 1 && dayOfMonthEvery && monthEvery && !dayOfWeekEvery) {
    const time = formatTime(hourValues[0], minuteValues[0]);
    if (dayOfWeekValues.length === 1) {
      return `Every ${WEEKDAYS[dayOfWeekValues[0] % 7]} at ${time}`;
    }
    if (dayOfWeekValues.length === 5 && dayOfWeekValues[0] === 1 && dayOfWeekValues[4] === 5) {
      return `Every weekday at ${time}`;
    }
    if (dayOfWeekValues.length === 2 && dayOfWeekValues.includes(0) && dayOfWeekValues.includes(6)) {
      return `Every weekend at ${time}`;
    }
    const days = dayOfWeekValues.map(d => WEEKDAYS[d % 7]).join(', ');
    return `${days} at ${time}`;
  }

  // Case: Specific day of month at a time (e.g., "0 0 1 * *")
  if (!minuteEvery && minuteValues.length === 1 && !hourEvery && hourValues.length === 1 && !dayOfMonthEvery && monthEvery && dayOfWeekEvery) {
    const time = formatTime(hourValues[0], minuteValues[0]);
    if (dayOfMonthValues.length === 1) {
      if (!monthEvery && monthValues.length === 1) {
        return `At ${time} on ${MONTHS[monthValues[0]]} ${formatOrdinals(dayOfMonthValues[0])}`;
      }
      return `At ${time} on the ${formatOrdinals(dayOfMonthValues[0])} of every month`;
    }
    const days = dayOfMonthValues.map(d => formatOrdinals(d)).join(', ');
    return `At ${time} on the ${days} of every month`;
  }

  // Case: Specific month + day (e.g., "0 0 1 1 *")
  if (!minuteEvery && minuteValues.length === 1 && !hourEvery && hourValues.length === 1 && !dayOfMonthEvery && !monthEvery && dayOfWeekEvery) {
    const time = formatTime(hourValues[0], minuteValues[0]);
    if (dayOfMonthValues.length === 1 && monthValues.length === 1) {
      return `At ${time} on ${MONTHS[monthValues[0]]} ${formatOrdinals(dayOfMonthValues[0])}`;
    }
  }

  // Case: Hourly (e.g., "0 * * * *")
  if (minuteValues.length === 1 && minuteValues[0] === 0 && hourEvery && dayOfMonthEvery && monthEvery && dayOfWeekEvery) {
    return 'Every hour';
  }

  // Case: Every minute (e.g., "* * * * *")
  if (minuteEvery && hourEvery && dayOfMonthEvery && monthEvery && dayOfWeekEvery) {
    return 'Every minute';
  }

  // Fallback: return the expression as-is if we can't parse it nicely
  return expression;
}

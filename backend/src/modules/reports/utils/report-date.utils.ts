import { BUSINESS_TIMEZONE, formatToBusinessDate } from '../reports.service';
import { DatePreset } from '../dto/report-query.dto';

export interface DateRangeResult {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
  label: string;
}

/**
 * Parses date parts in business timezone
 */
function getTzParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZoneName: 'longOffset',
  }).formatToParts(date);

  const year = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
  const month = parseInt(parts.find((p) => p.type === 'month')!.value, 10);
  const day = parseInt(parts.find((p) => p.type === 'day')!.value, 10);
  const weekday = parts.find((p) => p.type === 'weekday')!.value;
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value;
  const offset = !tzName || tzName === 'GMT' ? '+00:00' : tzName.replace('GMT', '');

  return { year, month, day, weekday, offset };
}

function makeTzDate(year: number, month: number, day: number, offset: string): Date {
  const pad = (n: number) => String(n).padStart(2, '0');
  return new Date(`${year}-${pad(month)}-${pad(day)}T00:00:00.000${offset}`);
}

const WEEKDAY_INDEX_MAP: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function parseCalendarDateParts(dateStr: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    day: parseInt(match[3], 10),
  };
}

/**
 * Resolves current and previous date range for a given preset and timezone
 */
export function resolveDatePreset(
  preset: DatePreset = DatePreset.THIS_MONTH,
  timeZone: string = BUSINESS_TIMEZONE,
  customStartStr?: string,
  customEndStr?: string,
  referenceDate: Date = new Date(),
): DateRangeResult {
  const { year, month, day, weekday, offset } = getTzParts(referenceDate, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');

  // Start of today in business timezone
  const todayStart = makeTzDate(year, month, day, offset);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const tomorrowStart = new Date(todayStart.getTime() + oneDayMs);
  const yesterdayStart = new Date(todayStart.getTime() - oneDayMs);

  if (preset === DatePreset.TODAY) {
    return {
      currentStart: todayStart,
      currentEnd: tomorrowStart,
      previousStart: yesterdayStart,
      previousEnd: todayStart,
      label: 'Today vs Yesterday',
    };
  }

  if (preset === DatePreset.YESTERDAY) {
    const dayBeforeYesterdayStart = new Date(yesterdayStart.getTime() - oneDayMs);
    return {
      currentStart: yesterdayStart,
      currentEnd: todayStart,
      previousStart: dayBeforeYesterdayStart,
      previousEnd: yesterdayStart,
      label: 'Yesterday vs Day Before',
    };
  }

  if (preset === DatePreset.THIS_WEEK) {
    // Determine Monday-based day of week (Monday=0, ..., Sunday=6) in business timezone
    const dayOfWeek = WEEKDAY_INDEX_MAP[weekday] ?? 0;
    const thisWeekStart = new Date(todayStart.getTime() - dayOfWeek * oneDayMs);
    const nextWeekStart = new Date(thisWeekStart.getTime() + 7 * oneDayMs);
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * oneDayMs);

    return {
      currentStart: thisWeekStart,
      currentEnd: nextWeekStart,
      previousStart: lastWeekStart,
      previousEnd: thisWeekStart,
      label: 'This Week vs Last Week',
    };
  }

  if (preset === DatePreset.LAST_WEEK) {
    const dayOfWeek = WEEKDAY_INDEX_MAP[weekday] ?? 0;
    const thisWeekStart = new Date(todayStart.getTime() - dayOfWeek * oneDayMs);
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * oneDayMs);
    const twoWeeksAgoStart = new Date(lastWeekStart.getTime() - 7 * oneDayMs);

    return {
      currentStart: lastWeekStart,
      currentEnd: thisWeekStart,
      previousStart: twoWeeksAgoStart,
      previousEnd: lastWeekStart,
      label: 'Last Week vs Prior Week',
    };
  }

  if (preset === DatePreset.THIS_MONTH) {
    const currentMonthStart = makeTzDate(year, month, 1, offset);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMonthYear = month === 12 ? year + 1 : year;
    const nextMonthStart = makeTzDate(nextMonthYear, nextMonth, 1, offset);

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevMonthYear = month === 1 ? year - 1 : year;
    const prevMonthStart = makeTzDate(prevMonthYear, prevMonth, 1, offset);

    return {
      currentStart: currentMonthStart,
      currentEnd: nextMonthStart,
      previousStart: prevMonthStart,
      previousEnd: currentMonthStart,
      label: 'This Month vs Last Month',
    };
  }

  if (preset === DatePreset.LAST_MONTH) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevMonthYear = month === 1 ? year - 1 : year;
    const prevMonthStart = makeTzDate(prevMonthYear, prevMonth, 1, offset);
    const currentMonthStart = makeTzDate(year, month, 1, offset);

    const twoMonthsAgo = prevMonth === 1 ? 12 : prevMonth - 1;
    const twoMonthsAgoYear = prevMonth === 1 ? prevMonthYear - 1 : prevMonthYear;
    const twoMonthsAgoStart = makeTzDate(twoMonthsAgoYear, twoMonthsAgo, 1, offset);

    return {
      currentStart: prevMonthStart,
      currentEnd: currentMonthStart,
      previousStart: twoMonthsAgoStart,
      previousEnd: prevMonthStart,
      label: 'Last Month vs Prior Month',
    };
  }

  if (preset === DatePreset.THIS_YEAR) {
    const thisYearStart = makeTzDate(year, 1, 1, offset);
    const nextYearStart = makeTzDate(year + 1, 1, 1, offset);
    const lastYearStart = makeTzDate(year - 1, 1, 1, offset);

    return {
      currentStart: thisYearStart,
      currentEnd: nextYearStart,
      previousStart: lastYearStart,
      previousEnd: thisYearStart,
      label: 'This Year vs Last Year',
    };
  }

  // Custom or fallback
  let cStart: Date;
  let cEnd: Date;

  if (customStartStr) {
    const startParts = parseCalendarDateParts(customStartStr);
    if (startParts) {
      cStart = makeTzDate(startParts.year, startParts.month, startParts.day, offset);
    } else {
      cStart = new Date(customStartStr);
    }
  } else {
    cStart = makeTzDate(year, month, 1, offset);
  }

  if (customEndStr) {
    const endParts = parseCalendarDateParts(customEndStr);
    if (endParts) {
      const endDayStart = makeTzDate(endParts.year, endParts.month, endParts.day, offset);
      cEnd = new Date(endDayStart.getTime() + oneDayMs);
    } else {
      const rawEnd = new Date(customEndStr);
      if (customEndStr.length <= 10) {
        cEnd = new Date(rawEnd.getTime() + oneDayMs);
      } else {
        cEnd = rawEnd;
      }
    }
  } else {
    cEnd = tomorrowStart;
  }

  const durationMs = cEnd.getTime() - cStart.getTime();
  const pStart = new Date(cStart.getTime() - durationMs);
  const pEnd = cStart;

  return {
    currentStart: cStart,
    currentEnd: cEnd,
    previousStart: pStart,
    previousEnd: pEnd,
    label: 'Custom Range vs Prior Period',
  };
}

/**
 * Calculates absolute difference and percentage change between current and previous values
 */
export function calculateComparison(current: number, previous: number) {
  const diff = Number((current - previous).toFixed(2));
  let percent = 0;
  if (previous !== 0) {
    percent = Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
  } else if (current > 0) {
    percent = 100;
  } else if (current < 0) {
    percent = -100;
  }
  return {
    current: Number(current.toFixed(2)),
    previous: Number(previous.toFixed(2)),
    diff,
    percent,
  };
}

/**
 * Sanitizes a cell for RFC 4180 CSV export with formula injection prevention.
 * If the value starts with '=', '+', '-', '@', '\t', or '\r', prefix with a single quote.
 * Legitimate negative numbers (e.g. -150 or "-150.00") are preserved as numeric values.
 */
export function sanitizeCsvCell(value: any): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number' && !isNaN(value)) {
    return `"${value}"`;
  }
  let str = String(value);
  // Pure numeric values with optional leading sign (e.g. "-150", "+50.25") are safe from formula execution
  const isPureNumeric = /^[\+\-]?\d+(\.\d+)?$/.test(str.trim());
  if (!isPureNumeric && /^[\=\+\-\@\t\r]/.test(str)) {
    str = "'" + str;
  }
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Formats a 2D array of rows into a sanitized CSV string.
 */
export function generateCsvString(headers: string[], rows: any[][]): string {
  const headerLine = headers.map(sanitizeCsvCell).join(',');
  const rowLines = rows.map((row) => row.map(sanitizeCsvCell).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

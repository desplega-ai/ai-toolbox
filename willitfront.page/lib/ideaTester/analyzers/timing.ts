import type { TimingAnalysis } from '../types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function analyzeTiming(plannedTime: string | undefined): TimingAnalysis {
  const now = plannedTime ? new Date(plannedTime) : new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const dayName = DAYS[day];
  const isWeekend = day === 0 || day === 6;

  let score = 50;

  // Golden window: Sunday 6am-2pm UTC
  const isGoldenWindow = day === 0 && hour >= 6 && hour <= 14;
  if (isGoldenWindow) score += 20;

  // Weekend bonus (if not in golden window)
  else if (isWeekend) score += 10;

  // Weekday optimal times (9am-12pm PST = 5pm-8pm UTC)
  else if (hour >= 17 && hour <= 20) score += 10;

  // Dead zone penalty (3am-7am UTC)
  const isDeadZone = hour >= 3 && hour <= 7;
  if (isDeadZone) score -= 15;

  // Late night penalty (midnight-3am UTC)
  if (hour >= 0 && hour < 3) score -= 10;

  return {
    score: Math.max(0, Math.min(100, score)),
    dayOfWeek: dayName,
    hourUTC: hour,
    isWeekend,
    isGoldenWindow,
    isDeadZone,
  };
}

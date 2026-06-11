import { describe, it, expect } from 'vitest';
import { humanizeCron } from '../../../src/utils/cron-humanizer';

describe('Cron Humanizer', () => {
  it('should humanize every minute', () => {
    expect(humanizeCron('* * * * *')).toContain('minute');
  });

  it('should humanize daily at 9am', () => {
    expect(humanizeCron('0 9 * * *')).toContain('9:00 AM');
  });

  it('should humanize every Monday', () => {
    expect(humanizeCron('0 9 * * 1')).toContain('Monday');
  });

  it('should humanize every 30 minutes', () => {
    expect(humanizeCron('*/30 * * * *')).toContain('30');
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUtcFields, sliderHour } from '../../web/components/exact-time.js';

test('UTC fields accept leap day and reject invalid calendar dates or partial hours', () => {
  assert.equal(parseUtcFields('2028-02-29', '06:00'), Date.UTC(2028, 1, 29, 6));
  for (const [day, hour] of [['2027-02-29','06:00'], ['2028-02-30','00:00'], ['2028-01-01','24:00'], ['', '00:00'], ['2027-01-01','06:30']]) {
    assert.equal(parseUtcFields(day, hour), null);
  }
  assert.equal(parseUtcFields('2026-12-31','23:00'), Date.UTC(2026,11,31,23)); // core clamps valid dates
});

test('slider navigation uses hourly/day steps and clamps both ends', () => {
  assert.equal(sliderHour('ArrowLeft', false, 348, 17543), 347);
  assert.equal(sliderHour('ArrowRight', true, 348, 17543), 372);
  assert.equal(sliderHour('ArrowLeft', true, 0, 17543), 0);
  assert.equal(sliderHour('ArrowRight', true, 17542, 17543), 17543);
  assert.equal(sliderHour('Home', true, 348, 17543), 0);
  assert.equal(sliderHour('End', false, 348, 17543), 17543);
  assert.equal(sliderHour('Tab', false, 348, 17543), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { COST_CONFIG } from '../src/index.ts';

test('Cost tariff configuration is correctly specified', () => {
  assert.equal(COST_CONFIG.NEW_USER_BONUS, 50);
  assert.equal(COST_CONFIG.BUILD_COST, 10);
  assert.equal(COST_CONFIG.EDIT_COST, 3);
  assert.equal(COST_CONFIG.PUBLISH_COST, 0);
});

test('Credit pack prices structure', () => {
  assert.equal(COST_CONFIG.PACKS.length, 3);
  assert.equal(COST_CONFIG.PACKS[0].credits, 100);
  assert.equal(COST_CONFIG.PACKS[1].credits, 500);
  assert.equal(COST_CONFIG.PACKS[2].credits, 2000);
});

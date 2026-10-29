'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateMonthlyPayment } = require('../loan-calculator');

test('distribuye capital sin intereses en cuotas iguales', () => {
  assert.equal(calculateMonthlyPayment(1200, 0, 12), 100);
});

test('calcula cuota fija con tasa anual positiva', () => {
  const payment = calculateMonthlyPayment(1000000, 12, 12);
  assert.ok(Math.abs(payment - 88848.788678) < 0.01);
});

test('rechaza valores fuera de rango', () => {
  assert.throws(() => calculateMonthlyPayment(0, 12, 12), RangeError);
  assert.throws(() => calculateMonthlyPayment(1000, -1, 12), RangeError);
  assert.throws(() => calculateMonthlyPayment(1000, 12, 0), RangeError);
});
'use strict';

/** Calcula la cuota fija mensual de un préstamo amortizado. */
function calculateMonthlyPayment(principal, annualRate, termMonths) {
  if (!Number.isFinite(principal) || principal <= 0) throw new RangeError('El capital debe ser mayor que cero.');
  if (!Number.isFinite(annualRate) || annualRate < 0) throw new RangeError('La tasa anual no puede ser negativa.');
  if (!Number.isInteger(termMonths) || termMonths < 1) throw new RangeError('El plazo debe ser de al menos un mes.');

  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return principal / termMonths;
  const factor = (1 + monthlyRate) ** termMonths;
  return principal * monthlyRate * factor / (factor - 1);
}

module.exports = { calculateMonthlyPayment };
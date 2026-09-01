import React from 'react';

export default function PlanOptions({ result }) {
  if (!result.feasible) {
    return (
      <div className="card">
        <div className="no-plan-box">
          <h3>No feasible plan right now</h3>
          <p>{result.reason || 'Even the longest available tenure would exceed your monthly budget.'}</p>
          <p style={{ marginTop: 10, fontSize: '0.85rem' }}>
            Tried {result.meta?.lendersConsidered || 3} lenders across tenures 3–24 months at your budget of ₹{result.targetMonthlyPayment?.toLocaleString('en-IN')}/mo for an item priced at ₹{result.itemPrice?.toLocaleString('en-IN')}.
            Consider a lower-priced item, a larger down payment, or increasing your monthly buffer.
          </p>
        </div>
      </div>
    );
  }

  const { options, targetMonthlyPayment, itemPrice } = result;
  const best = options[0];
  const worst = options[options.length - 1];
  const saving = worst && best && worst.totalInterest !== best.totalInterest
    ? (worst.totalInterest - best.totalInterest)
    : null;

  return (
    <div className="card">
      <h2>Your EMI options</h2>
      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 16 }}>
        For ₹{itemPrice?.toLocaleString('en-IN')} at ₹{targetMonthlyPayment?.toLocaleString('en-IN')}/mo — ranked cheapest first
      </p>

      {options.map((opt, idx) => (
        <div key={`${opt.lenderId}-${opt.tenorMonths}`} className={`plan-card ${idx === 0 ? 'best' : ''}`}>
          {idx === 0 && <span className="badge">Best — lowest interest</span>}
          <h3>{opt.lenderId} — {opt.tenorMonths} months</h3>
          <div className="plan-grid">
            <div>
              <div className="val">₹{opt.emi.toLocaleString('en-IN')}</div>
              <div className="lbl">per month</div>
            </div>
            <div>
              <div className="val">{opt.tenorMonths} mo</div>
              <div className="lbl">tenure</div>
            </div>
            <div>
              <div className="val">₹{opt.totalInterest.toLocaleString('en-IN')}</div>
              <div className="lbl">total interest</div>
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 8, textAlign: 'center' }}>
            Total you pay: ₹{opt.totalPaid?.toLocaleString('en-IN')}
          </div>
        </div>
      ))}

      {saving != null && saving > 0 && options.length > 1 && (
        <div className="saving-highlight">
          Fastest plan saves you <strong>₹{saving.toLocaleString('en-IN')}</strong> in interest vs. the longest feasible option.
        </div>
      )}
    </div>
  );
}

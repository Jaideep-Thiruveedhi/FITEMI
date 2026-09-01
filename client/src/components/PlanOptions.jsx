import React from 'react';

export default function PlanOptions({ result }) {
  if (!result.feasible) {
    const budget = result.targetMonthlyPayment;
    const minEmi = result.minFeasibleEmi;
    const minTenor = result.minFeasibleTenor;
    const minLender = result.minFeasibleLender;
    return (
      <div className="card">
        <div className="no-plan-box">
          <h3>No feasible plan</h3>
          <p>{result.reason || 'Even the longest available tenure would exceed your monthly budget.'}</p>
          <div style={{ marginTop: 14, padding: 12, background: '#fff', borderRadius: 8, textAlign: 'left', fontSize: '0.9rem' }}>
            <div>Your budget: <strong>₹{budget?.toLocaleString('en-IN')}/month</strong></div>
            {minEmi != null && (
              <div>Lowest feasible EMI: <strong>₹{minEmi.toLocaleString('en-IN')}/month</strong> {minTenor ? `(${minTenor} months, ${minLender})` : ''}</div>
            )}
            <div style={{ marginTop: 8, color: '#92400e', fontSize: '0.85rem' }}>
              We won't recommend a plan that exceeds your stated budget.
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: '0.85rem', textAlign: 'left' }}>
            <strong>Try:</strong>
            <ul style={{ marginLeft: 18, marginTop: 6 }}>
              <li>increasing your monthly budget {minEmi && budget ? `(needs at least ₹${minEmi.toLocaleString('en-IN')})` : ''}</li>
              <li>choosing a lower-priced item</li>
              <li>making a larger down payment</li>
            </ul>
          </div>
          <p style={{ marginTop: 12, fontSize: '0.82rem', color: '#6b7280' }}>
            Tried {result.meta?.lendersConsidered || 3} synthetic lenders (tenures 3–24 mo) for ₹{result.itemPrice?.toLocaleString('en-IN')}.
            {result.affordabilityCeiling != null && <> Affordability ceiling was ₹{result.affordabilityCeiling.toLocaleString('en-IN')}/mo.</>}
          </p>
        </div>
      </div>
    );
  }

  const { options, targetMonthlyPayment, itemPrice, affordabilityCeiling } = result;
  const best = options[0];
  const worst = options[options.length - 1];
  const saving = worst && best && worst.totalInterest !== best.totalInterest
    ? (worst.totalInterest - best.totalInterest)
    : null;

  return (
    <div className="card">
      <h2>Your EMI options</h2>
      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 4 }}>
        For ₹{itemPrice?.toLocaleString('en-IN')} at ₹{targetMonthlyPayment?.toLocaleString('en-IN')}/mo — ranked cheapest first
      </p>
      {affordabilityCeiling != null && (
        <p style={{ fontSize: '0.82rem', color: '#065f46', marginBottom: 16, background: '#ecfdf5', padding: '6px 10px', borderRadius: 6, display: 'inline-block' }}>
          Affordability ceiling (backend): <strong>₹{affordabilityCeiling.toLocaleString('en-IN')}/mo</strong> (0.4 × take-home − obligations)
        </p>
      )}

      {options.map((opt, idx) => {
        const facts = opt.explanationFacts || {};
        return (
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
              {facts.monthlyHeadroom != null && <> · Headroom: ₹{facts.monthlyHeadroom.toLocaleString('en-IN')}/mo</>}
            </div>
            <div style={{ marginTop: 14, padding: 12, background: idx === 0 ? '#f0f7ff' : '#fffbeb', border: '1px solid ' + (idx === 0 ? '#bfdbfe' : '#fde68a'), borderRadius: 8 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: idx === 0 ? '#1e40af' : '#92400e', marginBottom: 8 }}>
                Why this plan?
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.88rem', lineHeight: 1.6, color: '#1f2937' }}>
                <li>Fits your monthly budget of <strong>₹{targetMonthlyPayment.toLocaleString('en-IN')}</strong> — EMI is ₹{opt.emi.toLocaleString('en-IN')}/mo {facts.monthlyHeadroom != null && facts.monthlyHeadroom >= 0 ? `(₹${facts.monthlyHeadroom.toLocaleString('en-IN')} headroom)` : ''}</li>
                <li>{facts.reason === 'lowest_total_interest' ? `Lowest total interest among feasible options — ₹${opt.totalInterest.toLocaleString('en-IN')} total interest, fastest payoff.` : facts.reason === 'lowest_monthly_payment' ? `Lowest monthly payment — most headroom, but higher total interest (₹${opt.totalInterest.toLocaleString('en-IN')}).` : facts.reasonLabel || `Tenure ${opt.tenorMonths} months, total interest ₹${opt.totalInterest.toLocaleString('en-IN')}.`}</li>
                <li>Rank {facts.rank || idx + 1} of {options.length} — {idx === 0 ? 'best overall' : `alternative tenure`}</li>
              </ul>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 8, fontStyle: 'italic' }}>
                Deterministic: EMI/interest/tenure from solver, not LLM. {facts.reason && `Reason: ${facts.reason}`}.
              </div>
            </div>
          </div>
        );
      })}

      {saving != null && saving > 0 && options.length > 1 && (
        <div className="saving-highlight">
          Fastest plan saves you <strong>₹{saving.toLocaleString('en-IN')}</strong> in interest vs. the longest feasible option.
        </div>
      )}
    </div>
  );
}

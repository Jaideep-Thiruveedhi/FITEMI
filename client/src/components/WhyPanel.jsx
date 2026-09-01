import React from 'react';

export default function WhyPanel({ result }) {
  return (
    <div className="card">
      <div className="why-panel">
        <h4>Why this recommendation?</h4>
        <p>{result.explanation || 'No explanation available.'}</p>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #fde68a', fontSize: '0.82rem', color: '#78350f' }}>
          <strong>Inputs used:</strong> Item ₹{result.itemPrice?.toLocaleString('en-IN')}
          {' · '} Budget ₹{result.targetMonthlyPayment?.toLocaleString('en-IN')}/mo
          {result.affordabilityCeiling != null && <> {' · '} Affordability ceiling ₹{result.affordabilityCeiling.toLocaleString('en-IN')}/mo</>}
          <br />
          <strong>Lenders checked:</strong> {result.meta?.lendersConsidered || 3} synthetic lenders (tenures 3–24 mo)
          {result.meta?.solveTimeMs != null && <> {' · '} Solved in {result.meta.solveTimeMs}ms</>}
          <br />
          <span style={{ fontSize: '0.78rem', color: '#a16207' }}>
            All EMI figures computed deterministically by the solver. The AI only explains — it never sets a number.
          </span>
        </div>
      </div>
    </div>
  );
}

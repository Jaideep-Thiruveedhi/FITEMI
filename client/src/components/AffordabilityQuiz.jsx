import React, { useState } from 'react';

export default function AffordabilityQuiz({ onComplete, onCancel }) {
  const [step, setStep] = useState(0);
  const [takeHomePay, setTakeHomePay] = useState('');
  const [existingObligations, setExistingObligations] = useState('');
  const [otherExpenses, setOtherExpenses] = useState('');
  const [error, setError] = useState(null);
  const [serverQuestion, setServerQuestion] = useState(null);
  const [useServerQuiz, setUseServerQuiz] = useState(false);

  // Simple local quiz — 3 steps, then compute ceiling directly
  // Also supports server-driven quiz via /api/recommend/quiz for LLM-enhanced wording

  const questions = [
    { key: 'takeHomePay', label: 'What is your monthly take-home pay (after taxes)?', value: takeHomePay, setter: setTakeHomePay, placeholder: 'e.g. 40000' },
    { key: 'existingObligations', label: 'How much goes to existing EMIs, rent, or fixed obligations each month?', value: existingObligations, setter: setExistingObligations, placeholder: 'e.g. 12000' },
    { key: 'otherExpenses', label: 'Other big recurring expenses (groceries, utilities, etc.)?', value: otherExpenses, setter: setOtherExpenses, placeholder: 'e.g. 8000 (or 0)' },
  ];

  const current = questions[step];

  const handleNext = () => {
    setError(null);
    const val = Number(current.value);
    if (current.value === '' || isNaN(val) || val < 0) {
      setError('Please enter a valid non-negative number.');
      return;
    }
    if (current.key === 'takeHomePay' && val <= 0) {
      setError('Take-home pay must be greater than 0.');
      return;
    }
    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      // Done — pass collected inputs; backend is the source of truth for affordability ceiling
      onComplete({
        takeHomePay: Number(takeHomePay),
        existingObligations: Number(existingObligations),
        otherExpenses: Number(otherExpenses) || 0,
      });
    }
  };

  const handleBack = () => {
    setError(null);
    if (step > 0) setStep(step - 1);
    else onCancel();
  };

  return (
    <div className="quiz-box">
      <div className="quiz-progress">Step {step + 1} of {questions.length}</div>
      <div className="q">{current.label}</div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <input
          type="number"
          placeholder={current.placeholder}
          value={current.value}
          onChange={(e) => current.setter(e.target.value)}
          min="0"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleNext(); } }}
        />
      </div>
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={handleBack} style={{ flex: 1 }}>
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        <button type="button" className="btn" onClick={handleNext} style={{ flex: 1 }}>
          {step === questions.length - 1 ? 'Done' : 'Next'}
        </button>
      </div>
    </div>
  );
}

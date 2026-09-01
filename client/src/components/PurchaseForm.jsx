import React, { useState } from 'react';
import AffordabilityQuiz from './AffordabilityQuiz.jsx';

export default function PurchaseForm({ onRecommend, loading }) {
  const [itemPrice, setItemPrice] = useState('');
  const [targetMonthly, setTargetMonthly] = useState('');
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizInputs, setQuizInputs] = useState(null);
  const [localError, setLocalError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLocalError(null);

    const price = Number(itemPrice);
    if (!itemPrice || isNaN(price) || price <= 0) {
      setLocalError('Please enter a valid item price greater than 0.');
      return;
    }

    // If quiz collected inputs, use affordability path — backend computes ceiling (source of truth)
    if (quizInputs) {
      onRecommend({
        itemPrice: price,
        takeHomePay: quizInputs.takeHomePay,
        existingObligations: quizInputs.existingObligations,
        otherExpenses: quizInputs.otherExpenses || 0,
      });
      return;
    }

    const budget = Number(targetMonthly);
    if (!targetMonthly || isNaN(budget) || budget <= 0) {
      setLocalError('Please enter how much you can pay per month, or use "help me figure it out".');
      return;
    }

    onRecommend({ itemPrice: price, targetMonthlyPayment: budget });
  };

  const handleQuizComplete = (inputs) => {
    setQuizInputs(inputs);
    setShowQuiz(false);
  };

  const handleQuizCancel = () => setShowQuiz(false);

  const resetQuiz = () => {
    setQuizInputs(null);
    setTargetMonthly('');
  };

  return (
    <div className="card">
      <h2>Find your EMI plan</h2>

      {showQuiz ? (
        <AffordabilityQuiz onComplete={handleQuizComplete} onCancel={handleQuizCancel} />
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Item price (₹)</label>
            <input
              type="number"
              placeholder="e.g. 24000"
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
              min="1"
            />
          </div>

          {quizInputs ? (
            <div className="success-box">
              Collected: take-home <strong>₹{quizInputs.takeHomePay?.toLocaleString('en-IN')}</strong>
              {' · '} obligations <strong>₹{quizInputs.existingObligations?.toLocaleString('en-IN')}</strong>
              {quizInputs.otherExpenses ? <> {' · '} other <strong>₹{quizInputs.otherExpenses?.toLocaleString('en-IN')}</strong></> : null}
              <br />
              <span style={{ fontSize: '0.85rem', color: '#555' }}>
                We'll compute your safe monthly budget on the server (backend is the source of truth).
              </span>
              <br />
              <button type="button" className="link-btn" onClick={resetQuiz}>Change / enter manually instead</button>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label>How much can you pay per month? (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 5000"
                  value={targetMonthly}
                  onChange={(e) => setTargetMonthly(e.target.value)}
                  min="1"
                />
              </div>
              <button type="button" className="link-btn" onClick={() => setShowQuiz(true)}>
                Not sure? Help me figure it out
              </button>
            </>
          )}

          {localError && <div className="error-box" style={{ marginTop: 12 }}>{localError}</div>}

          <button type="submit" className="btn" disabled={loading} style={{ marginTop: 16 }}>
            {loading ? 'Finding plans...' : 'Find my EMI plans'}
          </button>
        </form>
      )}
    </div>
  );
}

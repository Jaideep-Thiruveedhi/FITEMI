import React, { useState } from 'react';
import PurchaseForm from './components/PurchaseForm.jsx';
import AffordabilityQuiz from './components/AffordabilityQuiz.jsx';
import PlanOptions from './components/PlanOptions.jsx';
import WhyPanel from './components/WhyPanel.jsx';

export default function App() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleRecommend = async (payload) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      // Quiz still in progress
      if (data.quizInProgress) {
        // Should not happen here — quiz is handled separately
        setError('Quiz incomplete — please complete the affordability questions.');
        return;
      }
      setResult(data);
    } catch (e) {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const handleQuizComplete = async (ceiling, quizData) => {
    // quizData contains takeHomePay etc. — but we already have ceiling
    // We call recommend with affordability inputs
    // Actually AffordabilityQuiz handles its own API; this callback receives final ceiling
    // We'll trigger a recommend call using the collected quiz data
  };

  const clearResult = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Affordability-Matched EMI</h1>
        <p>One question: how much can you actually pay per month? We find the fastest, cheapest plan that fits.</p>
      </div>

      <PurchaseForm onRecommend={handleRecommend} loading={loading} onQuizRequest={() => {}} />

      {error && <div className="error-box">{error}</div>}

      {result && (
        <>
          <PlanOptions result={result} />
          <WhyPanel result={result} />
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button className="link-btn" onClick={clearResult}>Start over</button>
          </div>
        </>
      )}

      <div style={{ textAlign: 'center', marginTop: 32, fontSize: '0.8rem', color: '#9ca3af' }}>
        Synthetic lenders only — no real bank calls. Every recommendation is logged.
      </div>
    </div>
  );
}

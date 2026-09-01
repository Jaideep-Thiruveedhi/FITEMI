import React, { useState, useEffect } from 'react';
import './styles/theme.css';

// Dream prompts
const PROMPTS = [
  "I want a laptop around ₹60,000",
  "Find me a phone under ₹50,000 I can pay at ₹4,000/month",
  "Need something I can pay off within a year",
  "Show me audio gear under ₹30,000",
];

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [dream, setDream] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [plans, setPlans] = useState([]);
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(0);
  const [affordability, setAffordability] = useState({ takeHomePay: '', existingObligations: '', otherExpenses: '' });
  const [ceiling, setCeiling] = useState(null);
  const [showCompass, setShowCompass] = useState(false);
  const [tradeOff, setTradeOff] = useState('balanced'); // balanced | low-payment | low-interest | fast
  const [whatIfDelta, setWhatIfDelta] = useState(0);
  const [checkout, setCheckout] = useState(null);
  const [orders, setOrders] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [conciergeMsg, setConciergeMsg] = useState("Hi! I'm your FITEMI concierge. Tell me what you want, and I'll find a comfortable way to pay for it.");
  const [merchantInsights, setMerchantInsights] = useState(null);

  // Load catalog on mount
  useEffect(() => { fetchCatalog(); fetchOrders(); fetchAudit(); fetchInsights(); }, []);

  const fetchCatalog = async (q = '') => {
    const res = await fetch(`/api/catalog?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setCatalog(data.products || []);
  };

  const fetchOrders = async () => {
    const res = await fetch('/api/merchant/orders');
    const data = await res.json();
    setOrders(data.orders || []);
  };

  const fetchAudit = async () => {
    const res = await fetch('/api/audit');
    const data = await res.json();
    setAudit((data.entries || []).slice(-8).reverse());
  };

  const fetchInsights = async () => {
    const res = await fetch('/api/merchant/insights');
    const data = await res.json();
    setMerchantInsights(data);
  };

  // Dream discovery -> catalog
  const handleDream = async (text) => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/agent/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentText: text, affordabilityInputs: ceiling ? { takeHomePay: parseInt(affordability.takeHomePay), existingObligations: parseInt(affordability.existingObligations) } : null })
      });
      const data = await res.json();
      setCatalog(data.catalogResults?.map(r => r.product) || []);
      setConciergeMsg(data.explanation || "Found some options for you. Pick one to see comfortable payment paths.");
      setActiveTab('explore');
      // If affordability known, auto-select best fit
      if (data.bestFit) {
        const prod = data.catalogResults.find(r => r.isBestFit)?.product;
        if (prod) handleProductSelect(prod);
      }
    } catch (e) { setConciergeMsg("Couldn't parse that — try 'laptop around ₹60,000' or pick a product below."); }
    setLoading(false);
  };

  const handleProductSelect = async (product) => {
    setSelectedProduct(product);
    setActiveTab('fit');
    setShowCompass(true);
    // If we have ceiling, fetch plans
    if (ceiling) fetchPlans(product, ceiling);
    setConciergeMsg(`Great choice — ${product.name} at ₹${product.price.toLocaleString('en-IN')}. Let's find a comfortable EMI.`);
  };

  const fetchPlans = async (product, target) => {
    const p = product || selectedProduct;
    const t = target || ceiling;
    if (!p || !t) return;
    setLoading(true);
    const effTarget = whatIfDelta ? Math.max(500, t + whatIfDelta) : t;
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemPrice: p.price, targetMonthlyPayment: effTarget })
    });
    const data = await res.json();
    if (data.feasible) {
      let opts = data.options;
      // Trade-off re-ranking
      if (tradeOff === 'low-payment') opts = [...opts].sort((a,b) => a.emi - b.emi);
      else if (tradeOff === 'low-interest') opts = [...opts].sort((a,b) => a.totalInterest - b.totalInterest);
      else if (tradeOff === 'fast') opts = [...opts].sort((a,b) => a.tenorMonths - b.tenorMonths);
      setPlans(opts);
      setSelectedPlanIdx(0);
    } else {
      setPlans([]);
    }
    setLoading(false);
  };

  useEffect(() => { if (selectedProduct && ceiling) fetchPlans(); }, [tradeOff, whatIfDelta, ceiling]);

  const handleAffordability = async () => {
    const takeHome = parseInt(affordability.takeHomePay);
    const obligations = parseInt(affordability.existingObligations);
    if (!takeHome || obligations == null || isNaN(takeHome)) { setConciergeMsg("Please enter your take-home pay."); return; }
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemPrice: selectedProduct?.price || 60000, takeHomePay: takeHome, existingObligations: obligations, otherExpenses: parseInt(affordability.otherExpenses)||0 })
    });
    const data = await res.json();
    if (data.affordabilityCeiling != null) {
      setCeiling(data.affordabilityCeiling);
      setConciergeMsg(`Your comfort zone is ₹${data.affordabilityCeiling.toLocaleString('en-IN')}/mo (0.4× take-home − obligations). Now let's see plans that fit.`);
      if (selectedProduct) fetchPlans(selectedProduct, data.affordabilityCeiling);
    }
  };

  const handleCheckout = async () => {
    const plan = plans[selectedPlanIdx];
    if (!plan || !selectedProduct) return;
    setLoading(true);
    try {
      const res = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct.id,
          plan: { tenorMonths: plan.tenorMonths, emi: plan.emi, totalInterest: plan.totalInterest, totalPaid: plan.totalPaid, lenderId: plan.lenderId },
          amount: selectedProduct.price,
          buyer: { targetMonthlyPayment: ceiling, affordabilityCeiling: ceiling },
          userApproval: true
        })
      });
      const data = await res.json();
      if (data.success) {
        setCheckout(data);
        setConciergeMsg(`Order created! ${data.isSimulated ? 'Simulated test-mode — no real charge.' : 'Razorpay test order ready.'}`);
        fetchOrders(); fetchAudit();
      } else {
        setConciergeMsg(`Checkout failed: ${data.error}`);
      }
    } catch (e) { setConciergeMsg("Checkout failed — try again."); }
    setLoading(false);
  };

  const selectedPlan = plans[selectedPlanIdx];

  return (
    <div>
      <nav className="nav-shell">
        <div className="nav-inner">
          <div className="nav-logo">
            <div className="nav-logo-mark">◈</div> FITEMI
            <span style={{ fontSize:'0.7rem', background:'var(--peach)', padding:'4px 8px', borderRadius:999, marginLeft:8 }}>AI COMMERCE</span>
          </div>
          <div className="nav-tabs">
            {[
              ['home','Home'],
              ['explore','Explore'],
              ['fit','My Fit'],
              ['orders','Orders'],
              ['merchant','Merchant'],
            ].map(([id,label]) => (
              <button key={id} className={`nav-tab ${activeTab===id?'active':''}`} onClick={()=>setActiveTab(id)}>{label}</button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={()=>setAiMode(!aiMode)} style={{ fontSize:'0.8rem', border: aiMode?'1px solid var(--peach-deep)':'none' }}>
            {aiMode ? '🤖 AI Buyer: ON' : '🤖 AI Buyer'}
          </button>
        </div>
      </nav>

      <div className="page-shell">
        {/* HOME — Dream Discovery */}
        {activeTab==='home' && (
          <>
            <div className="hero">
              <h1>What's on <span>your mind?</span></h1>
              <p>FITEMI helps your AI buyer find what you can actually afford — then pays the right way.</p>
              <div className="dream-input-wrap">
                <span className="dream-input-icon">✦</span>
                <input className="dream-input" placeholder="I want a laptop around ₹60,000… or try 'phone at ₹4,000/month'" value={dream} onChange={e=>setDream(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') handleDream(dream); }} />
              </div>
              <div className="dream-prompts">
                {PROMPTS.map(p => <button key={p} className="prompt-pill" onClick={()=>{ setDream(p); handleDream(p); }}>{p}</button>)}
              </div>
              <div style={{ marginTop:24, display:'flex', gap:12, justifyContent:'center' }}>
                <button className="btn btn-primary" onClick={()=>handleDream(dream)} disabled={loading}>{loading?'Thinking…':'Find my fit →'}</button>
                <button className="btn btn-secondary" onClick={()=>setActiveTab('explore')}>Browse catalog</button>
              </div>
            </div>

            <div className="card" style={{ background:'linear-gradient(135deg, var(--peach-light) 0%, #fff 100%)', display:'flex', gap:24, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ fontSize:'3rem' }}>🧭</div>
              <div style={{ flex:1, minWidth:240 }}>
                <h3 style={{ marginBottom:8 }}>AI Buyer Mode</h3>
                <p style={{ color:'var(--navy-soft)', fontSize:'0.9rem' }}>“Find me a laptop for my user. Budget ₹60,000. Comfortable ₹5,000/mo.” → FITEMI discovers, compares, and asks for approval before charging. Try the prompts above.</p>
              </div>
              <button className="btn btn-primary" onClick={()=>handleDream("Find me a laptop for my user. Budget ₹60,000. Comfortable monthly payment ₹5,000.")}>Run AI Buyer demo</button>
            </div>

            <div style={{ marginTop:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div className="card">
                <h4>📦 Merchant Catalog</h4>
                <p style={{ fontSize:'0.9rem', color:'var(--navy-soft)', marginTop:8 }}>{catalog.length} products from 3 merchants — agent-readable, filterable.</p>
                <button className="btn btn-ghost" style={{ marginTop:12, color:'var(--navy)' }} onClick={()=>setActiveTab('explore')}>Explore →</button>
              </div>
              <div className="card card-lilac">
                <h4>🛡️ Bounded & Gated</h4>
                <p style={{ fontSize:'0.9rem', color:'var(--navy-soft)', marginTop:8 }}>No payment without explicit approval. Every money action is deterministic and audited.</p>
              </div>
            </div>

            <AiConcierge msg={conciergeMsg} />
          </>
        )}

        {/* EXPLORE — Catalog */}
        {activeTab==='explore' && (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:12 }}>
              <h2>Explore</h2>
              <div style={{ display:'flex', gap:8 }}>
                <input placeholder="Search products…" style={{ padding:'10px 16px', borderRadius:999, border:'1px solid rgba(26,26,46,0.1)', background:'white' }} onKeyDown={e=>{ if(e.key==='Enter') fetchCatalog(e.target.value); }} />
                <button className="btn btn-secondary" onClick={()=>fetchCatalog('')}>All</button>
                <button className="btn btn-secondary" onClick={()=>fetchCatalog('laptop')}>Laptops</button>
                <button className="btn btn-secondary" onClick={()=>fetchCatalog('phone')}>Phones</button>
              </div>
            </div>
            <div className="catalog-grid">
              {catalog.map(p => (
                <div key={p.id} className={`product-card ${selectedProduct?.id===p.id?'selected':''}`} onClick={()=>handleProductSelect(p)}>
                  <div className="product-image" style={{ background: p.color || 'var(--peach-light)' }}>
                    {p.badge && <span className="product-badge">{p.badge}</span>}
                    <span>{p.image}</span>
                  </div>
                  <div className="product-info">
                    <div className="product-merchant">{p.merchant?.name || p.merchantId} • {p.category}</div>
                    <div className="product-name">{p.name}</div>
                    <div className="product-price">
                      <span className="price-current">₹{p.price.toLocaleString('en-IN')}</span>
                      {p.originalPrice && <span className="price-original">₹{p.originalPrice.toLocaleString('en-IN')}</span>}
                    </div>
                    <div className="product-desc">{p.description}</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--navy-soft)' }}>{p.availability}</div>
                  </div>
                </div>
              ))}
            </div>
            {catalog.length===0 && <p style={{ textAlign:'center', marginTop:32, color:'var(--navy-soft)' }}>No products match. Try "laptop" or clear search.</p>}
            <AiConcierge msg={conciergeMsg} />
          </>
        )}

        {/* MY FIT — Affordability + Spectrum + Trade-off + What-if */}
        {activeTab==='fit' && (
          <>
            {!selectedProduct ? (
              <div className="card" style={{ textAlign:'center', padding:48 }}>
                <div style={{ fontSize:'3rem', marginBottom:16 }}>🔍</div>
                <h3>Pick a product to find your fit</h3>
                <p style={{ color:'var(--navy-soft)', marginTop:8 }}>Your affordability and EMI spectrum will appear here.</p>
                <button className="btn btn-primary" style={{ marginTop:16 }} onClick={()=>setActiveTab('explore')}>Choose product</button>
              </div>
            ) : (
              <>
                <div className="card" style={{ display:'flex', gap:20, alignItems:'center', flexWrap:'wrap' }}>
                  <div style={{ fontSize:'2.5rem', background: selectedProduct.color, width:72, height:72, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:16 }}>{selectedProduct.image}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'0.75rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--navy-soft)' }}>{selectedProduct.merchant?.name} • {selectedProduct.category}</div>
                    <h3>{selectedProduct.name}</h3>
                    <div style={{ fontWeight:700, fontSize:'1.25rem' }}>₹{selectedProduct.price.toLocaleString('en-IN')}</div>
                  </div>
                  <button className="btn btn-ghost" onClick={()=>setActiveTab('explore')}>Change</button>
                </div>

                {/* Affordability Compass */}
                <div className="card" style={{ marginTop:20 }}>
                  <h3>Affordability Compass</h3>
                  <p style={{ fontSize:'0.9rem', color:'var(--navy-soft)' }}>What's comfortable for you? Backend is the source of truth — frontend never decides.</p>
                  
                  {!ceiling ? (
                    <div style={{ marginTop:20, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                      <input placeholder="Take-home pay (₹)" type="number" value={affordability.takeHomePay} onChange={e=>setAffordability({...affordability, takeHomePay:e.target.value})} style={{ padding:'12px', borderRadius:12, border:'1px solid rgba(26,26,46,0.1)' }} />
                      <input placeholder="Existing obligations (₹)" type="number" value={affordability.existingObligations} onChange={e=>setAffordability({...affordability, existingObligations:e.target.value})} style={{ padding:'12px', borderRadius:12, border:'1px solid rgba(26,26,46,0.1)' }} />
                      <input placeholder="Other expenses (₹)" type="number" value={affordability.otherExpenses} onChange={e=>setAffordability({...affordability, otherExpenses:e.target.value})} style={{ padding:'12px', borderRadius:12, border:'1px solid rgba(26,26,46,0.1)' }} />
                    </div>
                  ) : null}
                  
                  {!ceiling ? (
                    <button className="btn btn-primary" style={{ marginTop:16 }} onClick={handleAffordability} disabled={loading}>Calculate my comfort zone</button>
                  ) : (
                    <div className="compass-wrap" style={{ marginTop:20 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', fontWeight:600 }}>
                        <span>TOO TIGHT</span><span>COMFORTABLE</span><span>STRETCHED</span>
                      </div>
                      <div className="compass-track">
                        <div className="compass-thumb" style={{ left: `${Math.min(90, Math.max(10, (ceiling/8000)*100))}%` }}>●</div>
                      </div>
                      <div className="compass-value">
                        <div className="compass-amount">₹{ceiling.toLocaleString('en-IN')}/mo</div>
                        <div className="compass-sub">Comfort zone • 0.4× take-home − obligations (backend) • <button className="btn btn-ghost" style={{ padding:'4px 8px', fontSize:'0.8rem' }} onClick={()=>{ setCeiling(null); setPlans([]); }}>Recalculate</button></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* EMI Spectrum */}
                {ceiling && (
                  <div className="spectrum-wrap" style={{ marginTop:20 }}>
                    <h3>EMI Spectrum</h3>
                    <p style={{ fontSize:'0.85rem', color:'var(--navy-soft)' }}>Lower monthly payment ←————————→ Lower total interest • Interactive — actual solver values</p>
                    {plans.length===0 ? (
                      <div style={{ textAlign:'center', padding:32, background:'var(--peach-light)', borderRadius:16, marginTop:16 }}>
                        <h4>No feasible plan</h4>
                        <p style={{ fontSize:'0.9rem', color:'var(--navy-soft)', marginTop:8 }}>Your budget ₹{ceiling.toLocaleString('en-IN')}/mo is below the lowest feasible EMI for this product. Try a lower-priced product or increase budget.</p>
                        <div style={{ marginTop:16, display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
                          <button className="btn btn-secondary" onClick={()=>setActiveTab('explore')}>Explore lower-priced</button>
                          <button className="btn btn-secondary" onClick={()=>setWhatIfDelta(1000)}>What if +₹1,000?</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="spectrum-track">
                          {plans.map((p,i) => {
                            const left = plans.length===1 ? 50 : (i/(plans.length-1))*100;
                            return (
                              <div key={p.lenderId+p.tenorMonths} className={`spectrum-plan ${i===selectedPlanIdx?'selected':''}`} style={{ left: `${left}%` }} onClick={()=>setSelectedPlanIdx(i)}>
                                {i===0 && <div className="spectrum-fit">★ YOUR FIT</div>}
                                <div className="spectrum-dot"></div>
                                <div className="spectrum-emi">₹{p.emi.toLocaleString('en-IN')}</div>
                                <div className="spectrum-tenor">{p.tenorMonths}mo</div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.75rem', color:'var(--navy-soft)', marginTop:8 }}>
                          <span>LOWER MONTHLY</span><span>LOWER INTEREST</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Trade-off Lab */}
                {plans.length>0 && (
                  <div className="card" style={{ marginTop:20 }}>
                    <h3>Trade-off Lab</h3>
                    <p style={{ fontSize:'0.85rem', color:'var(--navy-soft)' }}>What matters more? Plans re-rank deterministically.</p>
                    <div style={{ display:'flex', gap:8, marginTop:16, flexWrap:'wrap' }}>
                      {[
                        ['balanced','Balanced'],
                        ['low-payment','Lower monthly'],
                        ['low-interest','Lower interest'],
                        ['fast','Fastest payoff'],
                      ].map(([k,l]) => (
                        <button key={k} className={`btn ${tradeOff===k?'btn-primary':'btn-secondary'}`} style={{ padding:'10px 16px', fontSize:'0.85rem' }} onClick={()=>setTradeOff(k)}>{l}</button>
                      ))}
                    </div>
                    {selectedPlan && (
                      <p style={{ marginTop:12, fontSize:'0.85rem', background:'var(--lilac-light)', padding:12, borderRadius:12 }}>
                        Choosing <strong>{selectedPlan.tenorMonths}mo @ ₹{selectedPlan.emi.toLocaleString('en-IN')}</strong> vs next: tenure diff {Math.abs(selectedPlan.tenorMonths - (plans[1]?.tenorMonths||selectedPlan.tenorMonths))}mo, interest diff ₹{Math.abs(selectedPlan.totalInterest - (plans[1]?.totalInterest||selectedPlan.totalInterest)).toLocaleString('en-IN')}.
                      </p>
                    )}
                  </div>
                )}

                {/* What-If Simulator */}
                {ceiling && plans.length>0 && (
                  <div className="card" style={{ marginTop:20 }}>
                    <h3>What-if Simulator</h3>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
                      <button className="btn btn-secondary" onClick={()=>setWhatIfDelta(-1000)} style={whatIfDelta===-1000?{background:'var(--navy)',color:'white'}:{}}>Budget −₹1,000</button>
                      <button className="btn btn-secondary" onClick={()=>setWhatIfDelta(0)} style={whatIfDelta===0?{background:'var(--navy)',color:'white'}:{}}>Current</button>
                      <button className="btn btn-secondary" onClick={()=>setWhatIfDelta(500)} style={whatIfDelta===500?{background:'var(--navy)',color:'white'}:{}}>Budget +₹500</button>
                      <button className="btn btn-secondary" onClick={()=>setWhatIfDelta(1000)} style={whatIfDelta===1000?{background:'var(--navy)',color:'white'}:{}}>Budget +₹1,000</button>
                      <button className="btn btn-secondary" onClick={()=>setWhatIfDelta(-500)}>Pay 6mo sooner</button>
                    </div>
                    <div style={{ marginTop:16, display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:12, alignItems:'center', textAlign:'center' }}>
                      <div style={{ background:'var(--cream)', padding:16, borderRadius:12 }}>
                        <div style={{ fontSize:'0.75rem', color:'var(--navy-soft)' }}>CURRENT</div>
                        <div style={{ fontWeight:700 }}>₹{ceiling.toLocaleString('en-IN')}/mo</div>
                        <div style={{ fontSize:'0.8rem' }}>{plans.length} options</div>
                      </div>
                      <div>→</div>
                      <div style={{ background:'var(--peach-light)', padding:16, borderRadius:12, border:'2px solid var(--peach)' }}>
                        <div style={{ fontSize:'0.75rem', color:'var(--navy-soft)' }}>NEW CONSTRAINT</div>
                        <div style={{ fontWeight:700 }}>₹{(ceiling+whatIfDelta).toLocaleString('en-IN')}/mo</div>
                        <div style={{ fontSize:'0.8rem' }}>{whatIfDelta===0?'— same':'recalculating...'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Deep Plan View */}
                {selectedPlan && (
                  <div className="card" style={{ marginTop:20, background:'linear-gradient(135deg, #fff 0%, var(--lilac-light) 100%)' }}>
                    <h3>Deep Plan View</h3>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:16 }}>
                      <div>
                        <div style={{ fontSize:'2rem', fontWeight:700 }}>₹{selectedPlan.emi.toLocaleString('en-IN')}<span style={{ fontSize:'1rem', fontWeight:400 }}>/mo</span></div>
                        <div style={{ fontSize:'0.9rem', color:'var(--navy-soft)' }}>{selectedPlan.tenorMonths} months • {selectedPlan.lenderId}</div>
                        <div style={{ marginTop:16, fontSize:'0.85rem' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(26,26,46,0.06)' }}><span>Principal</span><strong>₹{selectedProduct.price.toLocaleString('en-IN')}</strong></div>
                          <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(26,26,46,0.06)' }}><span>Interest</span><strong>₹{selectedPlan.totalInterest.toLocaleString('en-IN')}</strong></div>
                          <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(26,26,46,0.06)' }}><span>Fee</span><strong>₹499</strong></div>
                          <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontWeight:700 }}><span>Total</span><strong>₹{(selectedPlan.totalPaid+499).toLocaleString('en-IN')}</strong></div>
                        </div>
                      </div>
                      <div>
                        <div style={{ background:'white', padding:16, borderRadius:12 }}>
                          <div style={{ height:12, background:`linear-gradient(90deg, var(--navy) 0%, var(--navy) ${(selectedProduct.price/selectedPlan.totalPaid)*100}%, var(--peach) ${(selectedProduct.price/selectedPlan.totalPaid)*100}%, var(--peach) 100%)`, borderRadius:999, marginBottom:8 }}></div>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.75rem' }}><span>● Principal</span><span style={{ color:'var(--peach-deep)' }}>● Interest</span></div>
                        </div>
                        <div style={{ marginTop:16, padding:12, background:'white', borderRadius:12, border:'1px solid var(--lilac)' }}>
                          <div style={{ fontSize:'0.75rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--navy)', marginBottom:8 }}>Why this plan?</div>
                          <ul style={{ paddingLeft:18, fontSize:'0.85rem', lineHeight:1.6 }}>
                            <li>Fits your ₹{ceiling.toLocaleString('en-IN')}/mo — ₹{selectedPlan.explanationFacts.monthlyHeadroom.toLocaleString('en-IN')} headroom</li>
                            <li>{selectedPlan.explanationFacts.reason==='lowest_total_interest'?'Lowest total interest — fastest payoff':`Interest ₹${selectedPlan.totalInterest.toLocaleString('en-IN')}`}</li>
                            <li>Rank {selectedPlan.explanationFacts.rank} of {plans.length} — {selectedPlan.tenorMonths}mo payoff</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop:16, display:'flex', gap:8 }}>
                      <button className="btn btn-primary" onClick={()=>setActiveTab('orders')} style={{ flex:1 }}>Continue to checkout →</button>
                      <button className="btn btn-secondary" onClick={()=>{ const el=document.getElementById('alternatives'); el?.scrollIntoView({behavior:'smooth'}); }}>Alternatives</button>
                    </div>
                    <div id="alternatives" style={{ marginTop:16 }}>
                      <h4 style={{ fontSize:'0.9rem', marginBottom:8 }}>Alternatives</h4>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px,1fr))', gap:8 }}>
                        {plans.slice(1).map(p=>(
                          <div key={p.lenderId} style={{ background:'white', padding:12, borderRadius:12, border:'1px solid rgba(26,26,46,0.08)' }}>
                            <div style={{ fontWeight:600, fontSize:'0.9rem' }}>{p.lenderId} • {p.tenorMonths}mo</div>
                            <div style={{ fontSize:'0.85rem' }}>₹{p.emi.toLocaleString('en-IN')}/mo • Interest ₹{p.totalInterest.toLocaleString('en-IN')}</div>
                            <div style={{ fontSize:'0.75rem', color:'var(--navy-soft)', marginTop:4 }}>{p.explanationFacts.reasonLabel.substring(0,60)}…</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <AiConcierge msg={conciergeMsg} />
              </>
            )}
          </>
        )}

        {/* ORDERS — Bounded Checkout + Razorpay */}
        {activeTab==='orders' && (
          <>
            {!selectedPlan || !selectedProduct ? (
              <div className="card" style={{ textAlign:'center', padding:48 }}>
                <div style={{ fontSize:'3rem' }}>🛒</div>
                <h3>No checkout yet</h3>
                <p style={{ color:'var(--navy-soft)', marginTop:8 }}>Pick a product and plan in My Fit to checkout.</p>
                <button className="btn btn-primary" style={{ marginTop:16 }} onClick={()=>setActiveTab('fit')}>Go to My Fit</button>
              </div>
            ) : (
              <>
                <div className="card" style={{ border:'2px solid var(--navy)', background:'linear-gradient(135deg, var(--peach-light) 0%, white 100%)' }}>
                  <div style={{ textAlign:'center', marginBottom:24 }}>
                    <div style={{ fontSize:'0.8rem', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--navy-soft)' }}>You are about to purchase</div>
                    <div style={{ fontSize:'1.75rem', fontWeight:700, marginTop:8 }}>{selectedProduct.name}</div>
                    <div style={{ fontSize:'1.25rem', color:'var(--navy-soft)' }}>₹{selectedProduct.price.toLocaleString('en-IN')}</div>
                  </div>
                  <div style={{ background:'white', padding:20, borderRadius:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                    <div>
                      <div style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--navy-soft)' }}>Plan</div>
                      <div style={{ fontSize:'1.5rem', fontWeight:700 }}>₹{selectedPlan.emi.toLocaleString('en-IN')}/mo</div>
                      <div style={{ fontSize:'0.9rem', color:'var(--navy-soft)' }}>{selectedPlan.tenorMonths} months • {selectedPlan.lenderId}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--navy-soft)' }}>Total payable</div>
                      <div style={{ fontSize:'1.5rem', fontWeight:700 }}>₹{selectedPlan.totalPaid.toLocaleString('en-IN')}</div>
                      <div style={{ fontSize:'0.9rem', color:'var(--navy-soft)' }}>Interest ₹{selectedPlan.totalInterest.toLocaleString('en-IN')}</div>
                    </div>
                  </div>
                  <div style={{ background:'white', padding:16, borderRadius:12, marginTop:16, border:'1px solid var(--lilac)' }}>
                    <div style={{ fontSize:'0.8rem', fontWeight:800, textTransform:'uppercase' }}>Why</div>
                    <ul style={{ paddingLeft:18, fontSize:'0.85rem', marginTop:8, lineHeight:1.6 }}>
                      <li>Within approved budget ₹{ceiling?.toLocaleString('en-IN')}/mo (₹{selectedPlan.explanationFacts.monthlyHeadroom.toLocaleString('en-IN')} headroom)</li>
                      <li>{selectedPlan.explanationFacts.reason==='lowest_total_interest'?'Lowest interest among matching options':selectedPlan.explanationFacts.reasonLabel}</li>
                      <li>Deterministic solver — no LLM financial decision</li>
                    </ul>
                  </div>
                  <div style={{ display:'flex', gap:12, marginTop:20 }}>
                    <button className="btn btn-primary" style={{ flex:1 }} onClick={handleCheckout} disabled={loading}>{loading?'Processing…':'Approve payment'}</button>
                    <button className="btn btn-secondary" onClick={()=>setActiveTab('fit')}>Change plan</button>
                    <button className="btn btn-ghost" onClick={()=>{ setCheckout(null); setActiveTab('fit'); }}>Cancel</button>
                  </div>
                  <div style={{ textAlign:'center', marginTop:12, fontSize:'0.75rem', color:'var(--navy-soft)' }}>🔒 Bounded gate — agent cannot charge without your approval. Test-mode only.</div>
                </div>

                {checkout && (
                  <div className="card" style={{ marginTop:16, background: checkout.isSimulated?'var(--peach-light)':'#ECFDF5', border:`2px solid ${checkout.isSimulated?'var(--peach-deep)':'var(--success)'}` }}>
                    <h3>{checkout.isSimulated?'✓ Simulated Test Order':'✓ Razorpay Test Order'}</h3>
                    <p style={{ fontSize:'0.9rem', marginTop:8 }}>{checkout.message}</p>
                    <div style={{ background:'white', padding:16, borderRadius:12, marginTop:12, fontSize:'0.85rem' }}>
                      <div>Order ID: <strong>{checkout.orderId}</strong></div>
                      <div>Razorpay ID: <strong>{checkout.razorpayOrder.id}</strong></div>
                      <div>Amount: <strong>₹{checkout.razorpayOrder.amountInRupees?.toLocaleString('en-IN') || selectedProduct.price.toLocaleString('en-IN')}</strong> • {checkout.razorpayOrder.currency || 'INR'}</div>
                      <div>Status: <strong>{checkout.merchantOrder?.status || 'paid'}</strong></div>
                    </div>
                    {!checkout.isSimulated && <p style={{ fontSize:'0.8rem', marginTop:12, color:'var(--navy-soft)' }}>Use Razorpay test card `4111 1111 1111 1111` + any CVV to complete in dashboard.</p>}
                  </div>
                )}

                <div className="card" style={{ marginTop:16 }}>
                  <h4>Your Orders</h4>
                  {orders.length===0 ? <p style={{ fontSize:'0.9rem', color:'var(--navy-soft)', marginTop:8 }}>No orders yet — complete a checkout above.</p> : (
                    <div style={{ marginTop:12, display:'grid', gap:8 }}>
                      {orders.slice(0,5).map(o=>(
                        <div key={o.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:12, background:'var(--cream)', borderRadius:12 }}>
                          <div>
                            <div style={{ fontWeight:600 }}>{o.productName}</div>
                            <div style={{ fontSize:'0.8rem', color:'var(--navy-soft)' }}>{o.plan.emi ? `₹${o.plan.emi}/mo • ${o.plan.tenorMonths}mo` : ''} • {o.merchantName}</div>
                          </div>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontWeight:600, color: o.status==='paid'?'var(--success)': o.status==='awaiting_approval'?'var(--warning)':'var(--navy)' }}>{o.status}</div>
                            <div style={{ fontSize:'0.75rem', color:'var(--navy-soft)' }}>₹{o.amount.toLocaleString('en-IN')}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
            <AiConcierge msg={conciergeMsg} />
          </>
        )}

        {/* MERCHANT */}
        {activeTab==='merchant' && (
          <>
            <h2>Merchant Console</h2>
            <p style={{ color:'var(--navy-soft)', marginBottom:16 }}>TechHaven • 3 products • Real-time AI buyer activity</p>
            
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px,1fr))', gap:12, marginBottom:20 }}>
              <div className="card" style={{ textAlign:'center' }}>
                <div style={{ fontSize:'2rem', fontWeight:700 }}>{orders.length}</div>
                <div style={{ fontSize:'0.8rem', color:'var(--navy-soft)' }}>Total orders</div>
              </div>
              <div className="card" style={{ textAlign:'center' }}>
                <div style={{ fontSize:'2rem', fontWeight:700, color:'var(--success)' }}>{orders.filter(o=>o.status==='paid').length}</div>
                <div style={{ fontSize:'0.8rem', color:'var(--navy-soft)' }}>Paid (test-mode)</div>
              </div>
              <div className="card" style={{ textAlign:'center' }}>
                <div style={{ fontSize:'2rem', fontWeight:700, color:'var(--warning)' }}>{orders.filter(o=>o.status==='awaiting_approval').length}</div>
                <div style={{ fontSize:'0.8rem', color:'var(--navy-soft)' }}>Awaiting approval</div>
              </div>
            </div>

            <div className="card">
              <h4>Recent AI Buyer Activity</h4>
              {orders.length===0 ? <p style={{ color:'var(--navy-soft)', marginTop:8 }}>No activity yet — create an order in Orders →</p> : (
                <div style={{ marginTop:12 }}>
                  {orders.slice(0,5).map(o=>(
                    <div key={o.id} style={{ display:'flex', gap:12, padding:12, borderBottom:'1px solid rgba(26,26,46,0.06)', alignItems:'center' }}>
                      <div style={{ width:40, height:40, background:'var(--lilac)', borderRadius:999, display:'flex', alignItems:'center', justifyContent:'center' }}>🤖</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:'0.9rem' }}>{o.status==='paid'?'PAID':'NEW AI BUYER'} — {o.productName}</div>
                        <div style={{ fontSize:'0.8rem', color:'var(--navy-soft)' }}>{o.plan ? `Agent selected: ₹${o.plan.emi}/mo • ${o.plan.tenorMonths}mo` : ''} • {new Date(o.createdAt).toLocaleString()}</div>
                      </div>
                      <div style={{ fontSize:'0.8rem', fontWeight:600, padding:'6px 12px', borderRadius:999, background: o.status==='paid'?'#ECFDF5':'#FFFBEB', color: o.status==='paid'?'var(--success)':'var(--warning)' }}>{o.status}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card" style={{ marginTop:16 }}>
              <h4>Revenue Intelligence <span style={{ fontSize:'0.7rem', background:'var(--lilac)', padding:'4px 8px', borderRadius:999, marginLeft:8 }}>DEMO SYNTHETIC</span></h4>
              {merchantInsights ? (
                <div style={{ marginTop:12 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                    <div style={{ background:'var(--cream)', padding:16, borderRadius:12, textAlign:'center' }}>
                      <div style={{ fontSize:'1.5rem', fontWeight:700 }}>{merchantInsights.real.conversionRate}</div>
                      <div style={{ fontSize:'0.75rem', color:'var(--navy-soft)' }}>Conversion (real orders)</div>
                    </div>
                    <div style={{ background:'var(--peach-light)', padding:16, borderRadius:12, textAlign:'center' }}>
                      <div style={{ fontSize:'1.5rem', fontWeight:700 }}>{merchantInsights.real.totalOrders}</div>
                      <div style={{ fontSize:'0.75rem', color:'var(--navy-soft)' }}>Total demo orders</div>
                    </div>
                  </div>
                  {merchantInsights.syntheticInsights.map((ins,i)=>(
                    <div key={i} style={{ background:'white', border:'1px solid rgba(26,26,46,0.08)', padding:16, borderRadius:12, marginBottom:8 }}>
                      <div style={{ fontSize:'0.9rem', fontWeight:600 }}>💡 {ins.insight}</div>
                      <div style={{ fontSize:'0.75rem', color:'var(--navy-soft)', marginTop:4 }}>{ins.source}</div>
                      <div style={{ fontSize:'0.8rem', color:'var(--success)', marginTop:4 }}>→ {ins.action}</div>
                    </div>
                  ))}
                  <div style={{ fontSize:'0.7rem', color:'var(--navy-soft)', marginTop:8, fontStyle:'italic' }}>{merchantInsights.disclaimer}</div>
                </div>
              ) : <p style={{ color:'var(--navy-soft)' }}>Loading insights…</p>}
            </div>

            <div className="card" style={{ marginTop:16 }}>
              <h4>Audit / Trust Timeline</h4>
              <p style={{ fontSize:'0.8rem', color:'var(--navy-soft)' }}>Every money action is explainable, bounded, gated.</p>
              <div style={{ marginTop:12, position:'relative', paddingLeft:24 }}>
                <div style={{ position:'absolute', left:8, top:0, bottom:0, width:2, background:'var(--peach)', borderRadius:999 }}></div>
                {[
                  ['Intent received', 'Dream: "laptop around ₹60,000"', 'ok'],
                  ['Product selected', selectedProduct ? selectedProduct.name : '—', selectedProduct?'ok':'pending'],
                  ['Affordability checked', ceiling ? `₹${ceiling}/mo (0.4× take-home)` : '—', ceiling?'ok':'pending'],
                  ['Plan selected', selectedPlan ? `${selectedPlan.tenorMonths}mo @ ₹${selectedPlan.emi}` : '—', selectedPlan?'ok':'pending'],
                  ['Approval requested', checkout ? 'User approved' : '—', checkout?'ok':'pending'],
                  ['Payment initiated', checkout?.razorpayOrder ? checkout.razorpayOrder.id : '—', checkout?'ok':'pending'],
                  ['Payment confirmed', checkout?.merchantOrder?.status==='paid'?'PAID (test-mode)':'—', checkout?.merchantOrder?.status==='paid'?'ok':'pending'],
                ].map(([title, desc, status])=>(
                  <div key={title} style={{ position:'relative', padding:'12px 0 12px 16px', display:'flex', gap:12, alignItems:'center' }}>
                    <div style={{ position:'absolute', left:-20, width:12, height:12, borderRadius:'50%', background: status==='ok'?'var(--success)':'var(--cream-dark)', border:'2px solid white', boxShadow:'0 0 0 2px var(--peach)' }}></div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:'0.9rem' }}>{title}</div>
                      <div style={{ fontSize:'0.8rem', color:'var(--navy-soft)' }}>{desc}</div>
                    </div>
                    <div style={{ fontSize:'0.7rem', padding:'4px 8px', borderRadius:999, background: status==='ok'?'#ECFDF5':'var(--cream)', color: status==='ok'?'var(--success)':'var(--navy-soft)' }}>{status}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:16, background:'var(--cream)', padding:12, borderRadius:12, fontSize:'0.75rem' }}>
                <div style={{ fontWeight:600, marginBottom:4 }}>Recent audit entries (sanitized)</div>
                {audit.length===0 ? <div style={{ color:'var(--navy-soft)' }}>No audit yet — make a request.</div> : audit.slice(0,3).map(a=>(
                  <div key={a.requestId} style={{ fontFamily:'monospace', fontSize:'0.7rem', padding:'4px 0', borderBottom:'1px solid rgba(26,26,46,0.06)' }}>
                    {new Date(a.timestamp).toLocaleTimeString()} • {a.method} {a.path} → {a.status} • {a.durationMs}ms • {a.requestId}
                  </div>
                ))}
                <button className="btn btn-ghost" style={{ fontSize:'0.75rem', marginTop:8 }} onClick={fetchAudit}>Refresh audit</button>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ textAlign:'center', padding:'24px 0 32px', fontSize:'0.75rem', color:'var(--navy-soft)', borderTop:'1px solid rgba(26,26,46,0.06)', marginTop:32 }}>
        FITEMI • AI-native payment-fit + commerce agent • Deterministic solver • Razorpay test-mode • Every money action explainable, bounded, gated
      </div>
    </div>
  );
}

function AiConcierge({ msg }) {
  return (
    <div style={{ marginTop:20, background:'linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)', color:'white', padding:16, borderRadius:16, display:'flex', gap:12, alignItems:'flex-start' }}>
      <div style={{ width:36, height:36, background:'var(--peach)', borderRadius:999, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>🤖</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:'0.75rem', fontWeight:700, letterSpacing:'0.05em', opacity:0.8 }}>FITEMI CONCIERGE</div>
        <div style={{ fontSize:'0.9rem', marginTop:4, lineHeight:1.5 }}>{msg}</div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import './styles/theme.css';

const PROMPTS = [
  "I want a laptop around ₹60,000",
  "Find me a phone I can pay at ₹4,000/month",
  "Need something I can pay off within a year",
  "Show me audio gear under ₹30,000",
];

export default function App() {
  const [tab, setTab] = useState('discover');
  const [dream, setDream] = useState('');
  const [intent, setIntent] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(null);
  const [plans, setPlans] = useState([]);
  const [activePlan, setActivePlan] = useState(0);
  const [afford, setAfford] = useState({ takeHomePay:'', existingObligations:'', otherExpenses:'' });
  const [ceiling, setCeiling] = useState(null);
  const [trade, setTrade] = useState('balanced');
  const [whatIf, setWhatIf] = useState(0);
  const [checkout, setCheckout] = useState(null);
  const [orders, setOrders] = useState([]);
  const [audit, setAudit] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiOn, setAiOn] = useState(true);
  const [concierge, setConcierge] = useState("Tell me what you want — I'll find a comfortable way to pay for it.");

  useEffect(()=>{ loadCatalog(); loadOrders(); loadAudit(); loadInsights(); }, []);
  const loadCatalog = async (q='')=>{ const r=await fetch(`/api/catalog?q=${encodeURIComponent(q)}`); const j=await r.json(); setCatalog(j.products||[]); };
  const loadOrders = async ()=>{ const r=await fetch('/api/merchant/orders'); const j=await r.json(); setOrders(j.orders||[]); };
  const loadAudit = async ()=>{ const r=await fetch('/api/audit'); const j=await r.json(); setAudit((j.entries||[]).slice(-8).reverse()); };
  const loadInsights = async ()=>{ const r=await fetch('/api/merchant/insights'); const j=await r.json(); setInsights(j); };

  const handleDream = async (text)=>{
    if(!text.trim()) return;
    setLoading(true);
    try{
      const r=await fetch('/api/agent/orchestrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intentText:text, affordabilityInputs: ceiling?{takeHomePay:parseInt(afford.takeHomePay), existingObligations:parseInt(afford.existingObligations)}:null})});
      const j=await r.json();
      setIntent(j.intent);
      setCatalog(j.catalogResults?.map(c=>c.product)||[]);
      setConcierge(j.explanation||"Found options. Pick a product to explore payment fits.");
      setTab('explore');
      const best=j.catalogResults?.find(c=>c.isBestFit)?.product;
      if(best) handleSelect(best, j.affordabilityCeiling);
    }catch{ setConcierge("Try: 'laptop around ₹60,000'"); }
    setLoading(false);
  };

  const handleSelect = async (product, knownCeiling)=>{
    setSelected(product);
    setTab('fit');
    if(knownCeiling) setCeiling(knownCeiling);
    else if(ceiling) fetchPlans(product, ceiling);
    setConcierge(`Considering ${product.name} — ₹${product.price.toLocaleString('en-IN')}. Let's find a comfortable EMI.`);
  };

  const fetchPlans = async (prod, target)=>{
    const p=prod||selected; const t=target||ceiling;
    if(!p||!t) return;
    setLoading(true);
    const eff=Math.max(500, t + whatIf);
    const r=await fetch('/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemPrice:p.price, targetMonthlyPayment: eff})});
    const j=await r.json();
    if(j.feasible){
      let opts=j.options;
      if(trade==='low-payment') opts=[...opts].sort((a,b)=>a.emi-b.emi);
      else if(trade==='low-interest') opts=[...opts].sort((a,b)=>a.totalInterest-b.totalInterest);
      else if(trade==='fast') opts=[...opts].sort((a,b)=>a.tenorMonths-b.tenorMonths);
      setPlans(opts); setActivePlan(0);
    } else setPlans([]);
    setLoading(false);
  };
  useEffect(()=>{ if(selected&&ceiling) fetchPlans(); },[trade, whatIf, ceiling]);

  const handleAfford = async ()=>{
    const th=parseInt(afford.takeHomePay); const ob=parseInt(afford.existingObligations);
    if(!th){ setConcierge("Enter take-home pay."); return; }
    const r=await fetch('/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemPrice:selected?.price||60000, takeHomePay:th, existingObligations:ob, otherExpenses:parseInt(afford.otherExpenses)||0})});
    const j=await r.json();
    if(j.affordabilityCeiling!=null){ setCeiling(j.affordabilityCeiling); setConcierge(`Comfort zone ₹${j.affordabilityCeiling.toLocaleString('en-IN')}/mo (0.4× take-home − obligations, backend).`); if(selected) fetchPlans(selected, j.affordabilityCeiling); }
  };

  const handleCheckout = async ()=>{
    const plan=plans[activePlan];
    if(!plan||!selected) return;
    setLoading(true);
    try{
      const r=await fetch('/api/checkout/create-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:selected.id, plan:{tenorMonths:plan.tenorMonths, emi:plan.emi, totalInterest:plan.totalInterest, totalPaid:plan.totalPaid, lenderId:plan.lenderId}, amount:selected.price, buyer:{targetMonthlyPayment:ceiling, affordabilityCeiling:ceiling}, userApproval:true})});
      const j=await r.json();
      if(j.success){ setCheckout(j); setConcierge(j.isSimulated?'Simulated test order — no real charge.':'Razorpay test order created.'); loadOrders(); loadAudit(); }
      else setConcierge(j.error);
    }catch{ setConcierge("Checkout failed."); }
    setLoading(false);
  };

  const plan=plans[activePlan];

  return (
    <div>
      <nav className="parchment-nav">
        <div className="nav-inner">
          <div className="nav-wordmark">FITEMI <span>TRACK 01 • AI COMMERCE</span></div>
          <div className="nav-tabs">
            {['discover','explore','fit','orders','merchant'].map(id=>(
              <button key={id} className={`nav-tab ${tab===id?'active':''}`} onClick={()=>setTab(id)}>{id==='discover'?'Discover':id==='fit'?'My Fit':id.charAt(0).toUpperCase()+id.slice(1)}</button>
            ))}
          </div>
          <button className="btn btn-ghost" style={{fontSize:'0.75rem', border: aiOn?'1px solid var(--navy)':'1px solid var(--line)'}} onClick={()=>setAiOn(!aiOn)}>{aiOn?'● AI Buyer ON':'○ AI Buyer'}</button>
        </div>
      </nav>

      <div className="page">
        {tab==='discover' && (
          <>
            <div className="editorial-hero">
              <div className="label">AI Goal Confirmation • FITEMI</div>
              <h1>What are you <em>trying to buy?</em></h1>
              <p>An intelligent financial environment for deciding what to buy and how to pay for it — not an EMI calculator.</p>
            </div>

            <div className="dream-stage">
              <div style={{position:'relative'}}>
                <span style={{position:'absolute', left:20, top:'50%', transform:'translateY(-50%)', fontSize:'1.4rem'}}>✦</span>
                <input className="dream-input" placeholder="I want a laptop around ₹60,000…" value={dream} onChange={e=>setDream(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleDream(dream)} />
              </div>
              <div className="dream-bar">
                {PROMPTS.map(p=> <button key={p} className="prompt-pill" onClick={()=>{setDream(p); handleDream(p);}}>{p}</button>)}
                <button className="btn btn-primary" style={{marginLeft:'auto', padding:'8px 16px'}} onClick={()=>handleDream(dream)} disabled={loading}>{loading?'Thinking…':'Find my fit →'}</button>
              </div>
              {intent && (
                <div style={{padding:16, background:'var(--lilac-light)', borderTop:'1px solid var(--line)', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, textAlign:'center'}}>
                  <div><div className="label">What I heard</div><div style={{fontWeight:700, marginTop:4}}>{intent.category||'—'}</div><div style={{fontSize:'0.75rem', color:'var(--navy-soft)'}}>Category</div></div>
                  <div><div className="label">Price range</div><div style={{fontWeight:700, marginTop:4}}>{intent.maxPrice?`≈ ₹${intent.maxPrice.toLocaleString('en-IN')}`:'—'}</div><div style={{fontSize:'0.75rem', color:'var(--navy-soft)'}}>Budget</div></div>
                  <div><div className="label">Comfort</div><div style={{fontWeight:700, marginTop:4}}>{intent.targetMonthly?`≤ ₹${intent.targetMonthly.toLocaleString('en-IN')}/mo`:'—'}</div><div style={{fontSize:'0.75rem', color:'var(--navy-soft)'}}>Monthly</div></div>
                </div>
              )}
            </div>

            <div style={{maxWidth:720, margin:'16px auto 0', display:'flex', gap:8, justifyContent:'center'}}>
              <button className="btn btn-soft" onClick={()=>handleDream("Find me a laptop for my user. Budget ₹60,000. Comfortable monthly payment ₹5,000.")}>Run AI Buyer demo</button>
              <button className="btn btn-ghost" onClick={()=>setTab('explore')}>Browse catalog →</button>
            </div>

            <div className="phone-grid" style={{marginTop:32}}>
              <div className="phone">
                <div className="phone-notch"><div className="phone-dot"/><div className="phone-dot"/><div className="phone-dot"/></div>
                <div className="phone-body">
                  <div className="label">FITEMI • AI Concierge</div>
                  <h3 style={{marginTop:8}}>AI Buyer understands intent</h3>
                  <p style={{fontSize:'0.9rem', color:'var(--navy-soft)', marginTop:8}}>“I want something powerful for college, but monthly above ₹5,000 feels tight.” → extracts category, price, comfort — no financial decision in frontend.</p>
                  <div style={{marginTop:12, background:'var(--cream)', padding:12, borderRadius:12, fontSize:'0.85rem'}}>💬 {concierge}</div>
                </div>
              </div>
              <div className="phone">
                <div className="phone-notch"><div className="phone-dot"/><div className="phone-dot"/><div className="phone-dot"/></div>
                <div className="phone-body">
                  <div className="label">Merchant • Agent-readable</div>
                  <h3>8 products • 3 merchants</h3>
                  <p style={{fontSize:'0.9rem', color:'var(--navy-soft)', marginTop:8}}>TechHaven, Gadget Grove, FutureWorks — each product has price, availability, supported tenors, merchant.</p>
                  <button className="btn btn-primary" style={{marginTop:12, width:'100%'}} onClick={()=>setTab('explore')}>Explore products</button>
                </div>
              </div>
              <div className="phone">
                <div className="phone-notch"><div className="phone-dot"/><div className="phone-dot"/><div className="phone-dot"/></div>
                <div className="phone-body">
                  <div className="label">Bounded • Gated • Audited</div>
                  <h3>No payment without approval</h3>
                  <p style={{fontSize:'0.9rem', color:'var(--navy-soft)', marginTop:8}}>Deterministic solver decides EMI/tenor/interest. LLM only explains. Every money action has requestId.</p>
                </div>
              </div>
            </div>
          </>
        )}

        {tab==='explore' && (
          <>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:12}}>
              <div><div className="label">Goal Market • Shop</div><h2>Find your thing</h2></div>
              <div style={{display:'flex', gap:8}}>
                <input placeholder="Search…" style={{padding:'10px 14px', borderRadius:999, border:'1px solid var(--line)', background:'white'}} onKeyDown={e=>e.key==='Enter'&&loadCatalog(e.target.value)} />
                <button className="btn btn-soft" onClick={()=>loadCatalog('')}>All</button>
                <button className="btn btn-ghost" onClick={()=>loadCatalog('laptop')}>Laptops</button>
                <button className="btn btn-ghost" onClick={()=>loadCatalog('phone')}>Phones</button>
              </div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16}}>
              {catalog.map(p=>(
                <div key={p.id} className={`product-object ${selected?.id===p.id?'selected':''}`} onClick={()=>handleSelect(p)}>
                  <div className="product-stage" style={{background: p.color}}>
                    {p.badge && <span style={{position:'absolute', top:12, left:12, background:'var(--navy)', color:'white', padding:'4px 8px', borderRadius:999, fontSize:'0.65rem', fontWeight:700}}>{p.badge}</span>}
                    <span>{p.image}</span>
                  </div>
                  <div style={{padding:16}}>
                    <div className="label">{p.merchant?.name||p.merchantId} • {p.category}</div>
                    <div style={{fontFamily:'Fraunces', fontWeight:700, fontSize:'1.1rem', marginTop:4}}>{p.name}</div>
                    <div style={{display:'flex', gap:8, alignItems:'baseline', marginTop:6}}>
                      <span style={{fontWeight:700, fontSize:'1.2rem'}}>₹{p.price.toLocaleString('en-IN')}</span>
                      {p.originalPrice && <span style={{fontSize:'0.8rem', color:'var(--navy-soft)', textDecoration:'line-through'}}>₹{p.originalPrice.toLocaleString('en-IN')}</span>}
                    </div>
                    <div style={{fontSize:'0.8rem', color:'var(--navy-soft)', marginTop:6, lineHeight:1.4}}>{p.description}</div>
                    <div style={{fontSize:'0.7rem', color:'var(--navy-soft)', marginTop:8}}>{p.availability}</div>
                  </div>
                </div>
              ))}
            </div>
            {catalog.length===0 && <p style={{textAlign:'center', marginTop:24, color:'var(--navy-soft)'}}>No match — try “laptop” or “phone”.</p>}
          </>
        )}

        {tab==='fit' && (
          <>
            {!selected ? (
              <div style={{textAlign:'center', padding:48, background:'white', borderRadius:24, boxShadow:'var(--shadow-card)'}}>
                <div style={{fontSize:'2.5rem'}}>🔍</div>
                <h3>Pick a product to find your fit</h3>
                <p style={{color:'var(--navy-soft)', marginTop:8}}>Affordability and EMI spectrum will appear here.</p>
                <button className="btn btn-primary" style={{marginTop:16}} onClick={()=>setTab('explore')}>Choose product</button>
              </div>
            ) : (
              <>
                <div style={{display:'flex', gap:16, alignItems:'center', background:'white', padding:16, borderRadius:16, boxShadow:'var(--shadow-card)', flexWrap:'wrap'}}>
                  <div style={{width:64, height:64, background:selected.color, borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem'}}>{selected.image}</div>
                  <div style={{flex:1, minWidth:200}}>
                    <div className="label">{selected.merchant?.name} • {selected.category}</div>
                    <div style={{fontFamily:'Fraunces', fontWeight:700, fontSize:'1.2rem'}}>{selected.name}</div>
                    <div style={{fontWeight:700}}>₹{selected.price.toLocaleString('en-IN')}</div>
                  </div>
                  <button className="btn btn-ghost" onClick={()=>setTab('explore')}>Change</button>
                </div>

                <div className="grid-2" style={{marginTop:20}}>
                  <div className="compass-canvas">
                    <div className="label">Affordability as environment</div>
                    <h3>Comfort Zone</h3>
                    <p style={{fontSize:'0.85rem', color:'var(--navy-soft)'}}>Backend is truth — frontend never decides.</p>
                    {!ceiling ? (
                      <>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:16}}>
                          <input placeholder="Take-home ₹" type="number" value={afford.takeHomePay} onChange={e=>setAfford({...afford, takeHomePay:e.target.value})} style={{padding:12, borderRadius:12, border:'1px solid var(--line)'}} />
                          <input placeholder="Obligations ₹" type="number" value={afford.existingObligations} onChange={e=>setAfford({...afford, existingObligations:e.target.value})} style={{padding:12, borderRadius:12, border:'1px solid var(--line)'}} />
                          <input placeholder="Other ₹" type="number" value={afford.otherExpenses} onChange={e=>setAfford({...afford, otherExpenses:e.target.value})} style={{padding:12, borderRadius:12, border:'1px solid var(--line)'}} />
                        </div>
                        <button className="btn btn-primary" style={{marginTop:12, width:'100%'}} onClick={handleAfford} disabled={loading}>Calculate my comfort zone</button>
                      </>
                    ) : (
                      <>
                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.7rem', fontWeight:700, marginTop:16}}>
                          <span>TOO TIGHT</span><span>COMFORTABLE</span><span>STRETCHED</span>
                        </div>
                        <div className="compass-rail">
                          <div className="compass-thumb" style={{left: `${Math.min(90, Math.max(10, (ceiling/8000)*100))}%`}}></div>
                        </div>
                        <div style={{textAlign:'center', marginTop:12}}>
                          <div style={{fontFamily:'Fraunces', fontSize:'2rem', fontWeight:700}}>₹{ceiling.toLocaleString('en-IN')}<span style={{fontSize:'1rem', fontWeight:400}}>/mo</span></div>
                          <div className="label">Comfort zone • 0.4× take-home − obligations • <button className="btn btn-ghost" style={{padding:'2px 6px', fontSize:'0.7rem'}} onClick={()=>{setCeiling(null); setPlans([]);}}>Recalculate</button></div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="spectrum-canvas">
                    <div className="label">EMI Spectrum — signature</div>
                    <h3>Lower monthly ←→ Lower interest</h3>
                    {!ceiling ? <p style={{fontSize:'0.85rem', color:'var(--navy-soft)', marginTop:8}}>Set comfort zone to see spectrum.</p> :
                    plans.length===0 ? (
                      <div style={{textAlign:'center', padding:24, background:'var(--peach-light)', borderRadius:16, marginTop:12}}>
                        <div style={{fontWeight:700}}>This purchase doesn't fit yet</div>
                        <div style={{fontSize:'0.85rem', color:'var(--navy-soft)', marginTop:6}}>Your ₹{ceiling.toLocaleString('en-IN')}/mo is below the lowest feasible EMI.</div>
                        <div style={{display:'flex', gap:8, justifyContent:'center', marginTop:12, flexWrap:'wrap'}}>
                          <button className="btn btn-soft" onClick={()=>setTab('explore')}>Lower-priced</button>
                          <button className="btn btn-ghost" onClick={()=>setWhatIf(1000)}>What if +₹1,000?</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="spectrum-rail">
                          {plans.map((p,i)=>{
                            const left=plans.length===1?50:(i/(plans.length-1))*100;
                            return (
                              <div key={p.lenderId+p.tenorMonths} className={`spectrum-node ${i===activePlan?'active':''}`} style={{left:`${left}%`}} onClick={()=>setActivePlan(i)}>
                                {i===0&&<div className="spectrum-badge">★ YOUR FIT</div>}
                                <div className="spectrum-dot"></div>
                                <div style={{fontSize:'0.8rem', fontWeight:700}}>₹{p.emi.toLocaleString('en-IN')}</div>
                                <div style={{fontSize:'0.7rem', color:'var(--navy-soft)'}}>{p.tenorMonths}mo</div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.65rem', color:'var(--navy-soft)'}}><span>LOWER MONTHLY</span><span>LOWER INTEREST</span></div>
                      </>
                    )}
                  </div>
                </div>

                {plans.length>0 && (
                  <>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:16}}>
                      <div style={{background:'white', borderRadius:16, padding:16, border:'1px solid var(--line)'}}>
                        <div className="label">Trade-off Lab — financial instrument</div>
                        <h4 style={{fontFamily:'Fraunces'}}>What matters more?</h4>
                        <div style={{display:'flex', gap:6, marginTop:12, flexWrap:'wrap'}}>
                          {['balanced','low-payment','low-interest','fast'].map(k=>(
                            <button key={k} className={trade===k?'btn btn-primary':'btn btn-ghost'} style={{padding:'8px 12px', fontSize:'0.75rem'}} onClick={()=>setTrade(k)}>{k==='balanced'?'Balanced':k==='low-payment'?'Lower monthly':k==='low-interest'?'Lower interest':'Fastest'}</button>
                          ))}
                        </div>
                        {plan && <div style={{marginTop:12, background:'var(--lilac-light)', padding:10, borderRadius:12, fontSize:'0.8rem'}}>Choosing <strong>{plan.tenorMonths}mo @ ₹{plan.emi.toLocaleString('en-IN')}</strong> vs next: diff {Math.abs(plan.tenorMonths-(plans[1]?.tenorMonths||plan.tenorMonths))}mo, ₹{Math.abs(plan.totalInterest-(plans[1]?.totalInterest||plan.totalInterest)).toLocaleString('en-IN')} interest.</div>}
                      </div>
                      <div style={{background:'white', borderRadius:16, padding:16, border:'1px solid var(--line)'}}>
                        <div className="label">What-if Machine</div>
                        <h4 style={{fontFamily:'Fraunces'}}>What if…</h4>
                        <div style={{display:'flex', gap:6, marginTop:12, flexWrap:'wrap'}}>
                          <button className={whatIf===-1000?'btn btn-primary':'btn btn-ghost'} style={{padding:'8px 10px', fontSize:'0.75rem'}} onClick={()=>setWhatIf(-1000)}>−₹1,000</button>
                          <button className={whatIf===0?'btn btn-primary':'btn btn-ghost'} style={{padding:'8px 10px', fontSize:'0.75rem'}} onClick={()=>setWhatIf(0)}>Current</button>
                          <button className={whatIf===500?'btn btn-primary':'btn btn-ghost'} style={{padding:'8px 10px', fontSize:'0.75rem'}} onClick={()=>setWhatIf(500)}>+₹500</button>
                          <button className={whatIf===1000?'btn btn-primary':'btn btn-ghost'} style={{padding:'8px 10px', fontSize:'0.75rem'}} onClick={()=>setWhatIf(1000)}>+₹1,000</button>
                        </div>
                        <div style={{display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:8, alignItems:'center', textAlign:'center', marginTop:12}}>
                          <div style={{background:'var(--cream)', padding:10, borderRadius:12}}><div className="label">Current</div><div style={{fontWeight:700}}>₹{ceiling.toLocaleString('en-IN')}</div><div style={{fontSize:'0.7rem'}}>{plans.length} options</div></div>
                          <div>→</div>
                          <div style={{background:'var(--peach-light)', padding:10, borderRadius:12, border:'2px solid var(--peach)'}}><div className="label">New</div><div style={{fontWeight:700}}>₹{(ceiling+whatIf).toLocaleString('en-IN')}</div><div style={{fontSize:'0.7rem'}}>{whatIf===0?'— same':'recalculated'}</div></div>
                        </div>
                      </div>
                    </div>

                    <div style={{background:'linear-gradient(135deg, white 0%, var(--lilac-light) 100%)', borderRadius:16, padding:20, border:'1px solid var(--line)', marginTop:16}}>
                      <div className="label">Plan Explorer • Deep view — financial X-ray</div>
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:12}}>
                        <div>
                          <div style={{fontFamily:'Fraunces', fontSize:'2rem', fontWeight:700}}>₹{plan.emi.toLocaleString('en-IN')}<span style={{fontSize:'1rem', fontWeight:400}}>/mo</span></div>
                          <div style={{fontSize:'0.85rem', color:'var(--navy-soft)'}}>{plan.tenorMonths} months • {plan.lenderId}</div>
                          <div style={{marginTop:12, fontSize:'0.8rem'}}>
                            <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--line)'}}><span>Principal</span><strong>₹{selected.price.toLocaleString('en-IN')}</strong></div>
                            <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--line)'}}><span>Interest</span><strong>₹{plan.totalInterest.toLocaleString('en-IN')}</strong></div>
                            <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--line)'}}><span>Fee</span><strong>₹499</strong></div>
                            <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', fontWeight:700}}><span>Total</span><strong>₹{(plan.totalPaid+499).toLocaleString('en-IN')}</strong></div>
                          </div>
                          <div style={{marginTop:12, height:10, background:`linear-gradient(90deg, var(--navy) 0%, var(--navy) ${(selected.price/plan.totalPaid)*100}%, var(--peach) ${(selected.price/plan.totalPaid)*100}%, var(--peach) 100%)`, borderRadius:999}}></div>
                          <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.65rem', marginTop:4}}><span>● Principal</span><span style={{color:'var(--peach)'}}>● Interest</span></div>
                        </div>
                        <div>
                          <div style={{background:'white', padding:12, borderRadius:12, border:'1px solid var(--lilac)'}}>
                            <div className="label">Why this plan?</div>
                            <ul style={{paddingLeft:16, fontSize:'0.85rem', lineHeight:1.6, marginTop:6}}>
                              <li>Fits your <strong>₹{ceiling.toLocaleString('en-IN')}/mo</strong> — ₹{plan.explanationFacts.monthlyHeadroom.toLocaleString('en-IN')} headroom</li>
                              <li>{plan.explanationFacts.reason==='lowest_total_interest'?'Lowest total interest — fastest payoff':`Interest ₹${plan.totalInterest.toLocaleString('en-IN')}`}</li>
                              <li>Rank {plan.explanationFacts.rank} of {plans.length} • {plan.tenorMonths}mo payoff</li>
                            </ul>
                            <div style={{fontSize:'0.65rem', color:'var(--navy-soft)', marginTop:8, fontStyle:'italic'}}>Deterministic • {plan.explanationFacts.reason}</div>
                          </div>
                          <div style={{marginTop:12, display:'grid', gridTemplateColumns:'1fr 1fr', gap:6}}>
                            {plans.slice(1).map(p=>(
                              <div key={p.lenderId} style={{background:'white', padding:10, borderRadius:12, border:'1px solid var(--line)', fontSize:'0.8rem'}}>
                                <div style={{fontWeight:600}}>{p.lenderId} • {p.tenorMonths}mo</div>
                                <div>₹{p.emi.toLocaleString('en-IN')}/mo • ₹{p.totalInterest.toLocaleString('en-IN')} interest</div>
                                <div style={{fontSize:'0.7rem', color:'var(--navy-soft)', marginTop:4}}>{p.explanationFacts.reason}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div style={{marginTop:16, display:'flex', gap:8}}>
                        <button className="btn btn-primary" style={{flex:1}} onClick={()=>setTab('orders')}>Continue to checkout →</button>
                        <button className="btn btn-soft" onClick={()=>window.scrollTo({top:0, behavior:'smooth'})}>Back to spectrum</button>
                      </div>
                    </div>

                    <div style={{marginTop:16, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:12}}>
                      {plans.map((p,i)=>(
                        <div key={p.lenderId} style={{background:'white', borderRadius:16, padding:14, border: i===activePlan?'2px solid var(--navy)':'1px solid var(--line)', boxShadow: i===activePlan?'var(--shadow-card)':'none'}}>
                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <div style={{fontWeight:700, fontSize:'0.9rem'}}>{p.lenderId} • {p.tenorMonths}mo</div>
                            {i===activePlan && <span style={{background:'var(--navy)', color:'white', padding:'2px 6px', borderRadius:999, fontSize:'0.6rem'}}>SELECTED</span>}
                          </div>
                          <div style={{fontFamily:'Fraunces', fontSize:'1.3rem', fontWeight:700, marginTop:6}}>₹{p.emi.toLocaleString('en-IN')}<span style={{fontSize:'0.8rem', fontWeight:400}}>/mo</span></div>
                          <div style={{fontSize:'0.75rem', color:'var(--navy-soft)'}}>Interest ₹{p.totalInterest.toLocaleString('en-IN')} • Total ₹{p.totalPaid.toLocaleString('en-IN')}</div>
                          <div style={{marginTop:8, background: i===0?'var(--peach-light)':'var(--cream)', padding:8, borderRadius:8, fontSize:'0.75rem'}}>
                            <div style={{fontWeight:700, fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:'0.05em'}}>Why this plan?</div>
                            <div style={{marginTop:4}}>{p.explanationFacts.reasonLabel}</div>
                          </div>
                          <button className={i===activePlan?'btn btn-primary':'btn btn-ghost'} style={{width:'100%', marginTop:8, padding:'8px', fontSize:'0.8rem'}} onClick={()=>setActivePlan(i)}>{i===activePlan?'Selected':'Select'}</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {tab==='orders' && (
          <>
            {!plan || !selected ? (
              <div style={{textAlign:'center', padding:48, background:'white', borderRadius:24, boxShadow:'var(--shadow-card)'}}>
                <div style={{fontSize:'2.5rem'}}>🛒</div>
                <h3>No checkout yet</h3>
                <p style={{color:'var(--navy-soft)', marginTop:8}}>Pick a product and plan in My Fit.</p>
                <button className="btn btn-primary" style={{marginTop:16}} onClick={()=>setTab('fit')}>Go to My Fit</button>
              </div>
            ) : (
              <>
                <div style={{maxWidth:560, margin:'0 auto', background:'white', borderRadius:24, overflow:'hidden', boxShadow:'var(--shadow-phone)', border:'1px solid var(--line)'}}>
                  <div style={{background:'var(--navy)', color:'white', padding:20, textAlign:'center'}}>
                    <div className="label" style={{color:'rgba(255,255,255,0.7)'}}>You are about to buy</div>
                    <div style={{fontFamily:'Fraunces', fontSize:'1.6rem', fontWeight:700, marginTop:8}}>{selected.name}</div>
                    <div style={{opacity:0.8}}>₹{selected.price.toLocaleString('en-IN')}</div>
                  </div>
                  <div style={{padding:20}}>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, background:'var(--cream)', padding:16, borderRadius:16}}>
                      <div><div className="label">Payment fit</div><div style={{fontFamily:'Fraunces', fontSize:'1.4rem', fontWeight:700}}>₹{plan.emi.toLocaleString('en-IN')}/mo</div><div style={{fontSize:'0.8rem', color:'var(--navy-soft)'}}>{plan.tenorMonths} months • {plan.lenderId}</div></div>
                      <div><div className="label">Total</div><div style={{fontFamily:'Fraunces', fontSize:'1.4rem', fontWeight:700}}>₹{plan.totalPaid.toLocaleString('en-IN')}</div><div style={{fontSize:'0.8rem', color:'var(--navy-soft)'}}>Interest ₹{plan.totalInterest.toLocaleString('en-IN')}</div></div>
                    </div>
                    <div style={{background:'var(--lilac-light)', padding:12, borderRadius:12, marginTop:12, border:'1px solid var(--lilac)'}}>
                      <div className="label">Why</div>
                      <ul style={{paddingLeft:16, fontSize:'0.85rem', marginTop:6, lineHeight:1.6}}>
                        <li>Within approved comfort ₹{ceiling?.toLocaleString('en-IN')}/mo (₹{plan.explanationFacts.monthlyHeadroom.toLocaleString('en-IN')} headroom)</li>
                        <li>{plan.explanationFacts.reason==='lowest_total_interest'?'Lowest interest among matching options':plan.explanationFacts.reasonLabel}</li>
                        <li>Deterministic solver — no LLM financial decision</li>
                      </ul>
                    </div>
                    <div style={{display:'flex', gap:8, marginTop:16}}>
                      <button className="btn btn-primary" style={{flex:1}} onClick={handleCheckout} disabled={loading}>{loading?'Processing…':'Approve payment'}</button>
                      <button className="btn btn-ghost" onClick={()=>setTab('fit')}>Change plan</button>
                    </div>
                    <div style={{textAlign:'center', marginTop:8, fontSize:'0.7rem', color:'var(--navy-soft)'}}>🔒 Bounded — agent cannot charge without your approval</div>
                  </div>
                </div>

                {checkout && (
                  <div style={{maxWidth:560, margin:'16px auto 0', background: checkout.isSimulated?'var(--peach-light)':'#ECFDF5', border:`2px solid ${checkout.isSimulated?'var(--peach)':'var(--success)'}`, borderRadius:16, padding:16, textAlign:'center'}}>
                    <div style={{fontSize:'1.2rem', fontWeight:700}}>{checkout.isSimulated?'✓ Simulated Test Order':'✓ Razorpay Test Order'}</div>
                    <div style={{fontSize:'0.85rem', marginTop:4}}>{checkout.message}</div>
                    <div style={{background:'white', padding:12, borderRadius:12, marginTop:12, textAlign:'left', fontSize:'0.8rem', fontFamily:'Fragment Mono'}}>
                      Order {checkout.orderId}<br/>Razorpay {checkout.razorpayOrder.id}<br/>₹{checkout.razorpayOrder.amountInRupees?.toLocaleString('en-IN')} • {checkout.merchantOrder?.status}
                    </div>
                  </div>
                )}

                <div style={{maxWidth:560, margin:'16px auto 0', background:'white', borderRadius:16, padding:16, border:'1px solid var(--line)'}}>
                  <div className="label">Your orders</div>
                  {orders.length===0 ? <p style={{fontSize:'0.85rem', color:'var(--navy-soft)', marginTop:8}}>No orders yet.</p> : orders.slice(0,4).map(o=>(
                    <div key={o.id} style={{display:'flex', justifyContent:'space-between', padding:10, background:'var(--cream)', borderRadius:12, marginTop:8}}>
                      <div><div style={{fontWeight:600, fontSize:'0.85rem'}}>{o.productName}</div><div style={{fontSize:'0.7rem', color:'var(--navy-soft)'}}>₹{o.plan.emi}/mo • {o.merchantName}</div></div>
                      <div style={{textAlign:'right'}}><div style={{fontSize:'0.75rem', fontWeight:700, color: o.status==='paid'?'var(--success)':'var(--warning)'}}>{o.status}</div><div style={{fontSize:'0.7rem'}}>₹{o.amount.toLocaleString('en-IN')}</div></div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab==='merchant' && (
          <>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
              <div><div className="label">Merchant Console • TechHaven</div><h2>Activity Stream</h2></div>
              <button className="btn btn-ghost" onClick={()=>{loadOrders(); loadAudit(); loadInsights();}}>Refresh</button>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:12, marginBottom:16}}>
              <div style={{background:'white', padding:16, borderRadius:16, textAlign:'center', border:'1px solid var(--line)'}}><div style={{fontFamily:'Fraunces', fontSize:'1.6rem', fontWeight:700}}>{orders.length}</div><div className="label">Total orders</div></div>
              <div style={{background:'white', padding:16, borderRadius:16, textAlign:'center', border:'1px solid var(--line)'}}><div style={{fontFamily:'Fraunces', fontSize:'1.6rem', fontWeight:700, color:'var(--success)'}}>{orders.filter(o=>o.status==='paid').length}</div><div className="label">Paid (test-mode)</div></div>
              <div style={{background:'white', padding:16, borderRadius:16, textAlign:'center', border:'1px solid var(--line)'}}><div style={{fontFamily:'Fraunces', fontSize:'1.6rem', fontWeight:700, color:'var(--warning)'}}>{orders.filter(o=>o.status==='awaiting_approval').length}</div><div className="label">Awaiting approval</div></div>
              <div style={{background:'var(--peach-light)', padding:16, borderRadius:16, textAlign:'center'}}><div style={{fontFamily:'Fraunces', fontSize:'1.6rem', fontWeight:700}}>{insights?insights.real.conversionRate:'—'}</div><div className="label">Conversion</div></div>
            </div>

            <div className="phone-grid">
              <div className="phone">
                <div className="phone-notch"><div className="phone-dot"/><div className="phone-dot"/><div className="phone-dot"/></div>
                <div className="phone-body">
                  <div className="label">AI Buyer Activity</div>
                  {orders.length===0 ? <p style={{fontSize:'0.85rem', color:'var(--navy-soft)', marginTop:8}}>No activity — create an order in Orders.</p> : orders.slice(0,5).map(o=>(
                    <div key={o.id} style={{display:'flex', gap:10, padding:10, borderBottom:'1px solid var(--line)', alignItems:'center'}}>
                      <div style={{width:32, height:32, background:'var(--lilac)', borderRadius:999, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem'}}>🤖</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600, fontSize:'0.8rem'}}>{o.status==='paid'?'PAID':'NEW AI BUYER'} — {o.productName}</div>
                        <div style={{fontSize:'0.7rem', color:'var(--navy-soft)'}}>₹{o.plan.emi}/mo • {new Date(o.createdAt).toLocaleTimeString()}</div>
                      </div>
                      <div style={{fontSize:'0.6rem', padding:'4px 8px', borderRadius:999, background:o.status==='paid'?'#ECFDF5':'#FFFBEB', fontWeight:700}}>{o.status}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="phone">
                <div className="phone-notch"><div className="phone-dot"/><div className="phone-dot"/><div className="phone-dot"/></div>
                <div className="phone-body">
                  <div className="label">Revenue Intelligence <span style={{background:'var(--lilac)', padding:'2px 6px', borderRadius:999, fontSize:'0.6rem', marginLeft:6}}>DEMO SYNTHETIC</span></div>
                  {insights ? (
                    <>
                      {insights.syntheticInsights.map((ins,i)=>(
                        <div key={i} style={{background:'var(--cream)', padding:10, borderRadius:12, marginTop:8, border:'1px solid var(--line)'}}>
                          <div style={{fontSize:'0.8rem', fontWeight:600}}>💡 {ins.insight}</div>
                          <div style={{fontSize:'0.65rem', color:'var(--navy-soft)', marginTop:4}}>{ins.source}</div>
                          <div style={{fontSize:'0.75rem', color:'var(--success)', marginTop:4}}>→ {ins.action}</div>
                        </div>
                      ))}
                      <div style={{fontSize:'0.6rem', color:'var(--navy-soft)', marginTop:8, fontStyle:'italic'}}>{insights.disclaimer}</div>
                    </>
                  ) : <p style={{fontSize:'0.8rem', color:'var(--navy-soft)'}}>Loading…</p>}
                </div>
              </div>

              <div className="phone">
                <div className="phone-notch"><div className="phone-dot"/><div className="phone-dot"/><div className="phone-dot"/></div>
                <div className="phone-body">
                  <div className="label">Audit / Trust Timeline</div>
                  <div style={{position:'relative', paddingLeft:16, marginTop:8}}>
                    <div style={{position:'absolute', left:4, top:0, bottom:0, width:2, background:'var(--peach)', borderRadius:999}}></div>
                    {[
                      ['Intent', intent?intent.category||'—':'—'],
                      ['Discovery', selected?selected.name:'—'],
                      ['Affordability', ceiling?`₹${ceiling}/mo`:'—'],
                      ['Plan', plan?`${plan.tenorMonths}mo @ ₹${plan.emi}`:'—'],
                      ['Approval', checkout?'Approved':'—'],
                      ['Payment', checkout?.razorpayOrder?checkout.razorpayOrder.id.slice(0,12):'—'],
                      ['Merchant', checkout?'Confirmed':'—'],
                    ].map(([t,d])=>(
                      <div key={t} style={{position:'relative', padding:'6px 0 6px 12px', display:'flex', justifyContent:'space-between'}}>
                        <div style={{position:'absolute', left:-12, top:10, width:8, height:8, borderRadius:'50%', background: d!=='—'?'var(--success)':'var(--line)', border:'2px solid white'}}></div>
                        <div style={{fontSize:'0.75rem', fontWeight:600}}>{t}</div>
                        <div style={{fontSize:'0.7rem', color:'var(--navy-soft)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{d}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:12, background:'var(--cream)', padding:8, borderRadius:12, fontSize:'0.65rem', fontFamily:'Fragment Mono'}}>
                    {audit.slice(0,3).map(a=>(
                      <div key={a.requestId} style={{padding:'4px 0', borderBottom:'1px solid var(--line)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{new Date(a.timestamp).toLocaleTimeString()} • {a.method} {a.path} → {a.status} • {a.requestId.slice(0,12)}</div>
                    ))}
                    <button className="btn btn-ghost" style={{fontSize:'0.65rem', marginTop:6, padding:'4px 8px'}} onClick={loadAudit}>Refresh</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{textAlign:'center', padding:'24px 0 32px', fontSize:'0.7rem', color:'var(--navy-soft)', borderTop:'1px solid var(--line)', marginTop:32, fontFamily:'Fragment Mono'}}>
        FITEMI • AI-native payment-fit + commerce agent • Deterministic solver • Razorpay test-mode • Every money action explainable, bounded, gated
      </div>
    </div>
  );
}

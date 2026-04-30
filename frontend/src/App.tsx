import { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, AlertTriangle, CheckCircle, Clock, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export default function App() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState<any>(null);

  // Fetch initial list
  useEffect(() => {
    axios.get(`${API_URL}/api/incidents`).then(res => {
      setIncidents(res.data);
    });
  }, []);

  // SSE for live feed
  useEffect(() => {
    const eventSource = new EventSource(`${API_URL}/api/feed`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setIncidents(prev => {
        // If it's a new incident
        if (!prev.find(i => i.id === data.id)) {
          return [data, ...prev];
        }
        // If it's an update
        return prev.map(i => i.id === data.id ? { ...i, ...data } : i);
      });
      // If we're viewing the updated incident, refresh details
      if (selectedId === data.id) {
        fetchDetails(data.id);
      }
    };
    return () => eventSource.close();
  }, [selectedId]);

  const fetchDetails = async (id: number) => {
    try {
      const res = await axios.get(`${API_URL}/api/incidents/${id}`);
      setDetails(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelect = (id: number) => {
    setSelectedId(id);
    setDetails(null);
    fetchDetails(id);
  };

  const submitRCA = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    
    try {
      await axios.put(`${API_URL}/api/incidents/${selectedId}/rca`, {
        state: 'CLOSED',
        root_cause_category: formData.get('category'),
        fix_applied: formData.get('fix'),
        prevention_steps: formData.get('prevention')
      });
      alert('RCA Submitted and Incident Closed successfully');
      fetchDetails(selectedId!);
    } catch (err: any) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="layout">
      {/* Sidebar - Live Feed */}
      <div className="sidebar glass-panel">
        <div className="header">
          <h1 className="header-title flex-start">
            <Activity />
            Live Feed
          </h1>
        </div>
        <div className="incident-list">
          {incidents.map(inc => (
            <div 
              key={inc.id} 
              className={`incident-card ${selectedId === inc.id ? 'active' : ''}`}
              onClick={() => handleSelect(inc.id)}
            >
              <div className="flex-between">
                <span className="text-sm font-bold">{inc.component_id}</span>
                <span className={`badge ${inc.severity}`}>{inc.severity}</span>
              </div>
              <div className="flex-between mt-2">
                <span className="text-sm text-muted">ID: #{inc.id}</span>
                <span className="text-sm text-muted" style={{color: inc.state === 'CLOSED' ? 'var(--success)' : 'var(--warning)'}}>
                  {inc.state}
                </span>
              </div>
            </div>
          ))}
          {incidents.length === 0 && (
             <div className="empty-state">
               <ShieldAlert size={48} />
               <p>No active incidents</p>
             </div>
          )}
        </div>
      </div>

      {/* Main Content - Details & RCA */}
      <div className="main-content glass-panel">
        {!selectedId ? (
          <div className="empty-state">
            <Activity size={64} />
            <h2>Select an incident to view details</h2>
          </div>
        ) : !details ? (
          <div className="empty-state">Loading...</div>
        ) : (
          <>
            <div className="details-header flex-between">
              <div>
                <h2 style={{fontSize: '2rem'}}>{details.incident.component_id}</h2>
                <div className="flex-start text-muted mt-2">
                  <Clock size={16} /> 
                  Started: {format(new Date(details.incident.start_time), 'PPp')}
                  {details.incident.end_time && ` • Ended: ${format(new Date(details.incident.end_time), 'PPp')}`}
                  {details.incident.mttr_seconds && ` • MTTR: ${details.incident.mttr_seconds}s`}
                </div>
              </div>
              <span className={`badge ${details.incident.severity}`} style={{fontSize: '1rem', padding: '0.5rem 1rem'}}>
                {details.incident.state}
              </span>
            </div>

            <div className="details-body">
              {/* RCA Section */}
              {details.incident.state === 'CLOSED' ? (
                <div className="glass-panel" style={{padding: '1.5rem', background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.2)'}}>
                  <h3 className="flex-start mb-4" style={{color: 'var(--success)'}}>
                    <CheckCircle /> Resolution & RCA
                  </h3>
                  <div className="form-group">
                    <label className="form-label">Root Cause Category</label>
                    <div className="form-input" style={{background: 'transparent'}}>{details.rca?.root_cause_category}</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fix Applied</label>
                    <div className="form-input" style={{background: 'transparent'}}>{details.rca?.fix_applied}</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Prevention Steps</label>
                    <div className="form-input" style={{background: 'transparent'}}>{details.rca?.prevention_steps}</div>
                  </div>
                </div>
              ) : (
                <div className="glass-panel" style={{padding: '1.5rem'}}>
                  <h3 className="flex-start mb-4"><AlertTriangle /> Mandatory Root Cause Analysis</h3>
                  <form onSubmit={submitRCA}>
                    <div className="form-group">
                      <label className="form-label">Root Cause Category</label>
                      <select name="category" className="form-input" required>
                        <option value="">Select Category...</option>
                        <option value="Hardware Failure">Hardware Failure</option>
                        <option value="Network Issue">Network Issue</option>
                        <option value="Software Bug">Software Bug</option>
                        <option value="Configuration Error">Configuration Error</option>
                        <option value="Third-Party Outage">Third-Party Outage</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Fix Applied</label>
                      <textarea name="fix" className="form-input" placeholder="Describe the immediate fix applied..." required></textarea>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Prevention Steps</label>
                      <textarea name="prevention" className="form-input" placeholder="How will we prevent this in the future?" required></textarea>
                    </div>
                    <button type="submit" className="btn mt-2">Submit RCA & Close Incident</button>
                  </form>
                </div>
              )}

              {/* Raw Signals */}
              <div>
                <h3 className="mb-4">Raw Signals ({details.signals.length} recorded)</h3>
                {details.signals.map((sig: any) => (
                  <div key={sig._id} className="signal-box">
                    <div className="text-muted" style={{fontSize: '0.75rem', marginBottom: '4px'}}>
                      {format(new Date(sig.timestamp), 'PPpp')}
                    </div>
                    {JSON.stringify(sig.payload)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

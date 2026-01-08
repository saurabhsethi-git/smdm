import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Admin() {
  const navigate = useNavigate();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedApp, setSelectedApp] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [repoInput, setRepoInput] = useState('');
  const [appInput, setAppInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Fetch apps list
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetch('http://localhost:8000/apps/list')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!mounted) return;
        const records = json && Array.isArray(json.records) ? json.records : [];
        setApps(records);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || String(err));
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const handleAppSelect = (app) => {
    setSelectedApp(app);
    setShowCreateForm(false);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError(null);
    if (!repoInput?.toString().trim() || !appInput?.trim()) {
      setCreateError('Repo name and App name are required.');
      return;
    }

    setCreating(true);
    try {
      const payload = {
        repo_name: repoInput,
        app_name: appInput
      };
      const res = await fetch('http://localhost:8000/create/app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });

      const text = await res.text();
      if (!res.ok) {
        setCreateError(text || `HTTP ${res.status}`);
        setCreating(false);
        return;
      }

      // success: refresh page
      window.location.reload();
    } catch (err) {
      setCreateError(err.message || String(err));
      setCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 60, background: 'white', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', paddingLeft: 24, zIndex: 100 }}>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 12px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          ← Back to Launcher
        </button>
        <h2 style={{ margin: '0 0 0 24px', flex: 1 }}>App Administration</h2>
      </div>

      {/* Left Sidebar - Apps List */}
      <aside style={{ width: 280, borderRight: '1px solid #e0e0e0', background: 'white', paddingTop: 80, overflowY: 'auto' }}>
        <div style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Applications</h3>
          {loading && <div>Loading...</div>}
          {error && <div style={{ color: 'red', fontSize: 12 }}>Error: {error}</div>}
          {!loading && !error && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {apps.length === 0 && <li style={{ color: '#666' }}>No apps found</li>}
              {apps.map((app, idx) => (
                <li key={idx} style={{ marginBottom: 6 }}>
                  <button
                    onClick={() => handleAppSelect(app)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: selectedApp === app ? '2px solid #007bff' : '1px solid #ddd',
                      background: selectedApp === app ? '#e7f3ff' : 'white',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontWeight: selectedApp === app ? 'bold' : 'normal'
                    }}
                  >
                    {app.app_name || 'Unnamed App'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Right Content - App Details / Create Form */}
      <main style={{ flex: 1, marginTop: 60, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0 }}>{selectedApp ? 'App Details' : 'Select an app or create new'}</h2>
          <button
            onClick={() => {
              setShowCreateForm((s) => !s);
              setSelectedApp(null);
              setRepoInput('');
              setAppInput('');
              setCreateError(null);
            }}
            style={{
              padding: '8px 12px',
              background: showCreateForm ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            {showCreateForm ? 'Close' : '+ Create New App'}
          </button>
        </div>

        {/* Create App Form */}
        {showCreateForm && (
          <div style={{ background: 'white', padding: 24, borderRadius: 8, marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <h3 style={{ marginTop: 0 }}>Create New App</h3>
            <form onSubmit={handleCreateSubmit}>
              {createError && <div style={{ color: 'red', marginBottom: 12 }}>{createError}</div>}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Repo Name</label>
                <input
                  type="text"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="Enter repo name"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 6,
                    border: '1px solid #ddd',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>App Name</label>
                <input
                  type="text"
                  value={appInput}
                  onChange={(e) => setAppInput(e.target.value)}
                  placeholder="Enter app name"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 6,
                    border: '1px solid #ddd',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                style={{
                  padding: '10px 16px',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: creating ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  opacity: creating ? 0.7 : 1
                }}
              >
                {creating ? 'Creating...' : 'Create App'}
              </button>
            </form>
          </div>
        )}

        {/* App Details */}
        {selectedApp && !showCreateForm && (
          <div style={{ background: 'white', padding: 24, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>App Details</h3>
              <button
                onClick={() => navigate(`/setup-repo/${encodeURIComponent(selectedApp.repo_name)}`)}
                style={{
                  padding: '8px 12px',
                  background: '#ffc107',
                  color: '#333',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                ⚙️ Setup
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {Object.entries(selectedApp).map(([key, value]) => (
                  <tr key={key} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px 0', fontWeight: 'bold', width: 160, color: '#555' }}>{key}</td>
                    <td style={{ padding: '10px 0 10px 16px', color: '#333' }}>
                      {value === null ? '—' : (typeof value === 'object' ? JSON.stringify(value) : String(value))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!selectedApp && !showCreateForm && (
          <div style={{ textAlign: 'center', color: '#999', marginTop: 48 }}>
            <p>Select an app from the left or click "Create New App" to get started</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default Admin;
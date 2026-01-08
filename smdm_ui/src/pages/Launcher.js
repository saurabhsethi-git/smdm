import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Launcher() {
  const navigate = useNavigate();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const handleAppClick = (repo_name) => {
    if (!repo_name) {
      console.warn('App missing repo_name');
      return;
    }
    navigate(`/app/${encodeURIComponent(repo_name)}`);
  };

  return (
    <div style={{ padding: 24, minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <h1 style={{ margin: 0 }}>Data Apps</h1>
          <button
            onClick={() => navigate('/admin')}
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
            Admin
          </button>
        </div>

        {loading && <div style={{ textAlign: 'center' }}>Loading apps...</div>}
        {error && <div style={{ textAlign: 'center', color: 'red' }}>Error: {error}</div>}

        {!loading && !error && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {apps.length === 0 ? (
              <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#666' }}>No apps found</p>
            ) : (
              apps.map((app, idx) => {
                const repoName = app.app_name || `App ${idx}`;
                const lastUpdated = app.last_updated ? new Date(app.last_updated).toLocaleDateString() : 'N/A';

                return (
                  <div
                    key={idx}
                    onClick={() => handleAppClick(app.repo_name)}
                    style={{
                      padding: 20,
                      background: 'white',
                      borderRadius: 8,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                    }}
                  >
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        margin: '0 auto 12px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: 32,
                        fontWeight: 'bold'
                      }}
                    >
                      {repoName.charAt(0).toUpperCase()}
                    </div>
                    <h3 style={{ margin: '8px 0', fontSize: 16, color: '#333' }}>{repoName}</h3>
                    <p style={{ margin: '4px 0', fontSize: 12, color: '#999' }}>Updated: {lastUpdated}</p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Launcher;
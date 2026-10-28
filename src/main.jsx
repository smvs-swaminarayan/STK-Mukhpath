import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("App Render Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '30px', textAlign: 'center', fontFamily: 'sans-serif', maxWidth: '600px', margin: '40px auto', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: '#c0392b' }}>⚠️ એપ્લિકેશન લોડ કરવામાં ક્ષતિ આવી છે</h2>
          <p style={{ color: '#64748b', fontSize: '14px' }}>{this.state.error?.message || 'અજ્ઞાત ક્ષતિ'}</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
            <button
              onClick={() => { 
                this.setState({ hasError: false, error: null });
                window.location.href = window.location.origin; 
              }}
              style={{ padding: '10px 20px', background: '#15803d', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 800 }}
            >
              🏠 મુખ્ય પેજ પર પાછા જાઓ
            </button>
            <button
              onClick={() => { 
                localStorage.removeItem('SMVS_PORTAL_ACTIVE_TAB');
                window.location.reload(); 
              }}
              style={{ padding: '10px 18px', background: '#1c3d5a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 800 }}
            >
              🔄 ફરી લોડ કરો
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

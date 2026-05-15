import { SignUp } from "@clerk/nextjs";

export default function RegisterPage() {
  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-branding">
          <h1 className="auth-logo">PoliTeam</h1>
          <p className="auth-tagline">Crea tu cuenta y conecta con tu comunidad</p>
          <div className="auth-features">
            <div className="auth-feature">
              <div className="auth-feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <span>Crea tu perfil en segundos</span>
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M1 18h4V9H1v9z"/></svg>
              </div>
              <span>Da likes y comenta publicaciones</span>
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <span>Chat en tiempo real con amigos</span>
            </div>
          </div>
        </div>
        <SignUp routing="hash" fallbackRedirectUrl="/" />
      </div>
    </div>
  );
}

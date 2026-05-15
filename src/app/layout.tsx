import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "PoliTeam — Tu Red Social",
  description: "Conecta, comparte y colabora con tu comunidad en PoliTeam",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ClerkProvider
          localization={{
            signIn: { start: { title: "Iniciar sesión", subtitle: "Bienvenido de vuelta", actionText: "¿No tienes cuenta?", actionLink: "Regístrate" } },
            signUp: { start: { title: "Crear cuenta", subtitle: "Únete a PoliTeam", actionText: "¿Ya tienes cuenta?", actionLink: "Inicia sesión" } },
            socialButtonsBlockButton: "Continuar con {{provider}}",
            dividerText: "o",
            formFieldLabel__emailAddress: "Correo electrónico",
            formFieldLabel__password: "Contraseña",
            formFieldLabel__firstName: "Nombre",
            formFieldLabel__lastName: "Apellido",
            formFieldLabel__phoneNumber: "Teléfono",
            formFieldInputPlaceholder__emailAddress: "tu@correo.com",
            formFieldInputPlaceholder__password: "Tu contraseña",
            formFieldInputPlaceholder__firstName: "Nombre",
            formFieldInputPlaceholder__lastName: "Apellido",
            formButtonPrimary: "Continuar",
            userButton: { action__manageAccount: "Mi cuenta", action__signOut: "Cerrar sesión" },
          }}
          appearance={{
            variables: {
              colorPrimary: "#0ea5e9",
              colorBackground: "#ffffff",
              colorInputBackground: "#f8fbff",
              colorInputText: "#1a2332",
              colorText: "#1a2332",
              colorTextSecondary: "#4a5e78",
              borderRadius: "12px",
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            },
            elements: {
              card: {
                background: "#ffffff",
                border: "1px solid rgba(14,165,233,0.12)",
                borderRadius: "20px",
                boxShadow: "0 12px 40px rgba(0,60,120,0.1), 0 0 60px rgba(14,165,233,0.05)",
                padding: "32px",
              },
              headerTitle: { color: "#1a2332", fontWeight: "700", fontSize: "1.3rem" },
              headerSubtitle: { color: "#6b8299" },
              socialButtonsBlockButton: {
                background: "#f0f8ff",
                border: "1px solid rgba(14,165,233,0.15)",
                color: "#1a2332",
                borderRadius: "10px",
              },
              formFieldInput: {
                background: "#f8fbff",
                border: "1px solid rgba(14,165,233,0.12)",
                color: "#1a2332",
                borderRadius: "10px",
              },
              formFieldLabel: { color: "#4a5e78", fontWeight: "500", fontSize: "0.85rem" },
              formButtonPrimary: {
                background: "linear-gradient(135deg, #0ea5e9, #38bdf8)",
                borderRadius: "10px",
                fontWeight: "600",
                boxShadow: "0 4px 15px rgba(14,165,233,0.25)",
              },
              footerActionLink: { color: "#0ea5e9" },
              dividerLine: { background: "rgba(14,165,233,0.1)" },
              dividerText: { color: "#8fa3ba" },
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}

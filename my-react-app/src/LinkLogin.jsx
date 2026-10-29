// Where a manager's login link lands: /t/:token signs the technician in and opens their
// first page (Formulaires). Nothing to type.
//
//   token → POST /api/auth/link   ({ token } → the same tokens as /login)
//
// The link keeps working until it expires or is cancelled, so the same link can be opened on
// a phone and on a computer. The page replaces itself in the history so Back doesn't
// sign in again.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./AuthContext";
import PhovaLogo from "./PhovaLogo";
import { homeFor } from "./roleTabs";

export default function LinkLogin() {
  const { token } = useParams();
  const { loginWithLink } = useAuth();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  // signing in twice would end the first session (one refresh token per user)
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const signIn = async () => {
      try {
        const data = await loginWithLink(token);
        navigate(homeFor(data.Role), { replace: true });
      } catch (err) {
        console.log("login link refused", err);
        setFailed(true);
      }
    };
    signIn();
  }, [token, loginWithLink, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <PhovaLogo className="mx-auto h-8" />
        {failed ? (
          <>
            <p className="mt-6 text-sm font-semibold text-slate-900 dark:text-slate-100">Ce lien ne fonctionne plus</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Il a expiré ou a été annulé. Demandez un nouveau lien à votre responsable.
            </p>
            <Link to="/login" className="mt-6 inline-block text-sm font-medium text-[#1A75BC] hover:underline dark:text-[#5BC6E8]">
              Se connecter avec un mot de passe
            </Link>
          </>
        ) : (
          <div className="mt-6 flex flex-col items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-[#1A75BC]" />
            Connexion…
          </div>
        )}
      </div>
    </div>
  );
}

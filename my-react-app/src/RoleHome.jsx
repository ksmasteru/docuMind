// The home page of the workshop roles whose step isn't built yet (roleTabs.js): a placeholder
// that says which role is signed in. Each role gets its own page here as its step is built.
import Layout from "./Layout";
import { useAuth } from "./AuthContext";
import { ROLE_LABEL } from "./workshopUtils";

const RoleHome = () => {
    const { user } = useAuth();
    return (
    <Layout active="home">
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <h1 className="text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Hello {user?.role}</h1>
            {ROLE_LABEL[user?.role] && (
                <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">{ROLE_LABEL[user.role]}</p>
            )}
        </div>
    </Layout>)
}

export default RoleHome;

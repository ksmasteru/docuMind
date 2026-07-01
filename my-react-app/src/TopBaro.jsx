import { Link, useNavigate } from "react-router-dom";


const TopBaro = ({isAdmin, onLogout}) => {

  return(
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
    <Link to="/search" className="text-sm font-semibold text-slate-900">
      DocuMind
    </Link>
    <nav className="flex items-center gap-4 text-sm">
      <Link to="/search" className="text-slate-500 hover:text-slate-900">
        Documents
      </Link>
      <Link to="/users" className="text-slate-500 hover:text-slate-900">
        Members
      </Link>
      { isAdmin &&
      <Link to="/admin" className="text-slate-900">
        Admin
      </Link>
        }
    <button onClick={onLogout} className="text-slate-500 hover:text-slate-900">
        Sign out
      </button>
    </nav>
  </header>
  )
}

export default TopBaro;
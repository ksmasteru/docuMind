// App.jsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import LoginPage from "./LoginPage";
import SearchPage from "./SearchPage";
import AdminPage from "./AdminPage";
import UploadPage from "./UploadPage";
import SignupPage  from "./SignupPage";
import SearchUsersPage from "./SearchUsersPage";
import { ThemeProvider } from "./ThemeContext";
import UploadedFiles from "./UploadedFiles";
import SearchContent from "./SearchContent";
import Ask from "./Ask";
import Forms from "./Forms";
import LinkLogin from "./LinkLogin";
import Tasks from "./Tasks";
import TaskScreen from "./TaskScreen";
import DataVisualisor from "./DataVisualisor";
import Technicians from "./Technicians";
import AssignTask from "./AssignTask";
import Orders from "./Orders";
import Review from "./Review";
import ReviewReport from "./ReviewReport";
import Dashboard from "./Dashboard";
import Pumps from "./Pumps";
import AlertDetail, { AlertsIndex } from "./AlertDetail";
import Workshop from "./Workshop";
import WorkshopRequest from "./WorkshopRequest";
import WorkshopIntervention from "./WorkshopIntervention";
import WorkshopAssign from "./WorkshopAssign";
import WorkshopFollowUp from "./WorkshopFollowUp";
import WorkshopReport from "./WorkshopReport";
import WorkshopQuote from "./WorkshopQuote";
import WorkshopPendingStep from "./WorkshopPendingStep";
import FinalCheckGuide from "./FinalCheckGuide";
import WorkshopAttachment from "./WorkshopAttachment";
import RoleHome from "./RoleHome";
import { canOpen, homeFor } from "./roleTabs";
import { pdfjs} from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc =
  new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();
  
function ProtectedRoute({ children }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { pathname } = useLocation();
  if (isLoading) return null; // or a spinner
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // a technician on a page that isn't theirs (old bookmark, reopened tab) goes back home
  if (!canOpen(user.role, pathname)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

// an unknown URL (or "/") goes to the signed-in role's first page
function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return <Navigate to={user ? homeFor(user.role) : "/login"} replace />;
}

export default function App() {
  return (
  <ThemeProvider>
  <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/register" element={<SignupPage />} />
          <Route path="/users" element={<ProtectedRoute><SearchUsersPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="/login" element={<LoginPage />} />
          {/* a manager's login link: signs a technician in without a password */}
          <Route path="/t/:token" element={<LinkLogin />} />
          <Route path="/documents" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
          <Route path="/uploadedFiles" element={<UploadedFiles />}/>
          <Route path="/searchContent" element={<SearchContent/>} />
          <Route path="/ask" element={<ProtectedRoute><Ask /></ProtectedRoute>}/>
          <Route path="/forms" element={<ProtectedRoute><Forms/></ProtectedRoute>}/>
          <Route path="/data-visualisor" element={<ProtectedRoute><DataVisualisor /></ProtectedRoute>} />
          <Route path="/tasks" element={<ProtectedRoute><Tasks/></ProtectedRoute>}/>
          <Route path="/tasks/:id" element={<ProtectedRoute><TaskScreen/></ProtectedRoute>}/>
          {/* manager pages: the dashboard (their home page), then the mobile app's Tâche / Ordres / Revue tabs;
              the backend refuses other roles */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard/></ProtectedRoute>}/>
          <Route path="/pumps" element={<ProtectedRoute><Pumps/></ProtectedRoute>}/>
          <Route path="/alerts" element={<ProtectedRoute><AlertsIndex/></ProtectedRoute>}/>
          <Route path="/alerts/:number" element={<ProtectedRoute><AlertDetail/></ProtectedRoute>}/>
          <Route path="/technicians" element={<ProtectedRoute><Technicians/></ProtectedRoute>}/>
          <Route path="/assign/:email" element={<ProtectedRoute><AssignTask/></ProtectedRoute>}/>
          <Route path="/orders" element={<ProtectedRoute><Orders/></ProtectedRoute>}/>
          <Route path="/review" element={<ProtectedRoute><Review/></ProtectedRoute>}/>
          <Route path="/review/:id" element={<ProtectedRoute><ReviewReport/></ProtectedRoute>}/>
          {/* the workshop loop: each role's queue, a new request (Sales, or a manager from an alert), one intervention */}
          <Route path="/atelier" element={<ProtectedRoute><Workshop/></ProtectedRoute>}/>
          <Route path="/atelier/nouvelle" element={<ProtectedRoute><WorkshopRequest/></ProtectedRoute>}/>
          <Route path="/atelier/:id" element={<ProtectedRoute><WorkshopIntervention/></ProtectedRoute>}/>
          {/* the Workshop Lead's task order for the technician (step 7 / 15) */}
          <Route path="/atelier/:id/affecter" element={<ProtectedRoute><WorkshopAssign/></ProtectedRoute>}/>
          <Route path="/atelier/:id/rapport" element={<ProtectedRoute><WorkshopReport/></ProtectedRoute>}/>
          <Route path="/atelier/:id/rapport/:submissionId" element={<ProtectedRoute><WorkshopReport/></ProtectedRoute>}/>
          <Route path="/atelier/:id/controle-final" element={<ProtectedRoute><WorkshopReport guide={<FinalCheckGuide/>}/></ProtectedRoute>}/>
          <Route path="/atelier/:id/devis/:quoteId" element={<ProtectedRoute><WorkshopQuote/></ProtectedRoute>}/>
          <Route path="/atelier/:id/etape/:slug" element={<ProtectedRoute><WorkshopPendingStep/></ProtectedRoute>}/>
          <Route path="/atelier/:id/attachement" element={<ProtectedRoute><WorkshopAttachment/></ProtectedRoute>}/>
          <Route path="/suivi" element={<ProtectedRoute><WorkshopFollowUp/></ProtectedRoute>}/>
          {/* the placeholder home page of the workshop roles whose step isn't built yet */}
          <Route path="/accueil" element={<ProtectedRoute><RoleHome/></ProtectedRoute>}/>
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
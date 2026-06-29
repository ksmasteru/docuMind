// App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import LoginPage from "./LoginPage";
import SearchPage from "./SearchPage";
import AdminPage from "./AdminPage";
import UploadPage from "./UploadPage";
import SignupPage  from "./SignupPage";
import SearchUsersPage from "./SearchUsersPage";

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null; // or a spinner
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
  <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/register" element={<SignupPage />} />
          <Route path="/users" element={<ProtectedRoute><SearchUsersPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/search" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
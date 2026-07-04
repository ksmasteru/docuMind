
import TopBaro  from "./TopBaro";
import Layout from "./Layout";
import { Link, useNavigate } from "react-router-dom";
import {useAuth} from "./AuthContext";
import { useEffect, useState } from "react";
import { apiClient } from "./apiClient";
import { useLocation } from "react-router-dom";

const UploadedFiles = () => {

    const {isAdmin, logout} = useAuth();
    const [data, setData] = useState([]);
    const [status, setStatus] = useState("");
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = location.state?.user;

    useEffect(() => {
        const fetchUserFiles = async () => {
            try{
                // what does this return
                const data = await apiClient.get("/api/v1/files/user/" + currentUser.email);
                // test with fucking post;
                //console.log(JSON.stringify(data));
                setData(data.data);
                setStatus("success");
            }
            catch (err)
            {
                console.log("Error while fetching for files");
                setStatus("error");
            }
        }
        fetchUserFiles();
    },[])
    // on mount load uplaoded files by user id.
    return(
    <Layout active="uploadedFiles">
    <div className="min-h-screen bg-slate-50">
    <TopBaro isAdmin={isAdmin} onLogout={() => logout().then(() => navigate("/login"))} />
     <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold text-slate-900">Uploaded files by User: {currentUser.name}</h1>
    <div className="mt-6">
        {status === "success" && data.filesCount > 0 && (
        <ul className="space-y-2">
        {data.files.map((file) => (
            <li
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <span className="text-sm font-medium text-slate-900">
                {file.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                    {file.size}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                  {file.userId}
                </span>
              </div>
                </li>
              ))}
        </ul>
        )}
        {status === "success" && data.filesCount === 0 && (
           <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
             NO FILES FOUND
            </p>
        )}
        {status === "error" && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Couldn't load files. Try again.
            </p>
        )}
    </div>
    </main>
    </div>
    </Layout>)
}

export default UploadedFiles;
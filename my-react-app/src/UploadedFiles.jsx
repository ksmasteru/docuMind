
import Layout from "./Layout";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiClient } from "./apiClient";
import { useLocation } from "react-router-dom";
import FileItem from "./FileItem.jsx";
import FilesList from "./FilesList.jsx";

const UploadedFiles = () => {

    const [data, setData] = useState([]);
    const [status, setStatus] = useState("");
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
     <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Uploaded files by User: {currentUser.name}</h1>
    <div className="mt-6">
        {status === "success" && data.filesCount > 0 && (
        <ul className="space-y-2">
        {<FilesList filesList={data.files}></FilesList>}
        </ul>
        )}

        {status === "success" && data.filesCount === 0 && (
           <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
             NO FILES FOUND
            </p>
        )}

        {status === "error" && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              Couldn't load files. Try again.
            </p>
        )}

    </div>
    </main>
    </div>
    </Layout>)
}

export default UploadedFiles;
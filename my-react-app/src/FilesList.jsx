import React, { useEffect } from 'react';
import FileItem  from './FileItem.jsx'; // 3. Import the new component

    /*
     {status === "success" && data.filesCount > 0 && (
        <ul className="space-y-2">
            {<FilesList filesList={data.files}/>}
        </ul>
        )}
    */

const FilesList = ({filesList}) => 
{


    return (
        <>
         {filesList.map((file, index) => (
              <li
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <FileItem key={file.id ?? `${file.name ?? "user"}-${index}`} file={file}></FileItem>
                      <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                        {file.size + "kb"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                        {file.userId}
                      </span>
                      </div>
              </li>
          ))}
        </>
    );
}

export default FilesList;
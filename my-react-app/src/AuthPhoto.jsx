// A stored photo (GET /api/v1/images/{id}). The endpoint needs the session's token, which an
// <img src> can't send, so the photo is fetched with apiClient and shown from a blob URL.
import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "./apiClient";

export function AuthPhoto({ imageId, alt, className }) {
    const [url, setUrl] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let objectUrl = null;
        let cancelled = false;
        apiClient.get(`/api/v1/images/${encodeURIComponent(imageId)}`, { responseType: "blob" })
            .then(({ data }) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(data);
                setUrl(objectUrl);
            })
            .catch((err) => {
                console.log("photo not loaded", err);
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [imageId]);

    if (failed) {
        return (
            <span className={cn("flex items-center justify-center rounded-sm border border-border bg-muted text-subtle", className)} title="Photo indisponible">
                <ImageOff className="size-5" aria-hidden="true" />
            </span>
        );
    }
    if (!url) return <span className={cn("block animate-pulse rounded-sm bg-foreground/[0.06]", className)} aria-label="Chargement de la photo" />;
    return (
        <a href={url} target="_blank" rel="noreferrer" className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <img src={url} alt={alt} className={cn("rounded-sm border border-border object-cover", className)} />
        </a>
    );
}

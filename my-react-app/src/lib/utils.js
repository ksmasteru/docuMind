import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn/ui's class helper: joins conditional classes and lets the last Tailwind class win
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

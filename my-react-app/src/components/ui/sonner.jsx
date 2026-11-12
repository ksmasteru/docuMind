import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/ThemeContext";

// shadcn/ui's toaster, on the app's own ThemeContext instead of next-themes.
// The severity icons take the theme's status colors.
const Toaster = ({
  ...props
}) => {
  const { isDark } = useTheme()
  return (
    <Sonner
      theme={isDark ? "dark" : "light"}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-ok" />,
        info: <InfoIcon className="size-4 text-primary" />,
        warning: <TriangleAlertIcon className="size-4 text-warn" />,
        error: <OctagonXIcon className="size-4 text-crit" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "font-ui !gap-3 !rounded-md !border-border !bg-popover !shadow-lg",
          title: "!text-[13px] !font-semibold !text-foreground",
          description: "!text-xs !text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground !font-semibold",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "0.375rem"
        }
      }
      {...props}
    />
  );
}

export { Toaster }

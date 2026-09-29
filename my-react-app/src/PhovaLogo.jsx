import phovaLogo from "./assets/phova_logo.png";

// The logo's navy lettering nearly disappears on dark backgrounds, so in dark
// mode it sits on a small white badge; in light mode it shows as is.
export default function PhovaLogo({ className = "" }) {
  return (
    <img
      src={phovaLogo}
      alt="PHOVA Technology"
      className={`w-auto dark:rounded-md dark:bg-white dark:px-2 dark:py-1 ${className}`}
    />
  );
}

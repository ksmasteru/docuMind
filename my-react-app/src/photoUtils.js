// Photos before they're sent (InspectionForm.jsx, ReportWizard.jsx).

// A phone photo is 3–5 MB; redrawn at 2000 px as a 0.8 JPEG it's well under 1 MB, and whatever
// the browser can open (HEIC on Safari) comes out as a JPEG the server accepts (JPEG, PNG, WebP).
// If the browser can't decode it, the original goes as is and the server decides.
const MAX_PHOTO_SIDE = 2000;

export async function shrinkPhoto(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]*$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } catch (err) {
    console.log("photo kept as is, the browser could not redraw it", err);
    return file;
  }
}
